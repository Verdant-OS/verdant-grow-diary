/**
 * AI Doctor session detail — read-only caution review checklist.
 *
 * Pure helper + render parity. No writes, no AI, no automation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiDoctorSessionDetail from "@/pages/AiDoctorSessionDetail";
import type { Diagnosis } from "@/lib/aiDoctorDiagnosisRules";
import type { AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import { buildCautionReviewChecklist } from "@/lib/aiDoctorSessionDetailViewModel";

let currentFixture: AiDoctorSessionRow | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          maybeSingle: () => Promise.resolve({ data: currentFixture, error: null }),
        }),
      }),
    }),
  },
}));

function renderRoute(row: AiDoctorSessionRow | null) {
  currentFixture = row;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/doctor/sessions/sess-x"]}>
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

function makeRow(
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
    ...rowOverrides,
  };
}

beforeEach(() => {
  currentFixture = null;
});

const VERIFY = "Verify the diagnosis against the plant photos and recent logs.";
const REVIEW_RISK = "Review the risk level before taking corrective action.";
const CONFIRM_CONTEXT =
  "Confirm plant, tent, sensor, watering, and feeding context.";

describe("buildCautionReviewChecklist — pure helper", () => {
  it("returns empty for no tokens", () => {
    expect(buildCautionReviewChecklist([])).toEqual([]);
  });

  it("maps low confidence", () => {
    expect(buildCautionReviewChecklist(["low confidence"])).toEqual([VERIFY]);
  });

  it("maps unrecorded confidence to the same item as low confidence", () => {
    expect(buildCautionReviewChecklist(["unrecorded confidence"])).toEqual([VERIFY]);
  });

  it("maps elevated risk", () => {
    expect(buildCautionReviewChecklist(["elevated risk"])).toEqual([REVIEW_RISK]);
  });

  it("maps missing info", () => {
    expect(buildCautionReviewChecklist(["missing info"])).toEqual([CONFIRM_CONTEXT]);
  });

  it("combines reasons in deterministic display order", () => {
    expect(
      buildCautionReviewChecklist(["missing info", "elevated risk", "low confidence"]),
    ).toEqual([VERIFY, REVIEW_RISK, CONFIRM_CONTEXT]);
  });

  it("dedupes duplicate tokens", () => {
    expect(
      buildCautionReviewChecklist([
        "low confidence",
        "low confidence",
        "unrecorded confidence",
      ]),
    ).toEqual([VERIFY]);
  });

  it("ignores unknown tokens", () => {
    expect(buildCautionReviewChecklist(["totally unknown"])).toEqual([]);
  });
});

describe("AiDoctorSessionDetail — caution checklist rendering", () => {
  it("renders the checklist under the caution banner when caution applies", async () => {
    renderRoute(
      makeRow(
        { riskLevel: "high", missingInformation: ["sensor history"] },
        { displayed_confidence: 0.2, raw_confidence: 0.2 },
      ),
    );
    const checklist = await screen.findByTestId(
      "ai-doctor-session-detail-caution-checklist",
    );
    const items = checklist.querySelectorAll(
      '[data-testid="ai-doctor-session-detail-caution-checklist-item"]',
    );
    expect(Array.from(items).map((n) => n.textContent)).toEqual([
      VERIFY,
      REVIEW_RISK,
      CONFIRM_CONTEXT,
    ]);
  });

  it("renders only the relevant checklist item for a single reason", async () => {
    renderRoute(makeRow({ riskLevel: "high" }));
    const checklist = await screen.findByTestId(
      "ai-doctor-session-detail-caution-checklist",
    );
    const items = checklist.querySelectorAll(
      '[data-testid="ai-doctor-session-detail-caution-checklist-item"]',
    );
    expect(Array.from(items).map((n) => n.textContent)).toEqual([REVIEW_RISK]);
  });

  it("does not render the checklist when no caution applies", async () => {
    renderRoute(makeRow());
    // Allow the detail page to settle.
    await screen.findByText(/AI Doctor session/i).catch(() => null);
    expect(
      screen.queryByTestId("ai-doctor-session-detail-caution-checklist"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-session-detail-caution-note"),
    ).toBeNull();
  });
});

describe("Static safety scan — caution checklist slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const tsxFiles = [
    "src/pages/AiDoctorSessionDetail.tsx",
  ];
  const helperFile = readFileSync(
    resolve(ROOT, "src/lib/aiDoctorSessionDetailViewModel.ts"),
    "utf8",
  );
  const tsxSources = tsxFiles.map((p) =>
    readFileSync(resolve(ROOT, p), "utf8"),
  );
  const ALL = [helperFile, ...tsxSources].join("\n");

  it("no writes", () => {
    for (const src of [helperFile, ...tsxSources]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no functions.invoke / service_role / action_queue / alerts writes", () => {
    expect(ALL).not.toMatch(/functions\.invoke/);
    expect(ALL).not.toMatch(/service_role/i);
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
  it("does not duplicate the checklist mapping table in TSX", () => {
    for (const src of tsxSources) {
      expect(src).not.toContain(VERIFY);
      expect(src).not.toContain(REVIEW_RISK);
      expect(src).not.toContain(CONFIRM_CONTEXT);
      expect(src).not.toMatch(/CAUTION_CHECKLIST_MAP/);
      expect(src).not.toMatch(/LOW_CONFIDENCE_PCT_THRESHOLD/);
    }
  });
});
