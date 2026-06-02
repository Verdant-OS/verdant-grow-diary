/**
 * aiDoctorSafeReviewStartViewModel — unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorSafeReviewStart,
  AI_DOCTOR_SAFE_REVIEW_NO_REQUEST_NOTICE,
  AI_DOCTOR_SAFE_REVIEW_PARTIAL_NOTICE,
  AI_DOCTOR_SAFE_REVIEW_STRONG_NOTICE,
  AI_DOCTOR_SAFE_REVIEW_TITLE,
} from "@/lib/aiDoctorSafeReviewStartViewModel";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";

const BANNED =
  /\b(diagnosis|diagnosed|confirmed|certain|cured|guaranteed|live|synced|connected|imported)\b/i;

const baseResult = (
  o: Partial<AiDoctorContextResult> = {},
): AiDoctorContextResult => ({
  readiness: "strong",
  missing: [],
  evidence: [],
  counts: {
    recentEvents: 0,
    recentWateringOrFeeding: 0,
    recentManualSnapshots: 0,
    recentWarnings: 0,
  },
  latest: { manualSnapshotAt: null },
  safeNextStep: "",
  diagnosisClaimed: false,
  ...o,
});

describe("buildAiDoctorSafeReviewStart", () => {
  it("blocks review start for insufficient readiness", () => {
    const v = buildAiDoctorSafeReviewStart(
      baseResult({ readiness: "insufficient", missing: ["plant-profile"] }),
    );
    expect(v.allowStart).toBe(false);
    expect(v.variant).toBe("blocked");
    expect(v.preparation).toBeNull();
    expect(v.blockedReason.length).toBeGreaterThan(0);
  });

  it("allows partial review with limited-confidence copy", () => {
    const v = buildAiDoctorSafeReviewStart(
      baseResult({
        readiness: "partial",
        evidence: ["plant-profile", "stage"],
        missing: ["plant-photo", "recent-manual-sensor-snapshot"],
      }),
    );
    expect(v.allowStart).toBe(true);
    expect(v.variant).toBe("partial");
    expect(v.preparation?.readinessNotice).toBe(
      AI_DOCTOR_SAFE_REVIEW_PARTIAL_NOTICE,
    );
    expect(v.preparation?.title).toBe(AI_DOCTOR_SAFE_REVIEW_TITLE);
    expect(v.preparation?.noRequestNotice).toBe(
      AI_DOCTOR_SAFE_REVIEW_NO_REQUEST_NOTICE,
    );
  });

  it("allows strong review with strong-context copy", () => {
    const v = buildAiDoctorSafeReviewStart(
      baseResult({
        readiness: "strong",
        evidence: ["plant-profile", "stage", "fresh-manual-sensor-snapshot"],
      }),
    );
    expect(v.allowStart).toBe(true);
    expect(v.variant).toBe("strong");
    expect(v.preparation?.readinessNotice).toBe(
      AI_DOCTOR_SAFE_REVIEW_STRONG_NOTICE,
    );
  });

  it("includes evidence and missing information labels", () => {
    const v = buildAiDoctorSafeReviewStart(
      baseResult({
        readiness: "partial",
        evidence: ["stage"],
        missing: ["plant-photo"],
      }),
    );
    expect(v.preparation?.evidence.map((e) => e.code)).toEqual(["stage"]);
    expect(v.preparation?.missing.map((m) => m.code)).toEqual(["plant-photo"]);
    expect(v.preparation?.evidence[0].label).toMatch(/Stage/i);
    expect(v.preparation?.missing[0].label).toMatch(/Plant photo/i);
  });

  it("summarizes recent manual sensor snapshots", () => {
    const v = buildAiDoctorSafeReviewStart(
      baseResult({
        readiness: "strong",
        evidence: ["fresh-manual-sensor-snapshot"],
        counts: {
          recentEvents: 3,
          recentWateringOrFeeding: 1,
          recentManualSnapshots: 2,
          recentWarnings: 0,
        },
      }),
    );
    expect(v.preparation?.snapshotSummary).toMatch(/2 manual sensor snapshots/);
    expect(v.preparation?.snapshotSummary).toMatch(/within 48 hours/);
  });

  it("summarizes recent warnings", () => {
    const v = buildAiDoctorSafeReviewStart(
      baseResult({
        readiness: "partial",
        counts: {
          recentEvents: 1,
          recentWateringOrFeeding: 0,
          recentManualSnapshots: 0,
          recentWarnings: 3,
        },
      }),
    );
    expect(v.preparation?.warningsSummary).toMatch(/3 recent warnings/);
  });

  it("emits no banned wording in any visible field", () => {
    const v = buildAiDoctorSafeReviewStart(
      baseResult({
        readiness: "partial",
        evidence: ["plant-profile", "stage", "recent-warnings"],
        missing: ["plant-photo", "recent-manual-sensor-snapshot"],
        counts: {
          recentEvents: 2,
          recentWateringOrFeeding: 1,
          recentManualSnapshots: 0,
          recentWarnings: 1,
        },
      }),
    );
    const text = JSON.stringify(v);
    expect(text).not.toMatch(BANNED);
  });
});
