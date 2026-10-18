import { describe, it, expect } from "vitest";
import { canMountLiveSensorSetup } from "@/lib/entitlements/liveSensorSetupAccess";

describe("canMountLiveSensorSetup", () => {
  it("mounts only for a completed, allowed server preflight with an active tent", () => {
    expect(canMountLiveSensorSetup({ serverGateState: "allowed", hasActiveTent: true })).toBe(true);
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
    expect(canMountLiveSensorSetup({ serverGateState: state, hasActiveTent: true })).toBe(false);
  });

  it("stays hidden without an active tent even when allowed", () => {
    expect(canMountLiveSensorSetup({ serverGateState: "allowed", hasActiveTent: false })).toBe(
      false,
    );
  });

  it("is deterministic for identical input", () => {
    const input = { serverGateState: "allowed", hasActiveTent: true };
    expect(canMountLiveSensorSetup(input)).toBe(canMountLiveSensorSetup(input));
  });
});
