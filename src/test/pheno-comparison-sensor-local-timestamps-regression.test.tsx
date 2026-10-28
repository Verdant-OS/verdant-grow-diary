/**
 * Regression belt for Pheno comparison demo sensor timestamps (#2349).
 * Page-level coverage lives in pheno-demo-local-timestamps.test.tsx; these
 * component tests pin the `plant-last-sensor-at` test id and snapshot rows
 * so a revert to raw ISO fails without re-rendering full routes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { formatSnapshotTimestamp } from "@/lib/dateFormat";
import { buildContextualPhenoComparisonView } from "@/lib/contextualPhenoComparisonViewModel";
import { CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS } from "@/lib/demo/contextualPhenoComparisonFixtures";
import { PHENO_COMPARISON_DEMO_CANDIDATES } from "@/lib/phenoComparisonFixtures";

const RAW_ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ORIGINAL_TZ = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "America/Chicago";
});

afterEach(() => {
  cleanup();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("Pheno comparison sensor timestamps — component regression", () => {
  it("ContextualPhenoComparisonPanel formats plant-last-sensor-at", () => {
    const view = buildContextualPhenoComparisonView(CONTEXTUAL_PHENO_COMPARISON_DEMO_PLANT_INPUTS);
    render(<ContextualPhenoComparisonPanel view={view} />);

    const alpha = screen.getByTestId("contextual-pheno-comparison-plant-demo-plant-alpha");
    const lastSensor = within(alpha).getByTestId("plant-last-sensor-at");
    expect(lastSensor.textContent).toBe(formatSnapshotTimestamp("2026-06-20T16:00:00.000Z"));
    expect(lastSensor.textContent).not.toMatch(RAW_ISO);
  });

  it("PhenoComparisonView formats snapshot capturedAt in demo mode", () => {
    const { container } = render(
      <MemoryRouter>
        <PhenoComparisonView inputs={PHENO_COMPARISON_DEMO_CANDIDATES} mode="demo" />
      </MemoryRouter>,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(RAW_ISO);
    expect(text).toContain(formatSnapshotTimestamp("2026-06-20T08:00:00.000Z"));
  });
});
