import { describe, expect, it } from "vitest";
import {
  buildEcowittPowerShellSnippet,
  classifySensorTestbench,
  isSensorTestbenchProvenance,
  isSensorTestbenchRow,
  SENSOR_TESTBENCH_LIVE_WINDOW_MS,
} from "@/lib/sensorTestbenchIndicatorRules";

const NOW = new Date("2026-06-06T18:00:00Z");

describe("shared testbench provenance fence", () => {
  it("recognizes explicit test confidence case-insensitively", () => {
    expect(isSensorTestbenchProvenance({ confidence: " TEST " })).toBe(true);
  });

  it("recognizes explicit demo confidence case-insensitively", () => {
    expect(isSensorTestbenchProvenance({ confidence: " DEMO " })).toBe(true);
  });

  it("requires explicit physical gateway evidence in addition to the preserved live source", () => {
    expect(
      isSensorTestbenchProvenance({
        vendor: " ECOWITT_WINDOWS_TESTBENCH ",
        verdantSource: "demo",
      }),
    ).toBe(true);
    expect(
      isSensorTestbenchProvenance({
        vendor: " ECOWITT_WINDOWS_TESTBENCH ",
        verdantSource: " LIVE ",
      }),
    ).toBe(true);
    expect(
      isSensorTestbenchProvenance({
        vendor: " ECOWITT_WINDOWS_TESTBENCH ",
        verdantSource: " LIVE ",
        physicalGatewayEvidence: true,
      }),
    ).toBe(false);
  });

  it("fails closed when the historical listener vendor lacks source lineage", () => {
    expect(isSensorTestbenchProvenance({ vendor: "ecowitt_windows_testbench" })).toBe(true);
  });

  it("fails closed for a legacy top-level listener source without raw provenance", () => {
    expect(isSensorTestbenchRow({ source: "ecowitt_windows_testbench" })).toBe(true);
  });

  it("fails closed when only the canonical verdant_source mirror says live", () => {
    expect(
      isSensorTestbenchRow({
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "high", verdant_source: "live" },
        },
      }),
    ).toBe(true);
  });

  it("does not flag a physical EcoWitt bridge row with preserved source and gateway markers", () => {
    expect(isSensorTestbenchProvenance({ vendor: "ecowitt_local_bridge" })).toBe(false);
    expect(
      isSensorTestbenchRow({
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: {
            confidence: "high",
            reported_verdant_source: "live",
            raw_payload: {
              stationtype: "GW2000A_V3.2.4",
              model: "GW2000A",
              dateutc: "2026-06-06 17:59:00",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("does not count a stripped secret plus one forwarded marker as physical proof", () => {
    expect(
      isSensorTestbenchRow({
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: {
            reported_verdant_source: "live",
            raw_payload: {
              PASSKEY: "redacted-before-storage",
              stationtype: "GW2000A_V3.2.4",
            },
          },
        },
      }),
    ).toBe(true);
  });
});

describe("classifySensorTestbench", () => {
  it("returns 'none' when there are no rows", () => {
    const r = classifySensorTestbench({ rows: [], now: NOW });
    expect(r.indicator).toBe("none");
    expect(r.latestAtIso).toBeNull();
  });

  it("flags vendor=ecowitt_windows_testbench as testbench even when fresh", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "ecowitt",
          captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
          raw_payload: { vendor: "ecowitt_windows_testbench" },
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("testbench");
    expect(r.isTestbench).toBe(true);
    expect(r.vendor).toBe("ecowitt_windows_testbench");
  });

  it("flags metadata.confidence=test as testbench", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "ecowitt",
          captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
          raw_payload: { metadata: { confidence: "test" } },
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("testbench");
    expect(r.confidence).toBe("test");
  });

  it.each(["test", "demo"])(
    "keeps canonical source=live with confidence=%s in the testbench state",
    (confidence) => {
      const r = classifySensorTestbench({
        rows: [
          {
            source: "live",
            captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
            raw_payload: {
              vendor: "ecowitt_windows_testbench",
              metadata: { confidence, verdant_source: "live" },
            },
          },
        ],
        now: NOW,
      });
      expect(r.indicator).toBe("testbench");
      expect(r.isTestbench).toBe(true);
      expect(r.confidence).toBe(confidence);
    },
  );

  it("renders fresh physical Windows-listener lineage with preserved source and gateway markers as live", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "live",
          quality: "ok",
          captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: {
              confidence: "high",
              reported_verdant_source: "live",
              raw_payload: {
                stationtype: "GW2000A_V3.2.4",
                model: "GW2000A",
                dateutc: "2026-06-06 17:59:00",
              },
            },
          },
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("live");
    expect(r.isTestbench).toBe(false);
    expect(r.source).toBe("live");
  });

  it("does not promote a fresh noncanonical ecowitt source to live", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "ecowitt",
          captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
          raw_payload: { vendor: "ecowitt" },
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("stale");
    expect(r.isTestbench).toBe(false);
  });

  it("does not promote canonical live without exact quality proof", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "live",
          captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
          raw_payload: { vendor: "ecowitt" },
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("stale");
  });

  it("renders aged ingest as stale", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "ecowitt",
          captured_at: new Date(
            NOW.getTime() - SENSOR_TESTBENCH_LIVE_WINDOW_MS - 60_000,
          ).toISOString(),
          raw_payload: {},
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("stale");
  });

  it("never promotes manual readings to live", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "manual",
          captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
          raw_payload: {},
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("stale");
  });

  it("picks the most recent row regardless of array order", () => {
    const r = classifySensorTestbench({
      rows: [
        {
          source: "ecowitt",
          captured_at: new Date(NOW.getTime() - 9_000_000).toISOString(),
          raw_payload: {},
        },
        {
          source: "ecowitt",
          captured_at: new Date(NOW.getTime() - 30_000).toISOString(),
          raw_payload: { vendor: "ecowitt_windows_testbench" },
        },
      ],
      now: NOW,
    });
    expect(r.indicator).toBe("testbench");
  });
});

describe("buildEcowittPowerShellSnippet", () => {
  const url = "https://example.supabase.co/functions/v1/sensor-ingest-webhook";

  it("includes tent id and plaintext token when both present", () => {
    const snippet = buildEcowittPowerShellSnippet({
      tentId: "tent-uuid",
      bridgeTokenPlaintext: "vbt_abcdef1234567890",
      ingestUrl: url,
    });
    expect(snippet).toContain('VERDANT_TENT_ID = "tent-uuid"');
    expect(snippet).toContain('VERDANT_BRIDGE_TOKEN = "vbt_abcdef1234567890"');
    expect(snippet).toContain(`VERDANT_INGEST_URL = "${url}"`);
  });

  it("uses a placeholder when token is missing", () => {
    const snippet = buildEcowittPowerShellSnippet({
      tentId: "tent-uuid",
      bridgeTokenPlaintext: null,
      ingestUrl: url,
    });
    expect(snippet).toMatch(/<vbt_/);
  });

  it("uses a placeholder when token does not look like a bridge token", () => {
    const snippet = buildEcowittPowerShellSnippet({
      tentId: "tent-uuid",
      bridgeTokenPlaintext: "not-a-real-token",
      ingestUrl: url,
    });
    expect(snippet).toMatch(/<vbt_/);
    expect(snippet).not.toContain("not-a-real-token");
  });

  it("uses a placeholder when tent id is missing", () => {
    const snippet = buildEcowittPowerShellSnippet({
      tentId: null,
      bridgeTokenPlaintext: null,
      ingestUrl: url,
    });
    expect(snippet).toContain("<TENT-UUID>");
  });
});
