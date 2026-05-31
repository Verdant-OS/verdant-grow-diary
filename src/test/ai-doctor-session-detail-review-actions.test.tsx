/**
 * AI Doctor session detail — review-status mutation action controls.
 *
 * Verifies the user-initiated action buttons inside SessionReviewStatusPanel:
 *  - All three buttons render (Mark reviewed / Needs follow-up / Clear).
 *  - Disabled states match the projected current status.
 *  - Clicking each button inserts the matching event_type with correct payload.
 *  - The optional note input is trimmed/capped and omitted when empty.
 *  - No user_id is sent from the client.
 *  - Server error is surfaced calmly via the inline error region.
 *  - Existing caution checklist + review summary + copy button still render.
 *  - Static safety scan confirms no row-level mutation controls, no
 *    action_queue / alerts / tasks writes, no AI calls, no automation markers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { AiDoctorSessionReviewEvent } from "@/lib/aiDoctorSessionReviewStatusRules";

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

const SESSION_ID = "sess-mut-1";
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

// --- Mutable mock state shared across tests ---------------------------------
let reviewEvents: AiDoctorSessionReviewEvent[] = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
let nextInsertError: { message: string } | null = null;

const forbidden = {
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
  functionsInvoke: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => {
  const sessionsBuilder = () => ({
    select: () => ({
      eq: (_col: string, value: string) => ({
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        maybeSingle: () =>
          Promise.resolve(
            value === SESSION_ID
              ? { data: fixture, error: null }
              : { data: null, error: null },
          ),
      }),
    }),
    update: (...args: unknown[]) => {
      forbidden.update(...args);
      return Promise.resolve({ data: null, error: null });
    },
  });
  const reviewsBuilder = () => ({
    select: () => ({
      in: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: reviewEvents, error: null }),
        }),
      }),
      order: () => ({
        limit: () => Promise.resolve({ data: reviewEvents, error: null }),
      }),
    }),
    insert: (payload: Record<string, unknown>) => {
      insertCalls.push({ table: "ai_doctor_session_reviews", payload });
      return Promise.resolve({ data: null, error: nextInsertError });
    },
    update: (...args: unknown[]) => {
      forbidden.update(...args);
      return Promise.resolve({ data: null, error: null });
    },
    upsert: (...args: unknown[]) => {
      forbidden.upsert(...args);
      return Promise.resolve({ data: null, error: null });
    },
    delete: (...args: unknown[]) => {
      forbidden.delete(...args);
      return Promise.resolve({ data: null, error: null });
    },
  });
  return {
    supabase: {
      from: (table: string) =>
        table === "ai_doctor_session_reviews"
          ? reviewsBuilder()
          : sessionsBuilder(),
      rpc: (...args: unknown[]) => {
        forbidden.rpc(...args);
        return Promise.resolve({ data: null, error: null });
      },
      functions: {
        invoke: (...args: unknown[]) => {
          forbidden.functionsInvoke(...args);
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
  };
});

function event(
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

function renderDetail() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
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

beforeEach(() => {
  reviewEvents = [];
  insertCalls.length = 0;
  nextInsertError = null;
  Object.values(forbidden).forEach((fn) => fn.mockClear());
});

describe("AiDoctorSessionDetail — review-status action controls", () => {
  it("renders all three action buttons + note input", async () => {
    renderDetail();
    expect(
      await screen.findByTestId("ai-doctor-session-detail-review-mark-reviewed"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-needs-follow-up"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-clear"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-session-detail-review-status-note-input"),
    ).toBeTruthy();
  });

  it("disables 'Clear review status' when current status is not_reviewed", async () => {
    reviewEvents = [];
    renderDetail();
    const clearBtn = (await screen.findByTestId(
      "ai-doctor-session-detail-review-clear",
    )) as HTMLButtonElement;
    expect(clearBtn.disabled).toBe(true);
    const markBtn = screen.getByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    ) as HTMLButtonElement;
    const followBtn = screen.getByTestId(
      "ai-doctor-session-detail-review-needs-follow-up",
    ) as HTMLButtonElement;
    expect(markBtn.disabled).toBe(false);
    expect(followBtn.disabled).toBe(false);
  });

  it("disables 'Mark reviewed' when current status is reviewed", async () => {
    reviewEvents = [
      event({
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
    const markBtn = screen.getByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    ) as HTMLButtonElement;
    expect(markBtn.disabled).toBe(true);
  });

  it("disables 'Needs follow-up' when current status is needs_follow_up", async () => {
    reviewEvents = [
      event({
        id: "e1",
        event_type: "needs_follow_up",
        created_at: "2026-05-28T10:00:00Z",
      }),
    ];
    renderDetail();
    await waitFor(() => {
      const panel = screen.getByTestId(
        "ai-doctor-session-detail-review-status-panel",
      );
      expect(panel.getAttribute("data-review-status")).toBe("needs_follow_up");
    });
    const btn = screen.getByTestId(
      "ai-doctor-session-detail-review-needs-follow-up",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("clicking 'Mark reviewed' inserts marked_reviewed with no note and no user_id", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(insertCalls.length).toBe(1));
    expect(insertCalls[0].table).toBe("ai_doctor_session_reviews");
    expect(insertCalls[0].payload).toEqual({
      session_id: SESSION_ID,
      event_type: "marked_reviewed",
    });
    expect("user_id" in insertCalls[0].payload).toBe(false);
  });

  it("clicking 'Needs follow-up' with a note inserts needs_follow_up + trimmed note", async () => {
    renderDetail();
    const input = (await screen.findByTestId(
      "ai-doctor-session-detail-review-status-note-input",
    )) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "  watch overnight  " } });
    const btn = screen.getByTestId(
      "ai-doctor-session-detail-review-needs-follow-up",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(insertCalls.length).toBe(1));
    expect(insertCalls[0].payload).toEqual({
      session_id: SESSION_ID,
      event_type: "needs_follow_up",
      note: "watch overnight",
    });
  });

  it("clicking 'Clear review status' inserts cleared when there is an active status", async () => {
    reviewEvents = [
      event({
        id: "e1",
        event_type: "marked_reviewed",
        created_at: "2026-05-28T10:00:00Z",
      }),
    ];
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-clear",
    );
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(insertCalls.length).toBe(1));
    expect(insertCalls[0].payload).toEqual({
      session_id: SESSION_ID,
      event_type: "cleared",
    });
  });

  it("event history reflects the new event after a successful insert", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    );
    // Arrange the server-truth list to include the new event after insert.
    reviewEvents = [
      event({
        id: "new-1",
        event_type: "marked_reviewed",
        created_at: "2026-05-29T10:00:00Z",
      }),
    ];
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => {
      const items = screen.getAllByTestId(
        "ai-doctor-session-detail-review-status-event",
      );
      expect(items.length).toBe(1);
      expect(items[0].getAttribute("data-event-type")).toBe("marked_reviewed");
    });
  });

  it("surfaces a calm inline error when the insert fails (RLS-denied)", async () => {
    nextInsertError = { message: "new row violates row-level security policy" };
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    const err = await screen.findByTestId(
      "ai-doctor-session-detail-review-error",
    );
    expect(err.textContent ?? "").toMatch(/row-level security/i);
  });

  it("caps the note textarea at 1000 chars", async () => {
    renderDetail();
    const input = (await screen.findByTestId(
      "ai-doctor-session-detail-review-status-note-input",
    )) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "x".repeat(2000) } });
    expect(input.value.length).toBe(1000);
  });

  it("preserves caution checklist, review summary, and copy button", async () => {
    renderDetail();
    expect(
      await screen.findByTestId("ai-doctor-session-detail-review-followup"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-session-detail-evidence"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-session-detail-copy-review-button"),
    ).toBeTruthy();
  });

  it("never calls update / upsert / delete / rpc / functions.invoke during clicks", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-review-mark-reviewed",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(insertCalls.length).toBe(1));
    expect(forbidden.update).not.toHaveBeenCalled();
    expect(forbidden.upsert).not.toHaveBeenCalled();
    expect(forbidden.delete).not.toHaveBeenCalled();
    expect(forbidden.rpc).not.toHaveBeenCalled();
    expect(forbidden.functionsInvoke).not.toHaveBeenCalled();
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(
  resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"),
  "utf8",
);

describe("AiDoctorSessionDetail review actions — safety scan", () => {
  it("page does not embed direct write calls (delegates to the mutation hook)", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });
  it("page does not write to action_queue / alerts / tasks", () => {
    expect(PAGE).not.toMatch(/from\(["']action_queue["']\)/);
    expect(PAGE).not.toMatch(/from\(["']alerts["']\)/);
    expect(PAGE).not.toMatch(/from\(["']alert_events["']\)/);
    expect(PAGE).not.toMatch(/from\(["']tasks["']\)/);
  });
  it("page contains no service_role / automation / device-control markers", () => {
    const lower = PAGE.toLowerCase();
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
  it("does not expose row-level (per-history-item) mutation controls", () => {
    // Action controls live only inside the review-status panel — not on each
    // event row. Defense in depth: history items must not embed mutation
    // testids.
    const reviewStatusEventBlock = PAGE.match(
      /data-testid="ai-doctor-session-detail-review-status-event"/g,
    );
    expect(reviewStatusEventBlock).not.toBeNull();
    // History rows must not contain their own per-event mutation buttons.
    expect(PAGE).not.toMatch(
      /data-testid="ai-doctor-session-detail-review-status-event[\s\S]{0,400}onClick=\{[^}]*mutate/,
    );
  });
});
