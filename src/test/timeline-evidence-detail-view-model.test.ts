/**
 * Tests for the Timeline Evidence Detail view-model. Pure helper.
 *
 * Confirms safe rendering of diary/photo/sensor entries, deterministic
 * source labels, no leakage of `raw_payload` or other unsafe fields,
 * and correct AI Doctor context decisions.
 */
import { describe, it, expect } from "vitest";
import {
  buildTimelineEvidenceDetailViewModel,
  TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS,
} from "@/lib/timelineEvidenceDetailViewModel";

const NOW = new Date("2025-06-01T12:00:00Z").getTime();

function vm(input: Parameters<typeof buildTimelineEvidenceDetailViewModel>[0]) {
  return buildTimelineEvidenceDetailViewModel(input, { nowMs: NOW });
}

describe("timelineEvidenceDetailViewModel", () => {
  it("returns null for invalid inputs", () => {
    expect(buildTimelineEvidenceDetailViewModel(null)).toBeNull();
    expect(buildTimelineEvidenceDetailViewModel({ id: "" } as unknown as { id: string })).toBeNull();
  });

  it("renders a diary entry with photo + recent sensor as strong AI Doctor context", () => {
    const m = vm({
      id: "e1",
      note: "Looks healthy",
      photo_url: "https://x/1.jpg",
      stage: "veg",
      entry_at: "2025-06-01T11:55:00Z",
      details: {
        event_type: "photo",
        plant_name: "Blue Dream",
        tent_name: "Tent A",
        source: "manual",
        sensor_snapshot: { ts: "2025-06-01T11:55:00Z", temp: 24, rh: 55, vpd: 1.1, source: "live" },
      },
    });
    expect(m).not.toBeNull();
    expect(m!.title).toBe("Blue Dream");
    expect(m!.eventTypeLabel).toBe("Photo");
    expect(m!.subtitle).toContain("Photo");
    expect(m!.subtitle).toContain("Tent A");
    expect(m!.photo?.hasPhoto).toBe(true);
    expect(m!.sensor?.isStale).toBe(false);
    expect(m!.badges).toContain("photo");
    expect(m!.badges).toContain("sensor");
    expect(m!.badges).not.toContain("stale_sensor");
    expect(m!.contextHint.level).toBe("strong");
    expect(m!.contextHint.label).toBe("Useful for AI Doctor context");
  });

  it("labels manual/live/csv/demo/stale/invalid sources correctly", () => {
    const cases: Array<[string, string]> = [
      ["manual", "Manual"],
      ["live", "Live"],
      ["csv", "CSV import"],
      ["demo", "Demo"],
      ["stale", "Stale"],
      ["invalid", "Invalid"],
    ];
    for (const [src, label] of cases) {
      const m = vm({
        id: "x",
        photo_url: null,
        entry_at: "2025-06-01T11:55:00Z",
        details: { event_type: "note", source: src },
      });
      expect(m!.sourceLabels).toContain(label);
    }
  });

  it("flags stale sensor snapshot when older than 30 minutes", () => {
    const m = vm({
      id: "e2",
      photo_url: "https://x/2.jpg",
      entry_at: "2025-06-01T09:00:00Z",
      details: {
        event_type: "photo",
        sensor_snapshot: { ts: "2025-06-01T09:00:00Z", temp: 22, source: "live" },
      },
    });
    expect(m!.sensor?.isStale).toBe(true);
    expect(m!.badges).toContain("stale_sensor");
    expect(m!.sourceLabels).toContain("Stale");
  });

  it("marks photo without sensor as partial / missing sensor context", () => {
    const m = vm({
      id: "e3",
      photo_url: "https://x/3.jpg",
      entry_at: "2025-06-01T11:55:00Z",
      details: { event_type: "photo", plant_name: "P" },
    });
    expect(m!.contextHint.level).toBe("partial_missing_sensor");
    expect(m!.contextHint.label).toBe("Missing sensor context");
  });

  it("marks sensor without photo as partial / missing photo context", () => {
    const m = vm({
      id: "e4",
      photo_url: null,
      entry_at: "2025-06-01T11:55:00Z",
      details: {
        event_type: "measurement",
        sensor_snapshot: { ts: "2025-06-01T11:55:00Z", temp: 23 },
      },
    });
    expect(m!.contextHint.level).toBe("partial_missing_photo");
  });

  it("marks entries missing photo and sensor as limited context", () => {
    const m = vm({
      id: "e5",
      photo_url: null,
      note: "just a note",
      entry_at: "2025-06-01T11:55:00Z",
      details: { event_type: "note" },
    });
    expect(m!.contextHint.level).toBe("limited");
    expect(m!.contextHint.label).toBe("Missing photo/sensor context");
  });

  it("does not expose raw_payload, tokens, or unknown detail keys", () => {
    const m = vm({
      id: "e6",
      note: "n",
      photo_url: null,
      entry_at: "2025-06-01T11:55:00Z",
      details: {
        event_type: "note",
        raw_payload: { secret: "PASSKEY-abc", Authorization: "Bearer abc" },
        bridge_token: "vbt_secret",
        api_key: "service_role-xyz",
        anything_else: { nested: "x" },
      },
    });
    const json = JSON.stringify(m);
    expect(json).not.toContain("raw_payload");
    expect(json).not.toContain("PASSKEY");
    expect(json).not.toContain("vbt_");
    expect(json).not.toContain("service_role");
    expect(json).not.toContain("Authorization");
    expect(json).not.toContain("bridge_token");
    expect(json).not.toContain("anything_else");
  });

  it("SAFE_DETAIL_KEYS allow-list stays minimal and free of unsafe fields", () => {
    expect(TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS.has("raw_payload")).toBe(false);
    expect(TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS.has("Authorization")).toBe(false);
    expect(TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS.has("api_key")).toBe(false);
    // Sanity: required keys present
    expect(TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS.has("event_type")).toBe(true);
    expect(TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS.has("plant_name")).toBe(true);
    expect(TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS.has("sensor_snapshot")).toBe(true);
    expect(TIMELINE_EVIDENCE_SAFE_DETAIL_KEYS.has("maturity_evidence")).toBe(true);
  });

  it("watering and feeding details produce dedicated sections + badges", () => {
    const w = vm({
      id: "w1",
      photo_url: null,
      entry_at: "2025-06-01T11:00:00Z",
      details: { event_type: "watering", watering_ml: 500 },
    });
    expect(w!.watering?.volumeMl).toBe(500);
    expect(w!.badges).toContain("watering");

    const f = vm({
      id: "f1",
      photo_url: null,
      entry_at: "2025-06-01T11:00:00Z",
      details: { event_type: "feeding", feeding_ec: 1.6, feeding_ph: 6.1 },
    });
    expect(f!.feeding?.ec).toBe(1.6);
    expect(f!.feeding?.ph).toBe(6.1);
    expect(f!.badges).toContain("feeding");
  });

  it("surfaces maturity evidence without turning it into a decision", () => {
    const m = vm({
      id: "m1",
      photo_url: null,
      entry_at: "2025-06-01T11:00:00Z",
      details: {
        event_type: "note",
        maturity_evidence: {
          source: "manual",
          evidence_type: "quick_log_maturity_evidence",
          advisory_only: true,
          observed_at: "2025-06-01T10:55:00Z",
          clear_pct: 10,
          cloudy_pct: 70,
          amber_pct: 20,
          color_note: "mostly turned",
          grower_note: "watch again tomorrow",
          raw_payload: { secret: "do-not-leak" },
        },
      },
    });

    expect(m!.maturityEvidence).toEqual({
      observedAt: "2025-06-01T10:55:00Z",
      advisoryOnly: true,
      clearPct: 10,
      cloudyPct: 70,
      amberPct: 20,
      notes: [
        { label: "Color", value: "mostly turned" },
        { label: "Grower note", value: "watch again tomorrow" },
      ],
    });
    expect(m!.badges).toContain("maturity_evidence");
    const json = JSON.stringify(m);
    expect(json).not.toContain("raw_payload");
    expect(json).not.toContain("do-not-leak");
    expect(json).not.toMatch(/ready to harvest/i);
    expect(json).not.toMatch(/harvest now/i);
  });

  it("ignores malformed maturity evidence", () => {
    const m = vm({
      id: "m2",
      entry_at: "2025-06-01T11:00:00Z",
      details: {
        event_type: "note",
        maturity_evidence: { evidence_type: "other", clear_pct: 10 },
      },
    });
    expect(m!.maturityEvidence).toBeNull();
    expect(m!.badges).not.toContain("maturity_evidence");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      id: "d1",
      photo_url: "https://x/d.jpg",
      note: "n",
      entry_at: "2025-06-01T11:55:00Z",
      details: { event_type: "photo", plant_name: "P", source: "manual" },
    } as const;
    expect(JSON.stringify(vm(input))).toBe(JSON.stringify(vm(input)));
  });
});
