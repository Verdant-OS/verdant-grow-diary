/**
 * Tests for manual sensor source/device labeling helpers and the
 * extension of buildManualReadingPayloads with optional deviceNote.
 *
 * Pure, deterministic, no I/O. Manual readings must never format as
 * Live / Synced / Connected even when a device note is present.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MANUAL_DEVICE_ID_PREFIX,
  MANUAL_READING_LABEL,
  MAX_MANUAL_DEVICE_NOTE_LEN,
  buildManualDeviceId,
  extractManualDeviceNote,
  formatSensorSourceLabel,
  getManualSensorDeviceOptions,
  normalizeManualSourceNote,
} from "@/lib/manualSensorSourceLabel";
import {
  buildManualReadingPayloads,
  validateManualEntry,
  computeVpdKpa,
} from "@/lib/sensorReadingManualEntryRules";

describe("normalizeManualSourceNote", () => {
  it("trims, collapses whitespace, and returns null for empty", () => {
    expect(normalizeManualSourceNote("   ")).toBeNull();
    expect(normalizeManualSourceNote(null)).toBeNull();
    expect(normalizeManualSourceNote(undefined)).toBeNull();
    expect(normalizeManualSourceNote("  SwitchBot   CO2  Monitor ")).toBe(
      "SwitchBot CO2 Monitor",
    );
  });

  it("strips control characters and unsafe punctuation", () => {
    expect(normalizeManualSourceNote("SensorPush<script>")).toBe("SensorPush script");
    expect(normalizeManualSourceNote("foo\u0000bar")).toBe("foo bar");
    expect(normalizeManualSourceNote("' OR 1=1 --")).toBe("OR 1 1 --");
  });

  it("caps length at MAX_MANUAL_DEVICE_NOTE_LEN", () => {
    const huge = "x".repeat(500);
    const out = normalizeManualSourceNote(huge);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(MAX_MANUAL_DEVICE_NOTE_LEN);
  });

  it("returns null for non-string input", () => {
    // @ts-expect-error intentional bad input
    expect(normalizeManualSourceNote(42)).toBeNull();
  });
});

describe("buildManualDeviceId / extractManualDeviceNote", () => {
  it("round-trips a safe note through the manual: prefix", () => {
    const id = buildManualDeviceId("SwitchBot CO2 Monitor");
    expect(id).toBe(`${MANUAL_DEVICE_ID_PREFIX}SwitchBot CO2 Monitor`);
    expect(extractManualDeviceNote(id)).toBe("SwitchBot CO2 Monitor");
  });

  it("returns null for empty/bad input", () => {
    expect(buildManualDeviceId(null)).toBeNull();
    expect(buildManualDeviceId(" ")).toBeNull();
    expect(extractManualDeviceNote(null)).toBeNull();
    expect(extractManualDeviceNote("shelly-ht-gen4")).toBeNull();
  });
});

describe("formatSensorSourceLabel", () => {
  it("formats manual without a note as 'Manual reading'", () => {
    expect(formatSensorSourceLabel({ source: "manual" })).toBe(MANUAL_READING_LABEL);
    expect(formatSensorSourceLabel({ source: "manual", deviceNote: " " })).toBe(
      MANUAL_READING_LABEL,
    );
  });

  it("formats manual with a safe note as 'Manual reading · <note>'", () => {
    expect(
      formatSensorSourceLabel({ source: "manual", deviceNote: "SwitchBot CO2 Monitor" }),
    ).toBe("Manual reading · SwitchBot CO2 Monitor");
    expect(
      formatSensorSourceLabel({
        source: "manual",
        deviceId: `${MANUAL_DEVICE_ID_PREFIX}SensorPush`,
      }),
    ).toBe("Manual reading · SensorPush");
  });

  it("never returns Live/Synced/Connected for manual", () => {
    const label = formatSensorSourceLabel({
      source: "manual",
      deviceNote: "Home Assistant copy",
    }).toLowerCase();
    for (const banned of ["live", "synced", "connected", "automatic"]) {
      expect(label).not.toContain(banned);
    }
  });

  it("preserves existing labels for live/sim/diary/unavailable", () => {
    expect(formatSensorSourceLabel({ source: "live" })).toBe("Live sensor");
    expect(formatSensorSourceLabel({ source: "sim" })).toBe("Simulated");
    expect(formatSensorSourceLabel({ source: "diary" })).toBe("Diary snapshot");
    expect(formatSensorSourceLabel({ source: "unavailable" })).toBe("Unavailable");
    // A device note on a non-manual row must not change the label.
    expect(
      formatSensorSourceLabel({ source: "live", deviceNote: "spoof" }),
    ).toBe("Live sensor");
  });

  it("device options are non-empty and stable", () => {
    const opts = getManualSensorDeviceOptions();
    expect(opts.length).toBeGreaterThan(3);
    expect(opts.find((o) => /switchbot/i.test(o.label))).toBeTruthy();
  });
});

describe("buildManualReadingPayloads · deviceNote integration", () => {
  const metrics = [{ metric: "temperature_c" as const, value: 24.5 }];

  it("omits device_id when no note is provided", () => {
    const [row] = buildManualReadingPayloads({ tentId: "t1", metrics });
    expect(row.source).toBe("manual");
    expect(row.device_id).toBeUndefined();
  });

  it("attaches a prefixed device_id when a note is provided", () => {
    const [row] = buildManualReadingPayloads({
      tentId: "t1",
      metrics,
      deviceNote: "SwitchBot CO2 Monitor",
    });
    expect(row.source).toBe("manual");
    expect(row.device_id).toBe(`${MANUAL_DEVICE_ID_PREFIX}SwitchBot CO2 Monitor`);
  });

  it("normalizes unsafe / overlong notes before attaching", () => {
    const [row] = buildManualReadingPayloads({
      tentId: "t1",
      metrics,
      deviceNote: "<bad>" + "x".repeat(200),
    });
    expect(row.device_id).toBeDefined();
    const note = row.device_id!.slice(MANUAL_DEVICE_ID_PREFIX.length);
    expect(note.length).toBeLessThanOrEqual(MAX_MANUAL_DEVICE_NOTE_LEN);
    expect(note).not.toContain("<");
  });
});

describe("Manual entry CO₂ acceptance and VPD preservation", () => {
  it("accepts missing CO₂ without flagging invalid", () => {
    const v = validateManualEntry({ airTempF: 75, humidityPct: 55 });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.metrics.find((m) => m.metric === "co2_ppm")).toBeUndefined();
  });

  it("accepts a valid CO₂ ppm value", () => {
    const v = validateManualEntry({ co2Ppm: 850 });
    expect(v.ok).toBe(true);
    const co2 = v.metrics.find((m) => m.metric === "co2_ppm");
    expect(co2?.value).toBe(850);
  });

  it("rejects negative CO₂ ppm", () => {
    const v = validateManualEntry({ co2Ppm: -10 });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /co/i.test(e))).toBe(true);
  });

  it("VPD calculation from temp/RH is unchanged", () => {
    // Sanity: known approximation at 25°C / 50% RH ≈ 1.585 kPa.
    const vpd = computeVpdKpa(25, 50);
    expect(vpd).toBeGreaterThan(1.5);
    expect(vpd).toBeLessThan(1.7);
  });
});

describe("ManualSensorReadingCard · static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../components/ManualSensorReadingCard.tsx"),
    "utf-8",
  );

  it("renders an optional device select with the safe testid", () => {
    expect(src).toContain('data-testid="manual-reading-device-select"');
    expect(src).toContain('data-testid="manual-reading-device-row"');
  });

  it("does not add forbidden integrations or device-control references", () => {
    const lower = src.toLowerCase();
    for (const term of [
      "action_queue",
      "ai-coach",
      "ai_coach",
      "mqtt",
      "home_assistant",
      "pi_bridge",
      "webhook",
      "relay",
      "actuator",
      "device_command",
      "service_role",
    ]) {
      expect(lower).not.toContain(term);
    }
  });

  it("does not contain forbidden celebratory/health copy", () => {
    const lower = src.toLowerCase();
    for (const banned of ["healthy", "perfect", "complete", "completed", "successful"]) {
      expect(lower).not.toContain(banned);
    }
  });
});
