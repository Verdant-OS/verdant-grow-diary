// Tranche B+ slice B4a — the /doctor context-consumer contract (D-B6, D4).
//
// The Sensors loop card can only ever emit `{ growId, tentId }`. This module
// is the CONSUMING half: it validates that carried scope against rows the
// grower actually owns and fails closed on anything else. It never selects a
// plant — "Verdant will not guess which plant you mean" is doctrine, so the
// scope may reorder and annotate the option list but must never remove a
// choice from it.
import { describe, expect, it } from "vitest";

import {
  partitionDoctorEntryOptionsByTent,
  resolveDoctorStartScope,
} from "@/lib/doctorStartContextRules";

const GROWS = [
  { id: "grow-1", name: "Autumn Run" },
  { id: "grow-2", name: "Side Tent" },
];
const TENTS = [
  { id: "tent-1", name: "Tent A", grow_id: "grow-1" },
  { id: "tent-2", name: "Tent B", grow_id: "grow-2" },
];

function scope(over: Record<string, unknown> = {}) {
  return resolveDoctorStartScope({
    urlGrowId: "grow-1",
    urlTentId: "tent-1",
    visibleGrows: GROWS,
    visibleTents: TENTS,
    ...over,
  });
}

describe("resolveDoctorStartScope — fail-closed validation", () => {
  it("resolves a grow+tent the grower owns", () => {
    expect(scope()).toEqual({
      growId: "grow-1",
      growName: "Autumn Run",
      tentId: "tent-1",
      tentName: "Tent A",
      hasInvalidScope: false,
    });
  });

  it("treats absent params as no scope, not as invalid", () => {
    const result = scope({ urlGrowId: null, urlTentId: null });
    expect(result.growId).toBeNull();
    expect(result.tentId).toBeNull();
    expect(result.hasInvalidScope).toBe(false);
  });

  it("normalizes whitespace and treats blank as absent", () => {
    expect(scope({ urlGrowId: "  grow-1  ", urlTentId: "  tent-1  " }).tentId).toBe("tent-1");
    const blank = scope({ urlGrowId: "   ", urlTentId: "   " });
    expect(blank.growId).toBeNull();
    expect(blank.hasInvalidScope).toBe(false);
  });

  it("fails closed on a grow the grower does not own", () => {
    const result = scope({ urlGrowId: "grow-someone-else" });
    expect(result.growId).toBeNull();
    expect(result.growName).toBeNull();
    expect(result.hasInvalidScope).toBe(true);
  });

  it("fails closed on a tent the grower does not own", () => {
    const result = scope({ urlTentId: "tent-gone" });
    expect(result.tentId).toBeNull();
    expect(result.hasInvalidScope).toBe(true);
  });

  it("fails closed when the tent belongs to a DIFFERENT grow than the one carried", () => {
    // tent-2 is real and owned, but it is not in grow-1. Accepting it would
    // annotate the page with a tent from another grow.
    const result = scope({ urlGrowId: "grow-1", urlTentId: "tent-2" });
    expect(result.growId).toBe("grow-1");
    expect(result.tentId).toBeNull();
    expect(result.hasInvalidScope).toBe(true);
  });

  it("accepts a tent with no carried grow, and derives the grow from the tent", () => {
    const result = scope({ urlGrowId: null, urlTentId: "tent-2" });
    expect(result.tentId).toBe("tent-2");
    expect(result.growId).toBe("grow-2");
    expect(result.hasInvalidScope).toBe(false);
  });

  it("never throws on null/empty/malformed row sets", () => {
    for (const rows of [null, undefined, []]) {
      const result = resolveDoctorStartScope({
        urlGrowId: "grow-1",
        urlTentId: "tent-1",
        visibleGrows: rows as never,
        visibleTents: rows as never,
      });
      expect(result.tentId).toBeNull();
      expect(result.hasInvalidScope).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(scope()).toEqual(scope());
  });
});

const OPTIONS = [
  { id: "p1", name: "Blue Dream", details: null, href: "/plants/p1" },
  { id: "p2", name: "Gelato", details: null, href: "/plants/p2" },
  { id: "p3", name: "Zkittlez", details: null, href: "/plants/p3" },
];
const PLANTS = [
  { id: "p1", tent_id: "tent-1" },
  { id: "p2", tent_id: "tent-2" },
  { id: "p3", tent_id: null },
];

describe("partitionDoctorEntryOptionsByTent — annotate, never remove", () => {
  it("splits in-tent plants from the rest without dropping any option", () => {
    const out = partitionDoctorEntryOptionsByTent({
      options: OPTIONS,
      plants: PLANTS,
      tentId: "tent-1",
    });
    expect(out.inScope.map((o) => o.id)).toEqual(["p1"]);
    expect(out.others.map((o) => o.id)).toEqual(["p2", "p3"]);
    // The union is lossless — the grower can still choose any plant.
    expect([...out.inScope, ...out.others]).toHaveLength(OPTIONS.length);
  });

  it("puts everything in `others` when there is no tent scope", () => {
    const out = partitionDoctorEntryOptionsByTent({
      options: OPTIONS,
      plants: PLANTS,
      tentId: null,
    });
    expect(out.inScope).toEqual([]);
    expect(out.others.map((o) => o.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("puts everything in `others` when the tent matches no plant", () => {
    const out = partitionDoctorEntryOptionsByTent({
      options: OPTIONS,
      plants: PLANTS,
      tentId: "tent-empty",
    });
    expect(out.inScope).toEqual([]);
    expect(out.others).toHaveLength(3);
  });

  it("preserves the builder's ordering within each partition", () => {
    const out = partitionDoctorEntryOptionsByTent({
      options: OPTIONS,
      plants: [
        { id: "p1", tent_id: "tent-1" },
        { id: "p3", tent_id: "tent-1" },
      ],
      tentId: "tent-1",
    });
    expect(out.inScope.map((o) => o.id)).toEqual(["p1", "p3"]);
  });

  it("accepts the camelCase tentId spelling the option builder also accepts", () => {
    const out = partitionDoctorEntryOptionsByTent({
      options: OPTIONS,
      plants: [{ id: "p2", tentId: "tent-1" }],
      tentId: "tent-1",
    });
    expect(out.inScope.map((o) => o.id)).toEqual(["p2"]);
  });

  it("never throws on null/empty inputs", () => {
    const out = partitionDoctorEntryOptionsByTent({
      options: null,
      plants: null,
      tentId: "tent-1",
    });
    expect(out.inScope).toEqual([]);
    expect(out.others).toEqual([]);
  });

  it("is deterministic", () => {
    const input = { options: OPTIONS, plants: PLANTS, tentId: "tent-1" };
    expect(partitionDoctorEntryOptionsByTent(input)).toEqual(
      partitionDoctorEntryOptionsByTent(input),
    );
  });
});
