/**
 * AI Doctor Phase 1 — Operator page route + plant deep link tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import OperatorAiDoctorPhase1, {
  OPERATOR_AI_DOCTOR_PHASE1_ROUTE,
} from "@/pages/OperatorAiDoctorPhase1";
import type { AiDoctorPhase1PlantOption } from "@/components/AiDoctorPhase1PlantPicker";
import type {
  AiDoctorContextPayload,
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

const PLANTS: AiDoctorPhase1PlantOption[] = [
  { id: "plant-a", name: "Plant A", strain: "Strain A", stage: "veg", tent_name: "Tent 1" },
  { id: "plant-b", name: "Plant B", strain: "Strain B", stage: "flower", tent_name: "Tent 2" },
];

function baseContext(plantId: string): AiDoctorContextPayload {
  return {
    grow_id: "g1",
    tent_id: "t1",
    plant_id: plantId,
    plant_name: plantId,
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
  };
}

function baseResult(
  overrides: Partial<AiDoctorDiagnosisResult> = {},
): AiDoctorDiagnosisResult {
  return {
    summary: "Cautious summary.",
    likely_issue: "Unclear.",
    confidence: "low",
    evidence: [],
    missing_information: [],
    possible_causes: [],
    immediate_action: "Observe.",
    what_not_to_do: [],
    follow_up_24h: "Re-check.",
    recovery_plan_3_day: "Hold stable.",
    risk_level: "low",
    action_queue_suggestion: null,
    ...overrides,
  };
}

function LocationProbe() {
  const loc = useLocation();
  return (
    <div
      data-testid="probe-location"
      data-pathname={loc.pathname}
      data-search={loc.search}
    />
  );
}

function renderAt(
  initialPath: string,
  pageProps: React.ComponentProps<typeof OperatorAiDoctorPhase1>,
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path={OPERATOR_AI_DOCTOR_PHASE1_ROUTE}
          element={
            <>
              <OperatorAiDoctorPhase1 {...pageProps} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OperatorAiDoctorPhase1 — page + routing", () => {
  it("renders header + read-only safety copy", () => {
    renderAt(OPERATOR_AI_DOCTOR_PHASE1_ROUTE, {});
    expect(screen.getByRole("heading", { name: /AI Doctor Phase 1/i })).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-page-safety-1")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-page-safety-2")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-page-safety-3")).toBeTruthy();
  });

  it("shows the no-plants state when plants are empty", () => {
    renderAt(OPERATOR_AI_DOCTOR_PHASE1_ROUTE, {});
    expect(screen.getByTestId("ai-doctor-phase1-no-plants-state")).toBeTruthy();
  });

  it("shows the choose-plant state when plants exist but none selected", () => {
    renderAt(OPERATOR_AI_DOCTOR_PHASE1_ROUTE, { plants: PLANTS });
    expect(screen.getByTestId("ai-doctor-phase1-choose-plant-state")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-plant-picker")).toBeTruthy();
  });

  it("preselects plant from ?plantId= and shows internal deep link", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
    });
    expect(
      screen
        .getByTestId("ai-doctor-phase1-plant-option-plant-a")
        .getAttribute("data-selected"),
    ).toBe("true");
    expect(screen.getByTestId("ai-doctor-phase1-deep-link-href").textContent).toContain(
      "plantId=plant-a",
    );
  });

  it("updates the URL query when a plant is selected", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
    });
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-plant-option-plant-b"));
    const probe = screen.getByTestId("probe-location");
    expect(probe.getAttribute("data-search")).toContain("plantId=plant-b");
  });

  it("shows unknown-plant state when ?plantId= does not match", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=does-not-exist`, {
      plants: PLANTS,
    });
    expect(screen.getByTestId("ai-doctor-phase1-unknown-plant-state")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-phase1-result-panel")).toBeNull();
  });

  it("shows no-result state when selected plant has no payload", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: () => null,
    });
    expect(screen.getByTestId("ai-doctor-phase1-no-result-state")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-result-summary")).toBeNull();
  });

  it("renders the result panel + missing-context guidance when payload exists", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: (id) => ({
        context: baseContext(id),
        result: baseResult({ missing_information: ["recent photo (14d)"] }),
      }),
    });
    expect(screen.getByTestId("ai-doctor-phase1-result-panel")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-missing-context-guidance")).toBeTruthy();
  });

  it("deep link reflects current plant selection", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
    });
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-plant-option-plant-b"));
    expect(screen.getByTestId("ai-doctor-phase1-deep-link-href").textContent).toContain(
      "plantId=plant-b",
    );
  });
});

// ---------------------------------------------------------------------------
// Navigation + App integration
// ---------------------------------------------------------------------------

describe("Operator Mode navigation — AI Doctor Results", () => {
  const SIDEBAR_SRC = readFileSync(
    resolve(__dirname, "../components/AppSidebar.tsx"),
    "utf8",
  );
  const APP_SRC = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");

  it("sidebar exposes 'AI Doctor Results' linking to the new route", () => {
    expect(SIDEBAR_SRC).toMatch(/AI Doctor Results/);
    expect(SIDEBAR_SRC).toMatch(/\/operator\/ai-doctor-phase1/);
  });

  it("App registers the route inside the protected AppShell block", () => {
    expect(APP_SRC).toMatch(/\/operator\/ai-doctor-phase1/);
    expect(APP_SRC).toMatch(/OperatorAiDoctorPhase1/);
  });

  it("existing AI Doctor navigation is preserved", () => {
    expect(SIDEBAR_SRC).toMatch(/AI Grow Doctor/);
    expect(SIDEBAR_SRC).toMatch(/to:\s*"\/doctor"/);
  });
});

// ---------------------------------------------------------------------------
// Static safety guards — page surface
// ---------------------------------------------------------------------------

describe("static safety — OperatorAiDoctorPhase1 page", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../pages/OperatorAiDoctorPhase1.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no Supabase/fetch/model/write/device-control surface", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/createClient\s*\(/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway|lovable\.dev\/ai/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
    expect(SRC).not.toMatch(/service_role/i);
  });
});

// ---------------------------------------------------------------------------
// Wiring polish — deep link query enrichment + adapter + CTAs
// ---------------------------------------------------------------------------

import { mapPlantsToPickerOptions } from "@/pages/OperatorAiDoctorPhase1";

describe("OperatorAiDoctorPhase1 — deep link enrichment", () => {
  const ENRICHED: AiDoctorPhase1PlantOption[] = [
    { id: "plant-a", name: "Plant A", grow_id: "grow-1", tent_id: "tent-1" },
    { id: "plant-b", name: "Plant B", grow_id: "grow-2", tent_id: "tent-2" },
  ];

  it("internal link includes growId and tentId when selected plant carries them", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: ENRICHED,
    });
    const href =
      screen.getByTestId("ai-doctor-phase1-internal-link-href").textContent ?? "";
    expect(href).toContain("plantId=plant-a");
    expect(href).toContain("growId=grow-1");
    expect(href).toContain("tentId=tent-1");
  });

  it("selecting a plant writes plantId + growId + tentId to the URL", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: ENRICHED,
    });
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-plant-option-plant-b"));
    const search = screen.getByTestId("probe-location").getAttribute("data-search") ?? "";
    expect(search).toContain("plantId=plant-b");
    expect(search).toContain("growId=grow-2");
    expect(search).toContain("tentId=tent-2");
  });
});

describe("OperatorAiDoctorPhase1 — empty-state CTAs", () => {
  it("no-result state renders Add Quick Log / Add Photo / Check Environment CTAs", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: () => null,
    });
    expect(screen.getByTestId("ai-doctor-phase1-cta-add-quick-log")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-cta-add-photo")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-cta-check-environment")).toBeTruthy();
  });

  it("no-result CTAs do not show any fake diagnosis content", () => {
    const { container } = renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: () => null,
    });
    // No result panel rendered.
    expect(screen.queryByTestId("ai-doctor-phase1-result-panel")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-result-summary")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(/Likely issue:/);
  });

  it("missing-context block surfaces evidence-first CTAs that include plantId", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: (id) => ({
        context: baseContext(id),
        result: baseResult({
          missing_information: ["recent photo (14d)", "recent trustworthy sensor reading (7d)"],
        }),
      }),
    });
    expect(screen.getByTestId("ai-doctor-phase1-missing-context-guidance")).toBeTruthy();
    const photoCta = screen.getByTestId("ai-doctor-phase1-cta-add-photo");
    expect(photoCta.getAttribute("href")).toContain("plantId=plant-a");
    expect(screen.getByTestId("ai-doctor-phase1-cta-check-environment")).toBeTruthy();
  });

  it("no fake content leaks across plant selections", () => {
    const getResultForPlant = (id: string) =>
      id === "plant-a"
        ? { context: baseContext(id), result: baseResult({ summary: "Plant A summary" }) }
        : null;
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-b`, {
      plants: PLANTS,
      getResultForPlant,
    });
    expect(screen.getByTestId("ai-doctor-phase1-no-result-state")).toBeTruthy();
    expect(screen.queryByText("Plant A summary")).toBeNull();
  });
});

describe("mapPlantsToPickerOptions — adapter", () => {
  it("maps real plant rows to picker options, resolving tent name by tent_id", () => {
    const options = mapPlantsToPickerOptions(
      [
        { id: "p1", name: "P1", strain: "S1", stage: "veg", tent_id: "t1", grow_id: "g1" },
        { id: "p2", name: null, strain: null, stage: null, tent_id: null, grow_id: null },
      ],
      [{ id: "t1", name: "Main Tent" }],
    );
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      id: "p1",
      name: "P1",
      strain: "S1",
      stage: "veg",
      tent_name: "Main Tent",
      tent_id: "t1",
      grow_id: "g1",
    });
    expect(options[1].tent_name).toBeNull();
    expect(options[1].grow_id).toBeNull();
  });

  it("skips plants without an id", () => {
    const options = mapPlantsToPickerOptions(
      [
        { id: "", name: "broken" } as unknown as { id: string },
        { id: "p1", name: "ok" },
      ],
      [],
    );
    expect(options.map((o) => o.id)).toEqual(["p1"]);
  });
});
