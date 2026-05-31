/**
 * AI Doctor Sessions index — "Needs follow-up: N visible" count chip.
 *
 * Read-only chip showing count of currently loaded rows whose projected
 * review status is `needs_follow_up`. No DB writes, no AI, no automation.
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
  countNeedsFollowUpVisible,
  formatNeedsFollowUpVisibleLabel,
  type FilterableSessionRow,
} from "@/lib/aiDoctorSessionsIndexFilters";
import {
  BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID,
  SAVED_VIEWS_STORAGE_KEY,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import type { AiDoctorSessionReviewState } from "@/lib/aiDoctorSessionReviewStatusRules";

// ---------------- pure helpers ----------------

describe("countNeedsFollowUpVisible + label helpers", () => {
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
      } as AiDoctorSessionReviewState);
    }
    return m;
  }

  it("returns 0 for empty / null / non-array inputs", () => {
    expect(countNeedsFollowUpVisible([])).toBe(0);
    expect(countNeedsFollowUpVisible([], null)).toBe(0);
    expect(countNeedsFollowUpVisible(null as unknown as FilterableSessionRow[])).toBe(0);
  });

  it("returns 0 when no rows project to needs_follow_up", () => {
    const rows = [tinyRow("a"), tinyRow("b")];
    expect(countNeedsFollowUpVisible(rows, stateMap([["a", "reviewed"]]))).toBe(0);
    expect(countNeedsFollowUpVisible(rows, null)).toBe(0);
  });

  it("counts only rows whose projected status is needs_follow_up", () => {
    const rows = [tinyRow("a"), tinyRow("b"), tinyRow("c"), tinyRow("d")];
    const state = stateMap([
      ["a", "needs_follow_up"],
      ["b", "reviewed"],
      ["c", "needs_follow_up"],
    ]);
    expect(countNeedsFollowUpVisible(rows, state)).toBe(2);
  });

  it("formatNeedsFollowUpVisibleLabel always reads 'N visible'", () => {
    expect(formatNeedsFollowUpVisibleLabel(0)).toBe("Needs follow-up: 0 visible");
    expect(formatNeedsFollowUpVisibleLabel(1)).toBe("Needs follow-up: 1 visible");
    expect(formatNeedsFollowUpVisibleLabel(3)).toBe("Needs follow-up: 3 visible");
  });

  it("formatNeedsFollowUpVisibleLabel clamps invalid numbers to 0", () => {
    expect(formatNeedsFollowUpVisibleLabel(NaN)).toBe("Needs follow-up: 0 visible");
    expect(formatNeedsFollowUpVisibleLabel(-2)).toBe("Needs follow-up: 0 visible");
    expect(formatNeedsFollowUpVisibleLabel(Infinity)).toBe("Needs follow-up: 0 visible");
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
let fromCallsByTable: Record<string, number> = {};

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
        fromCallsByTable[table] = (fromCallsByTable[table] ?? 0) + 1;
        if (table === "ai_doctor_session_reviews") return makeChain(reviewRows);
        return makeChain(sessionRows);
      },
    },
  };
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

const CHIP_TID = "ai-doctor-sessions-index-needs-follow-up-visible-chip";

function followUpEvent(id: string, session_id: string, at: string): ReviewRow {
  return {
    id,
    user_id: "u",
    session_id,
    event_type: "needs_follow_up",
    note: null,
    created_at: at,
  };
}

beforeEach(() => {
  sessionRows = [makeRow("a"), makeRow("b"), makeRow("c")];
  reviewRows = [];
  fromCallsByTable = {};
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe("AiDoctorSessionsIndex — Needs follow-up visible chip", () => {
  it("renders '0 visible' when no loaded sessions need follow-up", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    await waitFor(() =>
      expect(chip.textContent).toBe("Needs follow-up: 0 visible"),
    );
  });

  it("renders '1 visible' when exactly one loaded session needs follow-up", async () => {
    reviewRows = [followUpEvent("e1", "a", "2026-05-28T10:00:00Z")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    await waitFor(() =>
      expect(chip.textContent).toBe("Needs follow-up: 1 visible"),
    );
  });

  it("renders '3 visible' when multiple loaded sessions need follow-up", async () => {
    reviewRows = [
      followUpEvent("e1", "a", "2026-05-28T10:00:00Z"),
      followUpEvent("e2", "b", "2026-05-28T11:00:00Z"),
      followUpEvent("e3", "c", "2026-05-28T12:00:00Z"),
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    await waitFor(() =>
      expect(chip.textContent).toBe("Needs follow-up: 3 visible"),
    );
  });

  it("count works when built-in 'Needs follow-up' view is selected", async () => {
    reviewRows = [
      followUpEvent("e1", "a", "2026-05-28T10:00:00Z"),
      followUpEvent("e2", "b", "2026-05-28T11:00:00Z"),
    ];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    fireEvent.change(
      screen.getByTestId("ai-doctor-sessions-saved-views-select"),
      { target: { value: BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID } },
    );
    const chip = await screen.findByTestId(CHIP_TID);
    await waitFor(() =>
      expect(chip.textContent).toBe("Needs follow-up: 2 visible"),
    );
  });

  it("count works when other filters/sort are active", async () => {
    reviewRows = [followUpEvent("e1", "a", "2026-05-28T10:00:00Z")];
    renderPage(
      "/doctor/sessions?sort=oldest&caution=no",
    );
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    await waitFor(() =>
      expect(chip.textContent).toBe("Needs follow-up: 1 visible"),
    );
  });

  it("does not trigger an extra ai_doctor_session_reviews query beyond the existing review hook", async () => {
    reviewRows = [followUpEvent("e1", "a", "2026-05-28T10:00:00Z")];
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    await screen.findByTestId(CHIP_TID);
    await waitFor(() => {
      expect(fromCallsByTable["ai_doctor_session_reviews"] ?? 0).toBe(1);
    });
  });

  it("chip carries a non-global aria-label so it cannot be mistaken for a total", async () => {
    renderPage();
    await screen.findByTestId("ai-doctor-sessions-index-list");
    const chip = await screen.findByTestId(CHIP_TID);
    expect(chip.getAttribute("aria-label")).toBe("Needs follow-up: 0 visible");
    expect((chip.getAttribute("title") ?? "").toLowerCase()).toContain(
      "visible count only",
    );
  });
});

// ---------------- static safety scan ----------------

describe("Static safety scan — Needs follow-up chip slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
  ].map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const TSX = FILES[0];
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
  it("no row-level mutation controls introduced by this slice", () => {
    expect(TSX).not.toMatch(/data-testid=["'][^"']*row-level-mark-review[^"']*["']/);
  });
  it("count + label live in the rules module, not duplicated in TSX", () => {
    // TSX uses the helper, never spells the literal label inline.
    expect(TSX).toMatch(/formatNeedsFollowUpVisibleLabel\(/);
    expect(TSX).not.toMatch(/Needs follow-up:\s*\$\{/);
    // Review-status mapping for the chip is delegated to rowReviewStatus
    // inside the helper — no inline status string-equality in TSX.
    expect(TSX).not.toMatch(/=== ["']needs_follow_up["']/);
  });
});
