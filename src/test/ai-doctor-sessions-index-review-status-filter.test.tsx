/**
 * AI Doctor Sessions index — durable review-status filter.
 *
 * Covers pure helpers (parse/serialize/labels/applyClientSideFilters),
 * saved-view round-trip + signature, and UI wiring on the page.
 *
 * Safety: read-only. No DB writes, no AI, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import {
  applyClientSideFilters,
  DEFAULT_FILTERS,
  FILTER_PARAM_KEYS,
  formatActiveFilterLabels,
  isFiltersActive,
  parseFilters,
  parseReviewStatus,
  rowReviewStatus,
  serializeFilters,
  type FilterableSessionRow,
  type SessionsIndexFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";
import {
  addSavedView,
  BUILTIN_SAVED_VIEWS,
  BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
  SAVED_VIEWS_STORAGE_KEY,
  savedViewToSearchParams,
  viewSignature,
  type SavedView,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import type { AiDoctorSessionReviewState } from "@/lib/aiDoctorSessionReviewStatusRules";

// ---------------- pure helpers ----------------

describe("Review-status filter — pure helpers", () => {
  it("DEFAULT_FILTERS.reviewStatus is 'any'", () => {
    expect(DEFAULT_FILTERS.reviewStatus).toBe("any");
  });

  it("parseReviewStatus accepts valid values and rejects others", () => {
    expect(parseReviewStatus("any")).toBe("any");
    expect(parseReviewStatus("not_reviewed")).toBe("not_reviewed");
    expect(parseReviewStatus("reviewed")).toBe("reviewed");
    expect(parseReviewStatus("needs_follow_up")).toBe("needs_follow_up");
    expect(parseReviewStatus("garbage")).toBe("any");
    expect(parseReviewStatus(undefined)).toBe("any");
  });

  it("isFiltersActive flags any non-'any' review status as active", () => {
    expect(isFiltersActive(DEFAULT_FILTERS)).toBe(false);
    expect(
      isFiltersActive({ ...DEFAULT_FILTERS, reviewStatus: "reviewed" }),
    ).toBe(true);
    expect(
      isFiltersActive({ ...DEFAULT_FILTERS, reviewStatus: "not_reviewed" }),
    ).toBe(true);
    expect(
      isFiltersActive({ ...DEFAULT_FILTERS, reviewStatus: "needs_follow_up" }),
    ).toBe(true);
  });

  it("serialize/parse round-trips review status and omits the default", () => {
    expect(serializeFilters(DEFAULT_FILTERS)).not.toHaveProperty(
      FILTER_PARAM_KEYS.reviewStatus,
    );
    const f: SessionsIndexFilters = {
      ...DEFAULT_FILTERS,
      reviewStatus: "needs_follow_up",
    };
    const ser = serializeFilters(f);
    expect(ser[FILTER_PARAM_KEYS.reviewStatus]).toBe("needs_follow_up");
    expect(parseFilters(ser).reviewStatus).toBe("needs_follow_up");
  });

  it("formatActiveFilterLabels produces the required review labels", () => {
    expect(
      formatActiveFilterLabels({ ...DEFAULT_FILTERS, reviewStatus: "reviewed" }),
    ).toContain("Review: Reviewed");
    expect(
      formatActiveFilterLabels({
        ...DEFAULT_FILTERS,
        reviewStatus: "not_reviewed",
      }),
    ).toContain("Review: Not reviewed");
    expect(
      formatActiveFilterLabels({
        ...DEFAULT_FILTERS,
        reviewStatus: "needs_follow_up",
      }),
    ).toContain("Review: Needs follow-up");
    expect(
      formatActiveFilterLabels(DEFAULT_FILTERS).some((l) =>
        l.startsWith("Review:"),
      ),
    ).toBe(false);
  });

  function tinyRow(id: string): FilterableSessionRow {
    return { id, diagnosis: null } as unknown as FilterableSessionRow;
  }

  function stateMap(
    entries: Array<[string, AiDoctorSessionReviewState["status"]]>,
  ): Map<string, AiDoctorSessionReviewState> {
    const m = new Map<string, AiDoctorSessionReviewState>();
    for (const [id, status] of entries) {
      m.set(id, {
        status,
        latestEventId: "x",
        latestEventAt: "2026-05-30T00:00:00Z",
        latestNote: null,
      });
    }
    return m;
  }

  it("rowReviewStatus defaults to not_reviewed for missing entries", () => {
    const m = stateMap([["a", "reviewed"]]);
    expect(rowReviewStatus(tinyRow("a"), m)).toBe("reviewed");
    expect(rowReviewStatus(tinyRow("b"), m)).toBe("not_reviewed");
    expect(rowReviewStatus(tinyRow("b"), null)).toBe("not_reviewed");
  });

  it("applyClientSideFilters('not_reviewed') includes missing + cleared rows", () => {
    const rows = [tinyRow("a"), tinyRow("b"), tinyRow("c"), tinyRow("d")];
    // a: reviewed, b: needs_follow_up, c: not_reviewed (cleared projects here),
    // d: missing from map.
    const m = stateMap([
      ["a", "reviewed"],
      ["b", "needs_follow_up"],
      ["c", "not_reviewed"],
    ]);
    const out = applyClientSideFilters(
      rows,
      { ...DEFAULT_FILTERS, reviewStatus: "not_reviewed" },
      m,
    );
    expect(out.map((r) => r.id)).toEqual(["c", "d"]);
  });

  it("applyClientSideFilters('reviewed') keeps only reviewed rows", () => {
    const rows = [tinyRow("a"), tinyRow("b"), tinyRow("c")];
    const m = stateMap([
      ["a", "reviewed"],
      ["b", "needs_follow_up"],
    ]);
    const out = applyClientSideFilters(
      rows,
      { ...DEFAULT_FILTERS, reviewStatus: "reviewed" },
      m,
    );
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("applyClientSideFilters('needs_follow_up') keeps only needs-follow-up", () => {
    const rows = [tinyRow("a"), tinyRow("b"), tinyRow("c")];
    const m = stateMap([
      ["a", "reviewed"],
      ["b", "needs_follow_up"],
      ["c", "needs_follow_up"],
    ]);
    const out = applyClientSideFilters(
      rows,
      { ...DEFAULT_FILTERS, reviewStatus: "needs_follow_up" },
      m,
    );
    expect(out.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("combines deterministically with other filters", () => {
    // confidence=high AND reviewStatus=reviewed.
    const rows: FilterableSessionRow[] = [
      { id: "a", diagnosis: null, displayed_confidence: 0.95 } as unknown as FilterableSessionRow,
      { id: "b", diagnosis: null, displayed_confidence: 0.95 } as unknown as FilterableSessionRow,
      { id: "c", diagnosis: null, displayed_confidence: 0.4 } as unknown as FilterableSessionRow,
    ];
    const m = stateMap([
      ["a", "reviewed"],
      ["b", "needs_follow_up"],
      ["c", "reviewed"],
    ]);
    const out = applyClientSideFilters(
      rows,
      { ...DEFAULT_FILTERS, confidence: "high", reviewStatus: "reviewed" },
      m,
    );
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });
});

// ---------------- saved-view round-trip ----------------

describe("Review-status filter — saved views", () => {
  it("addSavedView preserves the review-status filter", () => {
    const result = addSavedView({
      label: "Needs follow-up only",
      filters: { ...DEFAULT_FILTERS, reviewStatus: "needs_follow_up" },
      page: 0,
      existing: [],
    });
    expect(result.ok).toBe(true);
    expect(result.view?.filters.reviewStatus).toBe("needs_follow_up");
  });

  it("viewSignature differs by review status (dedup-safe)", () => {
    const a = viewSignature(
      { ...DEFAULT_FILTERS, reviewStatus: "reviewed" },
      0,
    );
    const b = viewSignature(
      { ...DEFAULT_FILTERS, reviewStatus: "needs_follow_up" },
      0,
    );
    const c = viewSignature(DEFAULT_FILTERS, 0);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it("savedViewToSearchParams writes reviewStatus to the URL", () => {
    const view: SavedView = {
      id: "v1",
      label: "x",
      filters: { ...DEFAULT_FILTERS, reviewStatus: "reviewed" },
      page: 0,
      createdAt: "2026-05-30T00:00:00Z",
    };
    const out = savedViewToSearchParams(view, new URLSearchParams());
    expect(out.get(FILTER_PARAM_KEYS.reviewStatus)).toBe("reviewed");
  });

  it("built-in 'Needs my attention' view does NOT set a review filter", () => {
    const builtIn = BUILTIN_SAVED_VIEWS.find(
      (v) => v.id === BUILTIN_SAVED_VIEW_NEEDS_ATTENTION_ID,
    );
    expect(builtIn?.filters.reviewStatus).toBe("any");
  });
});

// ---------------- UI integration ----------------

interface ReviewRow {
  id: string;
  user_id: string;
  session_id: string;
  event_type: "marked_reviewed" | "needs_follow_up" | "cleared";
  note: string | null;
  created_at: string;
}

let sessionRows: AiDoctorSessionRow[] = [];
let reviewRows: ReviewRow[] = [];

vi.mock("@/integrations/supabase/client", () => {
  function makeChain(initial: unknown[]) {
    let current = initial;
    const chain: Record<string, unknown> = {};
    const passthrough = ["select", "eq", "order", "limit", "range", "not", "gte", "or"];
    for (const m of passthrough) chain[m] = () => chain;
    chain.in = (_column: string, values: unknown) => {
      if (Array.isArray(values)) {
        current = (current as ReviewRow[]).filter((r) =>
          (values as string[]).includes(r.session_id),
        );
      }
      return chain;
    };
    chain.then = (resolveFn: (v: unknown) => unknown) =>
      Promise.resolve({ data: current, error: null }).then(resolveFn);
    return chain;
  }
  return {
    supabase: {
      from: (table: string) => {
        if (table === "ai_doctor_session_reviews") return makeChain(reviewRows);
        return makeChain(sessionRows);
      },
    },
  };
});

function makeRow(
  id: string,
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

const SELECT_TID = "ai-doctor-sessions-index-filter-review-status";
const ROW_TID = "ai-doctor-sessions-index-row";
const CHIP_TID = "ai-doctor-sessions-index-review-status-chip";

beforeEach(() => {
  sessionRows = [makeRow("a"), makeRow("b"), makeRow("c")];
  reviewRows = [
    {
      id: "e1",
      user_id: "u",
      session_id: "a",
      event_type: "marked_reviewed",
      note: null,
      created_at: "2026-05-28T10:00:00Z",
    },
    {
      id: "e2",
      user_id: "u",
      session_id: "b",
      event_type: "needs_follow_up",
      note: null,
      created_at: "2026-05-28T11:00:00Z",
    },
    // c: no review events → not_reviewed.
  ];
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("Review-status filter — UI integration", () => {
  it("defaults to 'any' and shows all rows; chips remain visible", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = (await screen.findByTestId(
      SELECT_TID,
    )) as HTMLSelectElement;
    expect(select.value).toBe("any");
    expect(screen.getAllByTestId(ROW_TID)).toHaveLength(3);
    await screen.findByTestId(CHIP_TID); // at least one chip rendered
  });

  it("filtering to 'reviewed' shows only reviewed rows; chip still visible", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    // Wait for review state to settle before applying the filter.
    await screen.findByTestId(CHIP_TID);
    fireEvent.change(screen.getByTestId(SELECT_TID), {
      target: { value: "reviewed" },
    });
    await waitFor(() => {
      const rows = screen.getAllByTestId(ROW_TID);
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute("data-session-id")).toBe("a");
    });
    expect(screen.getAllByTestId(CHIP_TID).length).toBe(1);
  });

  it("filtering to 'needs_follow_up' shows only those rows", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await screen.findByTestId(CHIP_TID);
    fireEvent.change(screen.getByTestId(SELECT_TID), {
      target: { value: "needs_follow_up" },
    });
    await waitFor(() => {
      const rows = screen.getAllByTestId(ROW_TID);
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute("data-session-id")).toBe("b");
    });
  });

  it("filtering to 'not_reviewed' includes rows with missing state", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await screen.findByTestId(CHIP_TID);
    fireEvent.change(screen.getByTestId(SELECT_TID), {
      target: { value: "not_reviewed" },
    });
    await waitFor(() => {
      const rows = screen.getAllByTestId(ROW_TID);
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute("data-session-id")).toBe("c");
    });
  });

  it("renders the active filter label", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await screen.findByTestId(CHIP_TID);
    fireEvent.change(screen.getByTestId(SELECT_TID), {
      target: { value: "reviewed" },
    });
    const labels = await screen.findAllByTestId(
      "ai-doctor-sessions-index-active-filter-label",
    );
    expect(labels.map((l) => l.textContent)).toContain("Review: Reviewed");
  });

  it("Clear filters resets review filter to 'any'", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await screen.findByTestId(CHIP_TID);
    fireEvent.change(screen.getByTestId(SELECT_TID), {
      target: { value: "needs_follow_up" },
    });
    const clear = await screen.findByTestId(
      "ai-doctor-sessions-index-clear-filters",
    );
    fireEvent.click(clear);
    await waitFor(() => {
      const select = screen.getByTestId(SELECT_TID) as HTMLSelectElement;
      expect(select.value).toBe("any");
    });
  });

  it("hydrates the select from the URL", async () => {
    renderPage("/doctor/sessions?reviewStatus=needs_follow_up");
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const select = (await screen.findByTestId(
      SELECT_TID,
    )) as HTMLSelectElement;
    expect(select.value).toBe("needs_follow_up");
  });
});

// ---------------- static safety scan ----------------

describe("Static safety scan — review-status filter slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const TSX = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionsIndex.tsx"),
    "utf8",
  );
  const FILTERS = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionsIndexFilters.ts"),
    "utf8",
  );
  const SAVED = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionsSavedViewsRules.ts"),
    "utf8",
  );
  const ALL = `${TSX}\n${FILTERS}\n${SAVED}`;

  it("no DB writes in lib files", () => {
    for (const src of [FILTERS, SAVED]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.delete\(/);
    }
  });

  it("no functions.invoke / service_role / action_queue / alerts / tasks writes", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/service_role/i);
    expect(ALL).not.toMatch(/from\(['"]action_queue['"]\)/);
    expect(ALL).not.toMatch(/from\(['"]alerts['"]\)/);
    expect(ALL).not.toMatch(/from\(['"]tasks['"]\)/);
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
      expect(TSX.toLowerCase()).not.toContain(tok);
    }
  });

  it("no AI generation calls in slice", () => {
    for (const src of [TSX, FILTERS, SAVED]) {
      expect(src).not.toMatch(/generateContent/);
      expect(src).not.toMatch(/openai/i);
      expect(src).not.toMatch(/anthropic/i);
    }
  });

  it("review label mapping is not duplicated in TSX", () => {
    // Labels live in formatActiveFilterLabels (filters lib). TSX must not
    // hard-code the active-label strings.
    expect(TSX).not.toContain("Review: Reviewed");
    expect(TSX).not.toContain("Review: Not reviewed");
    expect(TSX).not.toContain("Review: Needs follow-up");
    // Page does wire the filter through serializeFilters / formatActive…
    expect(TSX).toMatch(/reviewStatus/);
  });
});
