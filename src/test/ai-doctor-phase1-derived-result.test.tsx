/**
 * AI Doctor Phase 1 — Derived result + UX polish tests.
 *
 * Covers:
 *  - Premium selected-plant header (name/strain/stage/tent + read-only badge).
 *  - "View plant context" + "Back to plant" navigation CTAs.
 *  - Evidence shortcuts (recent photo + open sensor summary anchor).
 *  - Unknown plantId state with "Clear selection" CTA.
 *  - Internal link "Copied!" inline confirmation copy.
 *  - Static safety guards on the page file.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import OperatorAiDoctorPhase1, {
  OPERATOR_AI_DOCTOR_PHASE1_ROUTE,
  AI_DOCTOR_PHASE1_SENSOR_ANCHOR_ID,
  buildPlantContextHref,
} from "@/pages/OperatorAiDoctorPhase1";
import type { AiDoctorPhase1PlantOption } from "@/components/AiDoctorPhase1PlantPicker";
import type {
  AiDoctorContextPayload,
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

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
  {
    id: "plant-b",
    name: "Plant B",
    strain: "Strain B",
    stage: "flower",
    tent_name: "Tent 2",
    tent_id: "tent-2",
    grow_id: "grow-2",
  },
];

function baseContext(plantId: string): AiDoctorContextPayload {
  return {
    grow_id: "grow-1",
    tent_id: "tent-1",
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

describe("buildPlantContextHref", () => {
  it("returns null when plantId is missing", () => {
    expect(buildPlantContextHref({ plantId: null })).toBeNull();
    expect(buildPlantContextHref({ plantId: undefined })).toBeNull();
  });

  it("includes growId/tentId when present", () => {
    expect(
      buildPlantContextHref({ plantId: "p1", growId: "g1", tentId: "t1" }),
    ).toBe("/plants/p1?growId=g1&tentId=t1");
  });

  it("omits growId/tentId when null", () => {
    expect(buildPlantContextHref({ plantId: "p1" })).toBe("/plants/p1");
  });

  it("supports an anchor hash", () => {
    expect(
      buildPlantContextHref({ plantId: "p1", hash: "photos" }),
    ).toBe("/plants/p1#photos");
  });
});

describe("OperatorAiDoctorPhase1 — selected-plant header", () => {
  it("renders plant name, strain, stage, tent + read-only badge + safety copy", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
    });
    const header = screen.getByTestId("ai-doctor-phase1-selected-plant-header");
    expect(header).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-phase1-selected-plant-name").textContent,
    ).toContain("Plant A");
    expect(
      screen.getByTestId("ai-doctor-phase1-selected-plant-strain").textContent,
    ).toContain("Strain A");
    expect(
      screen.getByTestId("ai-doctor-phase1-selected-plant-stage").textContent,
    ).toContain("veg");
    expect(
      screen.getByTestId("ai-doctor-phase1-selected-plant-tent").textContent,
    ).toContain("Tent 1");
    expect(
      screen.getByTestId("ai-doctor-phase1-readonly-badge").textContent,
    ).toContain("Read-only AI Doctor Phase 1");
    expect(header.textContent).toContain("No result is saved from this screen.");
  });

  it("View plant context href preserves plantId/growId/tentId", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
    });
    const href =
      screen
        .getByTestId("ai-doctor-phase1-view-plant-context")
        .getAttribute("href") ?? "";
    expect(href).toContain("/plants/plant-a");
    expect(href).toContain("growId=grow-1");
    expect(href).toContain("tentId=tent-1");
  });

  it("does not render write buttons in header", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
    });
    const header = screen.getByTestId("ai-doctor-phase1-selected-plant-header");
    const buttons = header.querySelectorAll("button");
    expect(buttons.length).toBe(0);
    expect(header.textContent ?? "").not.toMatch(
      /\b(approve|execute|run AI|send to|create action)\b/i,
    );
  });

  it("header is hidden when no plant selected", () => {
    renderAt(OPERATOR_AI_DOCTOR_PHASE1_ROUTE, { plants: PLANTS });
    expect(
      screen.queryByTestId("ai-doctor-phase1-selected-plant-header"),
    ).toBeNull();
  });
});

describe("OperatorAiDoctorPhase1 — Back to plant CTA", () => {
  it("renders Back to plant for a valid selected plant with preserved IDs", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-b`, {
      plants: PLANTS,
    });
    const cta = screen.getByTestId("ai-doctor-phase1-back-to-plant");
    const href = cta.getAttribute("href") ?? "";
    expect(href).toContain("/plants/plant-b");
    expect(href).toContain("growId=grow-2");
    expect(href).toContain("tentId=tent-2");
  });

  it("hidden when no plant is selected", () => {
    renderAt(OPERATOR_AI_DOCTOR_PHASE1_ROUTE, { plants: PLANTS });
    expect(
      screen.queryByTestId("ai-doctor-phase1-back-to-plant"),
    ).toBeNull();
  });

  it("hidden for unknown plant id", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=does-not-exist`, {
      plants: PLANTS,
    });
    expect(
      screen.queryByTestId("ai-doctor-phase1-back-to-plant"),
    ).toBeNull();
  });
});

describe("OperatorAiDoctorPhase1 — unknown plant state", () => {
  it("blocks result rendering and shows plant picker + clear CTA", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=nope`, {
      plants: PLANTS,
      getResultForPlant: () => ({
        context: baseContext("nope"),
        result: baseResult({ summary: "FAKE" }),
      }),
    });
    expect(screen.getByTestId("ai-doctor-phase1-unknown-plant-state")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-plant-picker")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-phase1-result-panel")).toBeNull();
    expect(screen.queryByText("FAKE")).toBeNull();
  });

  it("Clear selection removes plantId from URL", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=nope&growId=stale`, {
      plants: PLANTS,
    });
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-unknown-clear-cta"));
    const search =
      screen.getByTestId("probe-location").getAttribute("data-search") ?? "";
    expect(search).not.toContain("plantId");
    expect(search).not.toContain("growId");
  });

  it("selecting a valid plant from unknown state updates URL and renders header", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=nope`, {
      plants: PLANTS,
    });
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-plant-option-plant-a"));
    const search =
      screen.getByTestId("probe-location").getAttribute("data-search") ?? "";
    expect(search).toContain("plantId=plant-a");
    expect(
      screen.getByTestId("ai-doctor-phase1-selected-plant-header"),
    ).toBeTruthy();
  });
});

describe("OperatorAiDoctorPhase1 — evidence shortcuts", () => {
  it("renders shortcut links with preserved IDs and sensor anchor when result exists", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: (id) => ({
        context: baseContext(id),
        result: baseResult(),
      }),
    });
    const photo = screen.getByTestId(
      "ai-doctor-phase1-shortcut-view-recent-photo",
    );
    const sensor = screen.getByTestId(
      "ai-doctor-phase1-shortcut-open-sensor-summary",
    );
    const photoHref = photo.getAttribute("href") ?? "";
    expect(photoHref).toContain("/plants/plant-a");
    expect(photoHref).toContain("growId=grow-1");
    expect(photoHref).toContain("tentId=tent-1");
    expect(photoHref).toContain("#photos");
    expect(sensor.getAttribute("href")).toBe(
      `#${AI_DOCTOR_PHASE1_SENSOR_ANCHOR_ID}`,
    );
    expect(
      document.getElementById(AI_DOCTOR_PHASE1_SENSOR_ANCHOR_ID),
    ).not.toBeNull();
  });

  it("does not render shortcuts when no result is available", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: () => null,
    });
    expect(
      screen.queryByTestId("ai-doctor-phase1-evidence-shortcuts"),
    ).toBeNull();
  });

  it("shortcuts do not trigger any mutation handlers (anchors only)", () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
      getResultForPlant: (id) => ({
        context: baseContext(id),
        result: baseResult(),
      }),
    });
    const sensor = screen.getByTestId(
      "ai-doctor-phase1-shortcut-open-sensor-summary",
    );
    expect(sensor.tagName.toLowerCase()).toBe("a");
    expect(sensor.getAttribute("onclick")).toBeNull();
  });
});

describe("AiDoctorPhase1InternalLink — Copied! confirmation", () => {
  let writeText: ReturnType<typeof vi.fn>;
  const originalClipboard = (navigator as { clipboard?: unknown }).clipboard;

  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  it("shows 'Copied!' after successful copy", async () => {
    renderAt(`${OPERATOR_AI_DOCTOR_PHASE1_ROUTE}?plantId=plant-a`, {
      plants: PLANTS,
    });
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-internal-link-copy"));
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-phase1-internal-link-copied").textContent,
      ).toContain("Copied!"),
    );
    expect(writeText.mock.calls[0]?.[0]).toContain("plantId=plant-a");
  });
});

describe("static safety — derived result wiring", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../pages/OperatorAiDoctorPhase1.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("does not import the Supabase client directly", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/createClient\s*\(/);
  });

  it("does not call fetch/functions.invoke/AI provider APIs", () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway|lovable\.dev\/ai/i);
  });

  it("does not perform any insert/update/upsert/delete on critical tables", () => {
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
  });

  it("does not include device-control terms or privileged secrets", () => {
    expect(SRC).not.toMatch(
      /executeDeviceCommand|deviceControl|sendDeviceCommand/i,
    );
    expect(SRC).not.toMatch(/service_role|bridge[_-]?token/i);
  });
});
