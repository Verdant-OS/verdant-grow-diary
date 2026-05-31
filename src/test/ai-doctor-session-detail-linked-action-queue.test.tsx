/**
 * AI Doctor Session detail — "Linked Action Queue items" back-link panel.
 *
 * Verifies the read-only round-trip surface that lets growers jump from a
 * historical AI Doctor session to the approval-required Action Queue rows it
 * created, without ever exposing internal tokens or implying device control.
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

const SESSION_ID = "sess-link-1";
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

describe("AiDoctorSessionDetail — Linked Action Queue items panel", () => {
  it("renders nothing when there are no linked open action items", async () => {
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-page");
    // give the linked-actions query a chance to settle
    await waitFor(() => {
      expect(
        screen.queryByTestId("ai-doctor-session-detail-linked-action-queue"),
      ).toBeNull();
    });
  });

  it("shows the section with a single direct link when one open item is linked", async () => {
    linkedRows = [
      {
        id: "aq-1",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light to lower canopy temp. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    const section = await screen.findByTestId(
      "ai-doctor-session-detail-linked-action-queue",
    );
    expect(section.textContent).toContain("Linked Action Queue items");
    expect(section.textContent).toContain("approval-required");

    const link = (await screen.findByTestId(
      "ai-doctor-session-detail-linked-action-queue-primary-link",
    )) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/actions?focus=aq-1");
    expect(link.textContent).toContain("View in Action Queue");

    const count = screen.getByTestId(
      "ai-doctor-session-detail-linked-action-queue-count",
    );
    expect(count.textContent).toMatch(/1 open item/);
  });

  it("renders one row per linked item when multiple open items exist", async () => {
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
      "ai-doctor-session-detail-linked-action-queue-item",
    );
    expect(items).toHaveLength(2);
    const hrefs = items.map((li) =>
      li.querySelector("a")?.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/actions?focus=aq-a", "/actions?focus=aq-b"]);
    expect(
      screen.queryByTestId(
        "ai-doctor-session-detail-linked-action-queue-primary-link",
      ),
    ).toBeNull();
    expect(
      screen
        .getByTestId("ai-doctor-session-detail-linked-action-queue-count")
        .textContent,
    ).toMatch(/2 open items/);
  });

  it("never renders the raw [session:<id>] token", async () => {
    linkedRows = [
      {
        id: "aq-tok",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Watch closely. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    const section = await screen.findByTestId(
      "ai-doctor-session-detail-linked-action-queue",
    );
    const text = section.textContent ?? "";
    expect(text).not.toContain(`[session:${SESSION_ID}]`);
    expect(text).not.toContain("[session:");
  });

  it("never mentions target_device or device-control language", async () => {
    linkedRows = [
      {
        id: "aq-dev",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Adjust environment. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    const section = await screen.findByTestId(
      "ai-doctor-session-detail-linked-action-queue",
    );
    const lower = (section.textContent ?? "").toLowerCase();
    expect(lower).not.toContain("target_device");
    for (const tok of [
      "automate",
      "auto-execute",
      "actuate",
      "turn on",
      "turn off",
      "mqtt",
      "relay",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });

  it("preserves the existing Add to Action Queue button for eligible suggestions", async () => {
    linkedRows = [
      {
        id: "aq-keep",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Raise light. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    const btn = await screen.findByTestId(
      "ai-doctor-session-detail-add-to-action-queue-button",
    );
    expect(btn).toBeTruthy();
  });

  it("filters out rows that lack a matching session token", async () => {
    linkedRows = [
      {
        id: "aq-other",
        status: "pending_approval",
        source: "ai_doctor",
        reason: `Different review. [session:some-other-session]`,
      },
    ];
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-page");
    await waitFor(() => {
      expect(
        screen.queryByTestId("ai-doctor-session-detail-linked-action-queue"),
      ).toBeNull();
    });
  });

  it("filters out rows whose source is not ai_doctor", async () => {
    linkedRows = [
      {
        id: "aq-alert",
        status: "pending_approval",
        source: "environment_alert",
        reason: `Manual link. [session:${SESSION_ID}]`,
      },
    ];
    renderDetail();
    await screen.findByTestId("ai-doctor-session-detail-page");
    await waitFor(() => {
      expect(
        screen.queryByTestId("ai-doctor-session-detail-linked-action-queue"),
      ).toBeNull();
    });
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

describe("Linked Action Queue back-link — static safety", () => {
  it("page contains no insert/update/delete/upsert/rpc/functions.invoke", () => {
    expect(PAGE).not.toMatch(/\.insert\(/);
    expect(PAGE).not.toMatch(/\.update\(/);
    expect(PAGE).not.toMatch(/\.upsert\(/);
    expect(PAGE).not.toMatch(/\.delete\(/);
    expect(PAGE).not.toMatch(/\.rpc\(/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("hook is read-only (select only)", () => {
    expect(HOOK).not.toMatch(/\.insert\(/);
    expect(HOOK).not.toMatch(/\.update\(/);
    expect(HOOK).not.toMatch(/\.upsert\(/);
    expect(HOOK).not.toMatch(/\.delete\(/);
    expect(HOOK).not.toMatch(/\.rpc\(/);
    expect(HOOK).not.toMatch(/functions\.invoke/);
  });

  it("view model is pure (no supabase / fetch / react imports)", () => {
    expect(VM).not.toMatch(/from ["']@\/integrations\/supabase/);
    expect(VM).not.toMatch(/fetch\(/);
    expect(VM).not.toMatch(/from ["']react["']/);
  });

  it("no automation / device-control markers in the new surfaces", () => {
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
