/**
 * AI Doctor Sessions — "Built-in" badge + tooltip on system saved views.
 *
 * Read-only UI clarity slice. No DB writes, no persistence changes,
 * no AI calls, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  BUILTIN_SAVED_VIEW_TOOLTIP,
  SAVED_VIEWS_STORAGE_KEY,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import { DEFAULT_FILTERS } from "@/lib/aiDoctorSessionsIndexFilters";
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

function makeRow(id: string, over: Partial<AiDoctorSessionRow> = {}): AiDoctorSessionRow {
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
  };
  return {
    id,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: null,
    diagnosis,
    raw_confidence: 0.3,
    displayed_confidence: 0.3,
    context_confidence_ceiling: null,
    suggested_actions: [],
    ...over,
  };
}

function renderPage(initialPath = "/doctor/sessions") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AiDoctorSessionsIndex />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentRows = [];
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("AiDoctorSessionsIndex — Built-in badge + tooltip", () => {
  it("built-in option carries the tooltip via the title attribute and a (Built-in) label", async () => {
    currentRows = [makeRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const opts = screen.getAllByTestId(
      "ai-doctor-sessions-saved-views-builtin-option",
    ) as HTMLOptionElement[];
    const opt = opts.find((o) => (o.textContent ?? "").includes("Needs my attention"))!;
    expect(opt.getAttribute("title")).toBe(BUILTIN_SAVED_VIEW_TOOLTIP);
    expect(opt.textContent).toContain("Built-in");
  });

  it("shows the 'Built-in' badge with tooltip when the built-in view is selected", async () => {
    currentRows = [makeRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    expect(
      screen.queryByTestId("ai-doctor-sessions-saved-views-builtin-badge"),
    ).toBeNull();
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    const badge = await screen.findByTestId(
      "ai-doctor-sessions-saved-views-builtin-badge",
    );
    expect(badge.textContent).toContain("Built-in");
    expect(badge.getAttribute("title")).toBe(BUILTIN_SAVED_VIEW_TOOLTIP);
    expect(badge.getAttribute("aria-label")).toBe(BUILTIN_SAVED_VIEW_TOOLTIP);
  });

  it("badge also appears when the preset button is toggled on (auto-sync)", async () => {
    currentRows = [makeRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-builtin-badge"),
    ).toBeTruthy();
  });

  it("user-created saved views do not get the badge and keep Delete", async () => {
    const user: SavedView[] = [
      {
        id: "u1",
        label: "Critical only",
        filters: { ...DEFAULT_FILTERS, risk: "critical" },
        page: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(user));
    currentRows = [makeRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: "u1" } },
    );
    expect(
      await screen.findByTestId("ai-doctor-sessions-saved-views-delete"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("ai-doctor-sessions-saved-views-builtin-badge"),
    ).toBeNull();
  });

  it("Delete button stays hidden while built-in is selected", async () => {
    currentRows = [makeRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    await screen.findByTestId("ai-doctor-sessions-saved-views-builtin-badge");
    expect(
      screen.queryByTestId("ai-doctor-sessions-saved-views-delete"),
    ).toBeNull();
  });

  it("selecting the built-in still applies caution=yes + hasChecklist=yes", async () => {
    currentRows = [makeRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    const caution = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-caution",
    )) as HTMLSelectElement;
    const checklist = screen.getByTestId(
      "ai-doctor-sessions-index-filter-has-checklist",
    ) as HTMLSelectElement;
    expect(caution.value).toBe("yes");
    expect(checklist.value).toBe("yes");
  });
});

describe("Static safety scan — Built-in badge slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsSavedViewsRules.ts",
  ].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const ALL = FILES.join("\n");

  it("no DB writes", () => {
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
  it("built-in id detection is not duplicated inline in TSX", () => {
    // The string id appears only inside the rules module + this guard.
    // The TSX uses isBuiltInSavedViewId() — no raw "builtin:needs-attention"
    // literal should be present in the page component.
    expect(TSX).not.toContain("builtin:needs-attention");
  });
  it("tooltip text is defined once in rules and reused", () => {
    expect(TSX).not.toContain("System view · always available");
  });
});
