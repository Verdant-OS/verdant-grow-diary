import { describe, it, expect } from "vitest";
import { getGeneticParentage } from "@/lib/genetics/geneticParentage";
import { createBreedingEvent } from "./breedingEventMocks";

describe("geneticParentage helper", () => {
  it("Resolves donor and receiver IDs from pollination details", () => {
    const pollination = createBreedingEvent("pollination", -10, {
      donor_plant_id: "donor_1",
      receiver_plant_ids: ["receiver_1"]
    });
    
    const res = getGeneticParentage({ events: [pollination] });
    expect(res.donor_plant_id).toBe("donor_1");
    expect(res.receiver_plant_ids).toEqual(["receiver_1"]);
    expect(res.source_pollination_event_id).toBe(pollination.id);
    expect(res.confidence).toBe("medium");
  });

  it("Resolves parentage for a harvestEventId", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      donor_plant_id: "donor_1",
      receiver_plant_ids: ["receiver_1"]
    });
    const harvest = createBreedingEvent("cross_harvest", 0, {
      seed_batch_id: "batch1",
    });

    const res = getGeneticParentage({
      events: [pollination, harvest],
      harvestEventId: harvest.id
    });
    expect(res.donor_plant_id).toBe("donor_1");
    expect(res.receiver_plant_ids).toEqual(["receiver_1"]);
    expect(res.source_harvest_event_id).toBe(harvest.id);
    expect(res.source_pollination_event_id).toBe(pollination.id);
    expect(res.confidence).toBe("high");
  });

  it("Resolves parentage for a seedBatchId if present", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      donor_plant_id: "donor_2",
      receiver_plant_ids: ["receiver_2"]
    });
    const harvest = createBreedingEvent("cross_harvest", 0, {
      seed_batch_id: "batch2",
    });

    const res = getGeneticParentage({
      events: [pollination, harvest],
      seedBatchId: "batch2"
    });
    expect(res.donor_plant_id).toBe("donor_2");
    expect(res.source_harvest_event_id).toBe(harvest.id);
    expect(res.confidence).toBe("high");
  });

  it("Resolves parentage for an offspring plant listed in cross_harvest details.offspring_plant_ids", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      donor_plant_id: "donor_3",
      receiver_plant_ids: ["receiver_3"]
    });
    const harvest = createBreedingEvent("cross_harvest", 0, {
      offspring_plant_ids: ["offspring_1", "offspring_2"],
    });

    const res = getGeneticParentage({
      events: [pollination, harvest],
      plantId: "offspring_2"
    });
    expect(res.donor_plant_id).toBe("donor_3");
    expect(res.source_harvest_event_id).toBe(harvest.id);
    expect(res.confidence).toBe("high");
    expect(res.missing_links).not.toContain("offspring_link");
  });

  it("Returns high confidence when harvest and pollination are clearly linked", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      donor_plant_id: "donor_1",
      receiver_plant_ids: ["receiver_1"]
    });
    const harvest = createBreedingEvent("cross_harvest", 0, {
      seed_batch_id: "batch1",
    });
    const res = getGeneticParentage({
      events: [pollination, harvest],
      harvestEventId: harvest.id
    });
    expect(res.confidence).toBe("high");
  });

  it("Returns medium confidence when only pollination exists", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      donor_plant_id: "donor_1",
      receiver_plant_ids: ["receiver_1"]
    });
    const res = getGeneticParentage({
      events: [pollination],
      plantId: "receiver_1"
    });
    expect(res.confidence).toBe("medium");
  });

  it("Reports missing donor_plant_id", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      receiver_plant_ids: ["receiver_1"]
    });
    const res = getGeneticParentage({ events: [pollination] });
    expect(res.missing_links).toContain("donor_plant_id");
  });

  it("Reports missing receiver_plant_ids", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      donor_plant_id: "donor_1"
    });
    const res = getGeneticParentage({ events: [pollination] });
    expect(res.missing_links).toContain("receiver_plant_ids");
  });

  it("Reports missing pollination_event when no pollination exists", () => {
    const harvest = createBreedingEvent("cross_harvest", 0, {
      seed_batch_id: "batch1",
    });
    const res = getGeneticParentage({ events: [harvest], harvestEventId: harvest.id });
    expect(res.missing_links).toContain("pollination_event");
    expect(res.confidence).toBe("low");
  });

  it("Reports missing cross_harvest_event when no harvest exists", () => {
    const pollination = createBreedingEvent("pollination", -40, {
      donor_plant_id: "donor_1",
      receiver_plant_ids: ["receiver_1"]
    });
    const res = getGeneticParentage({ events: [pollination] });
    expect(res.missing_links).toContain("cross_harvest_event");
  });

  it("Does not throw on malformed details", () => {
    const badPol = createBreedingEvent("pollination", -10, null as any);
    const badHarv = createBreedingEvent("cross_harvest", 0, "string" as any);
    expect(() => getGeneticParentage({ events: [badPol, badHarv], harvestEventId: badHarv.id })).not.toThrow();
  });

  it("Does not invent parent IDs", () => {
    const emptyPol = createBreedingEvent("pollination", -10, {});
    const res = getGeneticParentage({ events: [emptyPol] });
    expect(res.donor_plant_id).toBeUndefined();
    expect(res.receiver_plant_ids).toBeUndefined();
  });

  it("Handles multiple pollination events by choosing the closest pollination before the selected harvest", () => {
    const pol1 = createBreedingEvent("pollination", -60, { donor_plant_id: "donor_old" });
    const pol2 = createBreedingEvent("pollination", -30, { donor_plant_id: "donor_correct" });
    const pol3 = createBreedingEvent("pollination", +10, { donor_plant_id: "donor_future" }); // after harvest
    const harvest = createBreedingEvent("cross_harvest", 0, { seed_batch_id: "batch" });
    
    const res = getGeneticParentage({
      events: [pol1, pol2, pol3, harvest],
      harvestEventId: harvest.id
    });
    expect(res.donor_plant_id).toBe("donor_correct");
    expect(res.source_pollination_event_id).toBe(pol2.id);
  });

  it("Handles events out of chronological order", () => {
    const pol = createBreedingEvent("pollination", -30, { donor_plant_id: "donor_1" });
    const harvest = createBreedingEvent("cross_harvest", 0, { seed_batch_id: "batch" });
    
    // Pass them in reverse chronological order in the array
    const res = getGeneticParentage({
      events: [harvest, pol],
      harvestEventId: harvest.id
    });
    expect(res.donor_plant_id).toBe("donor_1");
  });
});
