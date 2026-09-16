import { describe, expect, it } from "vitest";
import {
  buildAiDoctorContextReadView,
  contextEvidenceReadStatus,
} from "@/lib/aiDoctorContextReadStateRules";

describe("context read completeness", () => {
  it.each([
    ["pending", "idle", "loading"],
    ["pending", "fetching", "loading"],
    ["pending", "paused", "paused"],
    ["success", "idle", "success"],
    ["success", "fetching", "refreshing"],
    ["success", "paused", "paused"],
    ["error", "idle", "error"],
    ["error", "fetching", "error"],
    ["error", "paused", "paused"],
  ] as const)("maps %s/%s to %s", (status, fetchStatus, expected) => {
    expect(contextEvidenceReadStatus(status, fetchStatus)).toBe(expected);
  });

  it("gives known failures priority over unresolved sibling reads", () => {
    const result = buildAiDoctorContextReadView({
      timeline: { readStatus: "paused" },
      rootZone: { readStatus: "error", hasData: true },
      manual: { status: "loading" },
    });
    expect(result).toMatchObject({ status: "unavailable", canRetry: true, showAssessment: false });
    expect(result.cachedNotice).toContain("Previously loaded");
  });

  it.each(["companionEvidenceUnavailable", "auditEvidenceUnavailable"] as const)(
    "keeps %s visible even when every transport query completed",
    (partialFlag) => {
      expect(
        buildAiDoctorContextReadView({
          timeline: { readStatus: "success", [partialFlag]: true },
          rootZone: { readStatus: "success" },
          manual: { status: "success" },
        }),
      ).toMatchObject({ status: "unavailable", showAssessment: false, canRetry: true });
    },
  );

  it("requires the manual window to establish an outcome and settle its refresh", () => {
    for (const manual of [
      { status: undefined },
      { status: "success", refreshing: true },
    ] as const) {
      expect(
        buildAiDoctorContextReadView({
          timeline: { readStatus: "success" },
          rootZone: null,
          manual,
        }).showAssessment,
      ).toBe(false);
    }
  });

  it("labels cached failed manual evidence without approving the complete summary", () => {
    const result = buildAiDoctorContextReadView({
      timeline: { readStatus: "success" },
      rootZone: null,
      manual: { status: "refresh_error" },
    });
    expect(result.showAssessment).toBe(false);
    expect(result.cachedNotice).toContain("Previously loaded");
  });

  it("allows an established read with no applicable root-zone or tent source", () => {
    expect(
      buildAiDoctorContextReadView({
        timeline: { readStatus: "success" },
        rootZone: null,
        manual: null,
      }),
    ).toMatchObject({ status: "ready", showAssessment: true, canRetry: false, message: null });
  });
});
