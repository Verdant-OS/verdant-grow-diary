/**
 * Tests for the AI Doctor session detail review-action polish:
 *   - pure helper buildSessionReviewActionsCopy returns correct labels +
 *     disabled-state reasons for each projected status.
 *   - detail-page action panel renders the calm helper copy.
 *   - disabled buttons expose the reason via title + aria-label.
 *   - enabled buttons still call the existing mutation hook.
 *   - static safety scan over the page + helper sources confirms no new
 *     write paths beyond the existing useMarkAiDoctorSessionReview hook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import React from "react";
import {
  buildSessionReviewActionsCopy,
  REVIEW_ACTIONS_APPEND_ONLY_HELPER_TEXT,
  REVIEW_ACTIONS_NO_SIDE_EFFECTS_HELPER_TEXT,
} from "@/lib/aiDoctorSessionReviewStatusRules";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";

// --- Pure helper -------------------------------------------------------------
describe("buildSessionReviewActionsCopy", () => {
  it("not_reviewed → only Clear is disabled, with reason", () => {
    const c = buildSessionReviewActionsCopy("not_reviewed");
    expect(c.isMarkReviewedDisabledByStatus).toBe(false);
    expect(c.isNeedsFollowUpDisabledByStatus).toBe(false);
    expect(c.isClearDisabledByStatus).toBe(true);
    expect(c.markReviewedDisabledReason).toBeNull();
    expect(c.needsFollowUpDisabledReason).toBeNull();
    expect(c.clearDisabledReason).toMatch(/no review status/i);
  });
  it("reviewed → only Mark reviewed is disabled, with reason", () => {
    const c = buildSessionReviewActionsCopy("reviewed");
    expect(c.isMarkReviewedDisabledByStatus).toBe(true);
    expect(c.isNeedsFollowUpDisabledByStatus).toBe(false);
    expect(c.isClearDisabledByStatus).toBe(false);
    expect(c.markReviewedDisabledReason).toMatch(/already.*reviewed/i);
    expect(c.clearDisabledReason).toBeNull();
  });
  it("needs_follow_up → only Needs follow-up is disabled, with reason", () => {
    const c = buildSessionReviewActionsCopy("needs_follow_up");
    expect(c.isNeedsFollowUpDisabledByStatus).toBe(true);
    expect(c.needsFollowUpDisabledReason).toMatch(/already.*follow.?up/i);
    expect(c.isMarkReviewedDisabledByStatus).toBe(false);
    expect(c.isClearDisabledByStatus).toBe(false);
  });
  it("exposes calm append-only and no-side-effects helper text", () => {
    const c = buildSessionReviewActionsCopy("not_reviewed");
    expect(c.appendOnlyHelperText).toBe(REVIEW_ACTIONS_APPEND_ONLY_HELPER_TEXT);
    expect(c.noSideEffectsHelperText).toBe(
      REVIEW_ACTIONS_NO_SIDE_EFFECTS_HELPER_TEXT,
    );
    expect(REVIEW_ACTIONS_APPEND_ONLY_HELPER_TEXT).toMatch(/append-only event/i);
    expect(REVIEW_ACTIONS_NO_SIDE_EFFECTS_HELPER_TEXT).toMatch(
      /does not change alerts.*tasks.*action queue/i,
    );
  });
});

// --- Detail-page render ------------------------------------------------------
const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const PLANT_ID = "22222222-2222-2222-2222-222222222222";

const mockState = vi.hoisted(() => ({
  insertCalls: [] as Array<{ table: string; payload: unknown }>,
  reviewEvents: [] as Array<{
    id: string;
    user_id: string;
    session_id: string;
    event_type: "marked_reviewed" | "needs_follow_up" | "cleared";
    note: string | null;
    created_at: string;
  }>,
}));

function setReviewEvents(
  evs: Array<{
    id: string;
    event_type: "marked_reviewed" | "needs_follow_up" | "cleared";
    created_at?: string;
    note?: string | null;
  }>,
) {
  mockState.reviewEvents = evs.map((e) => ({
    id: e.id,
    user_id: "u1",
    session_id: SESSION_ID,
    event_type: e.event_type,
    note: e.note ?? null,
    created_at: e.created_at ?? "2025-01-01T00:00:00.000Z",
  }));
}

vi.mock("@/integrations/supabase/client", () => {
  const SESSION_ID = "11111111-1111-1111-1111-111111111111";
  const PLANT_ID = "22222222-2222-2222-2222-222222222222";
  const sessionRow = {
    id: SESSION_ID,
    plant_id: PLANT_ID,
    tent_id: null,
    grow_id: null,
    user_id: "u1",
    photo_id: null,
    photo_url: null,
    status: "completed",
    summary: "ok",
    likely_issue: null,
    confidence: 0.8,
    risk_level: "low",
    evidence: null,
    immediate_action: null,
    avoid: null,
    follow_up_24h: null,
    recovery_3d: null,
    missing_information: null,
    possible_causes: null,
    suggest_action_queue: false,
    model: "test",
    model_provider: "test",
    raw_response: null,
    error_text: null,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  };

  const tableBuilder = (table: string) => {
    if (table === "ai_doctor_sessions") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: sessionRow, error: null }),
          }),
        }),
      };
    }
    if (table === "ai_doctor_session_reviews") {
      return {
        insert: (payload: unknown) => {
          mockState.mockState.insertCalls.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
        select: () => ({
          in: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({ data: mockState.reviewEvents, error: null }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        in: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    };
  };
  return {
    supabase: {
      from: (table: string) => tableBuilder(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/ai-doctor/sessions/${SESSION_ID}`]}>
        <Routes>
          <Route
            path="/ai-doctor/sessions/:sessionId"
            element={<AiDoctorSessionDetail />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockState.insertCalls.length = 0;
  mockState.reviewEvents = [];
});

describe("AiDoctorSessionDetail — review action polish", () => {
  it("renders both helper copy lines under the action group", async () => {
    setReviewEvents([]);
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-session-detail-review-status-actions"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-helper-append-only")
        .textContent,
    ).toMatch(/append-only event/i);
    expect(
      screen.getByTestId(
        "ai-doctor-session-detail-review-helper-no-side-effects",
      ).textContent,
    ).toMatch(/does not change alerts.*tasks.*action queue/i);
  });

  it("Clear button is disabled with reason when status is not_reviewed", async () => {
    setReviewEvents([]);
    renderPage();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-clear",
    );
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toMatch(/no review status/i);
    expect(btn.getAttribute("aria-label")).toMatch(/no review status/i);
    const mark = screen.getByTestId("ai-doctor-session-detail-review-mark-reviewed");
    expect(mark).not.toBeDisabled();
    expect(mark.getAttribute("title")).toBeNull();
  });

  it("Mark reviewed button is disabled with reason when already reviewed", async () => {
    setReviewEvents([
      { id: "e1", event_type: "marked_reviewed" },
    ]);
    renderPage();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    );
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn.getAttribute("title")).toMatch(/already.*reviewed/i);
    expect(btn.getAttribute("aria-label")).toMatch(/already.*reviewed/i);
  });

  it("Needs follow-up button is disabled with reason when already flagged", async () => {
    setReviewEvents([{ id: "e1", event_type: "needs_follow_up" }]);
    renderPage();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-needs-follow-up",
    );
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn.getAttribute("title")).toMatch(/already.*follow.?up/i);
    expect(btn.getAttribute("aria-label")).toMatch(/already.*follow.?up/i);
  });

  it("enabled Mark reviewed button still inserts an append-only review event", async () => {
    setReviewEvents([]);
    renderPage();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    );
    fireEvent.click(btn);
    await waitFor(() => expect(mockState.insertCalls.length).toBeGreaterThan(0));
    expect(mockState.insertCalls[0].table).toBe("ai_doctor_session_reviews");
    expect(mockState.insertCalls[0].payload).toMatchObject({
      session_id: SESSION_ID,
      event_type: "marked_reviewed",
    });
    const p = mockState.insertCalls[0].payload as Record<string, unknown>;
    expect("user_id" in p).toBe(false);
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const PAGE_SRC = readFileSync(
  resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"),
  "utf8",
);
const RULES_SRC = readFileSync(
  resolve(ROOT, "src/lib/aiDoctorSessionReviewStatusRules.ts"),
  "utf8",
);

describe("review action polish — safety scan", () => {
  it("page introduces no insert/update/upsert/delete beyond the existing hook", () => {
    expect(PAGE_SRC).not.toMatch(/\.insert\(/);
    expect(PAGE_SRC).not.toMatch(/\.update\(/);
    expect(PAGE_SRC).not.toMatch(/\.upsert\(/);
    expect(PAGE_SRC).not.toMatch(/\.delete\(/);
  });
  it("page does not invoke edge functions or rpcs for review actions", () => {
    expect(PAGE_SRC).not.toMatch(/functions\.invoke/);
    expect(PAGE_SRC).not.toMatch(/supabase\.rpc\(/);
  });
  it("page does not write to action_queue / alerts / tasks", () => {
    expect(PAGE_SRC).not.toMatch(/action_queue/);
    expect(PAGE_SRC).not.toMatch(/from\(["']alerts["']\)/);
    expect(PAGE_SRC).not.toMatch(/from\(["']tasks["']\)/);
    expect(PAGE_SRC).not.toMatch(/alert_events/);
  });
  it("page contains no service_role / automation / device-control markers", () => {
    const lower = PAGE_SRC.toLowerCase();
    expect(lower).not.toContain("service_role");
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
  it("pure rules file remains pure (no I/O, no React)", () => {
    expect(RULES_SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES_SRC).not.toMatch(/from\s+["']react["']/);
    expect(RULES_SRC).not.toMatch(/functions\.invoke/);
  });
});
