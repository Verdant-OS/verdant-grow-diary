/**
 * Diagnostic-copy mapping + reason sanitization for the Sensors ingest test
 * classifier. Pins:
 *   - every sanitized webhook error code has friendly copy
 *   - reason strings that look like Bearer headers / JWTs / vbt_ tokens /
 *     service-role keys are redacted before being rendered.
 */

import { describe, expect, it } from "vitest";
import {
  classifySensorIngestTestResult,
  SANITIZED_WEBHOOK_ERROR_COPY,
} from "@/lib/sensorIngestTestResultRules";

const EXPECTED_CODES = [
  "unauthorized",
  "token_revoked",
  "token_expired",
  "server_misconfigured",
  "invalid_json",
  "invalid_payload",
  "forbidden_tent",
  "tent_lookup_failed",
  "insert_failed",
  "method_not_allowed",
  "internal_error",
  "auth_lookup_failed",
];

describe("SANITIZED_WEBHOOK_ERROR_COPY — every webhook code has copy", () => {
  for (const code of EXPECTED_CODES) {
    it(`has copy for "${code}"`, () => {
      expect(SANITIZED_WEBHOOK_ERROR_COPY[code]).toBeTruthy();
    });
  }

  it("none of the copy strings echo Bearer / Authorization / vbt_ / service_role", () => {
    for (const v of Object.values(SANITIZED_WEBHOOK_ERROR_COPY)) {
      expect(v).not.toMatch(/Bearer\s+\S+/i);
      expect(v).not.toMatch(/vbt_[A-Za-z0-9]/);
      expect(v).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});

describe("classifySensorIngestTestResult — copy/category coverage", () => {
  it("401 unauthorized is auth_problem with reason echoed (sanitized)", () => {
    const r = classifySensorIngestTestResult({ status: 401, body: { error: "unauthorized" } });
    expect(r.category).toBe("auth_problem");
    expect(r.detail).toContain("unauthorized");
    expect(r.corsWorking).toBe(true);
  });

  it("400 invalid_payload is payload_problem with reason echoed", () => {
    const r = classifySensorIngestTestResult({ status: 400, body: { error: "invalid_payload" } });
    expect(r.category).toBe("payload_problem");
    expect(r.detail).toContain("invalid_payload");
  });

  it("503 server_misconfigured does not leak Bearer/secret strings", () => {
    const r = classifySensorIngestTestResult({
      status: 503,
      body: { error: "server_misconfigured" },
    });
    expect(r.corsWorking).toBe(true);
    expect(r.detail).not.toMatch(/Bearer/i);
  });

  it("401 token_revoked maps to revoked-token copy (not unknown)", () => {
    const r = classifySensorIngestTestResult({
      status: 401,
      body: { error: "token_revoked" },
    });
    expect(r.category).toBe("auth_problem");
    expect(r.detail.toLowerCase()).toContain("revoked");
    expect(r.detail.toLowerCase()).toContain("new active bridge token");
    expect(r.detail.toLowerCase()).toContain(".env");
    expect(r.detail.toLowerCase()).toContain("restart the listener");
    expect(r.detail.toLowerCase()).not.toContain("unrecognized");
    expect(r.detail.toLowerCase()).not.toContain("unknown_webhook_error");
    // never echoes raw token shapes or Authorization headers
    expect(r.detail).not.toMatch(/vbt_[A-Za-z0-9]/);
    expect(r.detail).not.toMatch(/Bearer\s+\S+/i);
    expect(r.detail.toLowerCase()).not.toContain("authorization:");
    expect(r.detail.toLowerCase()).not.toContain("database");
  });

  it("401 token_expired maps to expired-token copy", () => {
    const r = classifySensorIngestTestResult({
      status: 401,
      body: { error: "token_expired" },
    });
    expect(r.category).toBe("auth_problem");
    expect(r.detail.toLowerCase()).toContain("expired");
    expect(r.detail.toLowerCase()).toContain("new active bridge token");
  });
});


describe("classifier reason sanitization — never echoes token-shaped strings", () => {
  const cases: Array<{ name: string; reason: string }> = [
    { name: "vbt_ bridge token", reason: "vbt_abcdefghijklmno_secret_value" },
    { name: "JWT-shaped", reason: "aaaaaaaa.bbbbbbbb.cccccccc" },
    { name: "Bearer header", reason: "Bearer vbt_xyz1234567890_secret" },
    { name: "sb_ service-role-like", reason: "sb_abcdefghijklmnopqrstuv" },
    { name: "service role env name", reason: "SUPABASE_SERVICE_ROLE_KEY=ey..." },
  ];

  for (const { name, reason } of cases) {
    it(`401 with reason=${name} is redacted in detail`, () => {
      const r = classifySensorIngestTestResult({
        status: 401,
        body: { error: null, reason },
      });
      expect(r.detail).not.toContain(reason);
      expect(r.detail.toLowerCase()).not.toMatch(/bearer\s+vbt_/);
      expect(r.detail).not.toMatch(/vbt_[A-Za-z0-9]{6,}/);
      expect(r.detail).not.toContain("SUPABASE_SERVICE_ROLE_KEY=ey");
    });
  }
});

describe("corsWorking flag — preflight vs server", () => {
  it("network error → corsWorking=false", () => {
    const r = classifySensorIngestTestResult({ status: 0, body: null, networkError: true });
    expect(r.corsWorking).toBe(false);
  });

  it("readable HTTP status → corsWorking=true", () => {
    for (const status of [200, 400, 401, 403, 404, 429, 500, 503]) {
      const r = classifySensorIngestTestResult({ status, body: { error: "x" } });
      expect(r.corsWorking, `status ${status}`).toBe(true);
    }
  });
});
