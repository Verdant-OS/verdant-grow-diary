/**
 * VPD diary timeline status widget — view-model + component tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import VpdTimelineStatusWidget from "@/components/VpdTimelineStatusWidget";
import { buildVpdTimelineStatusViewModel } from "@/lib/vpdTimelineStatusViewModel";

const ROOT = resolve(__dirname, "../..");

describe("buildVpdTimelineStatusViewModel", () => {
  it("derives VPD from temp + RH and classifies in_target", () => {
    const vm = buildVpdTimelineStatusViewModel({
      airTempC: 25,
      humidityPct: 60,
      stage: "late_veg",
    });
    expect(vm.shouldRender).toBe(true);
    expect(vm.vpdKpa).toBeGreaterThan(0);
    expect(vm.status).toBe("in_target");
    expect(vm.guidanceLabel).toMatch(/within the target band/i);
    expect(vm.canonicalStageLabel).toBe("Late veg");
  });

  it("low + high statuses surface review-first copy", () => {
    const low = buildVpdTimelineStatusViewModel({ vpdKpa: 0.5, stage: "late_veg" });
    expect(low.status).toBe("low");
    expect(low.guidanceLabel).toMatch(/Review humidity, temperature, and airflow/);

    const high = buildVpdTimelineStatusViewModel({ vpdKpa: 1.6, stage: "late_veg" });
    expect(high.status).toBe("high");
    expect(high.guidanceLabel).toMatch(/Review temperature, humidity, airflow/);
  });

  it("stage unknown never produces healthy / in-target copy", () => {
    const vm = buildVpdTimelineStatusViewModel({ vpdKpa: 1.0, stage: "mystery" });
    expect(vm.status).toBe("stage_unknown");
    expect(vm.guidanceLabel).toMatch(/Confirm plant stage/);
    expect(vm.guidanceLabel).not.toMatch(/in target|healthy/i);
  });

  it("missing temp/RH renders nothing (shouldRender=false)", () => {
    const vm = buildVpdTimelineStatusViewModel({ stage: "late_veg" });
    expect(vm.shouldRender).toBe(false);
  });

  it("vpdKpa supplied directly is sufficient context", () => {
    const vm = buildVpdTimelineStatusViewModel({ vpdKpa: 1.0, stage: "late_veg" });
    expect(vm.shouldRender).toBe(true);
  });

  it("legacy stage 'veg' maps to canonical late_veg", () => {
    const vm = buildVpdTimelineStatusViewModel({ vpdKpa: 1.0, stage: "veg" });
    expect(vm.canonicalStage).toBe("late_veg");
  });

  it("vpdLabel is 'Derived VPD' and never says 'Live'", () => {
    const vm = buildVpdTimelineStatusViewModel({ vpdKpa: 1.0, stage: "late_veg" });
    expect(vm.vpdLabel).toBe("Derived VPD");
  });
});

describe("<VpdTimelineStatusWidget /> rendering", () => {
  it("renders canonical stage label + target band + status", () => {
    render(<VpdTimelineStatusWidget vpdKpa={1.0} stage="late_veg" />);
    expect(screen.getByTestId("vpd-timeline-status-widget-stage").textContent).toMatch(/Late veg/);
    expect(screen.getByTestId("vpd-timeline-status-widget-band").textContent).toMatch(/0\.90–1\.20 kPa/);
    expect(screen.getByTestId("vpd-timeline-status-widget-status").textContent).toMatch(/In target/);
  });

  it("renders low/high statuses", () => {
    const { rerender } = render(<VpdTimelineStatusWidget vpdKpa={0.5} stage="late_veg" />);
    expect(screen.getByTestId("vpd-timeline-status-widget-status").textContent).toMatch(/Low/);
    rerender(<VpdTimelineStatusWidget vpdKpa={1.6} stage="late_veg" />);
    expect(screen.getByTestId("vpd-timeline-status-widget-status").textContent).toMatch(/High/);
  });

  it("renders nothing if temp/RH missing and no VPD", () => {
    const { container } = render(<VpdTimelineStatusWidget stage="late_veg" />);
    expect(container.firstChild).toBeNull();
  });

  it("stage unknown never shows 'In target'", () => {
    render(<VpdTimelineStatusWidget vpdKpa={1.0} stage="mystery" />);
    expect(screen.queryByText(/In target/)).toBeNull();
    expect(screen.getByText(/Confirm plant stage/)).toBeTruthy();
  });

  it("missing RH but temp present renders unavailable copy", () => {
    render(<VpdTimelineStatusWidget airTempC={25} stage="late_veg" />);
    // No RH → cannot derive → shouldRender=false → renders null
    const widget = screen.queryByTestId("vpd-timeline-status-widget");
    expect(widget).toBeNull();
  });

  it("never renders nutrient / irrigation / equipment / device recommendations", () => {
    for (const stage of ["late_veg", "mystery"]) {
      const { container, unmount } = render(
        <VpdTimelineStatusWidget vpdKpa={1.6} stage={stage} />,
      );
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/nutrient|feed|fertilizer|irrigate|water now|water more|water less/i);
      expect(text).not.toMatch(/turn on|turn off|switch on|switch off|relay|actuator|pump|dehumidifier|humidifier|fan/i);
      expect(text).not.toMatch(/\bLive\b/);
      unmount();
    }
  });
});

describe("static safety — VpdTimelineStatusWidget files", () => {
  const VM_SRC = readFileSync(resolve(ROOT, "src/lib/vpdTimelineStatusViewModel.ts"), "utf8");
  const COMP_SRC = readFileSync(resolve(ROOT, "src/components/VpdTimelineStatusWidget.tsx"), "utf8");

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

  it("does not duplicate the VPD target band table or stage mapping pairs", () => {
    for (const src of [VM_SRC, COMP_SRC]) {
      expect(src).not.toMatch(/minKpa\s*:\s*0?\.\d/);
      // No legacy → canonical pair text in source.
      const hasVegPair = /["']veg["']/.test(src) && /["']late_veg["']/.test(src);
      const hasFlowerPair =
        /["']flower["']/.test(src) && /["']mid_late_flower["']/.test(src);
      const hasPreflowerPair =
        /["']preflower["']/.test(src) && /["']early_flower["']/.test(src);
      expect(hasVegPair || hasFlowerPair || hasPreflowerPair).toBe(false);
    }
  });
});
