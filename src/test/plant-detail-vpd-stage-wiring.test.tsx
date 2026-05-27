/**
 * Render tests: stage-aware VPD copy wiring on Plant Detail's tent
 * environment panel, plus regression assertions on Tent Detail wiring.
 *
 * - Plant Detail: stage-aware VPD copy renders with plant's stage
 * - Unknown stage does NOT render an "In ... range" verdict
 * - Stale readings stay marked stale/historical
 * - Source files contain no automation / device-control / unsafe writes
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import PlantTentEnvironmentPanel from "@/components/PlantTentEnvironmentPanel";

// Mock the readings hook so we can control the slice deterministically.
vi.mock("@/hooks/usePlantTentLatestReadings", () => ({
  usePlantTentLatestReadings: vi.fn(),
}));
import { usePlantTentLatestReadings } from "@/hooks/usePlantTentLatestReadings";

const ROOT = resolve(__dirname, "../..");
const PANEL_SRC = readFileSync(
  resolve(ROOT, "src/components/PlantTentEnvironmentPanel.tsx"),
  "utf8",
);
const TENT_DETAIL_SRC = readFileSync(
  resolve(ROOT, "src/pages/TentDetail.tsx"),
  "utf8",
);

function renderPanel(stage: string | null, opts?: { stale?: boolean }) {
  const ts = opts?.stale
    ? new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString()
    : new Date().toISOString();
  const rows = [
    { ts, metric: "vpd_kpa", value: 1.0, source: "manual", device_id: null },
    { ts, metric: "temperature_c", value: 24, source: "manual", device_id: null },
    { ts, metric: "humidity_pct", value: 55, source: "manual", device_id: null },
  ];
  (usePlantTentLatestReadings as unknown as ReturnType<typeof vi.fn>)
    .mockReturnValue({ data: rows, isLoading: false });

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlantTentEnvironmentPanel
          tentId="tent-1"
          tentName="Tent 1"
          plantId="p-1"
          plantName="Plant"
          growId="g-1"
          plantStage={stage}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Plant Detail — stage-aware VPD copy", () => {
  it("renders veg-stage in-target copy when fresh", () => {
    renderPanel("veg");
    const hint = screen.getByTestId("plant-tent-environment-vpd-stage-hint");
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toMatch(/In Veg VPD range/);
    expect(hint.textContent).toMatch(/VPD targets depend on plant stage/);
    // Label segment (before the helper sentence) should not be marked historical.
    expect(hint.textContent?.split(".")[0]).not.toMatch(/historical|stale/i);
  });

  it("does not render an 'in target' verdict when stage is unknown", () => {
    renderPanel(null);
    const hint = screen.getByTestId("plant-tent-environment-vpd-stage-hint");
    expect(hint.textContent).not.toMatch(/in target/i);
    expect(hint.textContent).not.toMatch(/In .* VPD range/);
    expect(hint.textContent?.toLowerCase()).toContain("stage unknown");
  });

  it("renders harvest/drying as context-only", () => {
    renderPanel("drying");
    const hint = screen.getByTestId("plant-tent-environment-vpd-stage-hint");
    expect(hint.textContent?.toLowerCase()).toContain("context only");
    expect(hint.textContent).not.toMatch(/In .* VPD range/);
  });

  it("preserves stale / historical wording for stale readings", () => {
    renderPanel("veg", { stale: true });
    const hint = screen.getByTestId("plant-tent-environment-vpd-stage-hint");
    expect(hint.textContent?.toLowerCase()).toMatch(/historical|stale/);
    // Stale marker on the captured-source strip still rendered.
    expect(
      screen.getByTestId("plant-tent-environment-stale"),
    ).toBeInTheDocument();
  });
});

describe("Tent Detail — stage-aware VPD wiring (static)", () => {
  it("uses classifyVpdAgainstStage from the shared rules module", () => {
    expect(TENT_DETAIL_SRC).toMatch(/classifyVpdAgainstStage/);
    expect(TENT_DETAIL_SRC).toMatch(
      /from\s+["']@\/lib\/(vpdStageTargetRules|stageAwareVpdTargets)["']/,
    );
    expect(TENT_DETAIL_SRC).toMatch(/tent-detail-vpd-stage-hint/);
  });
  it("does not hardcode VPD warn thresholds in JSX anymore", () => {
    expect(TENT_DETAIL_SRC).not.toMatch(/snap\.vpd\s*>\s*1\.6/);
    expect(TENT_DETAIL_SRC).not.toMatch(/snap\.vpd\s*<\s*0\.6/);
  });
});

describe("safety contract — Plant Detail wiring sources", () => {
  it("no service_role / automation / device-control strings", () => {
    for (const src of [PANEL_SRC, TENT_DETAIL_SRC]) {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
      );
      expect(src).not.toMatch(/ai[\s_-]?coach|ai_doctor/i);
    }
  });
  it("no new writes to alerts / action_queue / sensor_readings from these wirings", () => {
    for (const src of [PANEL_SRC, TENT_DETAIL_SRC]) {
      expect(src).not.toMatch(
        /\.from\(["'](alerts|action_queue|sensor_readings)["']\)\s*\.(insert|update|delete|upsert)/,
      );
    }
  });
});
