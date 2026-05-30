/**
 * AI Doctor Sessions index — "Needs my attention" one-click preset.
 *
 * Read-only UI shortcut over existing caution + hasChecklist filters.
 * No DB writes, no AI calls, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  applyNeedsAttentionPreset,
  clearNeedsAttentionPreset,
  countNeedsAttentionVisible,
  DEFAULT_FILTERS,
  isNeedsAttentionPresetActive,
  NEEDS_ATTENTION_PRESET_LABEL,
} from "@/lib/aiDoctorSessionsIndexFilters";
import { MANAGED_KEYS } from "@/lib/aiDoctorSessionsSavedViewsRules";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const result = () => Promise.resolve({ data: currentRows, error: null });
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit", "range", "not", "gte", "or"];
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => result().then(resolve);
  return { supabase: { from: () => chain } };
});

function makeRow(
  id: string,
  diag: Partial<Diagnosis> = {},
  over: Partial<AiDoctorSessionRow> = {},
): AiDoctorSessionRow {
  const diagnosis: Diagnosis = {
    summary: "ok",
    likelyIssue: "ok",
    confidence: 0.9,
    evidence: ["e1"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "",
    whatNotToDo: [],
    followUp24h: null,
    recoveryPlan3d: null,
    riskLevel: "low",
    suggestedActions: [],
    ...diag,
  };
  return {
    id,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: null,
    diagnosis,
    raw_confidence: 0.9,
    displayed_confidence: 0.9,
    context_confidence_ceiling: null,
    suggested_actions: [],
    ...over,
  };
}

const lowConfRow = (id: string) =>
  makeRow(id, {}, { displayed_confidence: 0.3, raw_confidence: 0.3 });
const healthyRow = (id: string) => makeRow(id);

describe("preset helpers", () => {
  it("isNeedsAttentionPresetActive only true when both filters set", () => {
    expect(isNeedsAttentionPresetActive(DEFAULT_FILTERS)).toBe(false);
    expect(
      isNeedsAttentionPresetActive({ ...DEFAULT_FILTERS, caution: "yes" }),
    ).toBe(false);
    expect(
      isNeedsAttentionPresetActive({
        ...DEFAULT_FILTERS,
        caution: "yes",
        hasChecklist: "yes",
      }),
    ).toBe(true);
  });
  it("applyNeedsAttentionPreset preserves unrelated keys", () => {
    const next = applyNeedsAttentionPreset({
      ...DEFAULT_FILTERS,
      risk: "high",
      confidence: "low",
    });
    expect(next.caution).toBe("yes");
    expect(next.hasChecklist).toBe("yes");
    expect(next.risk).toBe("high");
    expect(next.confidence).toBe("low");
  });
  it("clearNeedsAttentionPreset only clears the two preset keys", () => {
    const next = clearNeedsAttentionPreset({
      ...DEFAULT_FILTERS,
      caution: "yes",
      hasChecklist: "yes",
      risk: "high",
    });
    expect(next.caution).toBe("all");
    expect(next.hasChecklist).toBe("all");
    expect(next.risk).toBe("high");
  });
  it("countNeedsAttentionVisible counts matching rows only", () => {
    const rows = [healthyRow("a"), lowConfRow("b"), lowConfRow("c"), healthyRow("d")];
    expect(countNeedsAttentionVisible(rows)).toBe(2);
    expect(countNeedsAttentionVisible([])).toBe(0);
  });
  it("preset keys live inside saved-view managed keys", () => {
    expect(MANAGED_KEYS).toContain("caution");
    expect(MANAGED_KEYS).toContain("hasChecklist");
  });
});

function LocationProbe(): ReactElement {
  const loc = useLocation();
  return <div data-testid="probe-search">{loc.search}</div>;
}

function renderPage(initialPath = "/doctor/sessions") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AiDoctorSessionsIndex />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentRows = [];
});

describe("AiDoctorSessionsIndex — Needs my attention preset UI", () => {
  it("button renders on the sessions index", async () => {
    currentRows = [healthyRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const btn = screen.getByTestId(
      "ai-doctor-sessions-index-needs-attention-preset",
    );
    expect(btn.textContent).toContain(NEEDS_ATTENTION_PRESET_LABEL);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking the button applies caution=yes + hasChecklist=yes and updates URL", async () => {
    currentRows = [lowConfRow("a"), healthyRow("b")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    const cautionSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-caution",
    )) as HTMLSelectElement;
    const checklistSel = screen.getByTestId(
      "ai-doctor-sessions-index-filter-has-checklist",
    ) as HTMLSelectElement;
    expect(cautionSel.value).toBe("yes");
    expect(checklistSel.value).toBe("yes");
    const search = screen.getByTestId("probe-search").textContent ?? "";
    expect(search).toContain("caution=yes");
    expect(search).toContain("hasChecklist=yes");
  });

  it("active badge renders only when both preset filters are active", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    expect(
      screen.queryByTestId("ai-doctor-sessions-index-needs-attention-badge"),
    ).toBeNull();
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-needs-attention-badge"),
    ).toBeTruthy();
    const btn = screen.getByTestId(
      "ai-doctor-sessions-index-needs-attention-preset",
    );
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking active preset clears the preset filters but keeps others", async () => {
    currentRows = [lowConfRow("a")];
    renderPage("/doctor/sessions?risk=high");
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    await screen.findByTestId("ai-doctor-sessions-index-needs-attention-badge");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    const cautionSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-caution",
    )) as HTMLSelectElement;
    expect(cautionSel.value).toBe("all");
    const riskSel = screen.getByTestId(
      "ai-doctor-sessions-index-filter-risk",
    ) as HTMLSelectElement;
    expect(riskSel.value).toBe("high");
  });

  it("Clear filters also removes the preset filters", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    await screen.findByTestId("ai-doctor-sessions-index-needs-attention-badge");
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-index-clear-filters"));
    expect(
      screen.queryByTestId("ai-doctor-sessions-index-needs-attention-badge"),
    ).toBeNull();
  });

  it("individual filter selects still work after preset is applied", async () => {
    currentRows = [lowConfRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    const confSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-confidence",
    )) as HTMLSelectElement;
    fireEvent.change(confSel, { target: { value: "low" } });
    expect(
      (
        screen.getByTestId(
          "ai-doctor-sessions-index-filter-confidence",
        ) as HTMLSelectElement
      ).value,
    ).toBe("low");
  });

  it("visible count reflects currently loaded rows only", async () => {
    currentRows = [lowConfRow("a"), lowConfRow("b"), healthyRow("c")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const count = screen.getByTestId(
      "ai-doctor-sessions-index-needs-attention-count",
    );
    expect(count.textContent).toContain("2 visible");
  });

  it("filtered empty state renders when no loaded sessions match", async () => {
    currentRows = [healthyRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-empty-filtered"),
    ).toBeTruthy();
  });
});

describe("Static safety scan — Needs my attention preset slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
  ].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const ALL = FILES.join("\n");

  it("no writes", () => {
    for (const src of FILES) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke / service_role", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/service_role/i);
  });
  it("no action_queue / alerts / tasks writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']tasks["']\)/);
  });
  it("no automation / device-control markers", () => {
    const banned = [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ];
    for (const tok of banned) {
      expect(ALL.toLowerCase()).not.toContain(tok);
    }
  });
  it("no duplicated caution/checklist mapping in TSX", () => {
    expect(TSX).not.toContain("Verify the diagnosis against");
    expect(TSX).not.toContain("Review the risk level before");
    expect(TSX).not.toContain("Confirm plant, tent, sensor");
  });
});
