/**
 * Targeted: buildAiDoctorReadinessBlockedExplanation — order determinism.
 *
 * Guarantees that the blocking evidence categories are ALWAYS emitted in
 * the same stable, user-friendly order — regardless of the order they
 * appear in the input `missing` array, regardless of duplicates, and
 * regardless of unrelated soft-miss codes interleaved between them.
 *
 * Canonical order (source of truth: AI_DOCTOR_READINESS_BLOCKING_CODES):
 *   1. plant-profile
 *   2. recent-timeline-activity
 *   3. recent-manual-sensor-snapshot
 *
 * Pure: no React, no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorReadinessBlockedExplanation,
  AI_DOCTOR_READINESS_BLOCKING_CODES,
  type AiDoctorReadinessBlockingCode,
} from "@/lib/aiDoctorReadinessGateViewModel";

const CANONICAL: readonly AiDoctorReadinessBlockingCode[] =
  AI_DOCTOR_READINESS_BLOCKING_CODES;

const CANONICAL_SENTENCE_FRAGMENT =
  "a plant profile, a recent note, watering, feeding, or photo (last 7 days), and a recent manual sensor snapshot (last 7 days)";

// Every permutation of the 3 blocking codes.
const PERMUTATIONS: AiDoctorReadinessBlockingCode[][] = [
  ["plant-profile", "recent-timeline-activity", "recent-manual-sensor-snapshot"],
  ["plant-profile", "recent-manual-sensor-snapshot", "recent-timeline-activity"],
  ["recent-timeline-activity", "plant-profile", "recent-manual-sensor-snapshot"],
  ["recent-timeline-activity", "recent-manual-sensor-snapshot", "plant-profile"],
  ["recent-manual-sensor-snapshot", "plant-profile", "recent-timeline-activity"],
  ["recent-manual-sensor-snapshot", "recent-timeline-activity", "plant-profile"],
];

describe("buildAiDoctorReadinessBlockedExplanation — order determinism", () => {
  it("emits canonical order for every permutation of all 3 blocking codes", () => {
    for (const perm of PERMUTATIONS) {
      const r = buildAiDoctorReadinessBlockedExplanation({
        readiness: "insufficient",
        missing: perm,
        nextActionLabel: "Add context",
      });
      expect(r.blockingCodes).toEqual([...CANONICAL]);
      expect(r.sentence).toContain(CANONICAL_SENTENCE_FRAGMENT);
    }
  });

  it("emits canonical relative order for every 2-code subset regardless of input order", () => {
    const pairs: [AiDoctorReadinessBlockingCode, AiDoctorReadinessBlockingCode][] = [
      ["plant-profile", "recent-timeline-activity"],
      ["recent-timeline-activity", "plant-profile"],
      ["plant-profile", "recent-manual-sensor-snapshot"],
      ["recent-manual-sensor-snapshot", "plant-profile"],
      ["recent-timeline-activity", "recent-manual-sensor-snapshot"],
      ["recent-manual-sensor-snapshot", "recent-timeline-activity"],
    ];
    for (const pair of pairs) {
      const r = buildAiDoctorReadinessBlockedExplanation({
        readiness: "insufficient",
        missing: pair,
        nextActionLabel: "Add context",
      });
      const expected = CANONICAL.filter((c) => pair.includes(c));
      expect(r.blockingCodes).toEqual(expected);
      // Joined with " and " and no trailing comma.
      expect(r.sentence).toContain(
        `${r.blockingLabels[0]} and ${r.blockingLabels[1]}`,
      );
    }
  });

  it("ignores duplicates in `missing` without disturbing canonical order", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: [
        "recent-manual-sensor-snapshot",
        "recent-manual-sensor-snapshot",
        "plant-profile",
        "recent-timeline-activity",
        "plant-profile",
      ],
      nextActionLabel: "Add context",
    });
    expect(r.blockingCodes).toEqual([...CANONICAL]);
  });

  it("keeps canonical order when soft-miss codes are interleaved", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: [
        "strain",
        "recent-manual-sensor-snapshot",
        "plant-photo",
        "plant-profile",
        "medium",
        "recent-timeline-activity",
        "stage",
      ],
      nextActionLabel: "Add context",
    });
    expect(r.blockingCodes).toEqual([...CANONICAL]);
    // Soft-miss codes must never leak into blocking labels or sentence.
    for (const soft of ["strain", "stage", "medium", "plant-photo"]) {
      expect(r.blockingLabels.join("|")).not.toContain(soft);
    }
  });

  it("produces byte-identical output across 50 repeated evaluations (stability)", () => {
    const args = {
      readiness: "insufficient" as const,
      missing: [
        "recent-manual-sensor-snapshot",
        "plant-profile",
        "recent-timeline-activity",
      ],
      nextActionLabel: "Add context",
    };
    const first = buildAiDoctorReadinessBlockedExplanation(args);
    for (let i = 0; i < 50; i++) {
      expect(buildAiDoctorReadinessBlockedExplanation(args)).toEqual(first);
    }
  });

  it("produces the same output whether `missing` is a fresh array or a shared reference", () => {
    const shared: string[] = [
      "recent-timeline-activity",
      "plant-profile",
      "recent-manual-sensor-snapshot",
    ];
    const a = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: shared,
      nextActionLabel: "Add context",
    });
    const b = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: [...shared],
      nextActionLabel: "Add context",
    });
    expect(a).toEqual(b);
  });

  it("does not mutate the input `missing` array", () => {
    const input: string[] = [
      "recent-manual-sensor-snapshot",
      "plant-profile",
      "recent-timeline-activity",
      "strain",
    ];
    const snapshot = [...input];
    buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: input,
      nextActionLabel: "Add context",
    });
    expect(input).toEqual(snapshot);
  });
});
