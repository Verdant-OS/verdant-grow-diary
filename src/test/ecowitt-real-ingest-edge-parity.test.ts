/**
 * EcoWitt Real Ingest — Phase 1.6 Edge / src/lib parity tests.
 *
 * Drives src/lib and supabase/functions/_shared/* implementations through
 * the same Phase 1.5 fixtures and asserts identical observable behavior.
 * Drift here means the deployed Edge runtime would behave differently
 * from the app-side validator and must fail.
 */
import { describe, it, expect } from "vitest";

import { validateEcoWittRealIngestCandidate as libValidate } from "@/lib/ecowittRealIngestValidator";
import { redactEcoWittRawPayload as libRedact } from "@/lib/ecowittRealIngestRedaction";
import { buildEcoWittRealIngestDedupeKey as libDedupe } from "@/lib/ecowittRealIngestDedupe";
import { validateEcoWittBridgeAuthorization as libAuth } from "@/lib/ecowittRealIngestAuth";
import { handleEcoWittRealIngestRequest as libHandle } from "@/lib/ecowittRealIngestEndpoint";

import { validateEcoWittRealIngestCandidate as edgeValidate } from "../../supabase/functions/_shared/ecowittRealIngestValidator.ts";
import { redactEcoWittRawPayload as edgeRedact } from "../../supabase/functions/_shared/ecowittRealIngestRedaction.ts";
import { buildEcoWittRealIngestDedupeKey as edgeDedupe } from "../../supabase/functions/_shared/ecowittRealIngestDedupe.ts";
import { validateEcoWittBridgeAuthorization as edgeAuth } from "../../supabase/functions/_shared/ecowittRealIngestAuth.ts";
import { handleEcoWittRealIngestRequest as edgeHandle } from "../../supabase/functions/_shared/ecowittRealIngestEndpoint.ts";

import {
  PHASE_ONE_FIXTURES,
  FIXTURE_DUMMY_SENSITIVE_STRINGS,
} from "./fixtures/ecowitt-real-ingest-phase1-fixtures";

function norm(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v));
}

describe("ecowitt-real-ingest edge parity — validator", () => {
  for (const fx of PHASE_ONE_FIXTURES) {
    it(`[${fx.id}] validator parity`, () => {
      const opts = {
        reference_time: fx.reference_time,
        freshness_window_ms: fx.freshness_window_ms,
      };
      const a = libValidate(fx.payload, opts);
      const b = edgeValidate(fx.payload, opts);
      expect(norm(b)).toEqual(norm(a));
    });
  }
});

describe("ecowitt-real-ingest edge parity — redaction", () => {
  it("redacts sensitive payload identically", () => {
    const payload = {
      passkey: FIXTURE_DUMMY_SENSITIVE_STRINGS.passkey,
      mac: FIXTURE_DUMMY_SENSITIVE_STRINGS.mac,
      nested: { gateway: FIXTURE_DUMMY_SENSITIVE_STRINGS.gateway, ok: 1 },
      arr: [{ ip: FIXTURE_DUMMY_SENSITIVE_STRINGS.ip }, "x"],
      keep: "fine",
    };
    expect(norm(edgeRedact(payload))).toEqual(norm(libRedact(payload)));
  });

  it("passes primitives/null/undefined through identically", () => {
    expect(edgeRedact(null)).toEqual(libRedact(null));
    expect(edgeRedact(undefined)).toEqual(libRedact(undefined));
    expect(edgeRedact(42)).toEqual(libRedact(42));
    expect(edgeRedact("hello")).toEqual(libRedact("hello"));
  });
});

describe("ecowitt-real-ingest edge parity — dedupe", () => {
  it("builds identical dedupe key for matching identity inputs", () => {
    const input = {
      tent_id: "11111111-1111-4111-8111-111111111111",
      plant_id: "22222222-2222-4222-8222-222222222222",
      source_identity: "fixture-cloud",
      device_identity: "FIXTURE-DEVICE-AAAA",
      captured_at: "2026-06-04T11:59:30.000Z",
      metric_keys: ["humidity_pct", "air_temp_f", "vpd_kpa"],
    };
    expect(edgeDedupe(input)).toEqual(libDedupe(input));
  });

  it("returns null on missing identity in both impls", () => {
    const bad = {
      tent_id: "",
      source_identity: "x",
      device_identity: "y",
      captured_at: "2026-06-04T11:59:30.000Z",
      metric_keys: ["a"],
    };
    expect(edgeDedupe(bad)).toBeNull();
    expect(libDedupe(bad)).toBeNull();
  });
});

describe("ecowitt-real-ingest edge parity — auth", () => {
  const cases: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["missing header", null, "expected-token"],
    ["empty header", "", "expected-token"],
    ["malformed header", "NotAScheme", "expected-token"],
    ["unsupported scheme", "Basic abc", "expected-token"],
    ["empty bearer token", "Bearer ", "expected-token"],
    ["wrong token", "Bearer wrong-token", "expected-token"],
    ["correct token", "Bearer expected-token", "expected-token"],
    ["server not configured", "Bearer abc", null],
    ["server not configured empty", "Bearer abc", ""],
  ];
  for (const [name, header, expected] of cases) {
    it(`[${name}] auth parity`, () => {
      expect(edgeAuth(header, expected)).toEqual(libAuth(header, expected));
    });
  }
});

describe("ecowitt-real-ingest edge parity — endpoint handler", () => {
  const TOKEN = "fixture-expected-token";

  for (const fx of PHASE_ONE_FIXTURES) {
    it(`[${fx.id}] handler parity with valid auth`, () => {
      const input = {
        authorizationHeader: `Bearer ${TOKEN}`,
        expectedToken: TOKEN,
        payload: fx.payload,
        reference_time: fx.reference_time,
        freshness_window_ms: fx.freshness_window_ms,
      };
      const a = libHandle(input);
      const b = edgeHandle(input);
      expect(norm(b)).toEqual(norm(a));
      // Token must never appear in response.
      const serialized = JSON.stringify(b);
      expect(serialized).not.toContain(TOKEN);
      for (const secret of Object.values(FIXTURE_DUMMY_SENSITIVE_STRINGS)) {
        if (fx.must_not_appear_in_response.includes(secret)) {
          expect(serialized).not.toContain(secret);
        }
      }
    });
  }

  it("rejects wrong token identically", () => {
    const fx = PHASE_ONE_FIXTURES[0];
    const input = {
      authorizationHeader: "Bearer wrong",
      expectedToken: TOKEN,
      payload: fx.payload,
      reference_time: fx.reference_time,
      freshness_window_ms: fx.freshness_window_ms,
    };
    expect(norm(edgeHandle(input))).toEqual(norm(libHandle(input)));
  });

  it("returns not_configured identically when server token missing", () => {
    const fx = PHASE_ONE_FIXTURES[0];
    const input = {
      authorizationHeader: "Bearer anything",
      expectedToken: null,
      payload: fx.payload,
      reference_time: fx.reference_time,
      freshness_window_ms: fx.freshness_window_ms,
    };
    expect(norm(edgeHandle(input))).toEqual(norm(libHandle(input)));
  });

  it("returns bad_request identically for malformed body", () => {
    const input = {
      authorizationHeader: `Bearer ${TOKEN}`,
      expectedToken: TOKEN,
      payload: { parse_error: true },
      reference_time: "2026-06-04T12:00:00.000Z",
      freshness_window_ms: 300_000,
    };
    expect(norm(edgeHandle(input))).toEqual(norm(libHandle(input)));
  });

  it("returns bad_request identically for non-object body", () => {
    const input = {
      authorizationHeader: `Bearer ${TOKEN}`,
      expectedToken: TOKEN,
      payload: "not-an-object" as unknown,
      reference_time: "2026-06-04T12:00:00.000Z",
      freshness_window_ms: 300_000,
    };
    expect(norm(edgeHandle(input))).toEqual(norm(libHandle(input)));
  });

  it("returns bad_request identically for missing body", () => {
    const input = {
      authorizationHeader: `Bearer ${TOKEN}`,
      expectedToken: TOKEN,
      payload: null as unknown,
      reference_time: "2026-06-04T12:00:00.000Z",
      freshness_window_ms: 300_000,
    };
    expect(norm(edgeHandle(input))).toEqual(norm(libHandle(input)));
  });

  it("deterministic across repeated calls", () => {
    const fx = PHASE_ONE_FIXTURES[0];
    const input = {
      authorizationHeader: `Bearer ${TOKEN}`,
      expectedToken: TOKEN,
      payload: fx.payload,
      reference_time: fx.reference_time,
      freshness_window_ms: fx.freshness_window_ms,
    };
    const r1 = edgeHandle(input);
    const r2 = edgeHandle(input);
    expect(norm(r2)).toEqual(norm(r1));
  });
});
