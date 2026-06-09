/**
 * Evidence-rich dry-run report tests for the EcoWitt MQTT runner.
 *
 * Covers:
 *  - payload-kind classification (real gateway vs fake local smoke vs unknown)
 *  - PASSKEY value redaction (key name allowed, value never)
 *  - canonical_metrics reflects ACTUAL produced values (no co2_ppm unless raw CO₂ present)
 *  - missing_metrics lists canonical keys not produced
 *  - terminal/report output never contains tokens, service_role, SUPABASE_, etc.
 */

import { describe, expect, it } from "vitest";
import {
  buildEcowittIngestEvidence,
  classifyEcowittPayloadKind,
  normalizeEcowittMqttPayload,
  type EcowittMqttPayload,
} from "@/lib/ecowittMqttIngestRules";
import { buildIngestAttemptReport } from "@/lib/ingestAttemptReportRules";
import { buildRedactedReportJson } from "../../scripts/dev/ecowitt-mqtt-runner";

const NOW = new Date("2026-06-09T13:51:00Z");
const FRESH = "2026-06-09 13:50:40";

const REAL_GATEWAY_PAYLOAD: EcowittMqttPayload = {
  PASSKEY: "DEADBEEFCAFEBABE0123456789ABCDEF",
  stationtype: "GW1200B_V1.4.2",
  model: "GW1200B",
  dateutc: FRESH,
  runtime: 12345,
  heap: 24000,
  freq: "915M",
  interval: 60,
  tempf: 76.3,
  humidity: 55,
  soilmoisture1: 38,
  // No CO₂ field — real outdoor gateway lacks it
};

const FAKE_SMOKE_PAYLOAD: EcowittMqttPayload = {
  dateutc: FRESH,
  temp1f: 78.6,
  humidity1: 56,
  soilmoisture1: 45,
  co2: 720,
  stationtype: "GW1200",
  transport: "mqtt_local_test",
  test_sender: true,
  source: "local_test_sender",
};

describe("classifyEcowittPayloadKind", () => {
  it("classifies real gateway payload as real_ecowitt_gateway", () => {
    expect(classifyEcowittPayloadKind(REAL_GATEWAY_PAYLOAD)).toBe("real_ecowitt_gateway");
  });
  it("classifies fake local smoke payload as fake_local_test", () => {
    expect(classifyEcowittPayloadKind(FAKE_SMOKE_PAYLOAD)).toBe("fake_local_test");
  });
  it("classifies unknown payload as unknown", () => {
    expect(classifyEcowittPayloadKind({ dateutc: FRESH, tempf: 70 })).toBe("unknown");
  });
  it("classifies null payload as unknown", () => {
    expect(classifyEcowittPayloadKind(null)).toBe("unknown");
  });
});

describe("buildEcowittIngestEvidence (real gateway, no CO₂)", () => {
  const norm = normalizeEcowittMqttPayload({
    payload: REAL_GATEWAY_PAYLOAD,
    tentId: "t-1",
    now: NOW,
  });
  const ev = buildEcowittIngestEvidence({
    payload: REAL_GATEWAY_PAYLOAD,
    draft: norm.draft,
    topic: "ecowitt/grow",
    receivedAt: NOW,
  });

  it("classifies as real_ecowitt_gateway with provider=Ecowitt", () => {
    expect(ev.payload_kind).toBe("real_ecowitt_gateway");
    expect(ev.provider).toBe("Ecowitt");
  });

  it("includes temp_f, humidity_pct, vpd_kpa, soil_moisture_pct in canonical_metrics", () => {
    expect(ev.canonical_metrics).toEqual(
      expect.arrayContaining(["temp_f", "humidity_pct", "vpd_kpa", "soil_moisture_pct"]),
    );
  });

  it("does NOT include co2_ppm when raw payload has no CO₂ field", () => {
    expect(ev.canonical_metrics).not.toContain("co2_ppm");
    expect(ev.missing_metrics).toContain("co2_ppm");
  });

  it("marks PASSKEY as redacted; value never appears anywhere", () => {
    expect(ev.redactions.passkey_redacted).toBe(true);
    const blob = JSON.stringify(ev);
    expect(blob).not.toContain("DEADBEEFCAFEBABE0123456789ABCDEF");
  });

  it("raw_keys_redacted lists key names (PASSKEY allowed as KEY) but no values", () => {
    expect(ev.raw_keys_redacted).toContain("PASSKEY");
    expect(ev.raw_keys_redacted).toContain("stationtype");
    // No values: ensure no temp value or passkey value leaked
    for (const k of ev.raw_keys_redacted) {
      expect(k).not.toMatch(/DEADBEEF/i);
      expect(k).not.toMatch(/76\.3/);
    }
  });

  it("forbidden output patterns are not present", () => {
    expect(ev.redactions.forbidden_strings_present_after_redaction).toBe(false);
  });
});

describe("buildEcowittIngestEvidence (fake smoke)", () => {
  const norm = normalizeEcowittMqttPayload({
    payload: FAKE_SMOKE_PAYLOAD,
    tentId: "t-1",
    now: NOW,
  });
  const ev = buildEcowittIngestEvidence({
    payload: FAKE_SMOKE_PAYLOAD,
    draft: norm.draft,
    topic: "ecowitt/grow",
    receivedAt: NOW,
  });

  it("is classified as fake_local_test, provider=unknown", () => {
    expect(ev.payload_kind).toBe("fake_local_test");
    expect(ev.provider).toBe("unknown");
  });

  it("includes co2_ppm only because fake payload provides co2", () => {
    expect(ev.canonical_metrics).toContain("co2_ppm");
  });

  it("transport reflects raw transport field", () => {
    expect(ev.transport).toBe("mqtt_local_test");
  });
});

describe("buildEcowittIngestEvidence (unknown payload)", () => {
  const payload: EcowittMqttPayload = { dateutc: FRESH, tempf: 70, humidity: 50 };
  const norm = normalizeEcowittMqttPayload({ payload, tentId: "t-1", now: NOW });
  const ev = buildEcowittIngestEvidence({
    payload,
    draft: norm.draft,
    topic: "ecowitt/grow",
    receivedAt: NOW,
  });
  it("is classified as unknown and provider=unknown", () => {
    expect(ev.payload_kind).toBe("unknown");
    expect(ev.provider).toBe("unknown");
  });
});

describe("buildRedactedReportJson (runner)", () => {
  const norm = normalizeEcowittMqttPayload({
    payload: REAL_GATEWAY_PAYLOAD,
    tentId: "t-1",
    now: NOW,
  });
  const ev = buildEcowittIngestEvidence({
    payload: REAL_GATEWAY_PAYLOAD,
    draft: norm.draft,
    topic: "ecowitt/grow",
    receivedAt: NOW,
  });
  const report = buildIngestAttemptReport({
    url: "https://example/functions/v1/sensor-ingest-webhook",
    token: "vbt_abcdef1234567890",
    tentId: "t-1",
    dryRun: true,
    normalizerReasons: norm.reasons,
    metricKeys: ev.canonical_metrics,
    evidence: ev,
  });
  const json = buildRedactedReportJson(report);
  const text = JSON.stringify(json);

  it("contains evidence with payload_kind=real_ecowitt_gateway", () => {
    const evidence = (json as { evidence: { payload_kind: string } }).evidence;
    expect(evidence.payload_kind).toBe("real_ecowitt_gateway");
  });

  it("never leaks the raw PASSKEY value", () => {
    expect(text).not.toContain("DEADBEEFCAFEBABE0123456789ABCDEF");
  });

  it("never leaks the raw bridge token (vbt_…)", () => {
    expect(text).not.toContain("vbt_abcdef1234567890");
    expect(text).not.toMatch(/Bearer vbt_[a-z0-9]{12,}/);
  });

  it("never contains service_role / SUPABASE_ literals", () => {
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/SUPABASE_[A-Z_]+/);
  });

  it("does NOT list co2_ppm in metric_keys for the real gateway payload", () => {
    expect((json as { metric_keys: string[] }).metric_keys).not.toContain("co2_ppm");
    expect((json as { evidence: { missing_metrics: string[] } }).evidence.missing_metrics)
      .toContain("co2_ppm");
  });
});
