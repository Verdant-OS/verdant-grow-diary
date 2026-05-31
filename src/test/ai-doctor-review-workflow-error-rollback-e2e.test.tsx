/**
 * End-to-end regression for the AI Doctor review-status FAILURE path.
 *
 * Locks rollback semantics: if the INSERT into ai_doctor_session_reviews is
 * denied (RLS-style error) or otherwise fails, the optimistic UI must revert
 * so the user never sees stale review state.
 *
 *   detail not_reviewed → Mark reviewed → server rejects → inline error
 *     → projection rolls back to not_reviewed → history has no failed event
 *     → index shows no Reviewed chip → reviewStatus=reviewed excludes
 *     → reviewStatus=not_reviewed still includes → no extra writes.
 *
 * Safety envelope: only the (rejected) INSERT is attempted; no other writes.
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
import { SAVED_VIEWS_STORAGE_KEY } from "@/lib/aiDoctorSessionsSavedViewsRules";

// ---------------- shared mutable mock state ----------------

const SESSION_ID = "sess-err-1";
const OTHER_ID = "sess-err-2";
const RLS_ERROR_MESSAGE = "new row violates row-level security policy";

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
// Fail every insert by default in this file — that's the path under test.
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
        // Server rejects → no row appended to reviewRows.
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
  reviewRows = [];
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

describe("AI Doctor review workflow — error rollback", () => {
  it(
    "Mark reviewed insert is denied → optimistic state rolls back end-to-end",
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

      // 3+4: Click Mark reviewed (mock is configured to reject).
      const markBtn = screen.getByTestId(
        "ai-doctor-session-detail-review-mark-reviewed",
      );
      await act(async () => {
        fireEvent.click(markBtn);
      });

      // Exactly one INSERT was attempted with the expected append-only shape.
      await waitFor(() => expect(insertCalls.length).toBe(1));
      expect(insertCalls[0].table).toBe("ai_doctor_session_reviews");
      expect(insertCalls[0].payload).toEqual({
        session_id: SESSION_ID,
        event_type: "marked_reviewed",
      });
      expect("user_id" in insertCalls[0].payload).toBe(false);

      // 5: Inline error renders calmly.
      const err = await screen.findByTestId(
        "ai-doctor-session-detail-review-error",
      );
      expect((err.textContent ?? "").toLowerCase()).toMatch(
        /row-level security/,
      );

      // 6: Projection rolls back to not_reviewed.
      await waitFor(() => {
        const panel = screen.getByTestId(
          "ai-doctor-session-detail-review-status-panel",
        );
        expect(panel.getAttribute("data-review-status")).toBe("not_reviewed");
      });

      // 7: Event history retains no failed optimistic event.
      const items = screen.queryAllByTestId(
        "ai-doctor-session-detail-review-status-event",
      );
      expect(items.length).toBe(0);

      // 8: Sessions index shows no Reviewed chip for the rejected session.
      cleanup();
      renderIndex(client);
      await screen.findByTestId("ai-doctor-sessions-index-list");
      await waitFor(() => {
        const chips = screen.queryAllByTestId(
          "ai-doctor-sessions-index-review-status-chip",
        );
        const reviewedChip = chips.find(
          (c) => c.getAttribute("data-review-status") === "reviewed",
        );
        expect(reviewedChip).toBeFalsy();
      });

      // 9: reviewStatus=reviewed excludes the row.
      const reviewFilter = (await screen.findByTestId(
        "ai-doctor-sessions-index-filter-review-status",
      )) as HTMLSelectElement;
      fireEvent.change(reviewFilter, { target: { value: "reviewed" } });
      await waitFor(() => {
        const rows = screen.queryAllByTestId("ai-doctor-sessions-index-row");
        expect(rows.length).toBe(0);
      });

      // 10: reviewStatus=not_reviewed still includes the row.
      fireEvent.change(reviewFilter, { target: { value: "not_reviewed" } });
      await waitFor(() => {
        const rows = screen.getAllByTestId("ai-doctor-sessions-index-row");
        // Both seeded sessions remain "not reviewed".
        expect(rows.length).toBe(2);
      });

      // 11+12: No extra writes occurred after the failed insert.
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

describe("AI Doctor review error-rollback workflow — static safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const FILES = [
    "src/hooks/useMarkAiDoctorSessionReview.ts",
    "src/hooks/useAiDoctorSessionReviews.ts",
    "src/pages/AiDoctorSessionDetail.tsx",
    "src/pages/AiDoctorSessionsIndex.tsx",
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
        new RegExp(
          `from\\(["']${table}["']\\)[\\s\\S]{0,200}\\.(insert|update|upsert|delete)\\(`,
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
