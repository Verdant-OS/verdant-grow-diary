import { describe, it, expect } from "vitest";
import {
  isTraitObservationDetails,
  normalizeTraitExpression,
  normalizeTraitObservationEvent,
  summarizeTraitObservations
} from "@/lib/genetics/traitObservation";

describe("traitObservation helper", () => {
  it("Valid trait observation details are recognized", () => {
    const details = {
      observation_type: "trait_observation",
      trait_key: "stem_color",
      trait_label: "Stem Color",
      expression: "present"
    };
    expect(isTraitObservationDetails(details)).toBe(true);
  });

  it("Non-trait observation details are ignored", () => {
    const details = {
      observation_type: "other",
      trait_key: "stem_color",
      trait_label: "Stem Color",
      expression: "present"
    };
    expect(isTraitObservationDetails(details)).toBe(false);
  });

  it("Missing trait_key returns false/undefined", () => {
    const details = {
      observation_type: "trait_observation",
      trait_label: "Stem Color",
      expression: "present"
    };
    expect(isTraitObservationDetails(details)).toBe(false);
  });

  it("Missing trait_label returns false/undefined", () => {
    const details = {
      observation_type: "trait_observation",
      trait_key: "stem_color",
      expression: "present"
    };
    expect(isTraitObservationDetails(details)).toBe(false);
  });

  it("Invalid expression returns false/undefined", () => {
    const details = {
      observation_type: "trait_observation",
      trait_key: "stem_color",
      trait_label: "Stem Color",
      expression: "super_strong"
    };
    expect(isTraitObservationDetails(details)).toBe(false);
    expect(normalizeTraitExpression("super_strong")).toBeUndefined();
  });

  it("Expression normalization is case-insensitive", () => {
    expect(normalizeTraitExpression("PRESENT")).toBe("present");
    expect(normalizeTraitExpression(" WeaK ")).toBe("weak");
  });

  it("Confidence normalization accepts low/medium/high only", () => {
    const details = {
      observation_type: "trait_observation",
      trait_key: "stem_color",
      trait_label: "Stem Color",
      expression: "present",
      confidence: "high"
    };
    expect(isTraitObservationDetails(details)).toBe(true);

    const event = {
      id: "evt1",
      occurred_at: "2024-01-01T12:00:00Z",
      details
    };
    const norm = normalizeTraitObservationEvent(event);
    expect(norm?.confidence).toBe("high");

    const badConfidenceEvent = {
      ...event,
      details: { ...details, confidence: "sure" }
    };
    const normBad = normalizeTraitObservationEvent(badConfidenceEvent);
    expect(normBad?.confidence).toBeUndefined(); // Ignores invalid confidence but accepts event
  });

  it("normalizeTraitObservationEvent returns expected normalized object", () => {
    const event = {
      id: "evt1",
      plant_id: "p1",
      occurred_at: "2024-01-01T12:00:00Z",
      details: {
        observation_type: "trait_observation",
        trait_key: "stem_color",
        trait_label: "Stem Color",
        expression: "PRESENT",
        confidence: "HIGH",
        notes: "Very purple"
      }
    };
    const norm = normalizeTraitObservationEvent(event);
    expect(norm).toEqual({
      event_id: "evt1",
      plant_id: "p1",
      grow_id: undefined,
      observed_at: "2024-01-01T12:00:00Z",
      trait_key: "stem_color",
      trait_label: "Stem Color",
      expression: "present",
      confidence: "high",
      notes: "Very purple"
    });
  });

  it("Malformed details do not throw", () => {
    expect(normalizeTraitObservationEvent({ id: "evt", details: null })).toBeUndefined();
    expect(normalizeTraitObservationEvent({ id: "evt", details: "string" })).toBeUndefined();
    expect(normalizeTraitObservationEvent(null)).toBeUndefined();
  });

  it("summarizeTraitObservations groups by trait_key", () => {
    const events = [
      { id: "1", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } },
      { id: "2", occurred_at: "2024-01-02", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } },
      { id: "3", occurred_at: "2024-01-03", details: { observation_type: "trait_observation", trait_key: "t2", trait_label: "T2", expression: "weak" } },
    ];
    const summary = summarizeTraitObservations(events);
    expect(Object.keys(summary)).toEqual(["t1", "t2"]);
    expect(summary.t1.counts.total).toBe(2);
    expect(summary.t2.counts.total).toBe(1);
  });

  it("summarizeTraitObservations counts all expression buckets", () => {
    const events = [
      { id: "1", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "absent" } },
      { id: "2", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "weak" } },
      { id: "3", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "moderate" } },
      { id: "4", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "strong" } },
      { id: "5", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } },
      { id: "6", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } },
    ];
    const summary = summarizeTraitObservations(events);
    expect(summary.t1.counts).toEqual({
      absent: 1,
      weak: 1,
      moderate: 1,
      strong: 1,
      present: 2,
      total: 6
    });
  });

  it("summarizeTraitObservations tracks latest observation date", () => {
    const events = [
      { id: "1", occurred_at: "2024-01-01T10:00:00Z", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } },
      { id: "2", occurred_at: "2024-01-05T10:00:00Z", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } },
      { id: "3", occurred_at: "2024-01-03T10:00:00Z", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } },
    ];
    const summary = summarizeTraitObservations(events);
    expect(summary.t1.latest_observation_date).toBe("2024-01-05T10:00:00Z");
  });

  it("Summary does not include dominance/recessive claims", () => {
    // We implicitly assert this by checking the shape of the summary object.
    const events = [
      { id: "1", occurred_at: "2024-01-01", details: { observation_type: "trait_observation", trait_key: "t1", trait_label: "T1", expression: "present" } }
    ];
    const summary = summarizeTraitObservations(events);
    expect(summary.t1).not.toHaveProperty("dominance");
    expect(summary.t1).not.toHaveProperty("is_dominant");
  });
});
