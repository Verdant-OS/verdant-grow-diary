/**
 * phenoComparisonViewModel — pure view-model unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildPhenoComparisonView,
  type PhenoCandidateInput,
} from "@/lib/phenoComparisonViewModel";

const base: PhenoCandidateInput = {
  candidateId: "a",
  candidateLabel: "A",
  requireEcPh: true,
  requirePpfd: true,
  quickLogEntries: [{ id: "q1", at: "2026-06-20T00:00:00Z", kind: "note" }],
  photos: [{ id: "p1" }],
  sensorSnapshots: [
    {
      id: "s1",
      source: "live",
      capturedAt: "2026-06-20T00:00:00Z",
      tempF: 75,
      rh: 55,
      vpd: 1.1,
      ec: 1.5,
      ph: 6.1,
      ppfd: 600,
    },
  ],
};

describe("buildPhenoComparisonView", () => {
  it("errors on fewer than two candidates", () => {
    const v = buildPhenoComparisonView([base]);
    expect(v.ok).toBe(false);
    expect(v.error).toBe("too_few_candidates");
  });

  it("aggregates two candidates deterministically", () => {
    const v = buildPhenoComparisonView([
      { ...base, candidateId: "b", candidateLabel: "B" },
      base,
    ]);
    expect(v.ok).toBe(true);
    expect(v.candidates.map((c) => c.candidateId)).toEqual(["a", "b"]);
  });

  it("flags stale + invalid sources and missing metrics; never healthy", () => {
    const v = buildPhenoComparisonView([
      base,
      {
        candidateId: "z",
        candidateLabel: "Z",
        requireEcPh: true,
        requirePpfd: true,
        photos: [],
        sensorSnapshots: [
          { id: "st", source: "stale", capturedAt: "2024-01-01T00:00:00Z" },
          { id: "iv", source: "invalid" },
          { id: "wat", source: "not-a-real-source" },
        ],
      },
    ]);
    const z = v.candidates.find((c) => c.candidateId === "z")!;
    expect(z.hasAnyTrustedSensor).toBe(false);
    expect(z.missing.map((m) => m.code)).toEqual(
      expect.arrayContaining(["no_photo", "no_diary"]),
    );
    const stale = z.sensorSnapshots.find((s) => s.id === "st")!;
    expect(stale.source).toBe("stale");
    expect(stale.missing.map((m) => m.code)).toContain("stale_reading");
    const inv = z.sensorSnapshots.find((s) => s.id === "iv")!;
    expect(inv.source).toBe("invalid");
    expect(inv.missing.map((m) => m.code)).toContain("invalid_reading");
    // Unknown vendor label normalizes to invalid, never to a healthy label.
    const wat = z.sensorSnapshots.find((s) => s.id === "wat")!;
    expect(wat.source).toBe("invalid");
    expect(wat.trusted).toBe(false);
  });
});
