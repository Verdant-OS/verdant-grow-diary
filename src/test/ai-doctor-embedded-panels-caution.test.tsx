/**
 * Embedded AI Doctor session panels — caution + limited-context indicators.
 *
 * Read-only UI/view-model improvement. No writes, no AI, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: currentRows, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import PlantAiDoctorSessionsPanel from "@/components/PlantAiDoctorSessionsPanel";
import TentAiDoctorSessionsPanel from "@/components/TentAiDoctorSessionsPanel";
import CoachAiDoctorHistoryPanel from "@/components/CoachAiDoctorHistoryPanel";

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function makeRow(
  id: string,
  diagnosisOverrides: Partial<Diagnosis> = {},
  rowOverrides: Partial<AiDoctorSessionRow> = {},
): AiDoctorSessionRow {
  const diagnosis: Diagnosis = {
    summary: "ok",
    likelyIssue: "ok",
    confidence: 0.9,
    evidence: ["e1"],
    missingInformation: [],
    possibleCauses: [],
    immediateAction: "",
    whatNotToDo: [],
    followUp24h: null,
    recoveryPlan3d: null,
    riskLevel: "low",
    suggestedActions: [],
    ...diagnosisOverrides,
  };
  return {
    id,
    created_at: "2026-05-27T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: null,
    diagnosis,
    raw_confidence: 0.9,
    displayed_confidence: 0.9,
    context_confidence_ceiling: null,
    suggested_actions: [],
    ...rowOverrides,
  };
}

beforeEach(() => {
  currentRows = [];
});

describe("PlantAiDoctorSessionsPanel — indicators", () => {
  it("shows caution for low-confidence session", async () => {
    currentRows = [
      makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    ];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    expect(
      await screen.findByTestId("plant-ai-doctor-session-caution-indicator"),
    ).toBeTruthy();
  });

  it("shows caution for elevated-risk session", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    expect(
      await screen.findByTestId("plant-ai-doctor-session-caution-indicator"),
    ).toBeTruthy();
  });

  it("shows limited-context indicator when context missing", async () => {
    currentRows = [
      makeRow(
        "a",
        { evidence: [] },
        { plant_id: null, tent_id: null, grow_id: null },
      ),
    ];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    expect(
      await screen.findByTestId("plant-ai-doctor-session-limited-context-indicator"),
    ).toBeTruthy();
  });

  it("preserves View session link", async () => {
    currentRows = [makeRow("a")];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    const link = await screen.findByTestId("ai-doctor-session-view-link");
    expect(link.getAttribute("href")).toMatch(/^\/doctor\/sessions\/a$/);
  });
});

describe("TentAiDoctorSessionsPanel — indicators", () => {
  it("shows caution for low-confidence session", async () => {
    currentRows = [
      makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    ];
    renderWithProviders(<TentAiDoctorSessionsPanel tentId="t1" />);
    expect(
      await screen.findByTestId("tent-ai-doctor-session-caution-indicator"),
    ).toBeTruthy();
  });

  it("shows caution for elevated-risk session", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<TentAiDoctorSessionsPanel tentId="t1" />);
    expect(
      await screen.findByTestId("tent-ai-doctor-session-caution-indicator"),
    ).toBeTruthy();
  });

  it("shows limited-context indicator when context missing", async () => {
    currentRows = [
      makeRow(
        "a",
        { evidence: [] },
        { plant_id: null, tent_id: null, grow_id: null },
      ),
    ];
    renderWithProviders(<TentAiDoctorSessionsPanel tentId="t1" />);
    expect(
      await screen.findByTestId("tent-ai-doctor-session-limited-context-indicator"),
    ).toBeTruthy();
  });

  it("preserves View session link", async () => {
    currentRows = [makeRow("a")];
    renderWithProviders(<TentAiDoctorSessionsPanel tentId="t1" />);
    const link = await screen.findByTestId("tent-ai-doctor-session-view-link");
    expect(link.getAttribute("href")).toMatch(/^\/doctor\/sessions\/a$/);
  });
});

describe("CoachAiDoctorHistoryPanel — indicators", () => {
  it("shows caution for low-confidence session", async () => {
    currentRows = [
      makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    ];
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    expect(
      await screen.findByTestId("coach-ai-doctor-history-caution-indicator"),
    ).toBeTruthy();
  });

  it("shows caution for elevated-risk session", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    expect(
      await screen.findByTestId("coach-ai-doctor-history-caution-indicator"),
    ).toBeTruthy();
  });

  it("shows limited-context indicator when context missing", async () => {
    currentRows = [
      makeRow(
        "a",
        { evidence: [] },
        { plant_id: null, tent_id: null, grow_id: null },
      ),
    ];
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    expect(
      await screen.findByTestId("coach-ai-doctor-history-limited-context-indicator"),
    ).toBeTruthy();
  });

  it("preserves View all sessions link", async () => {
    currentRows = [];
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    const link = await screen.findByTestId("coach-ai-doctor-history-view-all-link");
    expect(link.getAttribute("href")).toBe("/doctor/sessions");
  });
});

describe("Static safety scan — embedded panels indicator slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const files = [
    "src/components/PlantAiDoctorSessionsPanel.tsx",
    "src/components/TentAiDoctorSessionsPanel.tsx",
    "src/components/CoachAiDoctorHistoryPanel.tsx",
    "src/lib/aiDoctorSessionDetailViewModel.ts",
  ];
  const sources = files.map((p) => readFileSync(resolve(ROOT, p), "utf8"));
  const ALL = sources.join("\n");

  it("no writes", () => {
    for (const src of sources) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
  });
  it("no service_role", () => {
    expect(ALL).not.toMatch(/service_role/i);
  });
  it("no action_queue / alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
  });
  it("no automation / device-control markers", () => {
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
  it("all three panels import the shared helpers", () => {
    for (const src of sources.slice(0, 3)) {
      expect(src).toMatch(/buildSessionRowCautionIndicator/);
      expect(src).toMatch(/isSessionLimitedContext/);
    }
  });
});
