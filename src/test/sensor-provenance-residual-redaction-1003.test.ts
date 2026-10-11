/**
 * #1003 residual — credential VALUES and hardware ids must not survive the
 * provenance paths that #1163 left on a shape regex or a denylist:
 *
 *  - Quick Log adapter → resolveSensorSnapshotDisplay: `sourceDetail` and
 *    `originalSource` carried the raw provider string, and the slug-shaped
 *    regex accepts separator-free MACs, 32-hex passkeys, UUIDs and
 *    MAC-bearing station ids.
 *  - EcoWitt forwarding widget: the "Latest metrics" row rendered the raw
 *    source/vendor and every metric KEY, which were only denylist-scrubbed
 *    (keys never), instead of the export's allowlists.
 *  - sanitizeReportValue copied object keys verbatim.
 *
 * Safe provenance (canonical labels, reviewed aliases, vendor slugs) and
 * safe metrics are preserved.
 */
import { describe, expect, it } from "vitest";
import { adaptQuickLogSensorContextInput } from "@/lib/quickLogSensorSnapshotViewModelAdapter";
import { buildQuickLogSensorSnapshotViewModel } from "@/lib/quickLogSensorSnapshotViewModel";
import { resolveSensorSnapshotDisplay } from "@/lib/sensorSnapshotFreshnessRules";
import { EMPTY_SENSOR_SNAPSHOT, type SensorSnapshot } from "@/lib/latestSensorSnapshotRules";
import {
  normalizeLocalForwardingStatus,
  sanitizeReportValue,
} from "@/lib/ecowittLocalForwardingStatus";
import { buildForwardingStatusViewModel } from "@/lib/ecowittLocalForwardingStatusViewModel";

const CAPTURED_AT = "2026-08-27T10:00:00.000Z";
const NOW = new Date("2026-08-27T10:05:00.000Z");

const BARE_MAC = "accb88af4c01";
const DASH_MAC = "ac-cb-88-af-4c-01";
const PASSKEY_HEX = "d41d8cd98f00b204e9800998ecf8427e";
const UUID = "3f2b8c1e-9a4d-4e2b-8f1a-0c7d5e6b9a12";
const STATION_ID = "gw2000a-wifi4c01";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlX3ZhbHVl";
const BRIDGE_TOKEN = "vbt_secret_token_value_123456";

const TAINTED_SOURCES = [BARE_MAC, DASH_MAC, PASSKEY_HEX, UUID, STATION_ID] as const;

function snap(source: string): SensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "s1",
    tent_id: "t1",
    captured_at: CAPTURED_AT,
    age_minutes: 5,
    source,
    confidence: 0.9,
    freshness: "fresh",
    metrics: {
      temp_f: 77,
      humidity_pct: 55,
      vpd_kpa: 1.1,
      soil_moisture_pct: 40,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
  } as SensorSnapshot;
}

describe("Quick Log adapter — hardware ids / credential values in source (#1003)", () => {
  it.each(TAINTED_SOURCES)("%s never reaches the adapted input or the view model", (raw) => {
    const adapted = adaptQuickLogSensorContextInput({
      state: { status: "ready", snapshot: snap(raw) },
      tentId: "t1",
    });
    const vm = buildQuickLogSensorSnapshotViewModel(adapted, { now: NOW });
    expect(JSON.stringify(adapted)).not.toContain(raw);
    expect(JSON.stringify(vm)).not.toContain(raw);
    expect(vm.display?.effectiveSource ?? "invalid").not.toBe("live");
  });

  it.each(TAINTED_SOURCES)("resolver drops %s as source detail and original source", (raw) => {
    const d = resolveSensorSnapshotDisplay(
      { source: raw, sourceDetail: raw, capturedAt: CAPTURED_AT },
      { now: NOW },
    );
    expect(d.sourceDetail).toBeNull();
    expect(d.originalSource).toBeNull();
    expect(JSON.stringify(d)).not.toContain(raw);
  });

  it("a hardware-id source detail on a live reading is dropped, not upgraded or downgraded", () => {
    const d = resolveSensorSnapshotDisplay(
      { source: "live", sourceDetail: BARE_MAC, capturedAt: CAPTURED_AT },
      { now: NOW },
    );
    expect(d.effectiveSource).toBe("live");
    expect(d.sourceDetail).toBeNull();
  });

  it.each(["pi_bridge", "ecowitt", "ecowitt_mqtt", "ggs_controller", "home_assistant", "esp32"])(
    "safe provenance slug %s is preserved as source detail",
    (slug) => {
      const d = resolveSensorSnapshotDisplay(
        { source: "live", sourceDetail: slug, capturedAt: CAPTURED_AT },
        { now: NOW },
      );
      expect(d.sourceDetail).toBe(slug);
    },
  );

  it("canonical original source survives", () => {
    const d = resolveSensorSnapshotDisplay(
      { source: "Live", capturedAt: CAPTURED_AT },
      { now: NOW },
    );
    expect(d.originalSource).toBe("Live");
  });

  it("safe metrics are preserved for a tainted source", () => {
    const adapted = adaptQuickLogSensorContextInput({
      state: { status: "ready", snapshot: snap(BARE_MAC) },
      tentId: "t1",
    });
    expect(adapted.snapshot?.metrics?.map((m) => m.key)).toEqual(["temp", "rh", "vpd", "soil"]);
  });
});

function readyWithLatestMetrics(latest: Record<string, unknown>) {
  return {
    state: "ready" as const,
    status: normalizeLocalForwardingStatus({
      ok: true,
      forwarding_enabled: true,
      forwarding_ready: true,
      latest_metrics: latest,
    }),
  };
}

function latestRowValue(latest: Record<string, unknown>): string {
  const vm = buildForwardingStatusViewModel(readyWithLatestMetrics(latest), NOW.getTime());
  return vm.rows.find((r) => r.key === "latest_metrics")?.value ?? "";
}

describe("EcoWitt forwarding widget — latest metrics row is allowlisted (#1003)", () => {
  it("unknown / credential-shaped source renders as invalid, never echoed", () => {
    for (const raw of [BARE_MAC, PASSKEY_HEX, STATION_ID, "home_assistant"]) {
      const value = latestRowValue({ source: raw, metrics: { temp_f: 77 } });
      expect(value).not.toContain(raw);
      expect(value).toContain("source=invalid");
    }
  });

  it("non-allowlisted vendor (station id, MAC) is dropped", () => {
    for (const raw of [STATION_ID, BARE_MAC, DASH_MAC]) {
      const value = latestRowValue({ source: "live", vendor: raw, metrics: { temp_f: 77 } });
      expect(value).not.toContain(raw);
      expect(value).not.toContain("vendor=");
    }
  });

  it("credential-shaped metric keys never render; allowlisted keys do", () => {
    const value = latestRowValue({
      source: "live",
      vendor: "ecowitt",
      captured_at: "2026-08-27T10:00:00Z",
      metrics: {
        temp_f: 77,
        humidity_percent: 55,
        soil_moisture_pct: 40,
        co2_ppm: 900,
        [JWT]: 1,
        [BRIDGE_TOKEN]: 2,
        [DASH_MAC]: 3,
        raw_payload: 4,
      },
    });
    expect(value).toContain("source=live");
    expect(value).toContain("vendor=ecowitt");
    expect(value).toContain("metrics=temp_f,humidity_percent,soil_moisture_pct,co2_ppm");
    for (const leak of [JWT, BRIDGE_TOKEN, DASH_MAC, "raw_payload"]) {
      expect(value).not.toContain(leak);
    }
  });
});

describe("sanitizeReportValue — keys and array paths (#1003)", () => {
  it("scrubs credential-shaped object keys at every depth, including inside arrays", () => {
    const out = sanitizeReportValue({
      [DASH_MAC]: 1,
      nested: { [BRIDGE_TOKEN]: "x", list: [{ [UUID]: "y" }, JWT, [PASSKEY_HEX]] },
      temp_f: 77,
    });
    const json = JSON.stringify(out);
    for (const leak of [DASH_MAC, BRIDGE_TOKEN, UUID, JWT, PASSKEY_HEX]) {
      expect(json).not.toContain(leak);
    }
    expect((out as Record<string, unknown>).temp_f).toBe(77);
  });
});
