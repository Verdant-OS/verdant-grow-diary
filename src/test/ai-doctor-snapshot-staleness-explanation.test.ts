/**
 * buildAiDoctorSnapshotStalenessExplanation — deterministic unit coverage.
 *
 * Pins the lib's whole contract:
 *  - cutoffAtIso is the exact instant `now - AI_DOCTOR_SNAPSHOT_FRESH_MS`
 *    in EVERY branch (null / unparseable / fresh / stale),
 *  - staleness is STRICT `>` — a snapshot exactly 48h old is NOT stale,
 *    matching evaluateAiDoctorContext's inclusive `<=` fresh check,
 *  - the stale sentence is a deterministic literal under the default
 *    identity formatter (the reason a grower sees is reproducible),
 *  - custom formatter is applied to BOTH timestamps,
 *  - invalid now/snapshotFreshMs inputs fall back instead of exploding.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorSnapshotStalenessExplanation,
  type AiDoctorSnapshotStalenessExplanation,
} from "@/lib/aiDoctorSnapshotStalenessExplanationViewModel";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const CUTOFF_ISO = new Date(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS).toISOString();

describe("buildAiDoctorSnapshotStalenessExplanation — cutoff instant", () => {
  it("computes cutoffAtIso as exactly now - 48h with the shared constant", () => {
    // The 48h window comes from AI_DOCTOR_CONTEXT_READINESS_CONFIG; this
    // pins the arithmetic (2026-06-01T12:00Z minus 48h) to the instant.
    expect(CUTOFF_ISO).toBe("2026-05-30T12:00:00.000Z");
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: null,
      now: NOW,
    });
    expect(res.cutoffAtIso).toBe(CUTOFF_ISO);
  });

  it("returns cutoffAtIso in every branch, including unparseable and fresh", () => {
    const branches: AiDoctorSnapshotStalenessExplanation[] = [
      buildAiDoctorSnapshotStalenessExplanation({ latestSnapshotAtIso: null, now: NOW }),
      buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: "not-a-timestamp",
        now: NOW,
      }),
      buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: "2026-06-01T11:00:00.000Z",
        now: NOW,
      }),
      buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: "2026-05-01T00:00:00.000Z",
        now: NOW,
      }),
    ];
    for (const res of branches) {
      expect(res.cutoffAtIso).toBe(CUTOFF_ISO);
    }
  });
});

describe("buildAiDoctorSnapshotStalenessExplanation — strict > boundary", () => {
  it("a snapshot EXACTLY at the 48h cutoff is not stale (agrees with the inclusive fresh rule)", () => {
    const exactlyAtCutoff = new Date(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS).toISOString();
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: exactlyAtCutoff,
      now: NOW,
    });
    expect(res.isStale).toBe(false);
    expect(res.sentence).toBe("");
    expect(res.snapshotAtIso).toBe(exactlyAtCutoff);
  });

  it("one millisecond older than the cutoff is stale", () => {
    const oneMsPastCutoff = new Date(
      NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS - 1,
    ).toISOString();
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: oneMsPastCutoff,
      now: NOW,
    });
    expect(res.isStale).toBe(true);
    expect(res.snapshotAtIso).toBe(oneMsPastCutoff);
    expect(res.sentence.length).toBeGreaterThan(0);
  });

  it("a clearly recent snapshot is not stale", () => {
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: "2026-06-01T10:00:00.000Z",
      now: NOW,
    });
    expect(res.isStale).toBe(false);
    expect(res.sentence).toBe("");
  });
});

describe("buildAiDoctorSnapshotStalenessExplanation — deterministic reason", () => {
  it("produces the exact stale sentence under the default identity formatter", () => {
    const snapIso = "2026-05-25T08:30:00.000Z";
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: snapIso,
      now: NOW,
    });
    expect(res.isStale).toBe(true);
    expect(res.sentence).toBe(
      `Your most recent manual sensor snapshot (${snapIso}) is older ` +
        `than the 48h freshness cutoff (${CUTOFF_ISO}). ` +
        `Add a fresh sensor snapshot to unblock a cautious AI Doctor review.`,
    );
  });

  it("is deterministic: identical args give deeply equal results", () => {
    const args = {
      latestSnapshotAtIso: "2026-05-20T00:00:00.000Z",
      now: NOW,
    };
    expect(buildAiDoctorSnapshotStalenessExplanation(args)).toEqual(
      buildAiDoctorSnapshotStalenessExplanation(args),
    );
  });

  it("names the rounded hour count for a custom freshness window", () => {
    const oneHourMs = 3_600_000;
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: new Date(NOW - 2 * oneHourMs).toISOString(),
      now: NOW,
      snapshotFreshMs: oneHourMs,
    });
    expect(res.isStale).toBe(true);
    expect(res.sentence).toContain("the 1h freshness cutoff");
    expect(res.cutoffAtIso).toBe(new Date(NOW - oneHourMs).toISOString());
  });

  it("applies a custom formatter to BOTH the snapshot and cutoff timestamps", () => {
    const snapIso = "2026-05-25T08:30:00.000Z";
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: snapIso,
      now: NOW,
      formatDateTime: (iso) => `[${iso}]`,
    });
    expect(res.sentence).toContain(`([${snapIso}])`);
    expect(res.sentence).toContain(`([${CUTOFF_ISO}])`);
    // Raw fields stay unformatted ISO for machine consumers.
    expect(res.snapshotAtIso).toBe(snapIso);
    expect(res.cutoffAtIso).toBe(CUTOFF_ISO);
  });
});

describe("buildAiDoctorSnapshotStalenessExplanation — missing / invalid inputs", () => {
  it("null snapshot: not stale, null snapshotAtIso, empty sentence", () => {
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: null,
      now: NOW,
    });
    expect(res).toEqual({
      isStale: false,
      snapshotAtIso: null,
      cutoffAtIso: CUTOFF_ISO,
      sentence: "",
    });
  });

  it("unparseable snapshot ISO: not stale, raw string preserved, empty sentence", () => {
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: "yesterday-ish",
      now: NOW,
    });
    expect(res.isStale).toBe(false);
    expect(res.snapshotAtIso).toBe("yesterday-ish");
    expect(res.sentence).toBe("");
  });

  it("non-finite `now` falls back without throwing and still returns the full shape", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: "2026-05-25T08:30:00.000Z",
        now: bad,
      });
      expect(typeof res.isStale).toBe("boolean");
      expect(typeof res.cutoffAtIso).toBe("string");
      expect(Number.isFinite(Date.parse(res.cutoffAtIso))).toBe(true);
    }
  });

  it("non-positive or non-finite snapshotFreshMs falls back to the shared 48h window", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: null,
        now: NOW,
        snapshotFreshMs: bad,
      });
      expect(res.cutoffAtIso).toBe(CUTOFF_ISO);
    }
  });
});

describe("buildAiDoctorSnapshotStalenessExplanation — near-boundary ms offsets", () => {
  // Symmetric sweep around the exact 48h cutoff. Every offset <= 0 must be
  // fresh (inclusive), every offset > 0 must be stale. No off-by-one, no
  // hidden rounding, no drift as offset magnitude grows.
  const FRESH_OFFSETS_MS = [0, -1, -2, -100, -999, -1_000, -60_000];
  const STALE_OFFSETS_MS = [1, 2, 100, 999, 1_000, 60_000, 3_600_000];

  for (const offset of FRESH_OFFSETS_MS) {
    it(`offset ${offset}ms from cutoff → fresh (inclusive boundary)`, () => {
      const snap = new Date(
        NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS + Math.abs(offset),
      ).toISOString();
      // Equivalent: snapshot age = 48h - |offset|, so age <= 48h.
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: snap,
        now: NOW,
      });
      expect(res.isStale).toBe(false);
      expect(res.sentence).toBe("");
      expect(res.snapshotAtIso).toBe(snap);
      expect(res.cutoffAtIso).toBe(CUTOFF_ISO);
    });
  }

  for (const offset of STALE_OFFSETS_MS) {
    it(`offset ${offset}ms past cutoff → stale (strict >)`, () => {
      const snap = new Date(
        NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS - offset,
      ).toISOString();
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: snap,
        now: NOW,
      });
      expect(res.isStale).toBe(true);
      expect(res.snapshotAtIso).toBe(snap);
      expect(res.cutoffAtIso).toBe(CUTOFF_ISO);
      expect(res.sentence).toContain("48h freshness cutoff");
    });
  }

  it("sweeping ±3ms across the cutoff never flips outside the strict > rule", () => {
    // Dense sweep: at every integer ms in [-3, +3] the classification is
    // fully determined by sign, not by any surrounding jitter.
    for (let d = -3; d <= 3; d++) {
      const snap = new Date(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS - d).toISOString();
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: snap,
        now: NOW,
      });
      // d > 0 → snapshot is (48h + d)ms old → stale.
      // d <= 0 → snapshot is (48h - |d|)ms old (or exactly 48h) → fresh.
      expect(res.isStale).toBe(d > 0);
    }
  });
});

describe("buildAiDoctorSnapshotStalenessExplanation — leap-second-like inputs", () => {
  // V8/Node treat "…:59:60Z" as NaN (no leap-second support in ECMAScript
  // Date). The helper must degrade to the unparseable branch — never
  // flip a snapshot into stale via a NaN comparison.
  const LEAP_STRINGS = [
    "2016-12-31T23:59:60Z",
    "2016-12-31T23:59:60.000Z",
    "2016-12-31T23:59:60.500Z",
    "2015-06-30T23:59:60Z",
  ];

  for (const leap of LEAP_STRINGS) {
    it(`leap-second-like input "${leap}" is treated as unparseable (not stale)`, () => {
      // Guard the platform assumption so a future engine change surfaces
      // here instead of silently altering the helper's behavior.
      expect(Number.isFinite(Date.parse(leap))).toBe(false);
      const res = buildAiDoctorSnapshotStalenessExplanation({
        latestSnapshotAtIso: leap,
        now: NOW,
      });
      expect(res).toEqual({
        isStale: false,
        snapshotAtIso: leap,
        cutoffAtIso: CUTOFF_ISO,
        sentence: "",
      });
    });
  }

  it("a plausible pre-leap-second timestamp one second earlier is classified normally", () => {
    // Sanity: the surrounding real second parses fine and is stale (well
    // past the 48h window from NOW=2026-06-01).
    const realIso = "2016-12-31T23:59:59.000Z";
    expect(Number.isFinite(Date.parse(realIso))).toBe(true);
    const res = buildAiDoctorSnapshotStalenessExplanation({
      latestSnapshotAtIso: realIso,
      now: NOW,
    });
    expect(res.isStale).toBe(true);
    expect(res.snapshotAtIso).toBe(realIso);
  });
});
