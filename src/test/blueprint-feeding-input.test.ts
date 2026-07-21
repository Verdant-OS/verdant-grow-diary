/**
 * Tests for selectLatestInputEcPh — picks the newest logged input EC and pH
 * from newest-first root-zone observations.
 */
import { describe, it, expect } from "vitest";

import { selectLatestInputEcPh } from "@/lib/blueprintFeedingInput";
import type { RootZoneObservationV1 } from "@/lib/rootZoneObservationRules";

/** Minimal observation with only the input EC/pH metrics the selector reads. */
function obs(inputEcMsCm: number | null, inputPh: number | null): RootZoneObservationV1 {
  return {
    metrics: { inputEcMsCm, inputPh },
  } as unknown as RootZoneObservationV1;
}

describe("selectLatestInputEcPh", () => {
  it("returns nulls for no observations", () => {
    expect(selectLatestInputEcPh([])).toEqual({ ec: null, ph: null });
  });

  it("takes both from the newest observation when it has them", () => {
    expect(selectLatestInputEcPh([obs(1.8, 6.0), obs(1.2, 5.8)])).toEqual({
      ec: 1.8,
      ph: 6.0,
    });
  });

  it("falls back to older observations per-metric when the newest lacks one", () => {
    // newest has EC but no pH; next has pH
    expect(selectLatestInputEcPh([obs(2.0, null), obs(1.0, 5.9)])).toEqual({
      ec: 2.0,
      ph: 5.9,
    });
    // newest has pH but no EC; next has EC
    expect(selectLatestInputEcPh([obs(null, 6.1), obs(1.4, 5.7)])).toEqual({
      ec: 1.4,
      ph: 6.1,
    });
  });

  it("returns nulls when no observation carries the input metrics", () => {
    expect(selectLatestInputEcPh([obs(null, null), obs(null, null)])).toEqual({
      ec: null,
      ph: null,
    });
  });

  it("stops at the first non-null value for each metric (uses the newest)", () => {
    expect(selectLatestInputEcPh([obs(1.1, 5.5), obs(2.2, 6.6)])).toEqual({
      ec: 1.1,
      ph: 5.5,
    });
  });
});
