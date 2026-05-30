/**
 * AI Doctor Sessions index — review-workflow filters
 * (caution / hasChecklist / confidence).
 *
 * Read-only filter UI + pure helper tests.
 * No DB writes, no AI calls, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import {
  applyClientSideFilters,
  confidenceBucketFromPct,
  DEFAULT_FILTERS,
  formatActiveFilterLabels,
  isFiltersActive,
  parseFilters,
  rowConfidenceBucket,
  rowHasCaution,
  rowHasChecklist,
  serializeFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";

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

describe("confidenceBucketFromPct", () => {
  it("buckets correctly", () => {
    expect(confidenceBucketFromPct(null)).toBe("unknown");
    expect(confidenceBucketFromPct(undefined)).toBe("unknown");
    expect(confidenceBucketFromPct(Number.NaN)).toBe("unknown");
    expect(confidenceBucketFromPct(0)).toBe("low");
    expect(confidenceBucketFromPct(60)).toBe("low");
    expect(confidenceBucketFromPct(61)).toBe("medium");
    expect(confidenceBucketFromPct(80)).toBe("medium");
    expect(confidenceBucketFromPct(81)).toBe("high");
    expect(confidenceBucketFromPct(100)).toBe("high");
  });
});

describe("row predicates", () => {
  it("rowHasCaution/Checklist false for healthy session", () => {
    const r = makeRow("a");
    expect(rowHasCaution(r)).toBe(false);
    expect(rowHasChecklist(r)).toBe(false);
  });
  it("rowHasCaution true for low confidence", () => {
    const r = makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 });
    expect(rowHasCaution(r)).toBe(true);
    expect(rowHasChecklist(r)).toBe(true);
  });
  it("rowConfidenceBucket reflects displayed_confidence", () => {
    expect(
      rowConfidenceBucket(
        makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.9 }),
      ),
    ).toBe("low");
    expect(
      rowConfidenceBucket(
        makeRow("a", {}, { displayed_confidence: 0.95, raw_confidence: 0.5 }),
      ),
    ).toBe("high");
    expect(
      rowConfidenceBucket(
        makeRow(
          "a",
          { confidence: null as unknown as number },
          { displayed_confidence: null, raw_confidence: null },
        ),
      ),
    ).toBe("unknown");
  });
});

describe("applyClientSideFilters", () => {
  const healthy = makeRow("healthy");
  const lowConf = makeRow(
    "low",
    {},
    { displayed_confidence: 0.3, raw_confidence: 0.3 },
  );
  const highRisk = makeRow("hr", { riskLevel: "high" });
  const unknownConf = makeRow(
    "uk",
    { confidence: null as unknown as number },
    { displayed_confidence: null, raw_confidence: null },
  );
  const rows = [healthy, lowConf, highRisk, unknownConf];

  it("default filters pass everything through", () => {
    expect(applyClientSideFilters(rows, DEFAULT_FILTERS).map((r) => r.id)).toEqual([
      "healthy",
      "low",
      "hr",
      "uk",
    ]);
  });
  it("caution=yes keeps only caution sessions", () => {
    expect(
      applyClientSideFilters(rows, { ...DEFAULT_FILTERS, caution: "yes" }).map(
        (r) => r.id,
      ),
    ).toEqual(["low", "hr", "uk"]);
  });
  it("caution=no inverts", () => {
    expect(
      applyClientSideFilters(rows, { ...DEFAULT_FILTERS, caution: "no" }).map(
        (r) => r.id,
      ),
    ).toEqual(["healthy"]);
  });
  it("hasChecklist=yes keeps only sessions with checklist items", () => {
    expect(
      applyClientSideFilters(rows, { ...DEFAULT_FILTERS, hasChecklist: "yes" }).map(
        (r) => r.id,
      ),
    ).toEqual(["low", "hr", "uk"]);
  });
  it("confidence=low keeps only low-confidence sessions", () => {
    expect(
      applyClientSideFilters(rows, { ...DEFAULT_FILTERS, confidence: "low" }).map(
        (r) => r.id,
      ),
    ).toEqual(["low"]);
  });
  it("confidence=unknown matches unrecorded confidence", () => {
    expect(
      applyClientSideFilters(rows, { ...DEFAULT_FILTERS, confidence: "unknown" }).map(
        (r) => r.id,
      ),
    ).toEqual(["uk"]);
  });
  it("combined filters are deterministic", () => {
    expect(
      applyClientSideFilters(rows, {
        ...DEFAULT_FILTERS,
        caution: "yes",
        confidence: "low",
      }).map((r) => r.id),
    ).toEqual(["low"]);
  });
});

describe("filter formatting + parsing", () => {
  it("formatActiveFilterLabels emits new labels", () => {
    expect(
      formatActiveFilterLabels({
        ...DEFAULT_FILTERS,
        caution: "yes",
        hasChecklist: "yes",
        confidence: "unknown",
      }),
    ).toEqual([
      "Caution only",
      "Has review checklist",
      "Confidence: Unknown",
    ]);
  });
  it("isFiltersActive detects new filters", () => {
    expect(isFiltersActive({ ...DEFAULT_FILTERS, caution: "yes" })).toBe(true);
    expect(isFiltersActive({ ...DEFAULT_FILTERS, hasChecklist: "no" })).toBe(true);
    expect(isFiltersActive({ ...DEFAULT_FILTERS, confidence: "high" })).toBe(true);
    expect(isFiltersActive(DEFAULT_FILTERS)).toBe(false);
  });
  it("parseFilters round-trips through serializeFilters", () => {
    const f = {
      ...DEFAULT_FILTERS,
      caution: "yes" as const,
      hasChecklist: "no" as const,
      confidence: "high" as const,
    };
    expect(parseFilters(serializeFilters(f))).toEqual(f);
  });
  it("parseFilters normalizes garbage values", () => {
    expect(
      parseFilters({ caution: "always", hasChecklist: "maybe", confidence: "huge" }),
    ).toEqual(DEFAULT_FILTERS);
  });
});

function renderPage(initialPath = "/doctor/sessions") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
function Page(): ReactElement {
  return <AiDoctorSessionsIndex />;
}

beforeEach(() => {
  currentRows = [];
});

describe("AiDoctorSessionsIndex — caution/checklist/confidence filter UI", () => {
  it("default state shows all sessions", async () => {
    currentRows = [
      makeRow("healthy"),
      makeRow("hr", { riskLevel: "high" }),
    ];
    renderPage();
    const list = await screen.findByTestId("ai-doctor-sessions-index-list");
    expect(within(list).getAllByTestId("ai-doctor-sessions-index-row").length).toBe(2);
  });

  it("caution filter narrows to caution rows only and renders active label", async () => {
    currentRows = [
      makeRow("healthy"),
      makeRow("low", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-caution"), {
      target: { value: "yes" },
    });
    const list = await screen.findByTestId("ai-doctor-sessions-index-list");
    const rows = within(list).getAllByTestId("ai-doctor-sessions-index-row");
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute("data-session-id")).toBe("low");
    const labels = screen
      .getAllByTestId("ai-doctor-sessions-index-active-filter-label")
      .map((n) => n.textContent);
    expect(labels).toContain("Caution only");
  });

  it("hasChecklist=yes narrows to checklist rows", async () => {
    currentRows = [makeRow("healthy"), makeRow("hr", { riskLevel: "high" })];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-has-checklist"),
      { target: { value: "yes" } },
    );
    const list = await screen.findByTestId("ai-doctor-sessions-index-list");
    const ids = within(list)
      .getAllByTestId("ai-doctor-sessions-index-row")
      .map((n) => n.getAttribute("data-session-id"));
    expect(ids).toEqual(["hr"]);
  });

  it("confidence=high narrows; unknown safely matches null confidence", async () => {
    currentRows = [
      makeRow("a", {}, { displayed_confidence: 0.9, raw_confidence: 0.9 }),
      makeRow("b", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
      makeRow(
        "c",
        { confidence: null as unknown as number },
        { displayed_confidence: null, raw_confidence: null },
      ),
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");

    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-confidence"),
      { target: { value: "high" } },
    );
    let list = await screen.findByTestId("ai-doctor-sessions-index-list");
    let ids = within(list)
      .getAllByTestId("ai-doctor-sessions-index-row")
      .map((n) => n.getAttribute("data-session-id"));
    expect(ids).toEqual(["a"]);

    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-confidence"),
      { target: { value: "unknown" } },
    );
    list = await screen.findByTestId("ai-doctor-sessions-index-list");
    ids = within(list)
      .getAllByTestId("ai-doctor-sessions-index-row")
      .map((n) => n.getAttribute("data-session-id"));
    expect(ids).toEqual(["c"]);
  });

  it("filtered empty state renders when filters hide all sessions", async () => {
    currentRows = [makeRow("healthy")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-caution"), {
      target: { value: "yes" },
    });
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-empty-filtered"),
    ).toBeTruthy();
  });

  it("Clear filters resets caution/checklist/confidence to defaults", async () => {
    currentRows = [makeRow("healthy")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-caution"), {
      target: { value: "yes" },
    });
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-confidence"),
      { target: { value: "low" } },
    );
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-index-clear-filters"));
    const cautionSel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-caution",
    )) as HTMLSelectElement;
    const confSel = screen.getByTestId(
      "ai-doctor-sessions-index-filter-confidence",
    ) as HTMLSelectElement;
    expect(cautionSel.value).toBe("all");
    expect(confSel.value).toBe("all");
  });

  it("existing risk filter still renders and operates", async () => {
    currentRows = [makeRow("a")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const risk = screen.getByTestId(
      "ai-doctor-sessions-index-filter-risk",
    ) as HTMLSelectElement;
    fireEvent.change(risk, { target: { value: "high" } });
    expect(risk.value).toBe("high");
  });
});

describe("Static safety scan — review-workflow filters slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
    "src/lib/aiDoctorSessionsSavedViewsRules.ts",
    "src/hooks/use-ai-doctor-sessions.ts",
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
    expect(TSX).not.toContain("low confidence");
    expect(TSX).not.toContain("missing info");
  });
});
