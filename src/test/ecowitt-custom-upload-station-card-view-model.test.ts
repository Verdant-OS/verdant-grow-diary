import { describe, expect, it } from "vitest";
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import { ECOWITT_CUSTOM_UPLOAD_INGEST_PATH } from "@/lib/ecowittCustomUploadIngestRules";
import { buildEcowittCustomUploadStationCard } from "@/lib/ecowittCustomUploadStationCardViewModel";

const NOW = new Date("2026-11-02T18:00:30.000Z");
const TENT = "22222222-2222-4222-8222-222222222222";
const TOKEN = "ef".repeat(24);

describe("EcoWitt customized-upload station card view model", () => {
  it("shows indoor Fahrenheit, soil, CO2, and a path with no leading slash", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: null,
      // #2732 P2-1: readings show only for a bound (active) claim.
      claimState: "active",
      claimId: "33333333-3333-4333-8333-333333333333",
      justCreatedToken: TOKEN,
      readings: [
        {
          tentId: TENT,
          metric: "temperature_c",
          value: 22.222222,
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
        {
          tentId: TENT,
          metric: "humidity_pct",
          value: 55,
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
        {
          tentId: TENT,
          metric: "soil_moisture_pct",
          value: 40,
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
        {
          tentId: TENT,
          metric: "co2_ppm",
          value: 800,
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
        {
          tentId: TENT,
          metric: "temperature_c",
          value: 99,
          source: "demo",
          quality: "ok",
          capturedAt: "2026-11-02T18:00:20.000Z",
        },
      ],
    });
    expect(model.emptyMessage).toBeNull();
    expect(model.freshness).toBe("live");
    expect(model.indoorTempF).toBe("72.0 °F");
    expect(model.indoorRh).toBe("55 %");
    expect(model.soil1).toBe("40 %");
    expect(model.co2).toBe("800 ppm");
    expect(model.settings.find((setting) => setting.label === "Path")?.value).toBe(`ew/${TOKEN}`);
    expect(model.settings.find((setting) => setting.label === "Path")?.value.startsWith("/")).toBe(
      false,
    );
  });

  it("says there is no live data instead of inventing numbers, and labels an old packet stale", () => {
    const empty = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: null,
      claimState: "none",
      justCreatedToken: null,
      readings: [],
    });
    expect(empty.emptyMessage).toBe(ECOWITT_CUSTOM_UPLOAD_COPY.empty);
    expect(empty.indoorTempF).toBeNull();
    expect(empty.freshness).toBe("none");
    expect(empty.settings.find((setting) => setting.label === "Path")?.value).toBe(
      ECOWITT_CUSTOM_UPLOAD_COPY.pathPlaceholder,
    );

    const stale = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      intervalSeconds: 16,
      lastReceivedAt: "2026-11-02T17:50:00.000Z",
      claimState: "active",
      justCreatedToken: null,
      readings: [
        {
          tentId: TENT,
          metric: "temperature_c",
          value: 20,
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "ok",
          capturedAt: "2026-11-02T17:50:00.000Z",
        },
      ],
    });
    expect(stale.freshness).toBe("stale");
    expect(stale.freshnessLabel).toBe(ECOWITT_CUSTOM_UPLOAD_COPY.stale);
    expect(stale.indoorTempF).toBe("68.0 °F");
    expect(stale.emptyMessage).toBeNull();
  });

  it("keeps numeric strings from sensor_readings and labels tent air", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: "2026-11-02T18:00:00.000Z",
      claimState: "active",
      justCreatedToken: null,
      readings: [
        {
          tentId: TENT,
          metric: "temperature_c",
          value: "22.2",
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
        {
          tentId: TENT,
          metric: "humidity_pct",
          value: "55",
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
      ],
    });
    expect(model.emptyMessage).toBeNull();
    expect(model.indoorTempF).toBe("72.0 °F");
    expect(model.indoorRh).toBe("55 %");
    expect(ECOWITT_CUSTOM_UPLOAD_COPY.indoorTemp).toBe("Tent temperature");
    expect(ECOWITT_CUSTOM_UPLOAD_COPY.indoorRh).toBe("Tent humidity");
  });

  it("shows a degraded rail reading instead of hiding it", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: "2026-11-02T18:00:00.000Z",
      claimState: "active",
      justCreatedToken: null,
      readings: [
        {
          tentId: TENT,
          metric: "soil_moisture_pct",
          value: 0,
          source: "live",
          ingestPath: ECOWITT_CUSTOM_UPLOAD_INGEST_PATH,
          quality: "degraded",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
      ],
    });
    expect(model.emptyMessage).toBeNull();
    expect(model.soil1).toBe("0 %");
    expect(model.edgeNote).toBe(ECOWITT_CUSTOM_UPLOAD_COPY.edgeRail);
  });

  it("hides create while the open-claim lookup is still pending", () => {
    const pending = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: null,
      claimState: "none",
      justCreatedToken: null,
      claimLookup: "pending",
      readings: [],
    });
    expect(pending.canCreateLink).toBe(false);
  });
});
