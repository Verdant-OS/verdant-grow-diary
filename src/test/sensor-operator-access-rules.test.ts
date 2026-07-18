import { describe, expect, it } from "vitest";
import {
  canShowSensorOperatorDiagnostics,
  type OperatorRoleStatus,
} from "@/lib/sensorOperatorAccessRules";

describe("sensor operator access rules", () => {
  it("shows diagnostics only when requested and server role is granted", () => {
    expect(
      canShowSensorOperatorDiagnostics({ requested: true, roleStatus: "granted" }),
    ).toBe(true);
    expect(
      canShowSensorOperatorDiagnostics({ requested: false, roleStatus: "granted" }),
    ).toBe(false);
  });

  it.each<OperatorRoleStatus>([
    "loading",
    "denied",
    "unauthenticated",
    "error",
  ])("fails closed for role status %s", (roleStatus) => {
    expect(
      canShowSensorOperatorDiagnostics({ requested: true, roleStatus }),
    ).toBe(false);
  });

  it("is deterministic for repeated identical inputs", () => {
    const input = { requested: true, roleStatus: "granted" as const };
    expect(
      Array.from({ length: 20 }, () => canShowSensorOperatorDiagnostics(input)),
    ).toEqual(Array.from({ length: 20 }, () => true));
  });
});
