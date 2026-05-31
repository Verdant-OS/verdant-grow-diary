/**
 * End-to-end regression for the AI Doctor review workflow.
 *
 * Locks the full durable review loop across detail-page mutation, optimistic
 * cache, server reconciliation, and sessions-index projection:
 *
 *   detail → mark needs_follow_up → insert event → optimistic chip → history
 *     → index row chip → reviewStatus filter → built-in saved view → visible
 *     count chip → jump → clear status → projection reverts → index chip
 *     disappears → filter excludes session.
 *
 * Safety envelope is asserted via a static scan plus runtime mock counters:
 *   - Only INSERT into ai_doctor_session_reviews is allowed.
 *   - No update / upsert / delete / rpc / functions.invoke.
 *   - No writes to action_queue / alerts / tasks.
 *   - No service_role / automation / device-control markers.
 *   - No row-level mutation controls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { AiDoctorSessionReviewEvent } from "@/lib/aiDoctorSessionReviewStatusRules";
import {
  BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID,
  SAVED_VIEWS_STORAGE_KEY,
} from "@/lib/aiDoctorSessionsSavedViewsRules";

// ---------------- shared mutable mock state ----------------

const SESSION_ID = "sess-e2e-1";
const OTHER_ID = "sess-e2e-2";

const fixtureDiagnosis: Diagnosis = {
  summary: "Mild heat stress.",
  likelyIssue: "Heat stress",
  confidence: 0.7,
  evidence: ["Tip curl"],
  missingInformation: [],
  possibleCauses: [],
  immediateAction: "",
  whatNotToDo: [],
  followUp24h: null,
  recoveryPlan3d: null,
  riskLevel: "medium",
  suggestedActions: [],
};

function makeRow(id: string): AiDoctorSessionRow {
  return {
    id,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: "Why are leaves curling?",
    diagnosis: fixtureDiagnosis,
    raw_confidence: 0.8,
    displayed_confidence: 0.7,
    context_confidence_ceiling: "medium",
    suggested_actions: [],
  };
}

let sessionRows: AiDoctorSessionRow[] = [];
let reviewRows: AiDoctorSessionReviewEvent[] = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> =
  [];

const forbidden = {
  update: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
  functionsInvoke: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => {
  function reviewsChain() {
    let current = reviewRows;
    const chain: Record<string, unknown> = {};
    const passthrough = ["select", "order", "limit", "range", "not", "gte", "or"];
    for (const m of passthrough) chain[m] = () => chain;
    chain.in = (_col: string, values: unknown) => {
      if (Array.isArray(values)) {
        current = reviewRows.filter((r) =>
          (values as string[]).includes(r.session_id),
        );
      }
      return chain;
    };
    chain.eq = () => chain;
    chain.then = (resolveFn: (v: unknown) => unknown) =>
      Promise.resolve({ data: current, error: null }).then(resolveFn);
    chain.insert = (payload: Record<string, unknown>) => {
      insertCalls.push({ table: "ai_doctor_session_reviews", payload });
      const inserted: AiDoctorSessionReviewEvent = {
        id: `srv-${insertCalls.length}`,
        user_id: "server-assigned",
        session_id: String(payload.session_id),
        event_type: payload.event_type as AiDoctorSessionReviewEvent["event_type"],
        note: (payload.note as string | undefined) ?? null,
        created_at: new Date(
          Date.parse("2026-05-29T10:00:00Z") + insertCalls.length * 1000,
        ).toISOString(),
      };
      reviewRows = [inserted, ...reviewRows];
      return Promise.resolve({ data: null, error: null });
    };
    chain.update = (...a: unknown[]) => {
      forbidden.update(...a);
      return Promise.resolve({ data: null, error: null });
    };
    chain.upsert = (...a: unknown[]) => {
      forbidden.upsert(...a);
      return Promise.resolve({ data: null, error: null });
    };
    chain.delete = (...a: unknown[]) => {
      forbidden.delete(...a);
      return Promise.resolve({ data: null, error: null });
    };
    return chain;
  }

  function sessionsChain() {
    const chain: Record<string, unknown> = {};
    const passthrough = ["select", "order", "limit", "range", "not", "gte", "or", "in"];
    for (const m of passthrough) chain[m] = () => chain;
    chain.eq = (col: string, value: string) => {
      if (col === "id") {
        const match = sessionRows.find((r) => r.id === value) ?? null;
        return {
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
          maybeSingle: () => Promise.resolve({ data: match, error: null }),
        };
      }
      return chain;
    };
    chain.maybeSingle = () =>
      Promise.resolve({ data: sessionRows[0] ?? null, error: null });
    chain.then = (resolveFn: (v: unknown) => unknown) =>
      Promise.resolve({ data: sessionRows, error: null }).then(resolveFn);
    chain.update = (...a: unknown[]) => {
      forbidden.update(...a);
      return Promise.resolve({ data: null, error: null });
    };
    return chain;
  }

  return {
    supabase: {
      from: (table: string) =>
        table === "ai_doctor_session_reviews"
          ? reviewsChain()
          : sessionsChain(),
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

// ---------------- helpers ----------------

function LocationProbe(): ReactElement {
  const loc = useLocation();
  return <div data-testid="probe-search">{loc.search}</div>;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderDetail(client: QueryClient) {
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

function renderIndex(client: QueryClient, initialPath = "/doctor/sessions") {
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
  sessionRows = [makeRow(SESSION_ID), makeRow(OTHER_ID)];
  reviewRows = [];
  insertCalls.length = 0;
  Object.values(forbidden).forEach((fn) => fn.mockClear());
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

// ---------------- the workflow ----------------

describe("AI Doctor review workflow — end-to-end regression", () => {
  it(
    "marks needs_follow_up from detail, projects across index, then clears",
    async () => {
      // 1+2: Detail page shows Not reviewed (no events).
      const client = makeClient();
      renderDetail(client);
      await waitFor(() => {
        const panel = screen.getByTestId(
          "ai-doctor-session-detail-review-status-panel",
        );
        expect(panel.getAttribute("data-review-status")).toBe("not_reviewed");
      });

      // 3+4: Mark Needs follow-up → exactly one append-only insert.
      const followBtn = screen.getByTestId(
        "ai-doctor-session-detail-review-needs-follow-up",
      );
      await act(async () => {
        fireEvent.click(followBtn);
      });
      await waitFor(() => expect(insertCalls.length).toBe(1));
      expect(insertCalls[0].table).toBe("ai_doctor_session_reviews");
      expect(insertCalls[0].payload).toEqual({
        session_id: SESSION_ID,
        event_type: "needs_follow_up",
      });
      expect("user_id" in insertCalls[0].payload).toBe(false);

      // 5: Optimistic projection flips the panel to needs_follow_up.
      // 6: After reconciliation, history shows the new event.
      await waitFor(() => {
        const panel = screen.getByTestId(
          "ai-doctor-session-detail-review-status-panel",
        );
        expect(panel.getAttribute("data-review-status")).toBe(
          "needs_follow_up",
        );
      });
      await waitFor(() => {
        const items = screen.getAllByTestId(
          "ai-doctor-session-detail-review-status-event",
        );
        expect(items.length).toBeGreaterThanOrEqual(1);
        expect(items[0].getAttribute("data-event-type")).toBe(
          "needs_follow_up",
        );
      });

      // 7+8+9+10+11: Switch to the index — same QueryClient so cached review
      // state survives the navigation.
      cleanup();
      renderIndex(client);
      await screen.findByTestId("ai-doctor-sessions-index-list");

      // 7: The needs_follow_up chip appears on the session's row.
      await waitFor(() => {
        const chips = screen.getAllByTestId(
          "ai-doctor-sessions-index-review-status-chip",
        );
        const ours = chips.find(
          (c) => c.getAttribute("data-review-status") === "needs_follow_up",
        );
        expect(ours).toBeTruthy();
      });

      // 10: Visible-count chip reflects the projected status.
      const visibleChip = await screen.findByTestId(
        "ai-doctor-sessions-index-needs-follow-up-visible-chip",
      );
      await waitFor(() =>
        expect(visibleChip.textContent).toBe("Needs follow-up: 1 visible"),
      );

      // 8: reviewStatus=needs_follow_up filter includes our session.
      const reviewFilter = (await screen.findByTestId(
        "ai-doctor-sessions-index-filter-review-status",
      )) as HTMLSelectElement;
      fireEvent.change(reviewFilter, { target: { value: "needs_follow_up" } });
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(1);
      });

      // Reset filter so the saved-view click owns the URL state.
      fireEvent.change(reviewFilter, { target: { value: "all" } });
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(2);
      });

      // 9+11: Clicking the chip applies the built-in saved view.
      fireEvent.click(visibleChip);
      await waitFor(() => {
        const search = screen.getByTestId("probe-search").textContent ?? "";
        expect(search).toContain("reviewStatus=needs_follow_up");
      });
      const savedSelect = (await screen.findByTestId(
        "ai-doctor-sessions-saved-views-select",
      )) as HTMLSelectElement;
      expect(savedSelect.value).toBe(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID);
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(1);
      });

      // 12: Clear review status from detail inserts `cleared`.
      cleanup();
      renderDetail(client);
      const clearBtn = await screen.findByTestId(
        "ai-doctor-session-detail-review-clear",
      );
      await waitFor(() =>
        expect((clearBtn as HTMLButtonElement).disabled).toBe(false),
      );
      await act(async () => {
        fireEvent.click(clearBtn);
      });
      await waitFor(() => expect(insertCalls.length).toBe(2));
      expect(insertCalls[1].payload).toEqual({
        session_id: SESSION_ID,
        event_type: "cleared",
      });

      // 13: Projection on detail returns to Not reviewed.
      await waitFor(() => {
        const panel = screen.getByTestId(
          "ai-doctor-session-detail-review-status-panel",
        );
        expect(panel.getAttribute("data-review-status")).toBe("not_reviewed");
      });

      // 14+15: Index no longer shows needs_follow_up chip; filter excludes it.
      cleanup();
      renderIndex(client);
      await screen.findByTestId("ai-doctor-sessions-index-list");
      await waitFor(() => {
        const chips = screen.queryAllByTestId(
          "ai-doctor-sessions-index-review-status-chip",
        );
        const stillFollowUp = chips.find(
          (c) => c.getAttribute("data-review-status") === "needs_follow_up",
        );
        expect(stillFollowUp).toBeFalsy();
      });
      const visibleChip2 = await screen.findByTestId(
        "ai-doctor-sessions-index-needs-follow-up-visible-chip",
      );
      await waitFor(() =>
        expect(visibleChip2.textContent).toBe("Needs follow-up: 0 visible"),
      );

      const reviewFilter2 = (await screen.findByTestId(
        "ai-doctor-sessions-index-filter-review-status",
      )) as HTMLSelectElement;
      fireEvent.change(reviewFilter2, {
        target: { value: "needs_follow_up" },
      });
      await waitFor(() => {
        const rows = screen.queryAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(0);
      });

      // Safety: only 2 inserts happened across the whole loop, no other writes.
      expect(insertCalls.length).toBe(2);
      expect(insertCalls.every((c) => c.table === "ai_doctor_session_reviews")).toBe(
        true,
      );
      expect(forbidden.update).not.toHaveBeenCalled();
      expect(forbidden.upsert).not.toHaveBeenCalled();
      expect(forbidden.delete).not.toHaveBeenCalled();
      expect(forbidden.rpc).not.toHaveBeenCalled();
      expect(forbidden.functionsInvoke).not.toHaveBeenCalled();
    },
    20_000,
  );
});

// ---------------- static safety scan ----------------

describe("AI Doctor review workflow — static safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/hooks/useMarkAiDoctorSessionReview.ts",
    "src/hooks/useAiDoctorSessionReviews.ts",
    "src/pages/AiDoctorSessionDetail.tsx",
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionsSavedViewsRules.ts",
    "src/lib/aiDoctorSessionReviewStatusRules.ts",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
  ];
  const SRC = Object.fromEntries(
    FILES.map((f) => [f, readFileSync(resolve(ROOT, f), "utf8")]),
  );
  const ALL = Object.values(SRC).join("\n");

  it("only the mutation hook writes to ai_doctor_session_reviews (insert-only)", () => {
    const mut = SRC["src/hooks/useMarkAiDoctorSessionReview.ts"];
    expect(mut).toMatch(/\.insert\(/);
    expect(mut).not.toMatch(/\.update\(/);
    expect(mut).not.toMatch(/\.upsert\(/);
    expect(mut).not.toMatch(/\.delete\(/);
    for (const [path, src] of Object.entries(SRC)) {
      if (path === "src/hooks/useMarkAiDoctorSessionReview.ts") continue;
      expect(src, `${path} must not call .insert(`).not.toMatch(/\.insert\(/);
      expect(src, `${path} must not call .update(`).not.toMatch(/\.update\(/);
      expect(src, `${path} must not call .upsert(`).not.toMatch(/\.upsert\(/);
      expect(src, `${path} must not call .delete(`).not.toMatch(/\.delete\(/);
    }
  });

  it("no functions.invoke / rpc / service_role anywhere in the slice", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/\.rpc\(/);
    expect(ALL.toLowerCase()).not.toContain("service_role");
  });

  it("no writes targeting action_queue / alerts / tasks", () => {
    for (const table of ["action_queue", "alerts", "alert_events", "tasks"]) {
      expect(ALL).not.toMatch(
        new RegExp(`from\\(["']${table}["']\\)[\\s\\S]{0,200}\\.(insert|update|upsert|delete)\\(`),
      );
    }
  });

  it("no AI / automation / device-control markers", () => {
    const banned = [
      "openai",
      "anthropic",
      "lovable-ai-gateway",
      "ai.gateway",
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
    const lower = ALL.toLowerCase();
    for (const tok of banned) {
      expect(lower, `unexpected marker: ${tok}`).not.toContain(tok);
    }
  });

  it("no row-level (per-event) mutation controls in detail history", () => {
    const detail = SRC["src/pages/AiDoctorSessionDetail.tsx"];
    expect(detail).not.toMatch(
      /data-testid="ai-doctor-session-detail-review-status-event[\s\S]{0,400}onClick=\{[^}]*mutate/,
    );
    expect(detail).not.toMatch(
      /data-testid=["'][^"']*row-level-mark-review[^"']*["']/,
    );
  });

  it("index page does not duplicate the built-in saved view id as a literal", () => {
    const idx = SRC["src/pages/AiDoctorSessionsIndex.tsx"];
    expect(idx).toMatch(/BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID/);
    expect(idx).not.toMatch(/["']builtin:needs-follow-up["']/);
  });
});
