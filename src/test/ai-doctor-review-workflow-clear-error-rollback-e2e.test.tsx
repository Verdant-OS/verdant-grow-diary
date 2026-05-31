/**
 * End-to-end regression for the AI Doctor "Clear review status" FAILURE path.
 *
 * Completes symmetric rollback coverage across all three review actions.
 * Locks: a failed `cleared` insert must not strip an existing durable
 * review state from the UI on either the detail page or the sessions index.
 *
 *   seed needs_follow_up → detail Needs follow-up → click Clear → insert
 *   rejected → inline error → optimistic cleared rolls back → detail stays
 *   Needs follow-up → history unchanged → index chip stays → visible-count
 *   stays 1 → reviewStatus filter still includes → built-in saved view still
 *   includes → reviewStatus=not_reviewed excludes → exactly 1 attempted
 *   insert, no other write paths.
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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const SESSION_ID = "sess-clear-err-1";
const OTHER_ID = "sess-clear-err-2";
const RLS_ERROR_MESSAGE = "new row violates row-level security policy";
const DURABLE_EVENT_ID = "durable-needs-follow-up-1";
const DURABLE_EVENT_AT = "2026-05-28T10:00:00Z";

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

function seededDurableEvent(): AiDoctorSessionReviewEvent {
  return {
    id: DURABLE_EVENT_ID,
    user_id: "server-assigned",
    session_id: SESSION_ID,
    event_type: "needs_follow_up",
    note: null,
    created_at: DURABLE_EVENT_AT,
  };
}

let sessionRows: AiDoctorSessionRow[] = [];
let reviewRows: AiDoctorSessionReviewEvent[] = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> =
  [];
let nextInsertError: { message: string } | null = {
  message: RLS_ERROR_MESSAGE,
};

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
      if (nextInsertError) {
        return Promise.resolve({ data: null, error: nextInsertError });
      }
      const inserted: AiDoctorSessionReviewEvent = {
        id: `srv-${insertCalls.length}`,
        user_id: "server-assigned",
        session_id: String(payload.session_id),
        event_type:
          payload.event_type as AiDoctorSessionReviewEvent["event_type"],
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
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionRows = [makeRow(SESSION_ID), makeRow(OTHER_ID)];
  reviewRows = [seededDurableEvent()];
  insertCalls.length = 0;
  nextInsertError = { message: RLS_ERROR_MESSAGE };
  Object.values(forbidden).forEach((fn) => fn.mockClear());
  try {
    window.localStorage.removeItem(SAVED_VIEWS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

// ---------------- the failure workflow ----------------

describe("AI Doctor review workflow — Clear review status error rollback", () => {
  it(
    "Clear insert is denied → existing needs_follow_up state survives end-to-end",
    async () => {
      // 1+2+3: Detail page shows Needs follow-up with the seeded history row.
      const client = makeClient();
      renderDetail(client);
      await waitFor(() => {
        const panel = screen.getByTestId(
          "ai-doctor-session-detail-review-status-panel",
        );
        expect(panel.getAttribute("data-review-status")).toBe(
          "needs_follow_up",
        );
      });
      const seededItems = screen.getAllByTestId(
        "ai-doctor-session-detail-review-status-event",
      );
      expect(seededItems.length).toBe(1);
      expect(seededItems[0].getAttribute("data-event-type")).toBe(
        "needs_follow_up",
      );

      // 4+5+6: Index row + visible-count chip + built-in saved view all
      // include the session before any failed mutation.
      cleanup();
      renderIndex(client);
      await screen.findByTestId("ai-doctor-sessions-index-list");
      await waitFor(() => {
        const chips = screen.getAllByTestId(
          "ai-doctor-sessions-index-review-status-chip",
        );
        const followChip = chips.find(
          (c) => c.getAttribute("data-review-status") === "needs_follow_up",
        );
        expect(followChip).toBeTruthy();
      });
      const visibleChipPre = await screen.findByTestId(
        "ai-doctor-sessions-index-needs-follow-up-visible-chip",
      );
      await waitFor(() =>
        expect(visibleChipPre.textContent).toBe("Needs follow-up: 1 visible"),
      );
      fireEvent.click(visibleChipPre);
      const savedSelectPre = (await screen.findByTestId(
        "ai-doctor-sessions-saved-views-select",
      )) as HTMLSelectElement;
      await waitFor(() =>
        expect(savedSelectPre.value).toBe(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID),
      );
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(1);
      });

      // 7+8: Back to detail; Clear is mocked to fail.
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

      // Exactly one INSERT attempt with the append-only `cleared` payload.
      await waitFor(() => expect(insertCalls.length).toBe(1));
      expect(insertCalls[0].table).toBe("ai_doctor_session_reviews");
      expect(insertCalls[0].payload).toEqual({
        session_id: SESSION_ID,
        event_type: "cleared",
      });
      expect("user_id" in insertCalls[0].payload).toBe(false);

      // 9: Inline error renders calmly.
      const err = await screen.findByTestId(
        "ai-doctor-session-detail-review-error",
      );
      expect((err.textContent ?? "").toLowerCase()).toMatch(
        /row-level security/,
      );

      // 10+11: Optimistic cleared rolls back; detail stays Needs follow-up.
      await waitFor(() => {
        const panel = screen.getByTestId(
          "ai-doctor-session-detail-review-status-panel",
        );
        expect(panel.getAttribute("data-review-status")).toBe(
          "needs_follow_up",
        );
      });

      // 12: History still shows ONLY the original durable event.
      const postItems = screen.getAllByTestId(
        "ai-doctor-session-detail-review-status-event",
      );
      expect(postItems.length).toBe(1);
      expect(postItems[0].getAttribute("data-event-type")).toBe(
        "needs_follow_up",
      );

      // 13+14+15+16: Index still reflects Needs follow-up everywhere.
      cleanup();
      renderIndex(client);
      await screen.findByTestId("ai-doctor-sessions-index-list");
      await waitFor(() => {
        const chips = screen.getAllByTestId(
          "ai-doctor-sessions-index-review-status-chip",
        );
        const followChip = chips.find(
          (c) => c.getAttribute("data-review-status") === "needs_follow_up",
        );
        expect(followChip).toBeTruthy();
      });
      const visibleChipPost = await screen.findByTestId(
        "ai-doctor-sessions-index-needs-follow-up-visible-chip",
      );
      await waitFor(() =>
        expect(visibleChipPost.textContent).toBe("Needs follow-up: 1 visible"),
      );

      const reviewFilter = (await screen.findByTestId(
        "ai-doctor-sessions-index-filter-review-status",
      )) as HTMLSelectElement;
      fireEvent.change(reviewFilter, { target: { value: "needs_follow_up" } });
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(1);
      });

      // Built-in saved view path (jump chip): still 1 row.
      fireEvent.change(reviewFilter, { target: { value: "all" } });
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(2);
      });
      fireEvent.click(visibleChipPost);
      const savedSelectPost = (await screen.findByTestId(
        "ai-doctor-sessions-saved-views-select",
      )) as HTMLSelectElement;
      await waitFor(() =>
        expect(savedSelectPost.value).toBe(BUILTIN_SAVED_VIEW_NEEDS_FOLLOW_UP_ID),
      );
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(1);
      });

      // 17: reviewStatus=not_reviewed excludes the still-flagged session.
      const reviewFilter2 = (await screen.findByTestId(
        "ai-doctor-sessions-index-filter-review-status",
      )) as HTMLSelectElement;
      fireEvent.change(reviewFilter2, { target: { value: "not_reviewed" } });
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        // OTHER_ID was never reviewed; SESSION_ID must NOT be in the list.
        expect(rows.length).toBe(1);
      });

      // 18+19: Exactly one attempted insert; no other write paths invoked.
      expect(insertCalls.length).toBe(1);
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

describe("AI Doctor Clear error-rollback workflow — static safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/hooks/useMarkAiDoctorSessionReview.ts",
    "src/hooks/useAiDoctorSessionReviews.ts",
    "src/pages/AiDoctorSessionDetail.tsx",
    "src/pages/AiDoctorSessionsIndex.tsx",
    "src/lib/aiDoctorSessionReviewStatusRules.ts",
    "src/lib/aiDoctorSessionsIndexFilters.ts",
    "src/lib/aiDoctorSessionsSavedViewsRules.ts",
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
        new RegExp(
          `from\\(['"]${table}['"]\\)[\\s\\S]{0,200}\\.(insert|update|upsert|delete)\\(`,
        ),
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

  it("mutation hook has an explicit onError rollback path", () => {
    const mut = SRC["src/hooks/useMarkAiDoctorSessionReview.ts"];
    expect(mut).toMatch(/onError/);
    expect(mut).toMatch(/setQueryData/);
  });
});
