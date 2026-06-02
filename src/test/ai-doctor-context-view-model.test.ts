import { describe, it, expect } from "vitest";
import {
  buildAiDoctorContextInput,
  evaluateAiDoctorContextFromSources,
  plantToAiDoctorContextPlant,
  timelineItemsToAiDoctorContextSources,
  AI_DOCTOR_READINESS_LABELS,
  labelEvidence,
  labelMissing,
} from "@/lib/aiDoctorContextViewModel";
import type { TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const HOUR = 60 * 60 * 1000;

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
    expect(
      plantToAiDoctorContextPlant({ photo: "https://x/y.jpg" })?.hasPlantPhoto,
    ).toBe(true);
    expect(plantToAiDoctorContextPlant({ photo: "" })?.hasPlantPhoto).toBe(
      false,
    );
  });

  it("preserves explicit hasPlantPhoto boolean", () => {
    expect(
      plantToAiDoctorContextPlant({ photo: "x", hasPlantPhoto: false })
        ?.hasPlantPhoto,
    ).toBe(false);
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
    expect(events.some((e) => e.category === "manual_sensor_snapshot")).toBe(
      true,
    );
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
    expect(AI_DOCTOR_READINESS_LABELS.insufficient).toBe(
      "Insufficient context",
    );
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
