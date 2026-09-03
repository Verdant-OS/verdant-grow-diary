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
  DOCTOR_CARRIED_PLANT_UNAVAILABLE_COPY,
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

  it("fails closed on a grow the grower does not own — INCLUDING its tent", () => {
    const result = scope({ urlGrowId: "grow-someone-else" });
    expect(result.growId).toBeNull();
    expect(result.growName).toBeNull();
    expect(result.hasInvalidScope).toBe(true);
    // The pair arrives from ONE producer, so a rejected half taints the tuple.
    // Returning the tent here would let the page promote and badge that tent
    // while simultaneously saying no tent context was applied.
    expect(result.tentId).toBeNull();
    expect(result.tentName).toBeNull();
  });

  it("keeps a valid tent only when the carried grow is absent, not when it is rejected", () => {
    // Absent grow: the tent stands on its own and supplies the grow.
    const absent = scope({ urlGrowId: null, urlTentId: "tent-1" });
    expect(absent.tentId).toBe("tent-1");
    expect(absent.hasInvalidScope).toBe(false);

    // Rejected grow: the tent goes with it.
    const rejected = scope({ urlGrowId: "nope", urlTentId: "tent-1" });
    expect(rejected.tentId).toBeNull();
    expect(rejected.hasInvalidScope).toBe(true);
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

  it("rejects a tent whose grow relationship cannot be PROVEN, not just one that conflicts", () => {
    // The schema permits a null grow_id on legacy tents. Accepting such a tent
    // alongside a carried grow would apply and badge an unverified pair — a
    // fail-OPEN in a function whose whole contract is fail-closed. "Unknown
    // relationship" must be treated like "wrong relationship".
    const orphanTent = [{ id: "tent-orphan", name: "Legacy Tent", grow_id: null }];
    const result = resolveDoctorStartScope({
      urlGrowId: "grow-1",
      urlTentId: "tent-orphan",
      visibleGrows: GROWS,
      visibleTents: orphanTent,
    });
    expect(result.growId).toBe("grow-1");
    expect(result.tentId).toBeNull();
    expect(result.hasInvalidScope).toBe(true);
  });

  it("still accepts an owner-less tent when NO grow was carried to contradict it", () => {
    // Nothing to prove a relationship against, and nothing claiming one.
    const orphanTent = [{ id: "tent-orphan", name: "Legacy Tent", grow_id: null }];
    const result = resolveDoctorStartScope({
      urlGrowId: null,
      urlTentId: "tent-orphan",
      visibleGrows: GROWS,
      visibleTents: orphanTent,
    });
    expect(result.tentId).toBe("tent-orphan");
    expect(result.growId).toBeNull();
    expect(result.hasInvalidScope).toBe(false);
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
    expect(out.hasUnavailableCarriedPlant).toBe(false);
  });

  it("is deterministic", () => {
    const input = { options: OPTIONS, plants: PLANTS, tentId: "tent-1" };
    expect(partitionDoctorEntryOptionsByTent(input)).toEqual(
      partitionDoctorEntryOptionsByTent(input),
    );
  });
});

describe("partitionDoctorEntryOptionsByTent — carried plant (D-B6 / B6)", () => {
  const TENT = "tent-1";
  const OTHER_TENT = "tent-2";
  const options = [
    { id: "p1", name: "Alpha" },
    { id: "p2", name: "Bravo" },
    { id: "p3", name: "Charlie" },
  ] as never[];
  const plants = [
    { id: "p1", tent_id: TENT },
    { id: "p2", tent_id: TENT },
    { id: "p3", tent_id: OTHER_TENT },
  ] as never[];

  it("orders the carried plant FIRST within its tent group without removing anything", () => {
    const r = partitionDoctorEntryOptionsByTent({
      options,
      plants,
      tentId: TENT,
      carriedPlantId: "p2",
    });
    expect(r.carriedPlantOptionId).toBe("p2");
    expect(r.hasUnavailableCarriedPlant).toBe(false);
    expect(r.inScope.map((o) => o.id)).toEqual(["p2", "p1"]);
    // Lossless: inScope ∪ others is still exactly the input.
    expect([...r.inScope, ...r.others].map((o) => o.id).sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("fails closed for a plant in ANOTHER tent — and flags unavailable (never silent drop)", () => {
    const r = partitionDoctorEntryOptionsByTent({
      options,
      plants,
      tentId: TENT,
      carriedPlantId: "p3",
    });
    expect(r.carriedPlantOptionId).toBeNull();
    expect(r.hasUnavailableCarriedPlant).toBe(true);
    expect(r.inScope.map((o) => o.id)).toEqual(["p1", "p2"]);
  });

  it("fails closed for a plant the grower does not own, or an absent one — flagged unavailable when requested", () => {
    for (const bad of ["p9", "", "   ", null, undefined]) {
      const r = partitionDoctorEntryOptionsByTent({
        options,
        plants,
        tentId: TENT,
        carriedPlantId: bad,
      });
      expect(r.carriedPlantOptionId).toBeNull();
      // Blank/absent intent is not a cue; only a non-empty rejected id is.
      const requested = typeof bad === "string" && bad.trim().length > 0;
      expect(r.hasUnavailableCarriedPlant).toBe(requested);
      expect(r.inScope.map((o) => o.id)).toEqual(["p1", "p2"]);
    }
  });

  it("labels a plant-only carry when that plant is already in the loaded options", () => {
    const r = partitionDoctorEntryOptionsByTent({ options, plants, carriedPlantId: "p2" });
    expect(r.carriedPlantOptionId).toBe("p2");
    expect(r.hasUnavailableCarriedPlant).toBe(false);
    expect(r.inScope).toEqual([]);
    expect(r.others.map((o) => o.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("flags unavailable for a plant-only carry that is outside the loaded options", () => {
    const r = partitionDoctorEntryOptionsByTent({ options, plants, carriedPlantId: "p9" });
    expect(r.carriedPlantOptionId).toBeNull();
    expect(r.hasUnavailableCarriedPlant).toBe(true);
    expect(r.inScope).toEqual([]);
    expect(r.others.map((o) => o.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("is a LABEL, not a selection — the result exposes no selected/applied field", () => {
    // The whole safety property of B6 / Doctor-says-so: a carried plant may be
    // ordered and badged, never applied. If a future edit adds a selection
    // field here, this fails and forces the decision back through review.
    const r = partitionDoctorEntryOptionsByTent({
      options,
      plants,
      tentId: TENT,
      carriedPlantId: "p1",
    });
    expect(Object.keys(r).sort()).toEqual([
      "carriedPlantOptionId",
      "hasUnavailableCarriedPlant",
      "inScope",
      "others",
    ]);
    expect(r).not.toHaveProperty("selected");
    expect(r).not.toHaveProperty("selectedPlantId");
    expect(r).not.toHaveProperty("appliedPlantId");
    expect(r).not.toHaveProperty("autoSelectedPlantId");
  });
});

describe("DOCTOR_CARRIED_PLANT_UNAVAILABLE_COPY", () => {
  it("is pinned grower-facing copy that never invents a plant name from a UUID", () => {
    expect(DOCTOR_CARRIED_PLANT_UNAVAILABLE_COPY).toMatch(/couldn't offer for review/i);
    expect(DOCTOR_CARRIED_PLANT_UNAVAILABLE_COPY).toMatch(/No plant was selected/i);
    expect(DOCTOR_CARRIED_PLANT_UNAVAILABLE_COPY).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});
