import { describe, it, expect } from "vitest";
import {
  buildAiDoctorContextInput,
  evaluateAiDoctorContextFromSources,
  plantToAiDoctorContextPlant,
  timelineItemsToAiDoctorContextSources,
  AI_DOCTOR_READINESS_LABELS,
  labelEvidence,
  labelMissing,
  rootZoneObservationsToAiDoctorContextEvents,
} from "@/lib/aiDoctorContextViewModel";
import type { RootZoneObservationV1 } from "@/lib/rootZoneObservationRules";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const HOUR = 60 * 60 * 1000;

function makeRootZoneObservation(
  overrides: Partial<RootZoneObservationV1> = {},
): RootZoneObservationV1 {
  return {
    occurredAt: iso(-HOUR),
    eventType: "watering",
    source: "manual",
    metrics: {
      schemaVersion: 1,
      volumeMl: 500,
      inputPh: null,
      inputEcMsCm: null,
      outputEcMsCm: null,
      runoffMl: null,
      runoffPh: null,
      runoffEcMsCm: null,
      waterTempC: null,
      nutrientLine: null,
      products: [],
    },
    ...overrides,
  };
}

function makeManualCard(
  capturedAt: string,
  severity: "ok" | "warning" | "invalid" = "ok",
): ManualSnapshotTimelineCard {
  return {
    id: `snap-${capturedAt}`,
    title: "Manual sensor snapshot",
    capturedAt,
    sourceLabel: "Manual",
    source: "manual",
    tentId: "tent-1",
    plantId: "plant-1",
    isTentLevel: false,
    notes: null,
    readings: [],
    severity,
    warnings: [],
    errors: [],
  };
}

describe("plantToAiDoctorContextPlant", () => {
  it("returns null for nullish plant", () => {
    expect(plantToAiDoctorContextPlant(null)).toBeNull();
    expect(plantToAiDoctorContextPlant(undefined)).toBeNull();
  });

  it("derives hasPlantPhoto from photo url when boolean not provided", () => {
    expect(plantToAiDoctorContextPlant({ photo: "https://x/y.jpg" })?.hasPlantPhoto).toBe(true);
    expect(plantToAiDoctorContextPlant({ photo: "" })?.hasPlantPhoto).toBe(false);
  });

  it("preserves explicit hasPlantPhoto boolean", () => {
    expect(plantToAiDoctorContextPlant({ photo: "x", hasPlantPhoto: false })?.hasPlantPhoto).toBe(
      false,
    );
  });
});

describe("timelineItemsToAiDoctorContextSources", () => {
  it("classifies diary items into bucket categories", () => {
    const items: TimelineMemoryItem[] = [
      {
        kind: "diary",
        key: "d1",
        occurredAt: iso(-HOUR),
        eventType: "watering",
        hasPhoto: false,
        note: "Water 500ml",
      },
    ];
    const { events, snapshots } = timelineItemsToAiDoctorContextSources(items);
    expect(snapshots).toEqual([]);
    expect(events[0].category).toBe("watering");
  });

  it("maps manual snapshots and emits a warnings event when card has warnings", () => {
    const items: TimelineMemoryItem[] = [
      {
        kind: "manual_sensor_snapshot",
        key: "s1",
        occurredAt: iso(-HOUR),
        card: makeManualCard(iso(-HOUR), "warning"),
      },
    ];
    const { events, snapshots } = timelineItemsToAiDoctorContextSources(items);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].severity).toBe("warning");
    expect(events.some((e) => e.category === "manual_sensor_snapshot")).toBe(true);
    expect(events.some((e) => e.category === "warnings")).toBe(true);
  });

  it("handles nullish inputs safely", () => {
    expect(timelineItemsToAiDoctorContextSources(null)).toEqual({
      events: [],
      snapshots: [],
    });
  });
});

describe("evaluateAiDoctorContextFromSources", () => {
  it("returns insufficient with no plant + no items", () => {
    const r = evaluateAiDoctorContextFromSources({
      plant: null,
      timelineItems: [],
      now: NOW,
    });
    expect(r.readiness).toBe("insufficient");
  });

  it("returns strong when plant + recent activity + fresh snapshot present", () => {
    const items: TimelineMemoryItem[] = [
      {
        kind: "diary",
        key: "d1",
        occurredAt: iso(-HOUR),
        eventType: "watering",
        hasPhoto: false,
        note: null,
      },
      {
        kind: "diary",
        key: "d2",
        occurredAt: iso(-2 * HOUR),
        eventType: "note",
        hasPhoto: false,
        note: "ok",
      },
      {
        kind: "manual_sensor_snapshot",
        key: "s1",
        occurredAt: iso(-HOUR),
        card: makeManualCard(iso(-HOUR)),
      },
    ];
    const r = evaluateAiDoctorContextFromSources({
      plant: {
        id: "p1",
        strain: "NL",
        stage: "veg",
        medium: "Coco",
        photo: "https://x/y.jpg",
      },
      timelineItems: items,
      now: NOW,
    });
    expect(r.readiness).toBe("strong");
  });

  it("uses two recent trusted manual root-zone actions as plant memory without creating sensor evidence", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: { stage: "veg", strain: "NL", medium: "coco" },
      timelineItems: [],
      rootZoneObservations: [
        makeRootZoneObservation(),
        makeRootZoneObservation({
          occurredAt: iso(-2 * HOUR),
          eventType: "feeding",
        }),
      ],
      now: NOW,
    });

    expect(result.readiness).toBe("partial");
    expect(result.counts).toMatchObject({
      recentEvents: 2,
      recentWateringOrFeeding: 2,
      recentManualSnapshots: 0,
    });
    expect(result.evidence).toContain("recent-watering-or-feeding");
    expect(result.evidence).not.toContain("recent-manual-sensor-snapshot");
    expect(result.missing).toContain("recent-manual-sensor-snapshot");
  });

  it("keeps one root-zone action below the existing recent-activity threshold", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: { stage: "veg", strain: "NL", medium: "coco" },
      timelineItems: [],
      rootZoneObservations: [makeRootZoneObservation()],
      now: NOW,
    });

    expect(result.counts.recentEvents).toBe(1);
    expect(result.counts.recentWateringOrFeeding).toBe(1);
    expect(result.readiness).toBe("insufficient");
    expect(result.missing).toContain("recent-timeline-activity");
  });

  it("counts a same-instant Quick Log note companion and root-zone row as one logical action", () => {
    const occurredAt = iso(-HOUR);
    const result = evaluateAiDoctorContextFromSources({
      plant: { stage: "veg", strain: "NL", medium: "coco" },
      timelineItems: [
        {
          kind: "diary",
          key: "quick-log-companion",
          occurredAt,
          eventType: "note",
          hasPhoto: false,
          note: "Watered and checked runoff",
        },
      ] as TimelineMemoryItem[],
      rootZoneObservations: [makeRootZoneObservation({ occurredAt })],
      now: NOW,
    });

    expect(result.counts.recentEvents).toBe(1);
    expect(result.counts.recentWateringOrFeeding).toBe(1);
    expect(result.evidence).toContain("recent-watering-or-feeding");
    expect(result.missing).not.toContain("recent-watering-or-feeding");
    expect(result.readiness).toBe("insufficient");
    expect(result.missing).toContain("recent-timeline-activity");
  });
});

describe("rootZoneObservationsToAiDoctorContextEvents", () => {
  it("normalizes a root-zone action timestamp before companion merging", () => {
    const rootZoneAt = "2026-06-01T06:00:00.000-05:00";

    expect(
      rootZoneObservationsToAiDoctorContextEvents(
        [makeRootZoneObservation({ occurredAt: rootZoneAt })],
        { now: NOW },
      ),
    ).toEqual([{ at: "2026-06-01T11:00:00.000Z", category: "watering" }]);
  });

  it.each(["csv", "demo", "stale", "invalid", "unknown"] as const)(
    "excludes %s root-zone provenance from readiness",
    (source) => {
      expect(
        rootZoneObservationsToAiDoctorContextEvents([makeRootZoneObservation({ source })], {
          now: NOW,
        }),
      ).toEqual([]);
    },
  );

  it("fails closed for null, malformed, old, and future observations", () => {
    const malformed = makeRootZoneObservation({
      metrics: { schemaVersion: 1 } as RootZoneObservationV1["metrics"],
    });
    const invalidTimestamp = makeRootZoneObservation({ occurredAt: "not-a-date" });
    const invalidEventType = makeRootZoneObservation({
      eventType: "environment_check" as RootZoneObservationV1["eventType"],
    });
    const old = makeRootZoneObservation({ occurredAt: iso(-8 * 24 * HOUR) });
    const future = makeRootZoneObservation({ occurredAt: iso(HOUR) });

    expect(
      rootZoneObservationsToAiDoctorContextEvents(
        [malformed, invalidTimestamp, invalidEventType, old, future],
        { now: NOW },
      ),
    ).toEqual([]);
    expect(rootZoneObservationsToAiDoctorContextEvents(null, { now: NOW })).toEqual([]);
  });

  it("counts a manual action with an invalid optional metric as activity, never sensor evidence", () => {
    const result = evaluateAiDoctorContextFromSources({
      plant: { stage: "veg" },
      timelineItems: [],
      rootZoneObservations: [makeRootZoneObservation({ invalidFields: ["inputPh"] })],
      now: NOW,
    });

    expect(result.counts.recentWateringOrFeeding).toBe(1);
    expect(result.counts.recentManualSnapshots).toBe(0);
    expect(result.evidence).not.toContain("recent-manual-sensor-snapshot");
    expect(result.missing).toContain("recent-manual-sensor-snapshot");
  });

  it("is deterministic across input order and collapses duplicate manual actions", () => {
    const watering = makeRootZoneObservation({ occurredAt: iso(-HOUR) });
    const feeding = makeRootZoneObservation({
      occurredAt: iso(-2 * HOUR),
      eventType: "feeding",
    });
    const first = rootZoneObservationsToAiDoctorContextEvents([feeding, watering, watering], {
      now: NOW,
    });
    const second = rootZoneObservationsToAiDoctorContextEvents([watering, feeding], { now: NOW });

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.map((event) => event.category)).toEqual(["watering", "feeding"]);
  });
});

describe("buildAiDoctorContextInput", () => {
  it("builds an input shape ready for the rules", () => {
    const input = buildAiDoctorContextInput({
      plant: { strain: "x", stage: "veg" },
      timelineItems: [],
      now: NOW,
    });
    expect(input.now).toBe(NOW);
    expect(input.plant?.hasProfile).toBe(true);
    expect(input.recentEvents).toEqual([]);
  });
});

describe("presenter labels", () => {
  it("labels every readiness bucket", () => {
    expect(AI_DOCTOR_READINESS_LABELS.strong).toBe("Strong context");
    expect(AI_DOCTOR_READINESS_LABELS.partial).toBe("Partial context");
    expect(AI_DOCTOR_READINESS_LABELS.insufficient).toBe("Insufficient context");
  });

  it("provides human labels for known missing/evidence codes", () => {
    expect(labelMissing("plant-profile")).toMatch(/Plant profile/);
    expect(labelEvidence("fresh-manual-sensor-snapshot")).toMatch(/48 hours/);
  });

  it("falls back to the raw code for unknown labels", () => {
    expect(labelMissing("unknown-code")).toBe("unknown-code");
    expect(labelEvidence("unknown-code")).toBe("unknown-code");
  });
});
