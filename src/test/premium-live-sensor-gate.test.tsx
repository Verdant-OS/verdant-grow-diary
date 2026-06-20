/**
 * PremiumLiveSensorGate component tests.
 *
 * Proves the future-proofing component:
 *  - shows loading skeleton before server gate resolves
 *  - renders children ONLY when state === "allowed"
 *  - renders Pro paywall copy when denied
 *  - renders safe error copy for invalid_request / network_error
 *  - never imports useMyEntitlements
 *  - never reads capabilities.liveSensors directly
 *  - introduces no fake-live / automation / device-control copy
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
} from "@/hooks/useLiveSensorServerGate";

const CHILD = <div data-testid="premium-child">PREMIUM STREAM</div>;
const allowedResult: LiveSensorGateResult = {
  ok: true,
  state: "allowed",
  reason: null,
  displayPlanId: "pro_monthly",
};
const deniedResult: LiveSensorGateResult = {
  ok: false,
  state: "denied",
  reason: "upgrade_required",
  displayPlanId: "free",
};

describe("PremiumLiveSensorGate", () => {
  it("shows screen-reader-friendly skeleton in loading state and hides children", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="loading"
        result={null}
      >
        {CHILD}
      </PremiumLiveSensorGate>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/checking live sensor access/i)).toBeInTheDocument();
    expect(screen.queryByTestId("premium-child")).not.toBeInTheDocument();
  });

  it("renders children ONLY when state === allowed and result.ok === true", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="allowed"
        result={allowedResult}
      >
        {CHILD}
      </PremiumLiveSensorGate>,
    );
    expect(screen.getByTestId("premium-child")).toBeInTheDocument();
  });

  it("does not render children when state is allowed but result.ok is false (defense in depth)", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="allowed"
        result={{ ...deniedResult, state: "denied" }}
      >
        {CHILD}
      </PremiumLiveSensorGate>,
    );
    expect(screen.queryByTestId("premium-child")).not.toBeInTheDocument();
  });

  it("renders Pro paywall copy on denied and hides children", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="denied"
        result={deniedResult}
      >
        {CHILD}
      </PremiumLiveSensorGate>,
    );
    expect(screen.getByText(LIVE_SENSOR_PAYWALL_HEADLINE)).toBeInTheDocument();
    expect(
      screen.getByText(LIVE_SENSOR_PAYWALL_UPGRADE_COPY),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("premium-child")).not.toBeInTheDocument();
  });

  it("renders safe invalid-request copy and hides children", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="invalid_request"
        result={null}
      >
        {CHILD}
      </PremiumLiveSensorGate>,
    );
    expect(
      screen.getByText(PREMIUM_LIVE_SENSOR_INVALID_COPY),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("premium-child")).not.toBeInTheDocument();
  });

  it("renders safe network-error copy and hides children", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="network_error"
        result={null}
      >
        {CHILD}
      </PremiumLiveSensorGate>,
    );
    expect(
      screen.getByText(PREMIUM_LIVE_SENSOR_NETWORK_COPY),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("premium-child")).not.toBeInTheDocument();
  });

  it("honors optional fallback for any non-allowed state", () => {
    render(
      <PremiumLiveSensorGate
        surface="live_sensor_stream"
        state="denied"
        result={deniedResult}
        fallback={<span data-testid="fb">FB</span>}
      >
        {CHILD}
      </PremiumLiveSensorGate>,
    );
    expect(screen.getByTestId("fb")).toBeInTheDocument();
    expect(screen.queryByTestId("premium-child")).not.toBeInTheDocument();
  });
});

describe("PremiumLiveSensorGate — source-level safety", () => {
  const SRC = readFileSync(
    resolve(process.cwd(), "src/components/PremiumLiveSensorGate.tsx"),
    "utf8",
  );

  it("does not import useMyEntitlements", () => {
    expect(SRC).not.toMatch(/useMyEntitlements/);
  });

  it("does not directly read capabilities.liveSensors", () => {
    expect(SRC).not.toMatch(/capabilities\.liveSensors/);
  });

  it("introduces no fake-live / automation / device-control copy", () => {
    expect(SRC).not.toMatch(/"[^"]*fake live[^"]*"/i);
    expect(SRC).not.toMatch(/"[^"]*execute device[^"]*"/i);
    expect(SRC).not.toMatch(/"[^"]*auto-?execute[^"]*"/i);
    expect(SRC).not.toMatch(/mqtt|home_assistant|pi_bridge|relay|actuator/i);
  });

  it("uses only the server-authoritative hook for the actual check", () => {
    expect(SRC).toMatch(/useLiveSensorServerGate/);
  });
});
