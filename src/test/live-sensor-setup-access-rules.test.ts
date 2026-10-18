import { describe, it, expect } from "vitest";
import { canMountLiveSensorSetup } from "@/lib/entitlements/liveSensorSetupAccess";

const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
const at = (serverGateState: string | null | undefined) => ({
  serverGateState,
  evaluatedTentId: TENT,
  activeTentId: TENT,
});

describe("canMountLiveSensorSetup", () => {
  it("mounts only for a completed, allowed server preflight for the active tent", () => {
    expect(canMountLiveSensorSetup(at("allowed"))).toBe(true);
  });

  it.each([
    "loading",
    "denied",
    "invalid_request",
    "network_error",
    "ALLOWED",
    "",
    null,
    undefined,
  ])("fails closed for server gate state %s", (state) => {
    expect(canMountLiveSensorSetup(at(state))).toBe(false);
  });

  it("stays hidden without an active tent even when allowed", () => {
    expect(
      canMountLiveSensorSetup({
        serverGateState: "allowed",
        evaluatedTentId: TENT,
        activeTentId: null,
      }),
    ).toBe(false);
    expect(
      canMountLiveSensorSetup({
        serverGateState: "allowed",
        evaluatedTentId: "",
        activeTentId: "",
      }),
    ).toBe(false);
  });

  it("is deterministic for identical input", () => {
    expect(canMountLiveSensorSetup(at("allowed"))).toBe(canMountLiveSensorSetup(at("allowed")));
  });
});
