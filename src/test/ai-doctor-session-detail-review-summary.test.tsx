/**
 * Tests for the AI Doctor session detail Review Summary section.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import { buildReviewSummaryViewModel, riskTone, isHighRiskLevel, pctFromUnit } from "@/lib/aiDoctorSessionDetailViewModel";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";

function makeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    summary: "Mild heat stress on canopy.",
    likelyIssue: "Heat stress",
    confidence: 0.7,
    evidence: ["Tip curl visible", "Leaves cupping"],
    missingInformation: ["No leaf-surface temp"],
    possibleCauses: ["Light too close"],
    immediateAction: "Raise light 10cm.",
    whatNotToDo: ["Do not defoliate aggressively"],
    followUp24h: { summary: "Recheck temps.", checklist: ["Check leaf temp"] },
    recoveryPlan3d: { summary: "Stabilize VPD.", checklist: [] },
    riskLevel: "high",
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
    ...overrides,
  };
}

function makeRow(diagnosis: Diagnosis | null): AiDoctorSessionRow {
  return {
    id: "sess-rev",
    created_at: "2026-05-28T10:00:00Z",
    plant_id: "p1",
    tent_id: "t1",
    grow_id: "g1",
    question: "Why are leaves curling?",
    diagnosis,
    raw_confidence: 0.8,
    displayed_confidence: 0.7,
    context_confidence_ceiling: "medium",
    suggested_actions: diagnosis?.suggestedActions ?? [],
  };
}

let currentRow: AiDoctorSessionRow | null = makeRow(makeDiagnosis());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
    }),
  },
}));

function renderRoute(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions/sess-rev"]}>
        <Routes>
          <Route path="/doctor/sessions/:sessionId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("buildReviewSummaryViewModel — pure helpers", () => {
  it("riskTone maps known levels", () => {
    expect(riskTone("low")).toBe("info");
    expect(riskTone("medium")).toBe("neutral");
    expect(riskTone("high")).toBe("warn");
    expect(riskTone("critical")).toBe("danger");
    expect(riskTone(null)).toBe("neutral");
    expect(riskTone("weird")).toBe("neutral");
  });
  it("isHighRiskLevel detects high/critical only", () => {
    expect(isHighRiskLevel("high")).toBe(true);
    expect(isHighRiskLevel("critical")).toBe(true);
    expect(isHighRiskLevel("medium")).toBe(false);
    expect(isHighRiskLevel(null)).toBe(false);
  });
  it("pctFromUnit clamps and rounds", () => {
    expect(pctFromUnit(0.7)).toBe(70);
    expect(pctFromUnit(1.5)).toBe(100);
    expect(pctFromUnit(-0.2)).toBe(0);
    expect(pctFromUnit(null)).toBe(null);
    expect(pctFromUnit(Number.NaN)).toBe(null);
  });
  it("builds full view model from diagnosis", () => {
    const vm = buildReviewSummaryViewModel({
      diagnosis: makeDiagnosis(),
      displayedConfidence: 0.7,
      rawConfidence: 0.8,
      suggestedActions: makeDiagnosis().suggestedActions,
    });
    expect(vm.risk.level).toBe("high");
    expect(vm.isHighRisk).toBe(true);
    expect(vm.confidencePct).toBe(70);
    expect(vm.evidence.length).toBe(2);
    expect(vm.missingInformation.length).toBe(1);
    expect(vm.suggestedActions.length).toBe(1);
    expect(vm.followUp24h?.summary).toMatch(/recheck/i);
    expect(vm.recoveryPlan3d?.summary).toMatch(/stabilize/i);
  });
  it("handles null diagnosis with calm fallbacks", () => {
    const vm = buildReviewSummaryViewModel({ diagnosis: null });
    expect(vm.risk.level).toBe("unknown");
    expect(vm.isHighRisk).toBe(false);
    expect(vm.evidence).toEqual([]);
    expect(vm.suggestedActions).toEqual([]);
    expect(vm.followUp24h).toBe(null);
    expect(vm.likelyIssue).toBe(null);
  });
});

describe("AiDoctorSessionDetail — Review Summary rendering", () => {
  it("renders Review Summary section with risk and confidence", async () => {
    currentRow = makeRow(makeDiagnosis());
    renderRoute(<AiDoctorSessionDetail />);
    expect(await screen.findByTestId("ai-doctor-session-detail-review-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-review-risk").textContent).toMatch(/high/i);
    expect(screen.getByTestId("ai-doctor-session-detail-review-confidence").textContent).toMatch(/70/);
  });

  it("renders evidence and missing-information lists", async () => {
    currentRow = makeRow(makeDiagnosis());
    renderRoute(<AiDoctorSessionDetail />);
    const ev = await screen.findByTestId("ai-doctor-session-detail-review-evidence");
    expect(ev.querySelectorAll("li").length).toBe(2);
    const mi = screen.getByTestId("ai-doctor-session-detail-review-missing-info");
    expect(mi.querySelectorAll("li").length).toBe(1);
  });

  it("renders suggested actions in review section", async () => {
    currentRow = makeRow(makeDiagnosis());
    renderRoute(<AiDoctorSessionDetail />);
    const list = await screen.findByTestId("ai-doctor-session-detail-review-actions");
    expect(list.textContent).toMatch(/raise light/i);
    expect(screen.getAllByTestId("ai-doctor-session-detail-review-action").length).toBe(1);
  });

  it("renders calm fallbacks for missing optional fields", async () => {
    currentRow = makeRow(
      makeDiagnosis({
        evidence: [],
        missingInformation: [],
        whatNotToDo: [],
        suggestedActions: [],
        followUp24h: { summary: "", checklist: [] },
        recoveryPlan3d: { summary: "", checklist: [] },
        likelyIssue: null,
        summary: "",
      }),
    );
    // suggested_actions on the row must match for the actions empty fallback
    currentRow.suggested_actions = [];
    renderRoute(<AiDoctorSessionDetail />);
    expect(await screen.findByTestId("ai-doctor-session-detail-review-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-review-evidence-empty")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-review-missing-info-empty")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-review-what-not-to-do-empty")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-review-actions-empty")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-review-followup-empty")).toBeTruthy();
  });

  it("renders follow-up 24h and 3d when present", async () => {
    currentRow = makeRow(
      makeDiagnosis({
        followUp24h: { summary: "Recheck temps.", checklist: ["Check leaf temp"] },
        recoveryPlan3d: { summary: "Stabilize VPD.", checklist: ["Reduce light"] },
      }),
    );
    renderRoute(<AiDoctorSessionDetail />);
    expect(await screen.findByTestId("ai-doctor-session-detail-review-followup-24h")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-review-followup-3d")).toBeTruthy();
  });
});

describe("AiDoctorSessionDetail — safety scan", () => {
  const ROOT = resolve(__dirname, "../..");
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const PAGE = read("src/pages/AiDoctorSessionDetail.tsx");
  const VM = read("src/lib/aiDoctorSessionDetailViewModel.ts");

  it("no DB writes and no AI invocation", () => {
    for (const src of [PAGE, VM]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/ai-coach/);
    }
  });
  it("no action_queue / alerts writes / service_role / automation strings", () => {
    const ALL = [PAGE, VM].join("\n").toLowerCase();
    expect(ALL).not.toContain("service_role");
    expect(ALL).not.toContain("action_queue");
    expect(ALL).not.toContain("alert_events");
    const banned = ["mqtt", "auto-execute", "actuate", "device.command", "relay.on", "relay.off", "home-assistant", "home_assistant", "smart plug"];
    for (const tok of banned) expect(ALL).not.toContain(tok);
  });
});
