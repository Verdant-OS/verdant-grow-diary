import { describe, it, expect } from "vitest";
import {
  buildPhenoKeeperLineageView,
  buildPhenoKeeperLineage,
  type PhenoKeeperInput,
} from "@/lib/phenoKeeperLineageViewModel";

function keeper(overrides: Partial<PhenoKeeperInput> = {}): PhenoKeeperInput {
  return {
    keeperId: "k1",
    keeperName: "Blue Dream Keeper",
    huntId: "h1",
    huntName: "Blue Dream Hunt",
    sourcePlantId: "p1",
    sourceCandidateLabel: "BD #1",
    ...overrides,
  };
}

describe("buildPhenoKeeperLineageView", () => {
  it("presents origin and downstream grows (newest first), counting them", () => {
    const view = buildPhenoKeeperLineageView(keeper(), [
      { growId: "g-old", growName: "Winter Run", startedAt: "2026-01-01T00:00:00Z" },
      { growId: "g-new", growName: "Spring Run", startedAt: "2026-04-01T00:00:00Z" },
    ]);
    expect(view.origin).toMatchObject({
      huntId: "h1",
      huntName: "Blue Dream Hunt",
      sourcePlantId: "p1",
      sourceCandidateLabel: "BD #1",
    });
    expect(view.downstreamGrows.map((g) => g.growId)).toEqual(["g-new", "g-old"]);
    expect(view.downstreamGrowCount).toBe(2);
    expect(view.missing).toEqual([]);
  });

  it("dedupes downstream grows by id and sorts dateless grows last", () => {
    const view = buildPhenoKeeperLineageView(keeper(), [
      { growId: "g1", startedAt: "2026-02-01T00:00:00Z" },
      { growId: "g1", startedAt: "2026-02-01T00:00:00Z" }, // dup
      { growId: "g2", startedAt: null }, // no date → last
    ]);
    expect(view.downstreamGrows.map((g) => g.growId)).toEqual(["g1", "g2"]);
  });

  it("flags no_downstream_grows when nothing is linked yet", () => {
    const view = buildPhenoKeeperLineageView(keeper(), []);
    expect(view.missing.map((m) => m.code)).toContain("no_downstream_grows");
  });

  it("flags no_source_candidate when the origin plant is absent", () => {
    const view = buildPhenoKeeperLineageView(keeper({ sourcePlantId: null }), [
      { growId: "g1", startedAt: "2026-02-01T00:00:00Z" },
    ]);
    expect(view.origin.sourcePlantId).toBeNull();
    expect(view.missing.map((m) => m.code)).toContain("no_source_candidate");
    expect(view.missing.map((m) => m.code)).not.toContain("no_downstream_grows");
  });

  it("falls back to keeperId when the name is blank; skips garbage downstream rows", () => {
    const view = buildPhenoKeeperLineageView(keeper({ keeperId: "kx", keeperName: "  " }), [
      { growId: "" } as never,
      { growId: "g9", growName: "Real Run" },
    ]);
    expect(view.keeperName).toBe("kx");
    expect(view.downstreamGrows.map((g) => g.growId)).toEqual(["g9"]);
  });
});

describe("buildPhenoKeeperLineage (set)", () => {
  it("maps keepers with their associated grows, preserving order", () => {
    const out = buildPhenoKeeperLineage([keeper({ keeperId: "a" }), keeper({ keeperId: "b" })], {
      a: [{ growId: "ga", startedAt: "2026-03-01T00:00:00Z" }],
      b: [],
    });
    expect(out.map((v) => v.keeperId)).toEqual(["a", "b"]);
    expect(out[0].downstreamGrowCount).toBe(1);
    expect(out[1].downstreamGrowCount).toBe(0);
  });

  it("handles null/undefined keepers and a missing map without throwing", () => {
    expect(buildPhenoKeeperLineage(null)).toEqual([]);
    expect(buildPhenoKeeperLineage(undefined)).toEqual([]);
    const out = buildPhenoKeeperLineage([keeper({ keeperId: "a" }), { keeperId: "" } as never]);
    expect(out.map((v) => v.keeperId)).toEqual(["a"]);
  });
});
