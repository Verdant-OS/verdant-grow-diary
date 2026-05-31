/**
 * AI Doctor Session detail — "Linked alert" read-only back-link.
 *
 * Closes the navigation loop: AI Doctor session → linked Action Queue item →
 * linked alert. Renders only when at least one linked open Action Queue row
 * exposes a safe `[alert:<id>]` token in its reason.
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
import { alertDetailPath } from "@/lib/routes";

const SESSION_ID = "sess-link-2";
const GROW_ID = "grow-1";

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
        detail: "Raise 10 cm.",
        priority: "medium",
        reason: "Reduce radiant load.",
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
    plant_id: null,
    tent_id: null,
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
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
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

describe("AiDoctorSessionDetail — Linked alert back-link", () => {
  it("renders no Linked alert section when no linked action carries an alert id", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-linked-action-queue");
    expect(
      screen.queryByTestId("ai-doctor-session-detail-linked-alert"),
    ).toBeNull();
  });

  it("renders 'Linked alert' chip and 'View linked alert' link when an alert id is present", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Lower humidity. [session:${SESSION_ID}] [alert:alert-xyz]`,
      },
    ];
    renderDetail();
    const chip = await screen.findByTestId(
      "ai-doctor-session-detail-linked-alert-chip",
    );
    expect(chip.textContent ?? "").toMatch(/linked alert/i);
    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-linked-alert-link",
    )) as HTMLAnchorElement;
    expect(link.textContent).toBe("View linked alert");
    expect(link.getAttribute("href")).toBe(alertDetailPath("alert-xyz"));
  });

  it("renders one link per unique alert id (dedupes duplicates)", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `A. [session:${SESSION_ID}] [alert:alert-a]`,
      },
      {
        id: "aq-2",
        status: "approved",
        source: "ai_doctor",
        reason: `B. [session:${SESSION_ID}] [alert:alert-a]`,
      },
    ];
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-linked-alert");
    const links = screen.getAllByTestId(
      "ai-doctor-session-detail-linked-alert-link",
    );
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe(alertDetailPath("alert-a"));
  });

  it("renders multiple links when multiple distinct alert ids are linked", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `A. [session:${SESSION_ID}] [alert:alert-a]`,
      },
      {
        id: "aq-2",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `B. [session:${SESSION_ID}] [alert:alert-b]`,
      },
    ];
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-linked-alert");
    const links = screen.getAllByTestId(
      "ai-doctor-session-detail-linked-alert-link",
    ) as HTMLAnchorElement[];
    expect(links).toHaveLength(2);
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain(alertDetailPath("alert-a"));
    expect(hrefs).toContain(alertDetailPath("alert-b"));
  });

  it("does not leak raw [alert:<id>], [session:<id>] tokens, or target_device", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Lower humidity. [session:${SESSION_ID}] [alert:alert-xyz]`,
      },
    ];
    const { container } = renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-linked-alert");
    const text = container.textContent ?? "";
    expect(text).not.toContain("[alert:");
    expect(text).not.toContain("[session:");
    expect(text.toLowerCase()).not.toContain("target_device");
  });

  it("copy does not imply automation, execution, equipment control, or status transition", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Lower humidity. [session:${SESSION_ID}] [alert:alert-xyz]`,
      },
    ];
    renderDetail();
    const section = await screen.findByTestId(
      "ai-doctor-session-detail-linked-alert",
    );
    const lower = (section.textContent ?? "").toLowerCase();
    for (const tok of [
      "auto-execute",
      "automatically",
      "actuate",
      "execute now",
      "turn on",
      "turn off",
      "relay",
      "mqtt",
      "approve",
      "reject",
      "complete",
      "resolve",
      "dismiss",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it("preserves the existing Linked Action Queue items panel", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Lower humidity. [session:${SESSION_ID}] [alert:alert-xyz]`,
      },
    ];
    renderDetail();
    await waitFor(() => {
      expect(
        screen.queryByTestId("ai-doctor-session-detail-linked-action-queue"),
      ).not.toBeNull();
    });
  });
});

// --- Static safety scans ----------------------------------------------------
const PAGE_SRC = readFileSync(
  resolve(__dirname, "../..", "src/pages/AiDoctorSessionDetail.tsx"),
  "utf8",
);
const VM_SRC = readFileSync(
  resolve(__dirname, "../..", "src/lib/aiDoctorSessionLinkedActionsViewModel.ts"),
  "utf8",
);

describe("AiDoctorSessionDetail Linked alert — static safety", () => {
  it("uses the shared route helper for alert detail", () => {
    expect(PAGE_SRC).toMatch(/alertDetailPath\(/);
  });

  it("uses the pure extractSourceAlertId helper in the view model", () => {
    expect(VM_SRC).toMatch(/extractSourceAlertId\(/);
  });

  it("introduces no write paths into action_queue or alerts", () => {
    const lower = PAGE_SRC.toLowerCase();
    expect(lower).not.toContain("functions.invoke");
    expect(lower).not.toContain("service_role");
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.upsert\(/,
    );
    expect(lower).not.toMatch(
      /from\(["']action_queue["'][\s\S]{0,200}?\.delete\(/,
    );
    expect(lower).not.toMatch(
      /from\(["']alerts["'][\s\S]{0,200}?\.(insert|update|delete|upsert)\(/,
    );
  });

  it("does not render raw session/alert tokens in JSX literals", () => {
    expect(PAGE_SRC).not.toMatch(/>\s*\[session:/);
    expect(PAGE_SRC).not.toMatch(/>\s*\[alert:/);
  });
});
