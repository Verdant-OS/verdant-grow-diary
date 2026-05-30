/**
 * AI Doctor Session detail (historical, read-only) tests.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import PlantAiDoctorSessionsPanel from "@/components/PlantAiDoctorSessionsPanel";
import TentAiDoctorSessionsPanel from "@/components/TentAiDoctorSessionsPanel";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

// Default supabase mock — no rows. Individual tests below re-mock the module.
vi.mock("@/integrations/supabase/client", () => {
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
  const fixture: AiDoctorSessionRow = {
    id: "sess-1",
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
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: (_col: string, value: string) => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
            maybeSingle: () =>
              Promise.resolve(
                value === "sess-1"
                  ? { data: fixture, error: null }
                  : { data: null, error: null },
              ),
          }),
        }),
      }),
    },
  };
});

function renderRoute(initialPath: string, element: ReactElement, path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderWithRouter(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PAGE = read("src/pages/AiDoctorSessionDetail.tsx");
const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const PLANT_PANEL = read("src/components/PlantAiDoctorSessionsPanel.tsx");
const TENT_PANEL = read("src/components/TentAiDoctorSessionsPanel.tsx");
const APP = read("src/App.tsx");

describe("AI Doctor Session detail — routing & wiring", () => {
  it("App registers /doctor/sessions/:sessionId route", () => {
    expect(APP).toMatch(/\/doctor\/sessions\/:sessionId/);
    expect(APP).toContain("AiDoctorSessionDetail");
  });
  it("hook exports useAiDoctorSession with maybeSingle by id", () => {
    expect(HOOK).toMatch(/export function useAiDoctorSession/);
    expect(HOOK).toMatch(/\.eq\(\s*["']id["']/);
    expect(HOOK).toMatch(/\.maybeSingle\(\)/);
  });
});

describe("Plant session row — View session link", () => {
  it("plant panel renders a View session link to /doctor/sessions/:id", () => {
    expect(PLANT_PANEL).toMatch(/data-testid="ai-doctor-session-view-link"/);
    expect(PLANT_PANEL).toMatch(/\/doctor\/sessions\/\$\{row\.id\}/);
  });
});

describe("Tent session row — View session link", () => {
  it("tent panel renders a View session link to /doctor/sessions/:id", () => {
    expect(TENT_PANEL).toMatch(/data-testid="tent-ai-doctor-session-view-link"/);
    expect(TENT_PANEL).toMatch(/\/doctor\/sessions\/\$\{row\.id\}/);
  });
});

describe("AiDoctorSessionDetail — rendering", () => {
  it("renders historical title and helper copy", async () => {
    renderRoute(
      "/doctor/sessions/sess-1",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    expect(screen.getByTestId("ai-doctor-session-detail-title").textContent).toMatch(
      /historical ai doctor session/i,
    );
    expect(screen.getByTestId("ai-doctor-session-detail-helper").textContent).toMatch(
      /saved diagnosis snapshot/i,
    );
  });

  it("renders likely issue, summary, risk, confidence, ceiling, action count", async () => {
    renderRoute(
      "/doctor/sessions/sess-1",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    expect(await screen.findByTestId("ai-doctor-session-detail-likely-issue")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-risk").textContent).toMatch(/medium/i);
    expect(screen.getByTestId("ai-doctor-session-detail-confidence").textContent).toMatch(/70%/);
    expect(screen.getByTestId("ai-doctor-session-detail-context-ceiling").textContent).toMatch(
      /medium/i,
    );
    expect(screen.getByTestId("ai-doctor-session-detail-action-count").textContent).toMatch(/1/);
  });

  it("renders suggested actions as read-only text only", async () => {
    renderRoute(
      "/doctor/sessions/sess-1",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    const list = await screen.findByTestId("ai-doctor-session-detail-actions-list");
    expect(list).toBeTruthy();
    // No buttons inside the actions list
    expect(list.querySelectorAll("button").length).toBe(0);
  });

  it("renders not-found state for missing/inaccessible session", async () => {
    renderRoute(
      "/doctor/sessions/missing",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    expect(await screen.findByTestId("ai-doctor-session-detail-not-found")).toBeTruthy();
  });
});

describe("AiDoctorSessionDetail — safety", () => {
  it("has no Add to Action Queue button", () => {
    expect(PAGE).not.toMatch(/add[_ ]to[_ ]action[_ ]queue/i);
    expect(PAGE).not.toMatch(/addDoctorSuggestion|onAddToQueue|addToQueue/);
  });
  it("does not call ai-coach or re-run AI", () => {
    expect(PAGE).not.toMatch(/functions\.invoke/);
    expect(PAGE).not.toMatch(/ai-coach/);
    expect(PAGE).not.toMatch(/runDoctor|runAi|generateDiagnosis/i);
  });
  it("does not write to any table", () => {
    for (const src of [PAGE, HOOK]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("does not reference action_queue or alerts writes", () => {
    const ALL = [PAGE, HOOK].join("\n");
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']alert_events["']\)/);
  });
  it("contains no service_role or automation/device-control strings", () => {
    const ALL = [PAGE, HOOK].join("\n").toLowerCase();
    expect(ALL).not.toContain("service_role");
    const banned = [
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
    for (const tok of banned) expect(ALL).not.toContain(tok);
  });
});

describe("Existing panels still render", () => {
  it("plant panel still renders empty state", () => {
    renderWithRouter(<PlantAiDoctorSessionsPanel plantId={null} />);
    expect(screen.getByTestId("plant-ai-doctor-sessions-empty-no-plant")).toBeTruthy();
  });
  it("tent panel still renders empty state", () => {
    renderWithRouter(<TentAiDoctorSessionsPanel tentId={null} />);
    expect(screen.getByTestId("tent-ai-doctor-sessions-empty-no-tent")).toBeTruthy();
  });
});
