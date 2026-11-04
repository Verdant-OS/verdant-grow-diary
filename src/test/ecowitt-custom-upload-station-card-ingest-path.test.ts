import { describe, expect, it } from "vitest";
import * as ingestRules from "@/lib/ecowittCustomUploadIngestRules";
import {
  planEcowittCustomUploadIngest,
  type EcowittCustomUploadPlanInput,
} from "@/lib/ecowittCustomUploadIngestRules";
import {
  buildEcowittCustomUploadStationCard,
  ecowittStationFenceFromListRow,
  type EcowittStationReadingInput,
} from "@/lib/ecowittCustomUploadStationCardViewModel";
import { TimelineBoundedRead } from "@/lib/timelineBoundedRead";

// #2732 P3-1 follow-up: the custom-upload station card shows only rows the
// custom-upload planner wrote. Live rows from the older passkey bridge
// (`ecowitt-ingest`) and old rows with no marker are hidden from this card.

const MARKER = "ecowitt_custom_upload";
const NOW = new Date("2026-11-02T18:00:30.000Z");
const AT = "2026-11-02T18:00:00.000Z";
const OWNER = "11111111-1111-4111-8111-111111111111";
const TENT = "22222222-2222-4222-8222-222222222222";
const CLAIM = "44444444-4444-4444-8444-444444444444";

function row(
  metric: string,
  value: number,
  extra: Partial<EcowittStationReadingInput> = {},
): EcowittStationReadingInput {
  return { tentId: TENT, metric, value, source: "live", quality: "ok", capturedAt: AT, ...extra };
}

const marked = (metric: string, value: number, extra: Partial<EcowittStationReadingInput> = {}) =>
  row(metric, value, { ingestPath: MARKER, ...extra });

function card(readings: EcowittStationReadingInput[]) {
  return buildEcowittCustomUploadStationCard({
    tentId: TENT,
    now: NOW,
    lastReceivedAt: AT,
    claimState: "active",
    claimId: CLAIM,
    justCreatedToken: null,
    readings,
  });
}

function planInput(): EcowittCustomUploadPlanInput {
  return {
    method: "POST",
    pathname: `/ew/${"ef".repeat(24)}`,
    bodyByteLength: 180,
    fields: {
      PASSKEY: "ab".repeat(16),
      stationtype: "GW1200-fixture",
      dateutc: "2026-11-02 18:00:00",
      tempinf: "72.0",
      humidityin: "55",
      soilmoisture1: "40",
      co2: "800",
    },
    claim: {
      id: CLAIM,
      userId: OWNER,
      tentId: TENT,
      passkeySha256: null,
      stationtype: null,
      intervalSeconds: 16,
      revokedAt: null,
      lastReceivedAt: null,
      lastCapturedAt: null,
    },
    entitlement: "allowed",
    now: NOW,
    passkeySha256: "aa".repeat(32),
    airChannels: [],
    soilChannels: [],
  };
}

describe("EcoWitt custom-upload ingest_path marker (#2732 P3-1)", () => {
  it("exports the marker value the planner writes", () => {
    expect((ingestRules as Record<string, unknown>).ECOWITT_CUSTOM_UPLOAD_INGEST_PATH).toBe(MARKER);
  });

  it("stamps ingest_path and claim_id on every planned row, deterministically", () => {
    const first = planEcowittCustomUploadIngest(planInput());
    const second = planEcowittCustomUploadIngest(planInput());
    expect(first.rows.length).toBeGreaterThan(0);
    for (const planned of first.rows) {
      const payload = planned.rawPayload as Record<string, unknown>;
      expect(payload.ingest_path).toBe(MARKER);
      expect(payload.claim_id).toBe(CLAIM);
    }
    expect(second).toEqual(first);
  });

  it("selects the marker in the bounded list read and the card reads it", () => {
    expect(TimelineBoundedRead.sensorListSelect.split(",")).toContain(
      "ingest_path:raw_payload->>ingest_path",
    );
    const fence = ecowittStationFenceFromListRow({ ingest_path: MARKER });
    expect((fence as Record<string, unknown>).ingestPath).toBe(MARKER);
    expect((ecowittStationFenceFromListRow({}) as Record<string, unknown>).ingestPath).toBeNull();
  });

  it("shows a marked live row as Live", () => {
    const model = card([marked("temperature_c", 22.222222)]);
    expect(model.indoorTempF).toBe("72.0 °F");
    expect(model.freshness).toBe("live");
  });

  it("excludes an unmarked bridge live row on the same tent, even when it is newer", () => {
    const bridgeAt = "2026-11-02T18:00:20.000Z";
    const model = card([
      marked("temperature_c", 22.222222),
      row("temperature_c", 30, { capturedAt: bridgeAt, vendor: "ecowitt" }),
      row("humidity_pct", 61, { capturedAt: bridgeAt, vendor: "ecowitt" }),
    ]);
    expect(model.indoorTempF).toBe("72.0 °F");
    expect(model.indoorRh).toBeNull();
  });

  it("hides old rows missing the marker instead of showing them as custom-upload Live", () => {
    const model = card([row("temperature_c", 22.222222), row("co2_ppm", 800)]);
    expect(model.indoorTempF).toBeNull();
    expect(model.co2).toBeNull();
    expect(model.freshness).toBe("none");
    expect(model.freshnessLabel).toBeNull();
    expect(model.emptyMessage).not.toBeNull();
  });

  it("does not treat another ingest_path value as this station", () => {
    const model = card([row("temperature_c", 22.222222, { ingestPath: "ecowitt_passkey_bridge" })]);
    expect(model.indoorTempF).toBeNull();
  });

  it("keeps the testbench fence for marked rows", () => {
    const model = card([
      marked("temperature_c", 30, { vendor: "ecowitt_windows_testbench" }),
      marked("humidity_pct", 50, { confidence: "demo" }),
    ]);
    expect(model.indoorTempF).toBeNull();
    expect(model.indoorRh).toBeNull();
    expect(model.freshness).toBe("none");
  });

  it("keeps per-metric freshness for marked rows", () => {
    const old = "2026-10-31T18:00:00.000Z";
    const mixed = card([
      marked("temperature_c", 22.222222, { capturedAt: old }),
      marked("co2_ppm", 800),
    ]);
    expect(mixed.indoorTempF).toBeNull();
    expect(mixed.co2).toBe("800 ppm");
    expect(mixed.freshness).toBe("live");

    const allOld = card([marked("temperature_c", 22.222222, { capturedAt: old })]);
    expect(allOld.indoorTempF).toBe("72.0 °F");
    expect(allOld.freshness).toBe("stale");
  });
});
