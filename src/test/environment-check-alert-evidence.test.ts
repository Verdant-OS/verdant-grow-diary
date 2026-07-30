/**
 * #596 — Environment checks become alert-eligible manual evidence.
 *
 * Proves the three contract points of the sensor-truth slice's decision:
 *  1. snapshotFromEnvironmentCheck maps ONLY the three air metrics, labels
 *     the snapshot `manual`, and timestamps it from the diary entry_at.
 *  2. A fresh, breaching env-check snapshot passes the alert-persistence
 *     gates; a stale one does not.
 *  3. The diary fence is untouched: sensor_snapshot blobs remain `diary`
 *     and remain non-persistable — this slice widens nothing.
 */
import { describe, expect, it } from "vitest";
import { snapshotFromDiary, snapshotFromEnvironmentCheck } from "@/lib/sensorSnapshot";
import { buildEnvironmentCheckDetails } from "@/lib/environmentCheckQuickLogRules";
import { isSnapshotPersistable } from "@/lib/environmentAlertPersistence";

const NOW = new Date("2026-07-30T18:00:00.000Z").getTime();
const minutesAgoIso = (m: number) => new Date(NOW - m * 60_000).toISOString();

function envelope(): Record<string, unknown> {
  // Built by the real builder so field names can never drift from the writer.
  const e = buildEnvironmentCheckDetails({
    roomTempF: "95", // hot tent → 35 °C, breach material
    humidityPct: "22",
    vpdKpa: "3.1",
    waterTempValue: "68",
    waterTempUnit: "F",
    ecMscm: "1.8",
    note: "hot and dry in there",
  });
  if (!e) throw new Error("fixture envelope unexpectedly null");
  return { ...e } as unknown as Record<string, unknown>;
}

describe("snapshotFromEnvironmentCheck (#596)", () => {
  it("maps the three air metrics, labels manual, timestamps from entry_at", () => {
    const ts = minutesAgoIso(5);
    const snap = snapshotFromEnvironmentCheck(ts, envelope());
    expect(snap).not.toBeNull();
    expect(snap?.source).toBe("manual");
    expect(snap?.ts).toBe(ts);
    expect(snap?.temp).toBeCloseTo(35, 0);
    expect(snap?.rh).toBe(22);
    expect(snap?.vpd).toBe(3.1);
  });

  it("never maps water temperature or EC onto soil fields", () => {
    const snap = snapshotFromEnvironmentCheck(minutesAgoIso(1), envelope());
    expect(snap?.soil_temp).toBeNull();
    expect(snap?.soil_ec).toBeNull();
    expect(snap?.soil).toBeNull();
    expect(snap?.co2).toBeNull();
    expect(snap?.ppfd).toBeNull();
    expect(snap?.device_id).toBeNull();
  });

  it("returns null for a note-only envelope (not sensor evidence)", () => {
    const noteOnly = buildEnvironmentCheckDetails({ note: "smells fine" });
    expect(noteOnly).not.toBeNull();
    expect(
      snapshotFromEnvironmentCheck(minutesAgoIso(1), {
        ...(noteOnly as unknown as Record<string, unknown>),
      }),
    ).toBeNull();
  });

  // Read-time distrust (Codex review, PR #601): diary JSON may be legacy or
  // hand-written — never coerce, never trust the write-time gate.
  it("rejects coercible junk instead of coercing it (empty string, booleans, numeric strings)", () => {
    expect(
      snapshotFromEnvironmentCheck(minutesAgoIso(1), {
        temp_c: "",
        humidity_pct: false,
        vpd_kpa: true,
      }),
    ).toBeNull();
    expect(
      snapshotFromEnvironmentCheck(minutesAgoIso(1), {
        temp_c: "24.5",
        humidity_pct: "55",
        vpd_kpa: "1.1",
      }),
    ).toBeNull();
  });

  it("drops out-of-band values to null instead of surfacing implausible telemetry", () => {
    const snap = snapshotFromEnvironmentCheck(minutesAgoIso(1), {
      temp_c: 300, // impossible tent temperature
      humidity_pct: 55,
      vpd_kpa: -2,
    });
    expect(snap).not.toBeNull();
    expect(snap?.temp).toBeNull();
    expect(snap?.rh).toBe(55);
    expect(snap?.vpd).toBeNull();
    expect(
      snapshotFromEnvironmentCheck(minutesAgoIso(1), {
        temp_c: 300,
        humidity_pct: 101,
        vpd_kpa: -2,
      }),
    ).toBeNull();
  });

  it("returns null without a timestamp or with malformed input", () => {
    expect(snapshotFromEnvironmentCheck(null, envelope())).toBeNull();
    expect(snapshotFromEnvironmentCheck(minutesAgoIso(1), null)).toBeNull();
    expect(
      snapshotFromEnvironmentCheck(minutesAgoIso(1), {
        temp_c: "not-a-number",
        humidity_pct: Number.NaN,
        vpd_kpa: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });
});

describe("alert-persistence eligibility (#596)", () => {
  it("a fresh env-check snapshot is persistable manual evidence", () => {
    const snap = snapshotFromEnvironmentCheck(minutesAgoIso(5), envelope());
    expect(snap).not.toBeNull();
    expect(
      isSnapshotPersistable({
        snapshot: snap,
        quality: "watch",
        isDemoData: false,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("a stale env-check snapshot is not persistable", () => {
    const snap = snapshotFromEnvironmentCheck(minutesAgoIso(31), envelope());
    expect(snap).not.toBeNull();
    expect(
      isSnapshotPersistable({
        snapshot: snap,
        quality: "watch",
        isDemoData: false,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("the diary fence is unchanged: sensor_snapshot blobs stay diary and non-persistable", () => {
    const diarySnap = snapshotFromDiary(minutesAgoIso(2), {
      ts: minutesAgoIso(2),
      temp: 25,
      rh: 50,
    });
    expect(diarySnap?.source).toBe("diary");
    expect(
      isSnapshotPersistable({
        snapshot: diarySnap,
        quality: "watch",
        isDemoData: false,
        now: NOW,
      }),
    ).toBe(false);
  });
});
