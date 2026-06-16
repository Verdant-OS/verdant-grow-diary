/**
 * EcoWitt Real Ingest — Phase 0 redaction + dedupe tests. Pure.
 */
import { describe, it, expect } from "vitest";
import {
  redactEcoWittRawPayload,
  ECOWITT_REAL_INGEST_REDACTED_LITERAL,
} from "../lib/ecowittRealIngestRedaction";
import { buildEcoWittRealIngestDedupeKey } from "../lib/ecowittRealIngestDedupe";

const R = ECOWITT_REAL_INGEST_REDACTED_LITERAL;

describe("redactEcoWittRawPayload", () => {
  it("redacts passkey/password/token/secret/auth/authorization keys", () => {
    const r = redactEcoWittRawPayload({
      passkey: "abc",
      password: "p",
      token: "t",
      Secret: "s",
      authorization: "Bearer x",
      auth: "x",
      keep: "ok",
    }) as Record<string, unknown>;
    expect(r.passkey).toBe(R);
    expect(r.password).toBe(R);
    expect(r.token).toBe(R);
    expect(r.Secret).toBe(R);
    expect(r.authorization).toBe(R);
    expect(r.auth).toBe(R);
    expect(r.keep).toBe("ok");
  });

  it("redacts mac/ip/station/gateway keys", () => {
    const r = redactEcoWittRawPayload({
      MAC: "AA:BB",
      ip: "1.2.3.4",
      station_id: "ST1",
      gateway: "GW",
      tent_id: "preserved",
    }) as Record<string, unknown>;
    expect(r.MAC).toBe(R);
    expect(r.ip).toBe(R);
    expect(r.station_id).toBe(R);
    expect(r.gateway).toBe(R);
    expect(r.tent_id).toBe("preserved");
  });

  it("redacts nested objects", () => {
    const r = redactEcoWittRawPayload({
      device: { mac: "AA:BB", model: "WS-1" },
      meta: { auth: "x", count: 3 },
    }) as Record<string, Record<string, unknown>>;
    expect(r.device.mac).toBe(R);
    expect(r.device.model).toBe("WS-1");
    expect(r.meta.auth).toBe(R);
    expect(r.meta.count).toBe(3);
  });

  it("redacts inside arrays", () => {
    const r = redactEcoWittRawPayload([
      { token: "x", n: 1 },
      { token: "y", n: 2 },
    ]) as Array<Record<string, unknown>>;
    expect(r[0].token).toBe(R);
    expect(r[1].token).toBe(R);
    expect(r[0].n).toBe(1);
  });

  it("preserves safe fields and primitive input", () => {
    expect(redactEcoWittRawPayload(42)).toBe(42);
    expect(redactEcoWittRawPayload("hello")).toBe("hello");
    expect(redactEcoWittRawPayload(null)).toBeNull();
    expect(redactEcoWittRawPayload(undefined)).toBeUndefined();
    const r = redactEcoWittRawPayload({ tempf: 75, humidity: 55 }) as Record<string, unknown>;
    expect(r.tempf).toBe(75);
    expect(r.humidity).toBe(55);
  });

  it("does not mutate the original payload", () => {
    const orig = { token: "x", nested: { mac: "AA" } };
    const snapshot = JSON.stringify(orig);
    redactEcoWittRawPayload(orig);
    expect(JSON.stringify(orig)).toBe(snapshot);
  });
});

const T = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";

const baseDedupeInput = () => ({
  tent_id: T,
  plant_id: P,
  source_identity: "ecowitt-cloud",
  device_identity: "ECOWITT-DEVICE-AB12",
  captured_at: "2026-06-04T11:59:30.000Z",
  metric_keys: ["humidity_pct", "air_temp_f"],
});

describe("buildEcoWittRealIngestDedupeKey", () => {
  it("is stable for the same logical payload regardless of metric_keys order", () => {
    const a = buildEcoWittRealIngestDedupeKey(baseDedupeInput())!;
    const b = buildEcoWittRealIngestDedupeKey({
      ...baseDedupeInput(),
      metric_keys: ["air_temp_f", "humidity_pct"],
    })!;
    expect(a).toBe(b);
  });

  it("sorts metric keys alphabetically in the key", () => {
    const k = buildEcoWittRealIngestDedupeKey(baseDedupeInput())!;
    expect(k.endsWith("air_temp_f,humidity_pct")).toBe(true);
  });

  it("changes when captured_at changes", () => {
    const a = buildEcoWittRealIngestDedupeKey(baseDedupeInput());
    const b = buildEcoWittRealIngestDedupeKey({
      ...baseDedupeInput(),
      captured_at: "2026-06-04T11:59:31.000Z",
    });
    expect(a).not.toBe(b);
  });

  it("changes when tent_id changes", () => {
    const a = buildEcoWittRealIngestDedupeKey(baseDedupeInput());
    const b = buildEcoWittRealIngestDedupeKey({
      ...baseDedupeInput(),
      tent_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(a).not.toBe(b);
  });

  it("changes when the metric set changes", () => {
    const a = buildEcoWittRealIngestDedupeKey(baseDedupeInput());
    const b = buildEcoWittRealIngestDedupeKey({
      ...baseDedupeInput(),
      metric_keys: ["humidity_pct"],
    });
    expect(a).not.toBe(b);
  });

  it("returns null when required identity fields are missing", () => {
    expect(
      buildEcoWittRealIngestDedupeKey({ ...baseDedupeInput(), tent_id: "" }),
    ).toBeNull();
    expect(
      buildEcoWittRealIngestDedupeKey({
        ...baseDedupeInput(),
        device_identity: "",
      }),
    ).toBeNull();
    expect(
      buildEcoWittRealIngestDedupeKey({
        ...baseDedupeInput(),
        source_identity: "",
      }),
    ).toBeNull();
    expect(
      buildEcoWittRealIngestDedupeKey({
        ...baseDedupeInput(),
        captured_at: "",
      }),
    ).toBeNull();
  });

  it("uses 'none' segment when plant_id is missing", () => {
    const k = buildEcoWittRealIngestDedupeKey({
      ...baseDedupeInput(),
      plant_id: null,
    })!;
    expect(k).toContain(`:${T}:none:`);
  });

  it("does not include raw payload, secrets, or sensitive tokens", () => {
    const k = buildEcoWittRealIngestDedupeKey(baseDedupeInput())!;
    expect(k).not.toMatch(/passkey|password|token|secret|authorization/i);
    // Identity values are intentionally part of the key, but no raw payload
    // ever gets passed in — it is not part of the function input shape.
    expect(k.startsWith("ecowitt:v1:")).toBe(true);
  });
});
