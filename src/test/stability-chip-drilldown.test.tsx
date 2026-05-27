import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StabilityChipDrilldown, {
  resolveCopyVariant,
} from "@/components/StabilityChipDrilldown";
import type { StabilityResult } from "@/lib/environmentStabilityRules";

function makeResult(
  status: StabilityResult["status"],
  overrides: Partial<StabilityResult> = {},
): StabilityResult {
  return {
    status,
    last24h: {
      hoursOutside: 3.4,
      hoursConsidered: 22,
      totalConsidered: 96,
      outsideCount: 12,
    },
    last7d: { hoursOutside: 0, hoursConsidered: 0, totalConsidered: 0, outsideCount: 0 },
    sparse: false,
    message: null,
    stage: "veg",
    ...overrides,
  };
}

describe("resolveCopyVariant", () => {
  it("maps unavailable", () => {
    expect(resolveCopyVariant(makeResult("unavailable"))).toBe("unavailable");
  });
  it("maps stage_unknown", () => {
    expect(resolveCopyVariant(makeResult("stage_unknown"))).toBe("stage_unknown");
  });
  it("maps context_only", () => {
    expect(resolveCopyVariant(makeResult("context_only"))).toBe("context_only");
  });
  it("maps stable/watch/unstable to outside_24h", () => {
    expect(resolveCopyVariant(makeResult("stable"))).toBe("outside_24h");
    expect(resolveCopyVariant(makeResult("watch"))).toBe("outside_24h");
    expect(resolveCopyVariant(makeResult("unstable"))).toBe("outside_24h");
  });
});

describe("StabilityChipDrilldown", () => {
  it("renders chip as a button (not a link) for tap/click drilldown", () => {
    render(
      <StabilityChipDrilldown
        tentId="t1"
        tentName="Tent A"
        stability={makeResult("unstable")}
      />,
    );
    const chip = screen.getByTestId("dashboard-stability-chip-t1");
    expect(chip.tagName).toBe("BUTTON");
  });

  it("opens a modal exposing the exact copy variant", () => {
    render(
      <StabilityChipDrilldown
        tentId="t1"
        tentName="Tent A"
        stability={makeResult("unstable")}
      />,
    );
    fireEvent.click(screen.getByTestId("dashboard-stability-chip-t1"));
    expect(screen.getByTestId("dashboard-stability-drilldown-t1")).toBeTruthy();
    expect(
      screen.getByTestId("dashboard-stability-drilldown-t1-variant").textContent,
    ).toBe("Outside 24h");
  });

  it("shows last-24h numeric details (hours outside + considered + count)", () => {
    render(
      <StabilityChipDrilldown
        tentId="t1"
        tentName="Tent A"
        stability={makeResult("watch")}
      />,
    );
    fireEvent.click(screen.getByTestId("dashboard-stability-chip-t1"));
    const dialog = screen.getByTestId("dashboard-stability-drilldown-t1");
    expect(dialog.textContent).toContain("3.4h");
    expect(dialog.textContent).toContain("22h");
    expect(dialog.textContent).toContain("96");
    expect(dialog.textContent).toContain("12");
  });

  it("labels the variant for unavailable, stage_unknown, context_only", () => {
    const cases: Array<[StabilityResult["status"], string]> = [
      ["unavailable", "Unavailable"],
      ["stage_unknown", "Stage unknown"],
      ["context_only", "Context only"],
    ];
    for (const [status, label] of cases) {
      const { unmount } = render(
        <StabilityChipDrilldown
          tentId="tx"
          tentName="Tent X"
          stability={makeResult(status)}
        />,
      );
      fireEvent.click(screen.getByTestId("dashboard-stability-chip-tx"));
      expect(
        screen.getByTestId("dashboard-stability-drilldown-tx-variant").textContent,
      ).toBe(label);
      unmount();
    }
  });

  it("stops click propagation so the wrapping Link does not navigate", () => {
    const onParentClick = vi.fn();
    render(
      <a href="/tents/t1" onClick={onParentClick}>
        <StabilityChipDrilldown
          tentId="t1"
          tentName="Tent A"
          stability={makeResult("stable")}
        />
      </a>,
    );
    fireEvent.click(screen.getByTestId("dashboard-stability-chip-t1"));
    expect(onParentClick).not.toHaveBeenCalled();
  });
});

// Static safety: ensure the drilldown component does not introduce writes,
// alerts, action queue, automation, or device-control surfaces.
import { readFileSync } from "fs";
import { resolve } from "path";
import { vi } from "vitest";

const SRC = readFileSync(
  resolve(__dirname, "../components/StabilityChipDrilldown.tsx"),
  "utf8",
);

describe("StabilityChipDrilldown safety", () => {
  it("introduces no alert/queue/automation/device-control writes", () => {
    expect(SRC).not.toMatch(
      /saveAlert\(|logAlertEvent\(|action_queue|service_role|insertAlert\(|device\.control|\bsetAutomation\b|\bautomate\(/i,
    );
  });
  it("performs no I/O (no supabase, no fetch)", () => {
    expect(SRC).not.toMatch(/supabase|fetch\(/);
  });
});
