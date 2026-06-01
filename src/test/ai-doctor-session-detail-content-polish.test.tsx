/**
 * AI Doctor Session Detail — content & linked-action UX polish.
 *
 * Verifies presentation/accessibility:
 *   - Loading skeletons with role=status + aria-busy.
 *   - Session summary panel with safe fallbacks.
 *   - Linked Action Queue loading/empty states.
 *   - Linked action controls have descriptive aria-labels & focus styles.
 *   - No raw IDs or [session:]/[alert:] tokens leak.
 *   - Static safety scan (no writes, no AI invoke, no automation copy).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

const SESSION_ID = "sess-polish-1";

function makeDiagnosis(): Diagnosis {
  return {
    summary: "Mild tip curl observed.",
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
    suggestedActions: [],
  };
}

function makeFixture(): AiDoctorSessionRow {
  const d = makeDiagnosis();
  return {
    id: SESSION_ID,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "plant-1",
    tent_id: "tent-1",
    grow_id: "grow-1",
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
let linkedDelayMs = 0;

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
      limit: () =>
        linkedDelayMs > 0
          ? new Promise((r) =>
              setTimeout(
                () => r({ data: linkedRows, error: null }),
                linkedDelayMs,
              ),
            )
          : Promise.resolve({ data: linkedRows, error: null }),
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
  linkedDelayMs = 0;
});

describe("AiDoctorSessionDetail — loading skeletons", () => {
  it("renders loading copy with role=status, aria-live, aria-busy and skeleton placeholders", async () => {
    renderDetail();
    const loading = await screen.findByTestId("ai-doctor-session-detail-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-live")).toBe("polite");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toMatch(/loading ai doctor session/i);
    expect(
      screen.getByTestId("ai-doctor-session-detail-loading-skeleton"),
    ).toBeTruthy();
  });

  it("does not render summary, linked actions, not-found or error copy while loading", () => {
    renderDetail();
    expect(
      screen.queryByTestId("ai-doctor-session-detail-session-summary"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-session-detail-linked-action-queue"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-session-detail-linked-action-queue-empty"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-session-detail-not-found"),
    ).toBeNull();
    expect(screen.queryByTestId("ai-doctor-session-detail-error")).toBeNull();
  });
});

describe("AiDoctorSessionDetail — session summary panel", () => {
  it("renders summary panel with safe fields from existing session data", async () => {
    renderDetail();
    const panel = await screen.findByTestId(
      "ai-doctor-session-detail-session-summary",
    );
    expect(panel.textContent).toMatch(/Session summary/);
    expect(
      screen.getByTestId("ai-doctor-session-summary-risk").textContent,
    ).toMatch(/medium/i);
    expect(
      screen.getByTestId("ai-doctor-session-summary-confidence").textContent,
    ).toMatch(/70%/);
    expect(
      screen.getByTestId("ai-doctor-session-summary-context").textContent,
    ).toMatch(/plant/i);
    expect(
      screen.getByTestId("ai-doctor-session-summary-diagnosis").textContent,
    ).toMatch(/mild tip curl/i);
    expect(
      screen.getByTestId("ai-doctor-session-summary-review-note").textContent,
    ).toMatch(/review this snapshot before acting/i);
  });

  it("renders calm fallback when diagnosis summary is missing — no fabricated content", async () => {
    currentFixture = {
      ...makeFixture(),
      diagnosis: { ...makeDiagnosis(), summary: null as unknown as string },
    };
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-session-summary");
    expect(
      screen.getByTestId("ai-doctor-session-summary-diagnosis-empty").textContent,
    ).toMatch(/no diagnosis summary saved/i);
  });

  it("never leaks raw plant/tent/grow ids or [session:]/[alert:] tokens", async () => {
    renderDetail();
    const panel = await screen.findByTestId(
      "ai-doctor-session-detail-session-summary",
    );
    const text = panel.textContent ?? "";
    expect(text).not.toContain("plant-1");
    expect(text).not.toContain("tent-1");
    expect(text).not.toContain("grow-1");
    expect(text).not.toContain("[session:");
    expect(text).not.toContain("[alert:");
  });
});

describe("AiDoctorSessionDetail — linked Action Queue states", () => {
  it("renders a loading state while linked actions are loading", async () => {
    linkedDelayMs = 200;
    linkedRows = [
      {
        id: "aq-l",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    const loading = await screen.findByTestId(
      "ai-doctor-session-detail-linked-action-queue-loading",
    );
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("renders a calm empty state when no linked actions exist", async () => {
    linkedRows = [];
    renderDetail();
    const empty = await screen.findByTestId(
      "ai-doctor-session-detail-linked-action-queue-empty",
    );
    expect(empty.textContent).toMatch(/no approval-required action has been queued/i);
    expect(
      screen.queryByTestId("ai-doctor-session-detail-linked-action-queue"),
    ).toBeNull();
  });

  it("linked action primary link has descriptive aria-label and focus-visible styles", async () => {
    linkedRows = [
      {
        id: "aq-x",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light to lower canopy temp. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-linked-action-queue-primary-link",
    )) as HTMLAnchorElement;
    const label = link.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/^Open linked action: /);
    expect(label).toMatch(/Raise light/);
    expect(label).not.toContain("aq-x");
    expect(label).not.toContain("[session:");
    expect(link.className).toMatch(/focus-visible:ring/);
    expect(link.getAttribute("href")).toBe("/actions?focus=aq-x");
  });

  it("each per-item linked link has aria-label and focus-visible styles", async () => {
    linkedRows = [
      {
        id: "aq-a",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
      },
      {
        id: "aq-b",
        status: "approved",
        source: "ai_doctor",
        reason: `Add fan. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    const items = await screen.findAllByTestId(
      "ai-doctor-session-detail-linked-action-queue-item-link",
    );
    expect(items).toHaveLength(2);
    for (const li of items) {
      const label = li.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/^Open linked action: /);
      expect(label).not.toContain("[session:");
      expect(label).not.toContain("[alert:");
      expect(li.className).toMatch(/focus-visible:ring/);
    }
    await waitFor(() => {
      const empty = screen.queryByTestId(
        "ai-doctor-session-detail-linked-action-queue-empty",
      );
      expect(empty).toBeNull();
    });
  });
});

// --- Static safety scan ------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(
  resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"),
  "utf8",
);

describe("AiDoctorSessionDetail content polish — static safety", () => {
  it("no service_role, no writes, no functions.invoke", () => {
    expect(PAGE).not.toContain("service_role");
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });
  it("no automation / autopilot / device-control / AI execution language", () => {
    const lower = PAGE.toLowerCase();
    for (const tok of [
      "autopilot",
      "auto-execute",
      "auto execute",
      "ai executed",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home_assistant",
      "home-assistant",
      "mqtt",
      "smart plug",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});
