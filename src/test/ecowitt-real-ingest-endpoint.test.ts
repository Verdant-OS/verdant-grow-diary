/**
 * EcoWitt Real Ingest — Phase 1 endpoint shell tests.
 *
 * Drives the pure handler (`handleEcoWittRealIngestRequest`) end-to-end.
 * No network, no Supabase, no Edge runtime. Validates auth boundary,
 * malformed-body handling, validator integration, redaction in the
 * response, dedupe-key surfacing, and the no-persistence contract.
 */
import { describe, it, expect } from "vitest";
import {
  handleEcoWittRealIngestRequest,
  type EcoWittRealIngestEndpointResponse,
} from "@/lib/ecowittRealIngestEndpoint";

const TOKEN = "vbt_phase1_endpoint_test_token";
const REF = "2026-06-04T12:00:00.000Z";
const FRESH_MS = 5 * 60 * 1000;
const UUID_TENT = "11111111-1111-4111-8111-111111111111";
const UUID_PLANT = "22222222-2222-4222-8222-222222222222";

const validPayload = () => ({
  tent_id: UUID_TENT,
  plant_id: UUID_PLANT,
  source: "live" as const,
  captured_at: "2026-06-04T11:59:30.000Z",
  device_identity: "ECOWITT-DEVICE-AB12",
  source_identity: "ecowitt-cloud",
  confidence: "high" as const,
  readings: { air_temp_f: 75, humidity_pct: 55, vpd_kpa: 1.1 },
  raw_payload: {
    passkey: "SECRET-PASSKEY-VALUE",
    mac: "AA:BB:CC:DD:EE:FF",
    ip: "192.168.1.50",
    station: "EcoWitt-Station-9",
    nested: { gateway: "gw-12345", safe_field: "ok" },
    safe_top: "fine",
  },
});

const baseInput = (overrides: Partial<Parameters<typeof handleEcoWittRealIngestRequest>[0]> = {}) => ({
  authorizationHeader: `Bearer ${TOKEN}`,
  expectedToken: TOKEN,
  payload: validPayload(),
  reference_time: REF,
  freshness_window_ms: FRESH_MS,
  ...overrides,
});

function assertNoPersistenceClaim(r: EcoWittRealIngestEndpointResponse) {
  const s = JSON.stringify(r).toLowerCase();
  expect(s).not.toContain("stored");
  expect(s).not.toContain("persisted");
  expect(s).not.toContain("inserted");
  // Note string should make non-persistence explicit
  expect(r.note).toMatch(/does not store/i);
}

describe("handleEcoWittRealIngestRequest — auth boundary", () => {
  it("401 unauthorized when authorization header is missing", () => {
    const r = handleEcoWittRealIngestRequest(baseInput({ authorizationHeader: undefined }));
    expect(r.http_status).toBe(401);
    expect(r.status).toBe("unauthorized");
    expect(r.accepted).toBe(false);
    expect(r.can_persist_later).toBe(false);
  });

  it("403 forbidden when bearer token is wrong", () => {
    const r = handleEcoWittRealIngestRequest(baseInput({ authorizationHeader: "Bearer nope" }));
    expect(r.http_status).toBe(403);
    expect(r.status).toBe("forbidden");
  });

  it("503 not_configured when server has no expected token", () => {
    const r = handleEcoWittRealIngestRequest(baseInput({ expectedToken: "" }));
    expect(r.http_status).toBe(503);
    expect(r.status).toBe("not_configured");
    expect(r.accepted).toBe(false);
  });

  it("never echoes the bearer token in the response", () => {
    const cases = [
      handleEcoWittRealIngestRequest(baseInput()),
      handleEcoWittRealIngestRequest(baseInput({ authorizationHeader: `Bearer ${TOKEN}`, expectedToken: "different" })),
      handleEcoWittRealIngestRequest(baseInput({ expectedToken: "" })),
    ];
    for (const r of cases) {
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    }
  });
});

describe("handleEcoWittRealIngestRequest — body shape", () => {
  it("400 bad_request when payload is null", () => {
    const r = handleEcoWittRealIngestRequest(baseInput({ payload: null }));
    expect(r.http_status).toBe(400);
    expect(r.status).toBe("bad_request");
  });

  it("400 bad_request when payload is undefined", () => {
    const r = handleEcoWittRealIngestRequest(baseInput({ payload: undefined }));
    expect(r.http_status).toBe(400);
  });

  it("400 bad_request on malformed JSON sentinel from wrapper", () => {
    const r = handleEcoWittRealIngestRequest(baseInput({ payload: { parse_error: true } }));
    expect(r.http_status).toBe(400);
    expect(r.blocked_reasons).toContain("bad_request:malformed_json");
  });

  it("400 bad_request when payload is not an object", () => {
    const r = handleEcoWittRealIngestRequest(baseInput({ payload: "string-payload" }));
    expect(r.http_status).toBe(400);
  });
});

describe("handleEcoWittRealIngestRequest — validation outcome", () => {
  it("422 rejected_candidate when validator blocks (non-uuid tent_id)", () => {
    const r = handleEcoWittRealIngestRequest(
      baseInput({ payload: { ...validPayload(), tent_id: "not-a-uuid" } }),
    );
    expect(r.http_status).toBe(422);
    expect(r.status).toBe("rejected_candidate");
    expect(r.accepted).toBe(false);
    expect(r.can_persist_later).toBe(false);
    expect(r.blocked_reasons.length).toBeGreaterThan(0);
    expect(r.blocked_reasons).toContain("non_uuid_tent_id");
  });

  it("422 rejected_candidate when source is not live", () => {
    const r = handleEcoWittRealIngestRequest(
      baseInput({ payload: { ...validPayload(), source: "demo" } }),
    );
    expect(r.http_status).toBe(422);
    expect(r.blocked_reasons).toContain("source_not_live");
  });

  it("202 accepted_candidate on a valid live candidate", () => {
    const r = handleEcoWittRealIngestRequest(baseInput());
    expect(r.http_status).toBe(202);
    expect(r.status).toBe("accepted_candidate");
    expect(r.accepted).toBe(true);
    expect(r.can_persist_later).toBe(true);
    expect(r.captured_at).toBe("2026-06-04T11:59:30.000Z");
    expect(r.source).toBe("live");
  });

  it("accepted response includes a dedupe_key", () => {
    const r = handleEcoWittRealIngestRequest(baseInput());
    expect(typeof r.dedupe_key).toBe("string");
    expect(r.dedupe_key && r.dedupe_key.length).toBeGreaterThan(0);
    expect(r.dedupe_key).toMatch(/^ecowitt:v1:/);
  });

  it("accepted response does not claim persisted/stored/live-label", () => {
    const r = handleEcoWittRealIngestRequest(baseInput());
    assertNoPersistenceClaim(r);
  });
});

describe("handleEcoWittRealIngestRequest — redaction & secrets", () => {
  it("redacts passkey/mac/ip/station/gateway in the payload preview", () => {
    const r = handleEcoWittRealIngestRequest(baseInput());
    const s = JSON.stringify(r.redacted_payload_preview);
    expect(s).not.toContain("SECRET-PASSKEY-VALUE");
    expect(s).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(s).not.toContain("192.168.1.50");
    expect(s).not.toContain("EcoWitt-Station-9");
    expect(s).not.toContain("gw-12345");
    // Safe fields remain
    expect(s).toContain("fine");
    expect(s).toContain("ok");
    expect(s).toContain("[REDACTED]");
  });

  it("redacted preview is present on rejected responses too", () => {
    const r = handleEcoWittRealIngestRequest(
      baseInput({ payload: { ...validPayload(), tent_id: "not-a-uuid" } }),
    );
    const s = JSON.stringify(r.redacted_payload_preview);
    expect(s).not.toContain("SECRET-PASSKEY-VALUE");
  });
});

describe("handleEcoWittRealIngestRequest — determinism & no side effects", () => {
  it("is deterministic for the same input + reference_time", () => {
    const a = handleEcoWittRealIngestRequest(baseInput());
    const b = handleEcoWittRealIngestRequest(baseInput());
    expect(a).toEqual(b);
  });

  it("does not mutate the input payload", () => {
    const payload = validPayload();
    const snapshot = JSON.parse(JSON.stringify(payload));
    handleEcoWittRealIngestRequest(baseInput({ payload }));
    expect(payload).toEqual(snapshot);
  });
});
