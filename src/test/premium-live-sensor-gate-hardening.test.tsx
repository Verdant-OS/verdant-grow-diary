/**
 * PremiumLiveSensorGate — copy-regression, integration wrapping,
 * and docs usage snippet tests.
 *
 * Storybook is NOT configured in this repo (no .storybook/ directory,
 * no .stories.* files), so stories are intentionally skipped per task.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
// Scanner guardrail: extend per-file timeout to 30s and cache repo walks so
// the recursive `src/` scan in this file does not flake under shard load
// (default 5s test timeout can be exceeded by I/O contention alone).
import {
  installScannerGuardrail,
  getCachedTsFiles,
} from "./support/scannerGuardrailHarness";

installScannerGuardrail({ file: __filename });
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PremiumLiveSensorGate,
  PREMIUM_LIVE_SENSOR_INVALID_COPY,
  PREMIUM_LIVE_SENSOR_NETWORK_COPY,
} from "@/components/PremiumLiveSensorGate";
import {
  LIVE_SENSOR_PAYWALL_HEADLINE,
  LIVE_SENSOR_PAYWALL_UPGRADE_COPY,
  type LiveSensorGateResult,
  type LiveSensorGateState,
} from "@/hooks/useLiveSensorServerGate";

const ROOT = process.cwd();

// --- Copy regression ------------------------------------------------------

describe("PremiumLiveSensorGate — copy regression (exact strings)", () => {
  it("paywall headline constant is the exact required string", () => {
    expect(LIVE_SENSOR_PAYWALL_HEADLINE).toBe(
      "Live sensor streaming is a Pro feature.",
    );
  });
  it("paywall upgrade copy constant is the exact required string", () => {
    expect(LIVE_SENSOR_PAYWALL_UPGRADE_COPY).toBe(
      "Upgrade required to use live sensor surfaces.",
    );
  });
  it("invalid_request copy is safe and non-empty", () => {
    expect(PREMIUM_LIVE_SENSOR_INVALID_COPY).toBe(
      "Live sensor request was invalid. Please reload and try again.",
    );
    expect(PREMIUM_LIVE_SENSOR_INVALID_COPY).not.toMatch(
      /fake|automation|execute device|relay|actuator/i,
    );
  });
  it("network_error copy is safe and non-empty", () => {
    expect(PREMIUM_LIVE_SENSOR_NETWORK_COPY).toBe(
      "Could not verify live sensor access right now. Please check your connection and retry.",
    );
    expect(PREMIUM_LIVE_SENSOR_NETWORK_COPY).not.toMatch(
      /fake|automation|execute device|relay|actuator/i,
    );
  });

  it("renders the exact paywall accessible text in denied state", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="denied"
        result={{
          ok: false,
          state: "denied",
          reason: "upgrade_required",
          displayPlanId: "free",
        }}
      >
        <span>NEVER</span>
      </PremiumLiveSensorGate>,
    );
    expect(
      screen.getByText("Live sensor streaming is a Pro feature."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Upgrade required to use live sensor surfaces."),
    ).toBeInTheDocument();
  });
});

// --- Integration wrapping a mock premium widget ---------------------------

function MockPremiumSensorWidget() {
  return (
    <div data-testid="mock-premium-sensor-widget">LIVE SENSOR STREAM</div>
  );
}

const allowedOk: LiveSensorGateResult = {
  ok: true,
  state: "allowed",
  reason: null,
  displayPlanId: "pro_monthly",
};
const allowedButNotOk: LiveSensorGateResult = {
  ok: false,
  state: "denied",
  reason: "upgrade_required",
  displayPlanId: "free",
};
const deniedRes: LiveSensorGateResult = {
  ok: false,
  state: "denied",
  reason: "upgrade_required",
  displayPlanId: "free",
};

describe("PremiumLiveSensorGate — integration wrapping a mock premium widget", () => {
  function mount(state: LiveSensorGateState, result: LiveSensorGateResult | null) {
    return render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state={state}
        result={result}
      >
        <MockPremiumSensorWidget />
      </PremiumLiveSensorGate>,
    );
  }

  it.each([
    ["loading", null] as const,
    ["denied", deniedRes] as const,
    ["invalid_request", null] as const,
    ["network_error", null] as const,
  ])("does NOT render the mock premium widget in %s state", (state, result) => {
    mount(state, result);
    expect(
      screen.queryByTestId("mock-premium-sensor-widget"),
    ).not.toBeInTheDocument();
  });

  it("renders the mock premium widget ONLY when state=allowed AND result.ok=true", () => {
    mount("allowed", allowedOk);
    expect(
      screen.getByTestId("mock-premium-sensor-widget"),
    ).toBeInTheDocument();
  });

  it("defense-in-depth: state=allowed but result.ok!==true still hides children", () => {
    mount("allowed", allowedButNotOk);
    expect(
      screen.queryByTestId("mock-premium-sensor-widget"),
    ).not.toBeInTheDocument();
  });
});

// --- Docs usage-snippet test ---------------------------------------------

describe("docs/paid-launch-entitlement-blocker.md — usage snippet", () => {
  const DOC = readFileSync(
    resolve(ROOT, "docs/paid-launch-entitlement-blocker.md"),
    "utf8",
  );
  it("includes a 'How to wrap future premium live-sensor widgets' section", () => {
    expect(DOC).toMatch(
      /How to wrap future premium live-sensor widgets/i,
    );
  });
  it("shows a PremiumLiveSensorGate snippet with surface, scope, and children", () => {
    expect(DOC).toMatch(/<PremiumLiveSensorGate/);
    expect(DOC).toMatch(/surface="live_sensor_stream"/);
    expect(DOC).toMatch(/scope=\{/);
  });
  it("states that children never render until the server gate returns allowed", () => {
    expect(DOC).toMatch(
      /never render premium live-sensor children before the server gate\s+returns `allowed`/i,
    );
  });
  it("declares useMyEntitlements / capabilities.liveSensors are presentation-only, not authoritative", () => {
    expect(DOC).toMatch(/presentation-only/i);
    expect(DOC).toMatch(/not.*authoritative/i);
  });
});

// --- Static safety: no current free sensor surface was wrapped -----------


describe("PremiumLiveSensorGate — no current free sensor surface is wrapped", () => {
  it("only the component file itself, its tests, and docs reference PremiumLiveSensorGate", () => {
    const allowed = new Set<string>([
      resolve(ROOT, "src/components/PremiumLiveSensorGate.tsx"),
      resolve(ROOT, "src/test/premium-live-sensor-gate.test.tsx"),
      resolve(ROOT, "src/test/premium-live-sensor-gate-hardening.test.tsx"),
      resolve(ROOT, "src/test/live-sensor-server-gate.test.ts"),
    ]);
    const offenders: string[] = [];
    for (const f of getCachedTsFiles(resolve(ROOT, "src"))) {
      if (allowed.has(f)) continue;
      if (/PremiumLiveSensorGate/.test(readFileSync(f, "utf8"))) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});
