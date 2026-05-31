/**
 * AI Doctor session detail — read-only review-status panel + history.
 *
 * Verifies the durable review-status surface on the detail page:
 *  - Projected status (not_reviewed / reviewed / needs_follow_up) renders.
 *  - Event history renders newest-first, includes notes when present.
 *  - Empty state appears when no review events exist.
 *  - The hook is scoped to the current session id only.
 *  - Caution checklist / review summary continue to render unchanged.
 *  - Static safety: no writes, no AI calls, no service_role, no action_queue.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import {
  projectLatestReviewStateBySession,
  type AiDoctorSessionReviewEvent,
} from "@/lib/aiDoctorSessionReviewStatusRules";

// --- Session fixture (shared) -------------------------------------------------
const fixtureDiagnosis: Diagnosis = {
  summary: "Mild heat stress on canopy.",
  likelyIssue: "Heat stress",
  confidence: 0.7,
  evidence: ["Tip curl visible"],
  missingInformation: ["No leaf-surface temp"],
  possibleCauses: ["Light too close"],
  immediateAction: "Raise light 10cm.",
  whatNotToDo: ["Do not defoliate"],
  followUp24h: { summary: "Recheck.", checklist: [] },
  recoveryPlan3d: { summary: "Stabilize VPD.", checklist: [] },
  riskLevel: "medium",
  suggestedActions: [
    {
      type: "task",
      title: "Raise light",
      detail: "Raise light by 10cm.",
      priority: "medium",
      reason: "Reduce radiant load.",
      approvalRequired: true,
    },
  ],
};

const SESSION_ID = "sess-rev-1";
const OTHER_SESSION_ID = "sess-rev-2";

const fixture: AiDoctorSessionRow = {
  id: SESSION_ID,
  created_at: "2026-05-27T10:00:00Z",
  plant_id: "p1",
  tent_id: "t1",
  grow_id: "g1",
  question: "Why are leaves curling?",
  diagnosis: fixtureDiagnosis,
  raw_confidence: 0.8,
  displayed_confidence: 0.7,
  context_confidence_ceiling: "medium",
  suggested_actions: fixtureDiagnosis.suggestedActions,
};

// --- Supabase mock with configurable review-event payload --------------------
let reviewEventsForNextTest: AiDoctorSessionReviewEvent[] = [];
const reviewScopeCalls: Array<unknown> = [];

vi.mock("@/integrations/supabase/client", () => {
  const sessionsSelect = () => ({
    eq: (_col: string, value: string) => ({
      order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      maybeSingle: () =>
        Promise.resolve(
          value === SESSION_ID
            ? { data: fixture, error: null }
            : { data: null, error: null },
        ),
    }),
  });
  const reviewsSelect = () => ({
    in: (_col: string, scope: unknown) => {
      reviewScopeCalls.push(scope);
      return {
        order: () => ({
          limit: () =>
            Promise.resolve({ data: reviewEventsForNextTest, error: null }),
        }),
      };
    },
    order: () => ({
      limit: () =>
        Promise.resolve({ data: reviewEventsForNextTest, error: null }),
    }),
  });
  return {
    supabase: {
      from: (table: string) => ({
        select: () =>
          table === "ai_doctor_session_reviews"
            ? reviewsSelect()
            : sessionsSelect(),
      }),
    },
  };
});

function renderDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/doctor/sessions/${SESSION_ID}`]}>
        <Routes>
          <Route
            path="/doctor/sessions/:sessionId"
            element={<AiDoctorSessionDetail />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function reviewRow(
  partial: Partial<AiDoctorSessionReviewEvent> & {
    id: string;
    event_type: AiDoctorSessionReviewEvent["event_type"];
    created_at: string;
  },
): AiDoctorSessionReviewEvent {
  return {
    user_id: "u1",
    session_id: SESSION_ID,
    note: null,
    ...partial,
  };
}

beforeEach(() => {
  reviewEventsForNextTest = [];
  reviewScopeCalls.length = 0;
});

describe("AiDoctorSessionDetail — review status panel", () => {
  it("shows 'Not reviewed' when there are no review events", async () => {
    reviewEventsForNextTest = [];
    renderDetail();
    const panel = await screen.findByTestId(
      "ai-doctor-session-detail-review-status-panel",
    );
    expect(panel.getAttribute("data-review-status")).toBe("not_reviewed");
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-status-badge")
        .textContent,
    ).toMatch(/not reviewed/i);
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-status-empty"),
    ).toBeTruthy();
  });

  it("shows 'Reviewed' when latest event is marked_reviewed", async () => {
    reviewEventsForNextTest = [
      reviewRow({
        id: "e1",
        event_type: "marked_reviewed",
        created_at: "2026-05-28T10:00:00Z",
      }),
    ];
    renderDetail();
    await waitFor(() => {
      const panel = screen.getByTestId(
        "ai-doctor-session-detail-review-status-panel",
      );
      expect(panel.getAttribute("data-review-status")).toBe("reviewed");
    });
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-status-badge")
        .textContent,
    ).toMatch(/^reviewed$/i);
  });

  it("shows 'Needs follow-up' when latest event is needs_follow_up", async () => {
    reviewEventsForNextTest = [
      reviewRow({
        id: "e1",
        event_type: "marked_reviewed",
        created_at: "2026-05-28T10:00:00Z",
      }),
      reviewRow({
        id: "e2",
        event_type: "needs_follow_up",
        created_at: "2026-05-28T11:00:00Z",
        note: "Check humidity overnight",
      }),
    ];
    renderDetail();
    await waitFor(() => {
      const panel = screen.getByTestId(
        "ai-doctor-session-detail-review-status-panel",
      );
      expect(panel.getAttribute("data-review-status")).toBe("needs_follow_up");
    });
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-status-badge")
        .textContent,
    ).toMatch(/needs follow-up/i);
  });

  it("shows 'Not reviewed' when latest event is cleared", async () => {
    reviewEventsForNextTest = [
      reviewRow({
        id: "e1",
        event_type: "marked_reviewed",
        created_at: "2026-05-28T10:00:00Z",
      }),
      reviewRow({
        id: "e2",
        event_type: "cleared",
        created_at: "2026-05-28T12:00:00Z",
      }),
    ];
    renderDetail();
    const panel = await screen.findByTestId(
      "ai-doctor-session-detail-review-status-panel",
    );
    expect(panel.getAttribute("data-review-status")).toBe("not_reviewed");
    // Empty-state copy only shows when there are zero events.
    expect(
      screen.queryByTestId("ai-doctor-session-detail-review-status-empty"),
    ).toBeNull();
  });

  it("renders event history newest-first", async () => {
    reviewEventsForNextTest = [
      reviewRow({
        id: "e1",
        event_type: "marked_reviewed",
        created_at: "2026-05-28T10:00:00Z",
      }),
      reviewRow({
        id: "e2",
        event_type: "needs_follow_up",
        created_at: "2026-05-28T11:00:00Z",
      }),
      reviewRow({
        id: "e3",
        event_type: "cleared",
        created_at: "2026-05-28T12:00:00Z",
      }),
    ];
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-review-status-panel");
    const items = screen.getAllByTestId(
      "ai-doctor-session-detail-review-status-event",
    );
    expect(items.map((n) => n.getAttribute("data-event-type"))).toEqual([
      "cleared",
      "needs_follow_up",
      "marked_reviewed",
    ]);
  });

  it("renders notes when present on history items", async () => {
    reviewEventsForNextTest = [
      reviewRow({
        id: "e1",
        event_type: "needs_follow_up",
        created_at: "2026-05-28T11:00:00Z",
        note: "Recheck VPD in 24h",
      }),
    ];
    renderDetail();
    const item = await screen.findByTestId(
      "ai-doctor-session-detail-review-status-event",
    );
    const note = within(item).getByTestId(
      "ai-doctor-session-detail-review-status-event-note",
    );
    expect(note.textContent).toMatch(/recheck vpd/i);
  });

  it("calm empty state appears when no events exist", async () => {
    reviewEventsForNextTest = [];
    renderDetail();
    const empty = await screen.findByTestId(
      "ai-doctor-session-detail-review-status-empty",
    );
    expect(empty.textContent).toMatch(/no review activity/i);
  });

  it("scopes the hook query to the current session id only", async () => {
    reviewEventsForNextTest = [];
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-review-status-panel");
    // The supabase mock recorded the `.in("session_id", scope)` argument.
    expect(reviewScopeCalls.length).toBeGreaterThan(0);
    for (const scope of reviewScopeCalls) {
      expect(Array.isArray(scope)).toBe(true);
      expect(scope as string[]).toEqual([SESSION_ID]);
      expect((scope as string[]).includes(OTHER_SESSION_ID)).toBe(false);
    }
  });

  it("preserves caution checklist and review-summary surfaces", async () => {
    reviewEventsForNextTest = [];
    renderDetail();
    // ReviewSummarySection still mounts (its known testid stem appears).
    expect(
      await screen.findByTestId("ai-doctor-session-detail-review-followup"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-session-detail-evidence"),
    ).toBeTruthy();
  });
});

// --- Pure-helper coverage (projection consistency) ---------------------------
describe("review history projection sanity", () => {
  it("projection map agrees with the latest event in the panel order", () => {
    const events: AiDoctorSessionReviewEvent[] = [
      reviewRow({
        id: "a",
        event_type: "marked_reviewed",
        created_at: "2026-05-28T09:00:00Z",
      }),
      reviewRow({
        id: "b",
        event_type: "needs_follow_up",
        created_at: "2026-05-28T10:00:00Z",
      }),
    ];
    const map = projectLatestReviewStateBySession(events);
    expect(map.get(SESSION_ID)?.status).toBe("needs_follow_up");
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGE = read("src/pages/AiDoctorSessionDetail.tsx");
const HOOK = read("src/hooks/useAiDoctorSessionReviews.ts");
const RULES = read("src/lib/aiDoctorSessionReviewStatusRules.ts");

describe("AiDoctorSessionDetail review-status surface — safety scan", () => {
  it("contains no write paths in the page or review hook", () => {
    for (const src of [PAGE, HOOK]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.delete\(/);
    }
  });
  it("makes no edge function calls and uses no service_role", () => {
    for (const src of [PAGE, HOOK]) {
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src.toLowerCase()).not.toContain("service_role");
    }
  });
  it("does not write to action_queue / alerts / tasks", () => {
    const all = [PAGE, HOOK].join("\n");
    expect(all).not.toMatch(/from\(["']action_queue["']\)/);
    expect(all).not.toMatch(/from\(["']alerts["']\)/);
    expect(all).not.toMatch(/from\(["']alert_events["']\)/);
    expect(all).not.toMatch(/from\(["']tasks["']\)/);
  });
  it("does not embed automation/device-control markers", () => {
    const lower = [PAGE, HOOK].join("\n").toLowerCase();
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
  it("keeps review-status mapping in pure helpers (not duplicated in TSX)", () => {
    // The page must import the centralized helpers/types, not re-declare
    // its own status→label or event-type→label maps in JSX.
    expect(PAGE).toMatch(/buildSessionReviewHistoryViewModel/);
    expect(PAGE).not.toMatch(/Marked reviewed/);
    expect(PAGE).not.toMatch(/Flagged: needs follow-up/);
    expect(PAGE).not.toMatch(/Cleared review status/);
    // Status labels live in the rules module.
    expect(RULES).toMatch(/Not reviewed/);
    expect(RULES).toMatch(/Reviewed/);
    expect(RULES).toMatch(/Needs follow-up/);
  });
});
