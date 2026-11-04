import { describe, expect, it } from "vitest";
import {
  buildEcowittCustomUploadStationCard,
  type EcowittStationReadingInput,
} from "@/lib/ecowittCustomUploadStationCardViewModel";

// #2732 Reviewer D P2-1: testbench and other-pathway live rows must never
// render as "Live" on the customized-upload station card.

const NOW = new Date("2026-11-02T18:00:30.000Z");
const TENT = "22222222-2222-4222-8222-222222222222";
const AT = "2026-11-02T18:00:00.000Z";

function live(
  metric: string,
  value: number,
  extra: Partial<EcowittStationReadingInput> = {},
): EcowittStationReadingInput {
  return { tentId: TENT, metric, value, source: "live", quality: "ok", capturedAt: AT, ...extra };
}

function card(readings: EcowittStationReadingInput[], claimState: "active" | "unbound" | "none") {
  return buildEcowittCustomUploadStationCard({
    tentId: TENT,
    now: NOW,
    lastReceivedAt: claimState === "active" ? AT : null,
    claimState,
    claimId: claimState === "none" ? null : "33333333-3333-4333-8333-333333333333",
    justCreatedToken: null,
    readings,
  });
}

describe("EcoWitt station card testbench fence (#2732 P2-1)", () => {
  it("drops a Windows-testbench live row even with an active claim", () => {
    const model = card(
      [live("temperature_c", 30, { vendor: "ecowitt_windows_testbench", confidence: null })],
      "active",
    );
    expect(model.freshness).toBe("none");
    expect(model.freshnessLabel).toBeNull();
    expect(model.indoorTempF).toBeNull();
  });

  it("drops a live row whose confidence is test or demo", () => {
    for (const confidence of ["test", "demo", " Demo "]) {
      const model = card([live("humidity_pct", 50, { confidence })], "active");
      expect(model.indoorRh).toBeNull();
      expect(model.freshness).toBe("none");
    }
  });

  it("keeps the physical-gateway exception of the shared detector", () => {
    const model = card(
      [
        live("temperature_c", 22.222222, {
          vendor: "ecowitt_windows_testbench",
          reportedVerdantSource: "live",
          gatewayMarkerCount: 2,
        }),
      ],
      "active",
    );
    expect(model.indoorTempF).toBe("72.0 °F");
    expect(model.freshness).toBe("live");
  });

  it("shows no values until a claim is bound (unbound or no claim)", () => {
    for (const state of ["unbound", "none"] as const) {
      const model = card([live("temperature_c", 22.222222)], state);
      expect(model.indoorTempF).toBeNull();
      expect(model.freshnessLabel).toBeNull();
    }
  });

  it("still shows a clean live row for an active claim, and old rows without fence fields", () => {
    const model = card([live("temperature_c", 22.222222)], "active");
    expect(model.indoorTempF).toBe("72.0 °F");
    expect(model.freshness).toBe("live");
  });
});

describe("ecowittStationFenceFromListRow", () => {
  it("reads flattened fence columns and counts gateway markers", async () => {
    const { ecowittStationFenceFromListRow } =
      await import("@/lib/ecowittCustomUploadStationCardViewModel");
    expect(
      ecowittStationFenceFromListRow({
        vendor: "ecowitt_windows_testbench",
        confidence: "test",
        reported_verdant_source: "live",
        gateway_stationtype: "GW1200",
        gateway_model: "",
        gateway_freq: "915M",
        gateway_runtime: null,
      }),
    ).toEqual({
      vendor: "ecowitt_windows_testbench",
      confidence: "test",
      reportedVerdantSource: "live",
      gatewayMarkerCount: 2,
    });
    expect(ecowittStationFenceFromListRow({ raw_payload: { vendor: "x" } })).toEqual({
      vendor: null,
      confidence: null,
      reportedVerdantSource: null,
      gatewayMarkerCount: 0,
    });
  });
});

describe("EcoWitt station card per-metric staleness (#2732 review 5761010782 P2-1)", () => {
  it("drops a days-old metric while a fresh metric keeps the card live", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      intervalSeconds: 60,
      lastReceivedAt: AT,
      claimState: "active",
      claimId: "33333333-3333-4333-8333-333333333333",
      justCreatedToken: null,
      readings: [
        live("co2_ppm", 800),
        live("temperature_c", 30, { capturedAt: "2026-10-30T18:00:00.000Z" }),
        live("humidity_pct", 50, { capturedAt: "2026-10-30T18:00:00.000Z" }),
      ],
    });
    expect(model.co2).toBe("800 ppm");
    expect(model.freshness).toBe("live");
    expect(model.indoorTempF).toBeNull();
    expect(model.indoorRh).toBeNull();
  });

  it("labels the card stale when every metric is older than three intervals", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      intervalSeconds: 60,
      lastReceivedAt: AT,
      claimState: "active",
      claimId: "33333333-3333-4333-8333-333333333333",
      justCreatedToken: null,
      readings: [live("temperature_c", 30, { capturedAt: "2026-11-02T17:50:00.000Z" })],
    });
    expect(model.indoorTempF).toBe("86.0 °F");
    expect(model.freshness).toBe("stale");
  });
});
