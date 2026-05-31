/**
 * AI Doctor Session detail — "Created from this session" chip beside each
 * suggestion that already has a linked open Action Queue item.
 *
 * Read-only UI polish. Reuses `useAiDoctorSessionLinkedActionQueueItems` and
 * the pure `findLinkedActionForSuggestion` helper. No new writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

const SESSION_ID = "sess-chip-1";
const GROW_ID = "grow-1";
const TENT_ID = "tent-1";
const PLANT_ID = "plant-1";

function makeDiagnosis(): Diagnosis {
  return {
    summary: "Mild stress.",
    likelyIssue: "Heat stress",
    confidence: 0.7,
    evidence: ["tip curl"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "Raise light.",
    whatNotToDo: [],
    followUp24h: { summary: "Recheck.", checklist: [] },
    recoveryPlan3d: { summary: "Stabilize.", checklist: [] },
    riskLevel: "medium",
    suggestedActions: [
      {
        type: "task",
        title: "Raise light",
        detail: "Raise the light by 10 cm.",
        priority: "medium",
        reason: "Reduce radiant load.",
        approvalRequired: true,
      },
      {
        type: "task",
        title: "Add oscillating fan",
        detail: "Improve canopy airflow.",
        priority: "low",
        reason: "Even out temperature.",
        approvalRequired: true,
      },
    ],
  };
}

function makeFixture(): AiDoctorSessionRow {
  const d = makeDiagnosis();
  return {
    id: SESSION_ID,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: PLANT_ID,
    tent_id: TENT_ID,
    grow_id: GROW_ID,
    question: "Why curling?",
    diagnosis: d,
    raw_confidence: 0.8,
    displayed_confidence: 0.7,
    context_confidence_ceiling: "medium",
    suggested_actions: d.suggestedActions,
  };
}

let currentFixture: AiDoctorSessionRow = makeFixture();
let linkedRows: Array<Record<string, unknown>> = [];

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
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
      order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
    }),
    insert: () => Promise.resolve({ data: null, error: null }),
  });

  const actionQueueBuilder = () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      like: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: linkedRows, error: null }),
    };
    return chain;
  };

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
          default:
            return {
              select: () => ({
                eq: () => Promise.resolve({ data: [], error: null }),
              }),
            };
        }
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
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
  currentFixture = makeFixture();
  linkedRows = [];
});

async function findReviewActionsList() {
  return await screen.findByTestId("ai-doctor-session-detail-review-actions");
}

describe("AiDoctorSessionDetail — 'Created from this session' chip", () => {
  it("shows the chip beside a suggestion that has a linked Action Queue item", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light to lower canopy temp. [session:${SESSION_ID}]`,
        suggested_change: "Raise light — Raise the light by 10 cm.",
      },
    ];
    renderDetail();
    const chip = await screen.findByTestId(
      "ai-doctor-session-detail-review-action-created-from-session-chip",
    );
    expect(chip.textContent).toContain("Created from this session");
  });

  it("renders a 'View in Action Queue' link with /actions?focus=<id>", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light — Raise the light by 10 cm.",
      },
    ];
    renderDetail();
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-review-action-created-from-session-link",
    )) as HTMLAnchorElement;
    expect(link.textContent).toContain("View in Action Queue");
    expect(link.getAttribute("href")).toBe("/actions?focus=aq-light");
  });

  it("only marks the matching suggestion when multiple suggestions exist", async () => {
    linkedRows = [
      {
        id: "aq-fan",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Add oscillating fan. [session:${SESSION_ID}]`,
        suggested_change: "Add oscillating fan — Improve canopy airflow.",
      },
    ];
    renderDetail();
    const list = await findReviewActionsList();
    await waitFor(() => {
      expect(
        within(list).getAllByTestId(
          "ai-doctor-session-detail-review-action-created-from-session-chip",
        ),
      ).toHaveLength(1);
    });
    const marked = within(list).getByTestId(
      "ai-doctor-session-detail-review-action-created-from-session",
    );
    expect(marked.getAttribute("data-action-queue-id")).toBe("aq-fan");

    // The first suggestion ("Raise light") should not be marked.
    const items = within(list).getAllByTestId(
      "ai-doctor-session-detail-review-action",
    );
    const raiseLight = items.find((li) => li.textContent?.startsWith("Raise light"));
    expect(raiseLight).toBeTruthy();
    expect(
      raiseLight!.querySelector(
        '[data-testid="ai-doctor-session-detail-review-action-created-from-session-chip"]',
      ),
    ).toBeNull();
  });

  it("does not render the chip when no linked Action Queue item exists", async () => {
    linkedRows = [];
    renderDetail();
    await findReviewActionsList();
    await waitFor(() => {
      expect(
        screen.queryByTestId(
          "ai-doctor-session-detail-review-action-created-from-session-chip",
        ),
      ).toBeNull();
    });
  });

  it("preserves the separate 'Linked Action Queue items' panel", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light — Raise the light by 10 cm.",
      },
    ];
    renderDetail();
    expect(
      await screen.findByTestId("ai-doctor-session-detail-linked-action-queue"),
    ).toBeTruthy();
  });

  it("preserves the existing Add to Action Queue button", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light — Raise the light by 10 cm.",
      },
    ];
    renderDetail();
    const buttons = await screen.findAllByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("never leaks the raw [session:<id>] token or target_device", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light — Raise the light by 10 cm.",
      },
    ];
    renderDetail();
    const marked = await screen.findByTestId(
      "ai-doctor-session-detail-review-action-created-from-session",
    );
    const text = (marked.textContent ?? "").toLowerCase();
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("target_device");
  });

  it("chip copy never implies automation, execution, or equipment control", async () => {
    linkedRows = [
      {
        id: "aq-light",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
        suggested_change: "Raise light — Raise the light by 10 cm.",
      },
    ];
    renderDetail();
    const marked = await screen.findByTestId(
      "ai-doctor-session-detail-review-action-created-from-session",
    );
    const lower = (marked.textContent ?? "").toLowerCase();
    for (const tok of [
      "automate",
      "auto-execute",
      "actuate",
      "turn on",
      "turn off",
      "mqtt",
      "relay",
      "approve",
      "complete",
      "reject",
      "execute",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(
  resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"),
  "utf8",
);
const HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useAiDoctorSessionLinkedActionQueueItems.ts"),
  "utf8",
);
const VM = readFileSync(
  resolve(ROOT, "src/lib/aiDoctorSessionLinkedActionsViewModel.ts"),
  "utf8",
);

describe("Created-from-session chip — static safety", () => {
  it("no new action_queue write chains in the page", () => {
    // Page must not chain insert/update/delete/upsert/rpc directly off action_queue.
    expect(PAGE).not.toMatch(/from\(["']action_queue["']\)[\s\S]{0,200}?\.insert\(/);
    expect(PAGE).not.toMatch(/from\(["']action_queue["']\)[\s\S]{0,200}?\.update\(/);
    expect(PAGE).not.toMatch(/from\(["']action_queue["']\)[\s\S]{0,200}?\.upsert\(/);
    expect(PAGE).not.toMatch(/from\(["']action_queue["']\)[\s\S]{0,200}?\.delete\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("hook is still read-only", () => {
    expect(HOOK).not.toMatch(/\.insert\(/);
    expect(HOOK).not.toMatch(/\.update\(/);
    expect(HOOK).not.toMatch(/\.upsert\(/);
    expect(HOOK).not.toMatch(/\.delete\(/);
    expect(HOOK).not.toMatch(/\.rpc\(/);
    expect(HOOK).not.toMatch(/functions\.invoke/);
  });

  it("view model remains pure (no supabase / fetch / react)", () => {
    expect(VM).not.toMatch(/from ["']@\/integrations\/supabase/);
    expect(VM).not.toMatch(/fetch\(/);
    expect(VM).not.toMatch(/from ["']react["']/);
  });

  it("no service_role / automation markers in the new surfaces", () => {
    for (const src of [PAGE, HOOK, VM]) {
      const lower = src.toLowerCase();
      expect(lower).not.toContain("service_role");
      for (const tok of [
        "auto-execute",
        "actuate",
        "device.command",
        "relay.on",
        "relay.off",
        "home_assistant",
        "home-assistant",
      ]) {
        expect(lower).not.toContain(tok);
      }
    }
  });
});
