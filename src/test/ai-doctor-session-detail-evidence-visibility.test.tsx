/**
 * AI Doctor session detail — evidence visibility, missing-info, caution note tests.
 *
 * Read-only UI. No writes. No automation. No device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import {
  buildCautionNote,
  buildReviewSummaryViewModel,
  CAUTION_NOTE_TEXT,
  LOW_CONFIDENCE_PCT_THRESHOLD,
} from "@/lib/aiDoctorSessionDetailViewModel";

let currentFixture: AiDoctorSessionRow | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_col: string, _value: string) => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: currentFixture, error: null }),
        }),
      }),
    }),
  },
}));

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

function makeRow(overrides: Partial<AiDoctorSessionRow> = {}): AiDoctorSessionRow {
  const diagnosis: Diagnosis = {
    summary: "Mild heat stress.",
    likelyIssue: "Heat stress",
    confidence: 0.9,
    evidence: ["Tip curl visible", "Tent ambient warm"],
    missingInformation: ["No leaf-surface temp"],
    possibleCauses: [],
    immediateAction: "Raise light.",
    whatNotToDo: [],
    followUp24h: null,
    recoveryPlan3d: null,
    riskLevel: "medium",
    suggestedActions: [],
  };
  return {
    id: "sess-x",
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
    ...overrides,
  };
}

describe("buildCautionNote (pure helper)", () => {
  it("does not show caution for high confidence, low risk, no missing info", () => {
    const vm = buildReviewSummaryViewModel({
      diagnosis: {
        riskLevel: "low",
        evidence: ["x"],
        missingInformation: [],
      } as Diagnosis,
      displayedConfidence: 0.9,
    });
    const note = buildCautionNote(vm);
    expect(note.show).toBe(false);
    expect(note.text).toBe(CAUTION_NOTE_TEXT);
  });

  it("shows caution for elevated risk", () => {
    const vm = buildReviewSummaryViewModel({
      diagnosis: { riskLevel: "high" } as Diagnosis,
      displayedConfidence: 0.9,
    });
    const note = buildCautionNote(vm);
    expect(note.show).toBe(true);
    expect(note.reasons.join(" ")).toMatch(/risk/i);
  });

  it("shows caution for low confidence", () => {
    const vm = buildReviewSummaryViewModel({
      diagnosis: { riskLevel: "low" } as Diagnosis,
      displayedConfidence: 0.4,
    });
    const note = buildCautionNote(vm);
    expect(note.show).toBe(true);
    expect(note.reasons.join(" ")).toMatch(/confidence/i);
  });

  it("threshold is grower-friendly (>=50%, <=70%)", () => {
    expect(LOW_CONFIDENCE_PCT_THRESHOLD).toBeGreaterThanOrEqual(50);
    expect(LOW_CONFIDENCE_PCT_THRESHOLD).toBeLessThanOrEqual(70);
  });
});

describe("AiDoctorSessionDetail — evidence/missing-info/caution rendering", () => {
  beforeEach(() => {
    currentFixture = null;
  });

  it("renders Evidence section items when evidence exists", async () => {
    currentFixture = makeRow();
    renderRoute(
      "/doctor/sessions/sess-x",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    const ev = await screen.findByTestId("ai-doctor-session-detail-evidence");
    expect(ev.textContent).toMatch(/Tip curl visible/);
  });

  it("renders Missing information section when present", async () => {
    currentFixture = makeRow();
    renderRoute(
      "/doctor/sessions/sess-x",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    const m = await screen.findByTestId("ai-doctor-session-detail-missing-info");
    expect(m.textContent).toMatch(/No leaf-surface temp/);
  });

  it("renders calm fallback when evidence is unavailable", async () => {
    const row = makeRow();
    row.diagnosis = { ...row.diagnosis!, evidence: [], missingInformation: [] };
    currentFixture = row;
    renderRoute(
      "/doctor/sessions/sess-x",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    expect(
      await screen.findByTestId("ai-doctor-session-detail-evidence-empty"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-session-detail-missing-info-empty"),
    ).toBeTruthy();
  });

  it("shows caution note when confidence is low", async () => {
    const row = makeRow();
    row.displayed_confidence = 0.3;
    row.raw_confidence = 0.3;
    currentFixture = row;
    renderRoute(
      "/doctor/sessions/sess-x",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    expect(
      await screen.findByTestId("ai-doctor-session-detail-caution-note"),
    ).toBeTruthy();
  });

  it("shows caution note when risk is elevated", async () => {
    const row = makeRow();
    row.diagnosis = { ...row.diagnosis!, riskLevel: "high" };
    currentFixture = row;
    renderRoute(
      "/doctor/sessions/sess-x",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    expect(
      await screen.findByTestId("ai-doctor-session-detail-caution-note"),
    ).toBeTruthy();
  });

  it("does not show caution for high confidence + low risk + no missing info", async () => {
    const row = makeRow();
    row.diagnosis = {
      ...row.diagnosis!,
      riskLevel: "low",
      missingInformation: [],
    };
    row.displayed_confidence = 0.95;
    currentFixture = row;
    renderRoute(
      "/doctor/sessions/sess-x",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    await screen.findByTestId("ai-doctor-session-detail-evidence");
    expect(screen.queryByTestId("ai-doctor-session-detail-caution-note")).toBeNull();
  });

  it("preserves header controls (copy summary, copy link, open new tab, view plant, view tent)", async () => {
    currentFixture = makeRow();
    renderRoute(
      "/doctor/sessions/sess-x",
      <AiDoctorSessionDetail />,
      "/doctor/sessions/:sessionId",
    );
    await screen.findByTestId("ai-doctor-session-detail-evidence");
    expect(screen.getByTestId("ai-doctor-session-detail-copy-review-button")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-copy-link-button")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-open-new-tab-link")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-plant-link")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-session-detail-tent-link")).toBeTruthy();
  });
});

describe("Static safety scan — evidence visibility slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const PAGE = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"),
    "utf8",
  );
  const VM = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionDetailViewModel.ts"),
    "utf8",
  );
  const ALL = [PAGE, VM].join("\n");

  it("no writes", () => {
    for (const src of [PAGE, VM]) {
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
  it("no action_queue or alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
  });
  it("no automation/device-control markers", () => {
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
