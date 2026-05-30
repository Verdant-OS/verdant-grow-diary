/**
 * "Why review?" explainer for AI Doctor caution badges.
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
import {
  buildReviewSummaryViewModel,
  buildCautionReasonTokens,
  buildSessionRowCautionIndicator,
  formatSessionRowCautionReasonText,
} from "@/lib/aiDoctorSessionDetailViewModel";

let currentRows: AiDoctorSessionRow[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: currentRows, error: null }),
        }),
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: currentRows, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";
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

function vmFor(row: AiDoctorSessionRow) {
  return buildReviewSummaryViewModel({
    diagnosis: row.diagnosis,
    rawConfidence: row.raw_confidence,
    displayedConfidence: row.displayed_confidence,
    suggestedActions: row.suggested_actions,
  });
}

describe("formatSessionRowCautionReasonText — pure formatter", () => {
  it("returns null when no caution reasons exist", () => {
    expect(formatSessionRowCautionReasonText([])).toBeNull();
    const vm = vmFor(makeRow("a"));
    expect(buildCautionReasonTokens(vm)).toEqual([]);
    expect(formatSessionRowCautionReasonText(buildCautionReasonTokens(vm))).toBeNull();
  });

  it("returns concise text for low confidence only", () => {
    const vm = vmFor(
      makeRow("a", {}, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    );
    const tokens = buildCautionReasonTokens(vm);
    expect(tokens).toEqual(["low confidence"]);
    expect(formatSessionRowCautionReasonText(tokens)).toBe(
      "Review because: low confidence.",
    );
  });

  it("returns concise text for elevated risk only", () => {
    const vm = vmFor(makeRow("a", { riskLevel: "high" }));
    const tokens = buildCautionReasonTokens(vm);
    expect(tokens).toEqual(["elevated risk"]);
    expect(formatSessionRowCautionReasonText(tokens)).toBe(
      "Review because: elevated risk.",
    );
  });

  it("combines multiple reasons in deterministic order", () => {
    const vm = vmFor(
      makeRow(
        "a",
        { riskLevel: "high", missingInformation: ["sensor history"] },
        { displayed_confidence: 0.2, raw_confidence: 0.2 },
      ),
    );
    const tokens = buildCautionReasonTokens(vm);
    expect(tokens).toEqual(["low confidence", "elevated risk", "missing info"]);
    expect(formatSessionRowCautionReasonText(tokens)).toBe(
      "Review because: low confidence, elevated risk, missing info.",
    );
  });

  it("buildSessionRowCautionIndicator exposes description when caution applies", () => {
    const indicator = buildSessionRowCautionIndicator(
      makeRow("a", { riskLevel: "high" }),
    );
    expect(indicator.show).toBe(true);
    expect(indicator.description).toBe("Review because: elevated risk.");
  });

  it("buildSessionRowCautionIndicator has null description when no caution", () => {
    const indicator = buildSessionRowCautionIndicator(makeRow("a"));
    expect(indicator.show).toBe(false);
    expect(indicator.description).toBeNull();
  });
});

describe("AiDoctorSessionsIndex — caution explainer", () => {
  it("renders the caution reason next to the badge", async () => {
    currentRows = [
      makeRow("a", { riskLevel: "high" }, { displayed_confidence: 0.3, raw_confidence: 0.3 }),
    ];
    renderWithProviders(<AiDoctorSessionsIndex />);
    const reason = await screen.findByTestId(
      "ai-doctor-sessions-index-caution-reason",
    );
    expect(reason.textContent).toBe(
      "Review because: low confidence, elevated risk.",
    );
  });

  it("limited-context badge still renders independently", async () => {
    currentRows = [
      makeRow(
        "a",
        { evidence: [] },
        { plant_id: null, tent_id: null, grow_id: null },
      ),
    ];
    renderWithProviders(<AiDoctorSessionsIndex />);
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-limited-context-indicator"),
    ).toBeTruthy();
  });
});

describe("PlantAiDoctorSessionsPanel — caution explainer", () => {
  it("renders the caution reason", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    const reason = await screen.findByTestId("plant-ai-doctor-session-caution-reason");
    expect(reason.textContent).toBe("Review because: elevated risk.");
  });

  it("preserves View session link", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<PlantAiDoctorSessionsPanel plantId="p1" />);
    const link = await screen.findByTestId("ai-doctor-session-view-link");
    expect(link.getAttribute("href")).toBe("/doctor/sessions/a");
  });
});

describe("TentAiDoctorSessionsPanel — caution explainer", () => {
  it("renders the caution reason", async () => {
    currentRows = [
      makeRow("a", {}, { displayed_confidence: 0.2, raw_confidence: 0.2 }),
    ];
    renderWithProviders(<TentAiDoctorSessionsPanel tentId="t1" />);
    const reason = await screen.findByTestId("tent-ai-doctor-session-caution-reason");
    expect(reason.textContent).toBe("Review because: low confidence.");
  });

  it("preserves View session link", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<TentAiDoctorSessionsPanel tentId="t1" />);
    const link = await screen.findByTestId("tent-ai-doctor-session-view-link");
    expect(link.getAttribute("href")).toBe("/doctor/sessions/a");
  });
});

describe("CoachAiDoctorHistoryPanel — caution explainer", () => {
  it("renders the caution reason", async () => {
    currentRows = [
      makeRow(
        "a",
        { riskLevel: "high", missingInformation: ["sensors"] },
        { displayed_confidence: 0.2, raw_confidence: 0.2 },
      ),
    ];
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    const reason = await screen.findByTestId("coach-ai-doctor-history-caution-reason");
    expect(reason.textContent).toBe(
      "Review because: low confidence, elevated risk, missing info.",
    );
  });

  it("preserves View session link", async () => {
    currentRows = [makeRow("a", { riskLevel: "high" })];
    renderWithProviders(<CoachAiDoctorHistoryPanel growId="g1" />);
    const link = await screen.findByTestId("coach-ai-doctor-history-view-link");
    expect(link.getAttribute("href")).toBe("/doctor/sessions/a");
  });
});

describe("Static safety scan — caution explainer slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const files = [
    "src/pages/AiDoctorSessionsIndex.tsx",
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
  it("no duplicated caution reason mapping in UI files", () => {
    const uiSources = sources.slice(0, 4);
    for (const src of uiSources) {
      // The literal "Review because:" prefix must only live in the helper file.
      expect(src).not.toContain("Review because:");
      // UI must not redefine the low-confidence threshold or risk-level checks.
      expect(src).not.toMatch(/LOW_CONFIDENCE_PCT_THRESHOLD/);
      expect(src).not.toMatch(/isHighRiskLevel/);
    }
  });
});
