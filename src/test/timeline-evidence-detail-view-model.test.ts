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
    expect(
      buildTimelineEvidenceDetailViewModel({ id: "" } as unknown as { id: string }),
    ).toBeNull();
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
        sensor_snapshot: {
          ts: "2025-06-01T11:55:00Z",
          temp: 24,
          rh: 55,
          vpd: 1.1,
          source: "manual",
        },
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

  it("labels persisted sources without accepting an unverified live claim", () => {
    const cases: Array<[string, string]> = [
      ["manual", "Manual"],
      ["live", "Invalid"],
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

  it("flags stale sensor snapshot when older than the live window", () => {
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
        sensor_snapshot: { ts: "2025-06-01T11:55:00Z", temp: 23, source: "manual" },
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

describe("Timeline drawer sensor evidence honesty", () => {
  const snapshotVm = (snapshot: Record<string, unknown>, photo = true) =>
    vm({
      id: "sensor-evidence",
      photo_url: photo ? "https://example.test/photo.jpg" : null,
      entry_at: "2025-06-01T11:55:00Z",
      details: { sensor_snapshot: snapshot },
    })!;
  const recentManual = { source: "manual", ts: "2025-06-01T11:55:00Z", temp: 24 };

  it.each(["invalid", "unknown", "demo", "stale", "live", "csv"])(
    "does not promote a persisted %s snapshot into strong current evidence",
    (source) => {
      const result = snapshotVm({ ...recentManual, source });
      expect(result.contextHint.level).toBe("limited");
      expect(result.contextHint.description).toContain("Photo and sensor record are present");
      expect(result.contextHint.description).not.toMatch(/strong evidence|no photo/i);
    },
  );

  it.each([{}, { temp: null }, { temp: Number.NaN }])(
    "does not call an empty sensor record strong evidence: %j",
    (metrics) => {
      const result = snapshotVm({ source: "manual", ts: recentManual.ts, ...metrics });
      expect(result.contextHint.level).toBe("limited");
      expect(result.contextHint.description).toContain("No usable sensor readings");
    },
  );

  it.each([
    ["temp", 200, "tempC"],
    ["rh", 101, "rhPercent"],
    ["vpd", -1, "vpdKpa"],
    ["co2", -1, "co2Ppm"],
    ["soil", 101, "soilPercent"],
  ] as const)("omits invalid %s while retaining usable readings", (field, value, output) => {
    const result = snapshotVm({ ...recentManual, rh: 55, [field]: value });
    expect(result.sensor?.[output]).toBeNull();
    expect(result.contextHint.level).toBe("limited");
    expect(result.contextHint.description).toMatch(/invalid/i);
  });

  it.each(["2025-06-01T13:00:00Z", "not-a-time"])(
    "does not call an invalid capture time recent: %s",
    (ts) => {
      const result = snapshotVm({ ...recentManual, ts });
      expect(result.contextHint.level).toBe("limited");
      expect(result.contextHint.description).toMatch(/timestamp/i);
    },
  );

  it.each(["", 0, { bad: "timestamp" }])(
    "does not replace a malformed supplied capture time with the recent diary time: %j",
    (ts) => {
      const result = snapshotVm({ ...recentManual, ts });
      expect(result.contextHint.level).toBe("limited");
      expect(result.contextHint.description).toMatch(/timestamp/i);
    },
  );

  it.each([0, 100])("keeps stuck humidity %s visible with caution", (rh) => {
    const result = snapshotVm({ ...recentManual, rh });
    expect(result.sensor?.rhPercent).toBe(rh);
    expect(result.contextHint.level).toBe("limited");
    expect(result.contextHint.description).toContain("Humidity stuck");
  });

  it("does not claim current evidence when both capture and diary timestamps are missing", () => {
    const result = vm({
      id: "missing-time",
      photo_url: "https://example.test/photo.jpg",
      details: { sensor_snapshot: { source: "manual", temp: 24 } },
    })!;
    expect(result.contextHint.level).toBe("limited");
    expect(result.contextHint.description).toMatch(/timestamp/i);
  });

  it("uses captured_at before the diary time when ts is absent", () => {
    const result = snapshotVm({ source: "manual", captured_at: "2025-05-30T12:00:00Z", temp: 24 });
    expect(result.sensor?.capturedAt).toBe("2025-05-30T12:00:00Z");
    expect(result.sensor?.isStale).toBe(true);
    expect(result.contextHint.level).toBe("limited");
  });

  it("keeps a usable one-hour-old manual snapshot within its 24-hour current window", () => {
    const result = snapshotVm({ ...recentManual, ts: "2025-06-01T11:00:00Z" });
    expect(result.sensor?.isStale).toBe(false);
    expect(result.contextHint.level).toBe("strong");
  });

  it.each([true, false])("describes present stale evidence honestly (photo=%s)", (photo) => {
    const result = snapshotVm({ ...recentManual, ts: "2025-05-30T12:00:00Z" }, photo);
    expect(result.contextHint.level).toBe("limited");
    expect(result.contextHint.description).toContain("older");
    expect(result.contextHint.description).not.toContain("no sensor snapshot");
    if (photo) expect(result.contextHint.description).not.toMatch(/no photo/i);
  });

  it("does not repeat an unverifiable persisted live claim in the Source summary", () => {
    const result = vm({
      id: "unverified-live",
      photo_url: "https://example.test/photo.jpg",
      entry_at: recentManual.ts,
      details: { source: "live", sensor_snapshot: { ...recentManual, source: "live" } },
    })!;
    expect(result.sourceLabels).not.toContain("Live");
    expect(result.sourceLabels).toContain("Invalid");
  });

  it("does not present metadata-only live provenance as verified sensor evidence", () => {
    const result = vm({
      id: "source-only",
      photo_url: "https://example.test/photo.jpg",
      details: { source: "live" },
    })!;
    expect(result.sourceLabels).toEqual(["Invalid"]);
    expect(result.sensor).toBeNull();
    expect(result.contextHint.level).toBe("partial_missing_sensor");
  });
});
