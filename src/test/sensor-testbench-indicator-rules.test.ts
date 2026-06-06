import { describe, expect, it } from "vitest";
import {
  buildEcowittPowerShellSnippet,
  classifySensorTestbench,
  SENSOR_TESTBENCH_LIVE_WINDOW_MS,
} from "@/lib/sensorTestbenchIndicatorRules";

const NOW = new Date("2026-06-06T18:00:00Z");

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

  it("renders fresh non-testbench ecowitt as live", () => {
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
    expect(r.indicator).toBe("live");
    expect(r.isTestbench).toBe(false);
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
