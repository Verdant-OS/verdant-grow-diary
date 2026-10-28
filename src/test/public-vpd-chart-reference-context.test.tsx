import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

import PublicVpdChart from "@/pages/PublicVpdChart";
import {
  calculatePublicVpdChartFromFahrenheit,
  publicVpdChartLateFlowerReferenceNote,
  publicVpdChartStageById,
  publicVpdChartStageRangeKpa,
} from "@/lib/publicVpdChartRules";
import * as stageTargetRules from "@/lib/vpdStageTargetRules";

afterEach(() => vi.restoreAllMocks());

describe("public VPD chart reference context", () => {
  it("names the chart and Verdant bands from their resolved rules", () => {
    const reference = publicVpdChartStageById("late_flower");
    const canonical = stageTargetRules.getVpdTargetBand("late_flower");
    const note = publicVpdChartLateFlowerReferenceNote();

    expect(note).toContain("cited sources' reference ranges");
    expect(note).toContain(`${reference.name} is ${publicVpdChartStageRangeKpa(reference)} here`);
    expect(note).toContain(
      `Verdant's stage-aware calculator uses its canonical ${canonical.min?.toFixed(1)}–${canonical.max?.toFixed(1)} kPa band`,
    );
    expect(note).toContain("hypothetical values, not a verified target status for your plants");
  });

  it("preserves the different bands and the concrete 1.57 kPa regression case", () => {
    const reference = publicVpdChartStageById("late_flower");
    const canonical = stageTargetRules.getVpdTargetBand("late_flower");
    const calculation = calculatePublicVpdChartFromFahrenheit(77, 44, -2);

    expect([reference.min, reference.max]).toEqual([1.2, 1.6]);
    expect([canonical.min, canonical.max]).toEqual([1.1, 1.5]);
    expect(calculation.vpdFormatted).toBe("1.57");
    expect(calculation.vpdRounded).toBeLessThanOrEqual(reference.max);
    expect(
      stageTargetRules.classifyVpdAgainstStage({
        value: calculation.vpdRounded,
        stage: "late_flower",
      }).classification,
    ).toBe("above_target");
  });

  it("shows the explanation beside the chart ranges and retains the calculator link", () => {
    render(
      <MemoryRouter>
        <PublicVpdChart />
      </MemoryRouter>,
    );
    const chart = screen.getByRole("region", { name: "VPD chart by growth stage" });
    expect(within(chart).getByText(publicVpdChartLateFlowerReferenceNote())).toBeVisible();
    expect(within(chart).getByRole("heading", { name: "Late Flower (1.2–1.6 kPa)" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Stage-aware VPD calculator" })).toHaveAttribute(
      "href",
      "/tools/vpd-calculator",
    );
  });

  it.each([
    { min: null, max: 1.5 },
    { min: 1.1, max: null },
  ])("does not invent a canonical range when a bound is missing: %j", (bounds) => {
    const canonical = stageTargetRules.getVpdTargetBand("late_flower");
    vi.spyOn(stageTargetRules, "getVpdTargetBand").mockReturnValue({ ...canonical, ...bounds });
    const note = publicVpdChartLateFlowerReferenceNote();

    expect(note).toContain("currently has no active late-flower target band");
    expect(note).not.toMatch(/null|undefined|NaN/);
    expect(note).toContain("Late Flower is 1.2–1.6 kPa here");
  });

  it("generates the same explanation repeatedly without changing either band", () => {
    const reference = { ...publicVpdChartStageById("late_flower") };
    const canonical = stageTargetRules.getVpdTargetBand("late_flower");
    expect(publicVpdChartLateFlowerReferenceNote()).toBe(publicVpdChartLateFlowerReferenceNote());
    expect(publicVpdChartStageById("late_flower")).toEqual(reference);
    expect(stageTargetRules.getVpdTargetBand("late_flower")).toEqual(canonical);
  });
});
