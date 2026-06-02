/**
 * aiDoctorReviewRequestPacket — packet bounds, sanitization, and shape.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorReviewRequestPacket,
  AI_DOCTOR_REVIEW_PACKET_EVENT_CAP,
  AI_DOCTOR_REVIEW_PACKET_SCHEMA_VERSION,
} from "@/lib/aiDoctorReviewRequestPacket";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import type {
  TimelineDiaryItem,
  TimelineManualSnapshotItem,
  TimelineMemoryItem,
} from "@/lib/timelineFilterRules";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

const ctx = (
  o: Partial<AiDoctorContextResult> = {},
): AiDoctorContextResult => ({
  readiness: "strong",
  missing: [],
  evidence: ["fresh-manual-sensor-snapshot"],
  counts: {
    recentEvents: 1,
    recentWateringOrFeeding: 0,
    recentManualSnapshots: 1,
    recentWarnings: 0,
  },
  latest: { manualSnapshotAt: null },
  safeNextStep: "",
  diagnosisClaimed: false,
  ...o,
});

const diary = (i: number, when: string): TimelineDiaryItem => ({
  kind: "diary",
  key: `d-${i}`,
  occurredAt: when,
  eventType: i % 2 === 0 ? "watering" : null,
  hasPhoto: false,
  note: `note ${i}`,
});

const snapshotCard = (when: string): ManualSnapshotTimelineCard =>
  ({
    id: "snap-1",
    title: "Manual sensor snapshot",
    capturedAt: when,
    sourceLabel: "Manual",
    source: "manual",
    tentId: "t-1",
    plantId: "p-1",
    isTentLevel: false,
    notes: null,
    readings: [
      { field: "temperature_c", value: 26.5, unit: "°C", derived: false },
      { field: "humidity_pct", value: 55, unit: "%", derived: false },
    ],
    severity: "ok",
    warnings: [],
  }) as unknown as ManualSnapshotTimelineCard;

const snapshot = (when: string): TimelineManualSnapshotItem => ({
  kind: "manual_sensor_snapshot",
  key: "snap-1",
  occurredAt: when,
  card: snapshotCard(when),
});

describe("buildAiDoctorReviewRequestPacket", () => {
  it("returns the expected bounded shape with schema version", () => {
    const items: TimelineMemoryItem[] = [
      diary(0, "2026-06-01T10:00:00Z"),
      snapshot("2026-06-01T09:00:00Z"),
    ];
    const packet = buildAiDoctorReviewRequestPacket({
      plant: {
        strain: "Northern Lights Auto",
        stage: "flower",
        medium: "coco",
        potSize: "11L",
      },
      timelineItems: items,
      context: ctx(),
    });
    expect(packet.schemaVersion).toBe(AI_DOCTOR_REVIEW_PACKET_SCHEMA_VERSION);
    expect(packet.plant).toEqual({
      strain: "Northern Lights Auto",
      stage: "flower",
      medium: "coco",
      potSize: "11L",
    });
    expect(packet.readiness.state).toBe("strong");
    expect(packet.recentEvents.length).toBeLessThanOrEqual(
      AI_DOCTOR_REVIEW_PACKET_EVENT_CAP,
    );
    expect(packet.recentSensorSnapshot?.capturedAt).toBe(
      "2026-06-01T09:00:00Z",
    );
    expect(packet.recentSensorSnapshot?.readings.length).toBe(2);
  });

  it("caps recentEvents at 20 and orders them newest first", () => {
    const items: TimelineMemoryItem[] = Array.from({ length: 50 }, (_, i) =>
      diary(i, `2026-06-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`),
    );
    const packet = buildAiDoctorReviewRequestPacket({
      plant: null,
      timelineItems: items,
      context: ctx(),
    });
    expect(packet.recentEvents.length).toBe(AI_DOCTOR_REVIEW_PACKET_EVENT_CAP);
    for (let i = 1; i < packet.recentEvents.length; i++) {
      expect(packet.recentEvents[i - 1].at >= packet.recentEvents[i].at).toBe(
        true,
      );
    }
  });

  it("keeps only the most recent sensor snapshot", () => {
    const items: TimelineMemoryItem[] = [
      snapshot("2026-05-30T10:00:00Z"),
      snapshot("2026-06-02T10:00:00Z"),
      snapshot("2026-06-01T10:00:00Z"),
    ];
    const packet = buildAiDoctorReviewRequestPacket({
      plant: null,
      timelineItems: items,
      context: ctx(),
    });
    expect(packet.recentSensorSnapshot?.capturedAt).toBe(
      "2026-06-02T10:00:00Z",
    );
  });

  it("never serializes raw_payload / secrets / tokens / service_role keys", () => {
    const items: TimelineMemoryItem[] = [snapshot("2026-06-01T10:00:00Z")];
    // Even when the plant or context objects are decorated with sensitive
    // keys, the builder must not surface them.
    const plant = {
      strain: "x",
      stage: "veg",
      medium: "soil",
      potSize: "5L",
      raw_payload: { secret: "leak" },
      service_role: "leak",
      tokens: ["t"],
      api_key: "k",
    } as never;
    const packet = buildAiDoctorReviewRequestPacket({
      plant,
      timelineItems: items,
      context: ctx(),
    });
    const dump = JSON.stringify(packet);
    expect(dump).not.toMatch(/raw_payload/);
    expect(dump).not.toMatch(/service_role/i);
    expect(dump).not.toMatch(/api_key/);
    expect(dump).not.toMatch(/\btokens\b/);
    expect(dump).not.toMatch(/leak/);
  });

  it("trims plant strings and drops empty values to null", () => {
    const packet = buildAiDoctorReviewRequestPacket({
      plant: {
        strain: "  Blue Dream  ",
        stage: "",
        medium: null,
        potSize: undefined as unknown as string,
      },
      timelineItems: [],
      context: ctx({ readiness: "partial" }),
    });
    expect(packet.plant).toEqual({
      strain: "Blue Dream",
      stage: null,
      medium: null,
      potSize: null,
    });
    expect(packet.readiness.state).toBe("partial");
  });
});
