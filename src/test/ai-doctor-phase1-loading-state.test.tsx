/**
 * AI Doctor Phase 1 — Loading state tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AiDoctorPhase1LoadingState } from "@/components/AiDoctorPhase1LoadingState";
import OperatorAiDoctorPhase1, {
  OPERATOR_AI_DOCTOR_PHASE1_ROUTE,
} from "@/pages/OperatorAiDoctorPhase1";
import type { AiDoctorPhase1PlantOption } from "@/components/AiDoctorPhase1PlantPicker";

const PLANTS: AiDoctorPhase1PlantOption[] = [
  {
    id: "plant-a",
    name: "Plant A",
    strain: "Strain A",
    stage: "veg",
    tent_name: "Tent 1",
    tent_id: "tent-1",
    grow_id: "grow-1",
  },
];

function renderPage(path: string, props: React.ComponentProps<typeof OperatorAiDoctorPhase1>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={OPERATOR_AI_DOCTOR_PHASE1_ROUTE}
          element={<OperatorAiDoctorPhase1 {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AiDoctorPhase1LoadingState — pure presenter", () => {
  it("renders title, body, and read-only safety copy", () => {
    render(<AiDoctorPhase1LoadingState />);
    expect(screen.getByTestId("ai-doctor-phase1-loading-state")).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-phase1-loading-title").textContent,
    ).toContain("Preparing AI Doctor context");
    expect(
      screen.getByTestId("ai-doctor-phase1-loading-body").textContent,
    ).toContain("Reviewing plant logs");
    expect(
      screen.getByTestId("ai-doctor-phase1-loading-safety").textContent,
    ).toMatch(/Read-only review\. Nothing is being saved/i);
  });

  it("renders all skeleton block placeholders", () => {
    render(<AiDoctorPhase1LoadingState />);
    for (const id of [
      "ai-doctor-phase1-loading-skeleton-plant-header",
      "ai-doctor-phase1-loading-skeleton-confidence-risk",
      "ai-doctor-phase1-loading-skeleton-evidence",
      "ai-doctor-phase1-loading-skeleton-sensor-summary",
      "ai-doctor-phase1-loading-skeleton-action-suggestion",
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  it("does not render fake summary/likely-issue/evidence/action details", () => {
    const { container } = render(<AiDoctorPhase1LoadingState />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Likely issue:/i);
    expect(text).not.toMatch(/action_queue_suggestion/i);
    expect(text).not.toMatch(/Approve|Execute|Run AI/i);
    expect(screen.queryByTestId("ai-doctor-phase1-result-panel")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-result-summary")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-result-likely-issue")).toBeNull();
  });

  it("exposes aria-busy for assistive tech", () => {
    render(<AiDoctorPhase1LoadingState />);
    const root = screen.getByTestId("ai-doctor-phase1-loading-state");
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(root.getAttribute("role")).toBe("status");
  });
});

describe("OperatorAiDoctorPhase1 — loading state integration", () => {
  it("renders the loading skeleton instead of no-result when isDerivingResult is true", () => {
    renderPage(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: () => null,
      isDerivingResult: true,
    });
    expect(screen.getByTestId("ai-doctor-phase1-loading-state")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-phase1-no-result-state")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-phase1-result-panel")).toBeNull();
  });

  it("hides the loading skeleton when a result becomes available", () => {
    renderPage(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      isDerivingResult: true,
      getResultForPlant: (id) => ({
        context: {
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: id,
          plant_name: id,
          strain: null,
          stage: "veg",
          medium: null,
          pot_size: null,
          recent_logs: [],
          recent_photos_count: 0,
          recent_watering_events: 0,
          recent_feeding_events: 0,
          sensor_summary: [],
          source_breakdown: [],
          missing_context: [],
          context_trust_level: "low",
        },
        result: {
          summary: "ok",
          likely_issue: "",
          confidence: "low",
          evidence: [],
          missing_information: [],
          possible_causes: [],
          immediate_action: "",
          what_not_to_do: [],
          follow_up_24h: "",
          recovery_plan_3_day: "",
          risk_level: "low",
          action_queue_suggestion: null,
        },
      }),
    });
    expect(screen.queryByTestId("ai-doctor-phase1-loading-state")).toBeNull();
    expect(screen.getByTestId("ai-doctor-phase1-result-panel")).toBeTruthy();
  });

  it("does not render loading state for unknown plantId", () => {
    renderPage(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=nope`, {
      plants: PLANTS,
      isDerivingResult: true,
    });
    expect(screen.queryByTestId("ai-doctor-phase1-loading-state")).toBeNull();
    expect(screen.getByTestId("ai-doctor-phase1-unknown-plant-state")).toBeTruthy();
  });
});

describe("static safety — AiDoctorPhase1LoadingState", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../components/AiDoctorPhase1LoadingState.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no Supabase/fetch/model/write/device-control surface", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
    expect(SRC).not.toMatch(/service_role|bridge[_-]?token/i);
  });
});

describe("AiDoctorPhase1LoadingState — premium shimmer", () => {
  it("skeleton bars include the shimmer animation class", () => {
    render(<AiDoctorPhase1LoadingState />);
    const bars = screen.getAllByTestId("ai-doctor-phase1-loading-skeleton-bar");
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      const cls = bar.getAttribute("class") ?? "";
      expect(cls).toMatch(/animate-shimmer/);
    }
  });

  it("does not import any external animation library", () => {
    const SRC = readFileSync(
      resolve(__dirname, "../components/AiDoctorPhase1LoadingState.tsx"),
      "utf8",
    );
    expect(SRC).not.toMatch(/framer-motion|react-spring|lottie|gsap/i);
  });

  it("loading copy remains readable without relying on animation alone", () => {
    render(<AiDoctorPhase1LoadingState />);
    expect(
      screen.getByTestId("ai-doctor-phase1-loading-title").textContent,
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-phase1-loading-body").textContent,
    ).toBeTruthy();
  });
});
