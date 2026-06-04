/**
 * VPD snapshot band chart — view-model + component tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import VpdSnapshotBandChart from "@/components/VpdSnapshotBandChart";
import { buildVpdSnapshotBandChartViewModel } from "@/lib/vpdSnapshotBandChartViewModel";

const ROOT = resolve(__dirname, "../..");

describe("buildVpdSnapshotBandChartViewModel", () => {
  it("low VPD against canonical late_veg produces low status + low guidance", () => {
    const vm = buildVpdSnapshotBandChartViewModel({ vpdKpa: 0.5, stage: "late_veg" });
    expect(vm.status).toBe("low");
    expect(vm.classification).toBe("low");
    expect(vm.guidanceLabel).toMatch(/Review humidity, temperature, and airflow/i);
    expect(vm.targetBandLabel).toBe("0.90–1.20 kPa");
    expect(vm.canonicalStage).toBe("late_veg");
    expect(vm.markerPercent).toBeGreaterThanOrEqual(0);
    expect(vm.renderable).toBe(true);
  });

  it("in-band VPD produces in_band + in-target guidance", () => {
    const vm = buildVpdSnapshotBandChartViewModel({ vpdKpa: 1.0, stage: "late_veg" });
    expect(vm.status).toBe("in_band");
    expect(vm.guidanceLabel).toMatch(/within the target band/i);
  });

  it("high VPD produces high + high guidance", () => {
    const vm = buildVpdSnapshotBandChartViewModel({ vpdKpa: 1.6, stage: "late_veg" });
    expect(vm.status).toBe("high");
    expect(vm.guidanceLabel).toMatch(/Review temperature, humidity, airflow/i);
  });

  it("stage unknown → not renderable, no healthy/in-target language", () => {
    const vm = buildVpdSnapshotBandChartViewModel({ vpdKpa: 1.0, stage: "mystery" });
    expect(vm.status).toBe("stage_unknown");
    expect(vm.renderable).toBe(false);
    expect(vm.guidanceLabel).toMatch(/Confirm plant stage/);
    expect(vm.guidanceLabel).not.toMatch(/in target|healthy|in_band/i);
    expect(vm.canonicalStage).toBeNull();
  });

  it("invalid VPD → unavailable, calm copy", () => {
    for (const v of [null, undefined, NaN as unknown as number]) {
      const vm = buildVpdSnapshotBandChartViewModel({ vpdKpa: v as never, stage: "late_veg" });
      expect(vm.status).toBe("unavailable");
      expect(vm.renderable).toBe(false);
      expect(vm.guidanceLabel).toMatch(/VPD unavailable/);
    }
  });

  it("legacy stage 'veg' maps to canonical late_veg band", () => {
    const vm = buildVpdSnapshotBandChartViewModel({ vpdKpa: 1.0, stage: "veg" });
    expect(vm.canonicalStage).toBe("late_veg");
    expect(vm.status).toBe("in_band");
  });

  it("vpdLabel is 'Derived VPD' and never 'Live'", () => {
    const vm = buildVpdSnapshotBandChartViewModel({ vpdKpa: 1.0, stage: "late_veg" });
    expect(vm.vpdLabel).toBe("Derived VPD");
    expect(vm.ariaLabel).not.toMatch(/Live/);
  });
});

describe("<VpdSnapshotBandChart /> rendering", () => {
  it("renders marker + band for valid VPD and known stage", () => {
    render(<VpdSnapshotBandChart vpdKpa={1.0} stage="late_veg" />);
    expect(screen.getByTestId("vpd-snapshot-band-chart-marker")).toBeTruthy();
    expect(screen.getByTestId("vpd-snapshot-band-chart-band")).toBeTruthy();
    expect(screen.getByTestId("vpd-snapshot-band-chart-value").textContent).toMatch(/1\.00 kPa/);
    expect(screen.getByText("Derived VPD")).toBeTruthy();
  });

  it("renders unavailable copy when stage unknown", () => {
    render(<VpdSnapshotBandChart vpdKpa={1.0} stage="mystery" />);
    expect(screen.getByTestId("vpd-snapshot-band-chart-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("vpd-snapshot-band-chart-marker")).toBeNull();
    expect(screen.getByText(/Confirm plant stage/)).toBeTruthy();
  });

  it("renders unavailable copy when VPD missing", () => {
    render(<VpdSnapshotBandChart vpdKpa={null} stage="late_veg" />);
    expect(screen.getByTestId("vpd-snapshot-band-chart-unavailable")).toBeTruthy();
  });

  it("has an aria-label describing the chart", () => {
    render(<VpdSnapshotBandChart vpdKpa={1.0} stage="late_veg" />);
    const group = screen.getByRole("group", { name: /Derived VPD/i });
    expect(group).toBeTruthy();
  });

  it("never renders the literal 'Live' label", () => {
    const { container } = render(<VpdSnapshotBandChart vpdKpa={1.0} stage="late_veg" />);
    expect(container.textContent ?? "").not.toMatch(/Live VPD/);
    expect(container.textContent ?? "").not.toMatch(/\bLive\b/);
  });
});

describe("static safety — VpdSnapshotBandChart files", () => {
  const VM_SRC = readFileSync(resolve(ROOT, "src/lib/vpdSnapshotBandChartViewModel.ts"), "utf8");
  const COMP_SRC = readFileSync(resolve(ROOT, "src/components/VpdSnapshotBandChart.tsx"), "utf8");

  it("contain no I/O, Supabase, fetch, alert, action_queue, or device-control surface", () => {
    for (const src of [VM_SRC, COMP_SRC]) {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/execute_device|setpoint_write|device_control|deviceControl/);
      expect(src).not.toMatch(/mqtt|home_assistant|pi_bridge|relay|actuator/i);
      expect(src).not.toMatch(/scheduler|cron|autopilot/i);
    }
  });

  it("component does not duplicate the VPD target band table", () => {
    // No hardcoded canonical stage → band map literals in the .tsx file.
    expect(COMP_SRC).not.toMatch(/minKpa\s*:\s*0?\.\d/);
    expect(COMP_SRC).not.toMatch(/maxKpa\s*:\s*1?\.\d/);
  });
});
