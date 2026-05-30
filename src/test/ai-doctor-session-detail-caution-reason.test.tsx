/**
 * AI Doctor session detail — caution "Why review?" explainer parity.
 *
 * Read-only UI/view-model parity. No writes, no AI, no automation.
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
  buildReviewSummaryViewModel,
  buildCautionReasonTokens,
  formatSessionRowCautionReasonText,
} from "@/lib/aiDoctorSessionDetailViewModel";

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
          <Route path="/doctor/sessions/:id" element={<AiDoctorSessionDetail />} />
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

function expectedReasonFor(row: AiDoctorSessionRow): string | null {
  const vm = buildReviewSummaryViewModel({
    diagnosis: row.diagnosis,
    rawConfidence: row.raw_confidence,
    displayedConfidence: row.displayed_confidence,
    suggestedActions: row.suggested_actions,
  });
  return formatSessionRowCautionReasonText(buildCautionReasonTokens(vm));
}

describe("AiDoctorSessionDetail — caution reason explainer", () => {
  it("renders the caution explainer for low confidence", async () => {
    const row = makeRow({}, { displayed_confidence: 0.3, raw_confidence: 0.3 });
    renderRoute(row);
    const el = await screen.findByTestId("ai-doctor-session-detail-caution-reason");
    expect(el.textContent).toBe("Review because: low confidence.");
    expect(el.textContent).toBe(expectedReasonFor(row));
  });

  it("renders the caution explainer for elevated risk", async () => {
    const row = makeRow({ riskLevel: "high" });
    renderRoute(row);
    const el = await screen.findByTestId("ai-doctor-session-detail-caution-reason");
    expect(el.textContent).toBe("Review because: elevated risk.");
  });

  it("renders combined reasons deterministically", async () => {
    const row = makeRow(
      { riskLevel: "high", missingInformation: ["sensor history"] },
      { displayed_confidence: 0.2, raw_confidence: 0.2 },
    );
    renderRoute(row);
    const el = await screen.findByTestId("ai-doctor-session-detail-caution-reason");
    expect(el.textContent).toBe(
      "Review because: low confidence, elevated risk, missing info.",
    );
    expect(el.textContent).toBe(expectedReasonFor(row));
  });

  it("renders explainer for missing info alone", async () => {
    const row = makeRow({ missingInformation: ["leaf surface temp"] });
    renderRoute(row);
    const el = await screen.findByTestId("ai-doctor-session-detail-caution-reason");
    expect(el.textContent).toBe("Review because: missing info.");
  });

  it("does not render an empty explainer when no caution reasons exist", async () => {
    const row = makeRow();
    renderRoute(row);
    // Wait for the page to render first
    await screen.findByText(/AI Doctor session/i).catch(() => null);
    expect(
      screen.queryByTestId("ai-doctor-session-detail-caution-note"),
    ).toBeNull();
    expect(
      screen.queryByTestId("ai-doctor-session-detail-caution-reason"),
    ).toBeNull();
  });

  it("sets title and aria-label to the explainer text when caution applies", async () => {
    const row = makeRow({ riskLevel: "high" });
    renderRoute(row);
    const note = await screen.findByTestId("ai-doctor-session-detail-caution-note");
    expect(note.getAttribute("title")).toBe("Review because: elevated risk.");
    expect(note.getAttribute("aria-label")).toBe("Review because: elevated risk.");
  });
});

describe("Static safety scan — detail-page caution reason slice", () => {
  const ROOT = resolve(__dirname, "../..");
  const file = readFileSync(
    resolve(ROOT, "src/pages/AiDoctorSessionDetail.tsx"),
    "utf8",
  );

  it("no writes", () => {
    expect(file).not.toMatch(/\.insert\(/);
    expect(file).not.toMatch(/\.update\(/);
    expect(file).not.toMatch(/\.delete\(/);
    expect(file).not.toMatch(/\.upsert\(/);
  });
  it("no functions.invoke / service_role / action_queue / alerts writes", () => {
    expect(file).not.toMatch(/functions\.invoke/);
    expect(file).not.toMatch(/service_role/i);
    expect(file).not.toMatch(/from\(["']action_queue["']\)/);
    expect(file).not.toMatch(/from\(["']alerts["']\)/);
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
      expect(file.toLowerCase()).not.toContain(tok);
    }
  });
  it("does not duplicate caution reason mapping in JSX", () => {
    expect(file).not.toContain("Review because:");
    expect(file).not.toMatch(/LOW_CONFIDENCE_PCT_THRESHOLD/);
    expect(file).not.toMatch(/isHighRiskLevel/);
  });
});
