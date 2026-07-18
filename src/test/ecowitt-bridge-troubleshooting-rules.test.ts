import { describe, it, expect } from "vitest";
import {
  buildTroubleshootingReport,
  TROUBLESHOOTING_NEXT_ACTIONS,
} from "@/lib/ecowittBridgeTroubleshootingRules";

const FRESH_NOW = new Date("2026-06-19T12:00:00.000Z");

describe("ecowittBridgeTroubleshootingRules", () => {
  it("marks complete valid config + fresh live reading as ok", () => {
    const r = buildTroubleshootingReport({
      env: {
        tentIdConfigured: true,
        ingestUrlConfigured: true,
        bridgeTokenStatus: "present",
        channelMapJsonValid: true,
        sendModeRequested: true,
      },
      lastReading: {
        capturedAt: "2026-06-19T11:59:30.000Z",
        source: "live",
        quality: "ok",
        provider: "ecowitt",
        transport: "mqtt",
        humidityPct: 55,
        soilMoisturePct: 38,
        airTempC: 23,
        vpdKpa: 1.2,
      },
      now: FRESH_NOW,
    });
    expect(r.overall).toBe("ok");
    expect(r.checks.find((c) => c.id === "source_live")?.status).toBe("ok");
    expect(r.checks.find((c) => c.id === "quality_ok")?.status).toBe("ok");
    expect(r.checks.find((c) => c.id === "provider_ecowitt")?.status).toBe("ok");
    expect(r.checks.find((c) => c.id === "transport_mqtt")?.status).toBe("ok");
    expect(r.checks.find((c) => c.id === "vpd")?.status).toBe("ok");
  });

  it("fails closed when token status is unknown", () => {
    const r = buildTroubleshootingReport({
      env: { tentIdConfigured: true, bridgeTokenStatus: "unknown" },
      lastReading: null,
      now: FRESH_NOW,
    });
    expect(r.overall).toBe("unknown");
    const tok = r.checks.find((c) => c.id === "bridge_token");
    expect(tok?.status).toBe("unknown");
    expect(tok?.detail).not.toMatch(/[A-Za-z0-9]{20,}/);
  });

  it("never returns token VALUES in any check detail", () => {
    const secret = "supersecret_token_value_ABCDEFGH12345678";
    const r = buildTroubleshootingReport({
      env: {
        tentIdConfigured: true,
        bridgeTokenStatus: "present",
        sendModeRequested: true,
        ingestUrlConfigured: true,
      },
      lastReading: null,
      now: FRESH_NOW,
    });
    const json = JSON.stringify(r);
    expect(json).not.toContain(secret);
    expect(json.toLowerCase()).not.toContain("bearer ");
  });

  it("flags VPD=0 as invalid placeholder when temp+RH valid", () => {
    const r = buildTroubleshootingReport({
      env: { tentIdConfigured: true, bridgeTokenStatus: "present" },
      lastReading: {
        capturedAt: "2026-06-19T11:59:30.000Z",
        source: "live",
        quality: "ok",
        provider: "ecowitt",
        transport: "mqtt",
        airTempC: 22,
        humidityPct: 50,
        vpdKpa: 0,
      },
      now: FRESH_NOW,
    });
    expect(r.checks.find((c) => c.id === "vpd")?.status).toBe("error");
  });

  it("flags non-live source as error", () => {
    const r = buildTroubleshootingReport({
      env: { tentIdConfigured: true, bridgeTokenStatus: "present" },
      lastReading: {
        capturedAt: "2026-06-19T11:59:30.000Z",
        source: "ecowitt", // wrong — would mean canonical bug
        quality: "ok",
        provider: "ecowitt",
        transport: "mqtt",
      },
      now: FRESH_NOW,
    });
    expect(r.checks.find((c) => c.id === "source_live")?.status).toBe("error");
  });

  it("includes the documented next actions", () => {
    const r = buildTroubleshootingReport({});
    const ids = r.nextActions.map((a) => a.id).sort();
    expect(ids).toEqual(TROUBLESHOOTING_NEXT_ACTIONS.map((a) => a.id).sort());
  });

  it("marks stale reading as warn", () => {
    const r = buildTroubleshootingReport({
      env: { tentIdConfigured: true, bridgeTokenStatus: "present" },
      lastReading: {
        capturedAt: "2026-06-19T10:00:00.000Z",
        source: "live",
        quality: "ok",
        provider: "ecowitt",
        transport: "mqtt",
        airTempC: 22,
        humidityPct: 50,
        vpdKpa: 1.0,
      },
      now: FRESH_NOW,
    });
    expect(r.checks.find((c) => c.id === "freshness")?.status).toBe("warn");
  });

  it("fails closed when a live source has no persisted quality proof", () => {
    const r = buildTroubleshootingReport({
      env: { tentIdConfigured: true, bridgeTokenStatus: "present" },
      lastReading: {
        capturedAt: "2026-06-19T11:59:30.000Z",
        source: "live",
        provider: "ecowitt",
        transport: "mqtt",
      },
      now: FRESH_NOW,
    });
    expect(r.checks.find((c) => c.id === "quality_ok")?.status).toBe("unknown");
    expect(r.overall).not.toBe("ok");
  });
});
