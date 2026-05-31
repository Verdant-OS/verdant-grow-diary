/**
 * AI Doctor Session detail — "Add to Action Queue" button.
 *
 * Verifies the presenter wrapping over `useAddAiDoctorSessionSuggestionToActionQueue`:
 *   - Eligible suggestion renders the button.
 *   - Ineligible suggestion does NOT render the button (no extra DOM noise).
 *   - Click flows through to a single `action_queue` insert and shows the
 *     success/duplicate/error labels.
 *   - Result links to the created/existing Action Queue item.
 *   - UI never leaks the raw `[session:<id>]` token or mentions `target_device`.
 *   - Static safety: no functions.invoke, no service_role, no automation /
 *     device-control verbs in the new component or page.
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

// --- Fixtures ---------------------------------------------------------------

const SESSION_ID = "sess-aq-1";
const GROW_ID = "grow-1";
const TENT_ID = "tent-1";
const PLANT_ID = "plant-1";

function makeDiagnosis(opts?: {
  approvalRequired?: boolean;
  detail?: string;
}): Diagnosis {
  return {
    summary: "Mild stress observed.",
    likelyIssue: "Heat stress",
    confidence: 0.7,
    evidence: ["tip curl"],
    missingInformation: [],
    possibleCauses: ["light too close"],
    immediateAction: "Raise light.",
    whatNotToDo: ["do not defoliate"],
    followUp24h: { summary: "Recheck.", checklist: [] },
    recoveryPlan3d: { summary: "Stabilize.", checklist: [] },
    riskLevel: "medium",
    suggestedActions: [
      {
        type: "task",
        title: "Raise light",
        detail: opts?.detail ?? "Raise the light by 10 cm and recheck in 24h.",
        priority: "medium",
        reason: "Reduce radiant load on the canopy.",
        approvalRequired: (opts?.approvalRequired ?? true) as true,
      },
    ],
  };
}

function makeFixture(diagnosis: Diagnosis): AiDoctorSessionRow {
  return {
    id: SESSION_ID,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: PLANT_ID,
    tent_id: TENT_ID,
    grow_id: GROW_ID,
    question: "Why are leaves curling?",
    diagnosis,
    raw_confidence: 0.8,
    displayed_confidence: 0.7,
    context_confidence_ceiling: "medium",
    suggested_actions: diagnosis.suggestedActions,
  };
}

// --- Mutable mock state -----------------------------------------------------

let currentFixture: AiDoctorSessionRow = makeFixture(makeDiagnosis());
let actionQueueProbeRows: Array<Record<string, unknown>> = [];
let nextActionQueueInsertError: { message: string } | null = null;
const actionQueueInsertCalls: Array<Record<string, unknown>> = [];
const actionQueueEventInsertCalls: Array<Record<string, unknown>> = [];

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
            value === currentFixture.id
              ? { data: currentFixture, error: null }
              : { data: null, error: null },
          ),
      }),
    }),
  });

  const reviewsBuilder = () => ({
    select: () => ({
      in: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
      order: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    insert: () => Promise.resolve({ data: null, error: null }),
  });

  const actionQueueBuilder = () => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, value: unknown) => {
        filters[col] = value;
        return chain;
      },
      in: (col: string, value: unknown) => {
        filters[col] = value;
        return chain;
      },
      like: (col: string, value: unknown) => {
        filters[`like_${col}`] = value;
        return chain;
      },
      limit: () =>
        Promise.resolve({ data: actionQueueProbeRows, error: null }),
      insert: (payload: Record<string, unknown>) => {
        actionQueueInsertCalls.push(payload);
        if (nextActionQueueInsertError) {
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: null, error: nextActionQueueInsertError }),
            }),
          };
        }
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "aq-new-1", grow_id: payload.grow_id },
                error: null,
              }),
          }),
        };
      },
    };
    return chain;
  };

  const actionQueueEventsBuilder = () => ({
    insert: (payload: Record<string, unknown>) => {
      actionQueueEventInsertCalls.push(payload);
      return Promise.resolve({ data: null, error: null });
    },
  });

  return {
    supabase: {
      from: (table: string) => {
        switch (table) {
          case "ai_doctor_sessions":
            return sessionsBuilder();
          case "ai_doctor_session_reviews":
            return reviewsBuilder();
          case "action_queue":
            return actionQueueBuilder();
          case "action_queue_events":
            return actionQueueEventsBuilder();
          default:
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
              }),
            };
        }
      },
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
  currentFixture = makeFixture(makeDiagnosis());
  actionQueueProbeRows = [];
  actionQueueInsertCalls.length = 0;
  actionQueueEventInsertCalls.length = 0;
  nextActionQueueInsertError = null;
  Object.values(forbidden).forEach((fn) => fn.mockClear());
});

describe("AiDoctorSessionDetail — Add to Action Queue button", () => {
  it("renders 'Add to Action Queue' for an eligible suggestion", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    expect(btn.textContent).toContain("Add to Action Queue");
    expect(
      screen.getByTestId("ai-doctor-session-detail-add-to-action-queue-helper")
        .textContent,
    ).toMatch(/approval-required/i);
  });

  it("does not render the button for an ineligible suggestion (no approvalRequired)", async () => {
    // Mutate suggested_actions to drop approvalRequired (simulate ingested
    // legacy row that bypassed the sanitizer).
    const d = makeDiagnosis();
    d.suggestedActions = d.suggestedActions.map((a) => ({
      ...a,
      approvalRequired: false as unknown as true,
    }));
    currentFixture = {
      ...makeFixture(d),
      suggested_actions: d.suggestedActions,
    };
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-review-action");
    expect(
      screen.queryByTestId("ai-doctor-session-detail-add-to-action-queue-button"),
    ).toBeNull();
  });

  it("click inserts exactly one pending_approval ai_doctor action and shows success label", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(actionQueueInsertCalls.length).toBe(1));
    const payload = actionQueueInsertCalls[0];
    expect(payload.source).toBe("ai_doctor");
    expect(payload.status).toBe("pending_approval");
    expect("user_id" in payload).toBe(false);
    expect("target_device" in payload).toBe(false);
    await waitFor(() =>
      expect(btn.textContent).toContain("Added to Action Queue"),
    );
  });

  it("shows a link to the created action after a successful insert", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-link",
    )) as HTMLAnchorElement;
    expect(link.getAttribute("data-action-queue-id")).toBe("aq-new-1");
    expect(link.getAttribute("href")).toBe("/actions");
  });

  it("shows 'Adding…' while the insert is in flight", async () => {
    // Make the probe return after a tick so we can observe loading state.
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    fireEvent.click(btn);
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-session-detail-add-to-action-queue")
          .getAttribute("data-state"),
      ).toMatch(/loading|inserted/),
    );
  });

  it("shows 'Already in Action Queue' + link when a duplicate open row exists", async () => {
    actionQueueProbeRows = [
      {
        id: "aq-existing-7",
        grow_id: GROW_ID,
        source: "ai_doctor",
        status: "pending_approval",
        reason: `Some prior reason. [session:${SESSION_ID}]`,
        suggested_change: "Raise light",
      },
    ];
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() =>
      expect(btn.textContent).toContain("Already in Action Queue"),
    );
    expect(actionQueueInsertCalls.length).toBe(0);
    const link = screen.getByTestId(
      "ai-doctor-session-detail-add-to-action-queue-link",
    );
    expect(link.getAttribute("data-action-queue-id")).toBe("aq-existing-7");
  });

  it("shows safe no-equipment-change error copy when the insert fails (RLS)", async () => {
    nextActionQueueInsertError = {
      message: "new row violates row-level security policy",
    };
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    const err = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-error",
    );
    expect(err.textContent ?? "").toMatch(/no equipment changes were made/i);
    expect(btn.textContent).toContain("Could not add");
  });

  it("UI never exposes raw [session:<id>] token", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(actionQueueInsertCalls.length).toBe(1));
    const root = screen.getByTestId(
      "ai-doctor-session-detail-add-to-action-queue",
    );
    expect(root.textContent ?? "").not.toContain(`[session:${SESSION_ID}]`);
    expect(root.textContent ?? "").not.toContain(SESSION_ID);
  });

  it("UI does not mention target_device anywhere", async () => {
    renderDetail();
    const root = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue",
    );
    expect((root.textContent ?? "").toLowerCase()).not.toContain("target_device");
    expect((root.textContent ?? "").toLowerCase()).not.toContain("device");
  });

  it("never calls update / upsert / delete / rpc / functions.invoke during click", async () => {
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(actionQueueInsertCalls.length).toBe(1));
    expect(forbidden.update).not.toHaveBeenCalled();
    expect(forbidden.upsert).not.toHaveBeenCalled();
    expect(forbidden.delete).not.toHaveBeenCalled();
    expect(forbidden.rpc).not.toHaveBeenCalled();
    expect(forbidden.functionsInvoke).not.toHaveBeenCalled();
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const COMPONENT = readFileSync(
  resolve(ROOT, "src/components/AiDoctorSessionActionQueueButton.tsx"),
  "utf8",
);
const PAGE = readFileSync(
  resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"),
  "utf8",
);

describe("AiDoctorSessionActionQueueButton — safety scan", () => {
  it("component does not embed direct DB writes (delegates to the mutation hook)", () => {
    expect(COMPONENT).not.toMatch(/\.insert\(/);
    expect(COMPONENT).not.toMatch(/\.update\(/);
    expect(COMPONENT).not.toMatch(/\.upsert\(/);
    expect(COMPONENT).not.toMatch(/\.delete\(/);
    expect(COMPONENT).not.toMatch(/\.rpc\(/);
    expect(COMPONENT).not.toMatch(/functions\.invoke/);
  });

  it("component does not write to alerts / tasks", () => {
    expect(COMPONENT).not.toMatch(/from\(["']alerts["']\)/);
    expect(COMPONENT).not.toMatch(/from\(["']alert_events["']\)/);
    expect(COMPONENT).not.toMatch(/from\(["']tasks["']\)/);
  });

  it("component contains no service_role / automation / device-control markers", () => {
    const lower = COMPONENT.toLowerCase();
    expect(lower).not.toContain("service_role");
    expect(lower).not.toContain("target_device");
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "turn on",
      "turn off",
      "automate",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it("page still does not embed direct write calls", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });
});
