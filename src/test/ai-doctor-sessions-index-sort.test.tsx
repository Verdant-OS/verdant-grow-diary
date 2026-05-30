/**
 * AI Doctor Sessions index — review-priority sorting.
 *
 * Pure helper tests + read-only UI render tests.
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
  applyClientSideSort,
  DEFAULT_FILTERS,
  parseFilters,
  parseSort,
  serializeFilters,
  type SortOption,
} from "@/lib/aiDoctorSessionsIndexFilters";
import {
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  SAVED_VIEWS_STORAGE_KEY,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
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
  createdAt: string,
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
    created_at: createdAt,
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

const oldHealthy = makeRow("old-healthy", "2026-01-01T00:00:00Z");
const newHealthy = makeRow("new-healthy", "2026-05-01T00:00:00Z");
const newHighRisk = makeRow(
  "new-hr",
  "2026-05-02T00:00:00Z",
  { riskLevel: "high" },
);
const oldHighLowConf = makeRow(
  "old-high",
  "2026-01-02T00:00:00Z",
  { riskLevel: "high" },
  { displayed_confidence: 0.2, raw_confidence: 0.2 },
);
const newUnknownConf = makeRow(
  "new-uk",
  "2026-05-03T00:00:00Z",
  { confidence: null as unknown as number, riskLevel: "medium" },
  { displayed_confidence: null, raw_confidence: null },
);

const ALL = [oldHealthy, newHealthy, newHighRisk, oldHighLowConf, newUnknownConf];

describe("parseSort", () => {
  it("accepts known options and rejects garbage", () => {
    expect(parseSort("oldest")).toBe("oldest");
    expect(parseSort("review-priority")).toBe("review-priority");
    expect(parseSort("nonsense")).toBe("newest");
    expect(parseSort(undefined)).toBe("newest");
  });
});

describe("applyClientSideSort", () => {
  it("default (newest) puts most recent created_at first", () => {
    expect(applyClientSideSort(ALL, "newest").map((r) => r.id)).toEqual([
      "new-uk",
      "new-hr",
      "new-healthy",
      "old-high",
      "old-healthy",
    ]);
  });
  it("oldest reverses", () => {
    expect(applyClientSideSort(ALL, "oldest").map((r) => r.id)).toEqual([
      "old-healthy",
      "old-high",
      "new-healthy",
      "new-hr",
      "new-uk",
    ]);
  });
  it("highest-risk first, then newest tie-break", () => {
    const ids = applyClientSideSort(ALL, "highest-risk").map((r) => r.id);
    expect(ids[0]).toBe("new-hr"); // critical
    expect(ids[1]).toBe("old-high"); // high
    expect(ids[2]).toBe("new-uk"); // medium
    // low-risk healthy rows last, newest first among them.
    expect(ids.slice(3)).toEqual(["new-healthy", "old-healthy"]);
  });
  it("lowest-confidence first, unknown before low", () => {
    const ids = applyClientSideSort(ALL, "lowest-confidence").map((r) => r.id);
    expect(ids[0]).toBe("new-uk"); // unknown
    expect(ids[1]).toBe("old-high"); // low
    // remaining = high confidence, newest-first
    expect(ids.slice(2)).toEqual(["new-hr", "new-healthy", "old-healthy"]);
  });
  it("review-priority orders caution/checklist > risk > low-conf > newest", () => {
    const ids = applyClientSideSort(ALL, "review-priority").map((r) => r.id);
    // old-high, new-hr, new-uk all qualify as caution+checklist given the
    // real buildSessionRowCautionIndicator behavior. Within that group risk
    // ranks high(3) > medium(2), then lower confidence first:
    //   old-high → high risk, low conf
    //   new-hr   → high risk, high conf
    //   new-uk   → medium risk, unknown conf
    expect(ids[0]).toBe("old-high");
    expect(ids[1]).toBe("new-hr");
    expect(ids[2]).toBe("new-uk");
    // healthy rows last, newest-first.
    expect(ids.slice(3)).toEqual(["new-healthy", "old-healthy"]);
  });
  it("review-priority uses newest-first as the final tie-breaker", () => {
    const a = makeRow("a", "2026-05-01T00:00:00Z");
    const b = makeRow("b", "2026-05-02T00:00:00Z");
    // Both healthy, identical except date.
    expect(applyClientSideSort([a, b], "review-priority").map((r) => r.id)).toEqual([
      "b",
      "a",
    ]);
  });
  it("does not mutate the input array", () => {
    const input = [...ALL];
    const snapshot = input.map((r) => r.id);
    applyClientSideSort(input, "review-priority");
    expect(input.map((r) => r.id)).toEqual(snapshot);
  });
  it("handles empty + single-row input safely", () => {
    expect(applyClientSideSort([], "review-priority")).toEqual([]);
    const single = [oldHealthy];
    const sorted = applyClientSideSort(single, "oldest");
    expect(sorted.length).toBe(1);
    expect(sorted).not.toBe(single);
  });
});

describe("sort URL round-trip", () => {
  it("non-default sort is included in serializeFilters", () => {
    const f = { ...DEFAULT_FILTERS, sort: "review-priority" as SortOption };
    const serialized = serializeFilters(f);
    expect(serialized.sort).toBe("review-priority");
    expect(parseFilters(serialized).sort).toBe("review-priority");
  });
  it("default sort is omitted from URL", () => {
    expect(serializeFilters(DEFAULT_FILTERS).sort).toBeUndefined();
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
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

function rowIds(): string[] {
  const list = screen.getByTestId("ai-doctor-sessions-index-list");
  return within(list)
    .getAllByTestId("ai-doctor-sessions-index-row")
    .map((n) => n.getAttribute("data-session-id") ?? "");
}

describe("AiDoctorSessionsIndex — sort UI", () => {
  it("default sort preserves existing newest-first order", async () => {
    currentRows = [oldHealthy, newHealthy];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    expect(rowIds()).toEqual(["new-healthy", "old-healthy"]);
    const sel = screen.getByTestId(
      "ai-doctor-sessions-index-filter-sort",
    ) as HTMLSelectElement;
    expect(sel.value).toBe("newest");
  });

  it("changing sort updates URL and re-orders rows", async () => {
    currentRows = [oldHealthy, newHealthy];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-sort"),
      { target: { value: "oldest" } },
    );
    expect(
      (
        await screen.findByTestId(
          "ai-doctor-sessions-index-filter-sort",
        )
      ).getAttribute("data-testid"),
    ).toBeTruthy();
    expect(rowIds()).toEqual(["old-healthy", "new-healthy"]);
    const search = screen.getByTestId("probe-search").textContent ?? "";
    expect(search).toContain("sort=oldest");
  });

  it("sort works after applying the Needs my attention preset", async () => {
    currentRows = [...ALL];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.click(
      screen.getByTestId("ai-doctor-sessions-index-needs-attention-preset"),
    );
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-sort"),
      { target: { value: "review-priority" } },
    );
    // Preset keeps only caution+checklist rows: old-high, new-uk.
    // Preset keeps caution+checklist rows: old-high, new-hr, new-uk.
    // Review-priority sort: high-risk (old-high low conf, new-hr high conf)
    // before medium (new-uk).
    expect(rowIds()).toEqual(["old-high", "new-hr", "new-uk"]);
  });

  it("sort works after selecting the built-in saved view", async () => {
    currentRows = [...ALL];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID } },
    );
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-index-filter-sort"),
      { target: { value: "highest-risk" } },
    );
    // Built-in keeps caution+checklist rows (old-high, new-hr, new-uk);
    // highest-risk: high(old-high, new-hr) > medium(new-uk). Within high,
    // newest-first tie-break puts new-hr before old-high.
    expect(rowIds()).toEqual(["new-hr", "old-high", "new-uk"]);
  });

  it("Clear filters resets sort back to newest", async () => {
    currentRows = [oldHealthy, newHealthy];
    renderPage("/doctor/sessions?sort=oldest&risk=low");
    await screen.findByTestId("ai-doctor-sessions-index-list");
    expect(rowIds()).toEqual(["old-healthy", "new-healthy"]);
    fireEvent.click(screen.getByTestId("ai-doctor-sessions-index-clear-filters"));
    const sel = (await screen.findByTestId(
      "ai-doctor-sessions-index-filter-sort",
    )) as HTMLSelectElement;
    expect(sel.value).toBe("newest");
    expect(rowIds()).toEqual(["new-healthy", "old-healthy"]);
  });

  it("active filter labels include the sort label", async () => {
    currentRows = [oldHealthy];
    renderPage("/doctor/sessions?sort=review-priority");
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const labels = screen
      .getAllByTestId("ai-doctor-sessions-index-active-filter-label")
      .map((n) => n.textContent);
    expect(labels.some((l) => l && l.includes("Review priority"))).toBe(true);
  });
});

describe("Static safety scan — sort slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
    "src/lib/aiDoctorSessionsSavedViewsRules.ts",
  ].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const ALL_SRC = FILES.join("\n");

  it("no DB writes", () => {
    for (const src of FILES) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke / service_role", () => {
    expect(ALL_SRC).not.toMatch(/functions\.invoke/);
    expect(ALL_SRC).not.toMatch(/service_role/i);
  });
  it("no action_queue / alerts / tasks writes", () => {
    expect(ALL_SRC).not.toMatch(/from\(['"]action_queue['"]\)/);
    expect(ALL_SRC).not.toMatch(/from\(['"]alerts['"]\)/);
    expect(ALL_SRC).not.toMatch(/from\(['"]tasks['"]\)/);
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
      expect(ALL_SRC.toLowerCase()).not.toContain(tok);
    }
  });
  it("sort comparator/mapping is not duplicated in TSX", () => {
    expect(TSX).not.toContain("CONFIDENCE_RANK");
    expect(TSX).not.toContain("RISK_RANK");
    expect(TSX).not.toContain("compareReviewPriority");
  });
});
