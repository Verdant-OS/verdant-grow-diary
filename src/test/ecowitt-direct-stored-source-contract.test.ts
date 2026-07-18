import { describe, expect, it } from "vitest";
import { buildEcoWittRoutedRows, buildEcoWittStoredRows } from "@/lib/ecowittRoutedRowBuilder";

const FINGERPRINT = "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa";

function routedRows() {
  return buildEcoWittRoutedRows({
    userId: "11111111-1111-4111-8111-111111111111",
    payload: {
      temp1f: "77",
      humidity1: "55",
      soilmoisture1: "40",
    },
    payloadPasskeyFingerprint: FINGERPRINT,
    eligibleTents: [
      {
        tent_id: "22222222-2222-4222-8222-222222222222",
        passkey_fingerprint: FINGERPRINT,
        air_channels: [1],
        soil_channels: [1],
      },
    ],
    capturedAt: "2026-07-18T11:55:00.000Z",
    timestampSource: "ecowitt_dateutc",
  }).rows;
}

describe("direct EcoWitt final-storage source contract", () => {
  it("maps freshness-approved routed rows to canonical live with explicit EcoWitt lineage", () => {
    const routed = routedRows();
    const stored = buildEcoWittStoredRows(routed);

    expect(routed.length).toBeGreaterThan(0);
    expect(stored).toHaveLength(routed.length);
    expect(new Set(routed.map((row) => row.source))).toEqual(new Set(["ecowitt"]));

    for (const row of stored) {
      expect(row.source).toBe("live");
      expect(row.quality).toBe("ok");
      expect(row.raw_payload.provider).toBe("ecowitt");
      expect(row.raw_payload.vendor).toBe("ecowitt");
      expect(row.raw_payload.metadata).toEqual({
        transport_source: "ecowitt",
        verdant_source: "live",
      });
    }
  });

  it("is deterministic and does not mutate transport-stage rows", () => {
    const routed = routedRows();
    const before = structuredClone(routed);

    expect(buildEcoWittStoredRows(routed)).toEqual(buildEcoWittStoredRows(routed));
    expect(routed).toEqual(before);
  });

  it("keeps an empty routed result empty", () => {
    expect(buildEcoWittStoredRows([])).toEqual([]);
  });
});
