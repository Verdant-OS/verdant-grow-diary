import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import StabilityChipDrilldown from "@/components/StabilityChipDrilldown";
import type { StabilityResult } from "@/lib/environmentStabilityRules";

function makeResult(
  stage: StabilityResult["stage"],
  status: StabilityResult["status"] = "stable",
  overrides: Partial<StabilityResult> = {},
): StabilityResult {
  return {
    status,
    last24h: {
      hoursOutside: 2.1,
      hoursConsidered: 22,
      totalConsidered: 96,
      outsideCount: 7,
    },
    last7d: {
      hoursOutside: 4.4,
      hoursConsidered: 150,
      totalConsidered: 600,
      outsideCount: 18,
    },
    sparse: false,
    message: null,
    stage,
    ...overrides,
  };
}

function open(tentId: string) {
  fireEvent.click(screen.getByTestId(`dashboard-stability-chip-${tentId}`));
}

describe("StabilityChipDrilldown — stage-band why context", () => {
  it("renders Flower VPD target on a flower tent row", () => {
    render(
      <StabilityChipDrilldown
        tentId="t-flower"
        tentName="Flower Tent"
        stability={makeResult("flower", "watch")}
      />,
    );
    open("t-flower");
    const node = screen.getByTestId(
      "dashboard-stability-drilldown-t-flower-why-context",
    );
    expect(node.textContent).toContain("Flower VPD target: 1.0–1.5 kPa");
    expect(node.getAttribute("data-why-kind")).toBe("stage");
  });

  it("renders Veg VPD target on a veg tent row", () => {
    render(
      <StabilityChipDrilldown
        tentId="t-veg"
        tentName="Veg Tent"
        stability={makeResult("veg", "stable")}
      />,
    );
    open("t-veg");
    expect(
      screen.getByTestId("dashboard-stability-drilldown-t-veg-why-context")
        .textContent,
    ).toContain("Veg VPD target: 0.8–1.2 kPa");
  });

  it("renders fallback copy for unknown stage", () => {
    render(
      <StabilityChipDrilldown
        tentId="t-unk"
        tentName="Mystery Tent"
        stability={makeResult("unknown", "stage_unknown")}
      />,
    );
    open("t-unk");
    const node = screen.getByTestId(
      "dashboard-stability-drilldown-t-unk-why-context",
    );
    expect(node.textContent).toBe("Target context unavailable.");
    expect(node.getAttribute("data-why-kind")).toBe("unavailable");
  });

  it("renders context-only copy for harvest/drying without a breach band", () => {
    render(
      <StabilityChipDrilldown
        tentId="t-harv"
        tentName="Drying Tent"
        stability={makeResult("harvest", "context_only")}
      />,
    );
    open("t-harv");
    const node = screen.getByTestId(
      "dashboard-stability-drilldown-t-harv-why-context",
    );
    expect(node.getAttribute("data-why-kind")).toBe("context_only");
    expect(node.textContent).toContain("Harvest");
    expect(node.textContent).toContain("context only");
    expect(node.textContent).not.toMatch(/\d+\.\d+\s*–\s*\d+\.\d+\s*kPa/);
  });

  it("still renders existing 24h details and variant alongside the why context", () => {
    render(
      <StabilityChipDrilldown
        tentId="t-keep"
        tentName="Keep Tent"
        stability={makeResult("flower", "unstable")}
      />,
    );
    open("t-keep");
    expect(
      screen.getByTestId("dashboard-stability-drilldown-t-keep-variant")
        .textContent,
    ).toBe("Outside 24h");
    expect(
      screen.getByTestId("dashboard-stability-drilldown-t-keep-why-context")
        .textContent,
    ).toContain("Flower VPD target");
    // Existing 24h numeric fields remain (hours-outside row text).
    expect(screen.getByText("Hours outside band")).toBeTruthy();
    expect(screen.getByText("Hours considered")).toBeTruthy();
    expect(screen.getByText("Outside count")).toBeTruthy();
  });

  it("static safety: no alert writes, queues, service_role, AI Doctor, or device control", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "src/components/StabilityChipDrilldown.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/ai[_-]?doctor/i);
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/\.from\(\s*["']alerts["']\s*\)/);
    expect(src).not.toMatch(/setDevicePower|sendMqtt|publishMqtt|deviceControl\(/);
  });
});
