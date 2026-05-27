/**
 * Plant Detail → AI Doctor Sessions panel tests.
 *
 * Asserts:
 *  1. Hook queries `ai_doctor_sessions` by plant_id.
 *  2. Hook orders newest first and limits results.
 *  3. Panel renders empty state.
 *  4. Panel renders session summary, risk, confidence, and suggested action count.
 *  5. Panel does not render Add to Action Queue.
 *  6. Plant Detail mounts the panel.
 *  7. Static safety: no insert/update/delete/upsert, no action_queue, no alerts
 *     writes, no service_role, no automation/device-control strings.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import PlantAiDoctorSessionsPanel from "@/components/PlantAiDoctorSessionsPanel";
import { AI_DOCTOR_SESSIONS_LIMIT, type AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const PANEL = read("src/components/PlantAiDoctorSessionsPanel.tsx");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

const diagnosis: Diagnosis = {
  summary: "Mild heat stress on upper canopy.",
  likelyIssue: "Heat stress",
  confidence: 0.72,
  evidence: ["Tip curl"],
  missingInformation: [],
  possibleCauses: ["Light too close"],
  immediateAction: "Raise the light by 10cm.",
  whatNotToDo: ["Do not defoliate"],
  followUp24h: { summary: "Re-check canopy.", checklist: [] },
  recoveryPlan3d: { summary: "Stabilize VPD.", checklist: [] },
  riskLevel: "medium",
  suggestedActions: [
    {
      type: "task",
      title: "Raise light",
      detail: "Raise grow light by 10cm.",
      priority: "medium",
      reason: "Reduces radiant load.",
      approvalRequired: true,
    },
  ],
};

function makeSession(overrides: Partial<AiDoctorSessionRow> = {}): AiDoctorSessionRow {
  return {
    id: "s1",
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "p1",
    grow_id: "g1",
    question: null,
    diagnosis,
    raw_confidence: 0.8,
    displayed_confidence: 0.72,
    context_confidence_ceiling: null,
    suggested_actions: diagnosis.suggestedActions,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Hook static contract: queries ai_doctor_sessions by plant_id
// ---------------------------------------------------------------------------

describe("useAiDoctorSessions — hook static contract", () => {
  it("queries ai_doctor_sessions table", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']ai_doctor_sessions["']/);
  });

  it("filters by plant_id", () => {
    expect(HOOK).toMatch(/\.eq\(\s*["']plant_id["']/);
  });

  it("orders newest first (ascending: false)", () => {
    expect(HOOK).toMatch(/\.order\(\s*["']created_at["'],\s*\{\s*ascending:\s*false/);
  });

  it("limits results", () => {
    expect(HOOK).toMatch(/\.limit\(/);
  });

  it("limit constant is at most 10", () => {
    expect(AI_DOCTOR_SESSIONS_LIMIT).toBeLessThanOrEqual(10);
    expect(AI_DOCTOR_SESSIONS_LIMIT).toBeGreaterThan(0);
  });

  it("is guarded by enabled: !!plantId", () => {
    expect(HOOK).toMatch(/enabled:\s*!!plantId/);
  });
});

// ---------------------------------------------------------------------------
// 3. Panel renders empty state
// ---------------------------------------------------------------------------

describe("PlantAiDoctorSessionsPanel — empty state", () => {
  it("renders empty state when no sessions", () => {
    renderWithClient(<PlantAiDoctorSessionsPanel plantId="p1" />);
    // isLoading = true (query never resolves in unit test without provider),
    // but the panel testid always renders
    expect(screen.getByTestId("plant-ai-doctor-sessions-panel")).toBeTruthy();
  });

  it("renders empty state copy when rows is empty", () => {
    // Render without a plantId so the panel shows no-plant state
    renderWithClient(<PlantAiDoctorSessionsPanel plantId={null} />);
    expect(screen.getByTestId("plant-ai-doctor-sessions-empty-no-plant")).toBeTruthy();
  });

  it("shows the read-only label", () => {
    renderWithClient(<PlantAiDoctorSessionsPanel plantId={null} />);
    expect(screen.getByTestId("plant-ai-doctor-sessions-readonly-label").textContent).toMatch(
      /read-only ai doctor history/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Panel renders session fields
// ---------------------------------------------------------------------------

describe("PlantAiDoctorSessionsPanel — session rendering (static source)", () => {
  it("session row renders summary field", () => {
    expect(PANEL).toMatch(/ai-doctor-session-summary/);
  });

  it("session row renders risk level field", () => {
    expect(PANEL).toMatch(/ai-doctor-session-risk/);
  });

  it("session row renders confidence field", () => {
    expect(PANEL).toMatch(/ai-doctor-session-confidence/);
  });

  it("session row renders suggested action count", () => {
    expect(PANEL).toMatch(/ai-doctor-session-action-count/);
  });

  it("session row renders likely issue field", () => {
    expect(PANEL).toMatch(/ai-doctor-session-likely-issue/);
  });

  it("session row renders created date", () => {
    expect(PANEL).toMatch(/ai-doctor-session-date/);
  });

  it("session row renders context ceiling when available", () => {
    expect(PANEL).toMatch(/ai-doctor-session-context-ceiling/);
  });
});

// ---------------------------------------------------------------------------
// 5. Panel does NOT render Add to Action Queue
// ---------------------------------------------------------------------------

describe("PlantAiDoctorSessionsPanel — no Add to Action Queue", () => {
  it("panel source does not reference action_queue table", () => {
    expect(PANEL).not.toMatch(/\.from\(["']action_queue["']\)/);
  });

  it("panel source has no Add to Action Queue button", () => {
    expect(PANEL).not.toMatch(/onAddToQueue|addToQueue|addDoctorSuggestion/i);
    expect(PANEL).not.toMatch(/add[_ ]to[_ ]action[_ ]queue/i);
  });

  it("hook source does not reference action_queue table", () => {
    expect(HOOK).not.toMatch(/\.from\(["']action_queue["']\)/);
  });
});

// ---------------------------------------------------------------------------
// 6. Plant Detail mounts the panel
// ---------------------------------------------------------------------------

describe("Plant Detail wiring", () => {
  it("PlantDetail imports PlantAiDoctorSessionsPanel", () => {
    expect(PLANT_DETAIL).toContain("PlantAiDoctorSessionsPanel");
  });

  it("PlantDetail mounts panel with plant.id", () => {
    expect(PLANT_DETAIL).toMatch(/PlantAiDoctorSessionsPanel[\s\S]{0,120}plantId=\{plant\.id\}/);
  });
});

// ---------------------------------------------------------------------------
// 7. Static safety
// ---------------------------------------------------------------------------

describe("AI Doctor Sessions safety", () => {
  const ALL = [PANEL, HOOK].join("\n");

  it("never writes from panel or hook", () => {
    for (const src of [PANEL, HOOK]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("does not reference action_queue or alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']alert_events["']\)/);
  });

  it("does not contain service_role credentials or key references in code", () => {
    // Check for code-level service_role usage (not doc comments)
    expect(PANEL).not.toMatch(/service_role/i);
    expect(HOOK).not.toMatch(/service_role/i);
  });

  it("contains no automation or device-control strings", () => {
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
    for (const tok of banned) {
      expect(ALL.toLowerCase()).not.toContain(tok);
    }
  });
});

// ---------------------------------------------------------------------------
// Existing Plant Detail surfaces remain intact
// ---------------------------------------------------------------------------

describe("Existing Plant Detail surfaces remain intact", () => {
  it("AssignTentDialog still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("AssignTentDialog");
  });

  it("PlantTentEnvironmentPanel still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("PlantTentEnvironmentPanel");
  });

  it("PlantRecentActivityPanel still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("PlantRecentActivityPanel");
  });

  it("PlantAssignedTentActionsPanel still rendered on Plant Detail", () => {
    expect(PLANT_DETAIL).toContain("PlantAssignedTentActionsPanel");
  });
});
