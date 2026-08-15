import { describe, expect, it } from "vitest";

import { resolveLiveProofStatus } from "../src/liveProofStatus.ts";

describe("resolveLiveProofStatus", () => {
  const success = {
    liveProofRequested: true,
    adapterKind: "live" as const,
    hostVerdict: "HOLD" as const,
    cleanupStatus: "PASS" as const,
    inspectorStatus: "finished",
    reviewerStatus: "finished",
  };

  it("returns BLOCKED when live proof was not requested", () => {
    expect(
      resolveLiveProofStatus({
        ...success,
        liveProofRequested: false,
        adapterKind: "fake",
      }),
    ).toBe("BLOCKED");
  });

  it("returns FAIL when live proof was requested on a fake adapter", () => {
    expect(resolveLiveProofStatus({ ...success, adapterKind: "fake" })).toBe("FAIL");
  });

  it("returns FAIL when a live adapter run is rejected", () => {
    expect(resolveLiveProofStatus({ ...success, hostVerdict: "REJECT" })).toBe("FAIL");
  });

  it("returns FAIL when cleanup fails", () => {
    expect(resolveLiveProofStatus({ ...success, cleanupStatus: "FAIL" })).toBe("FAIL");
  });

  it("returns FAIL when either agent did not finish", () => {
    expect(resolveLiveProofStatus({ ...success, reviewerStatus: "skipped" })).toBe("FAIL");
    expect(resolveLiveProofStatus({ ...success, inspectorStatus: "error" })).toBe("FAIL");
  });

  it("returns PASS only for a live adapter HOLD with cleanup and both finished runs", () => {
    expect(resolveLiveProofStatus(success)).toBe("PASS");
  });
});
