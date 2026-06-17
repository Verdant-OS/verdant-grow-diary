/**
 * Sanitizer + CI guarantees for sensor-ingest-webhook.
 *
 * - Pure-string tests for the sanitizer module (response bodies, error
 *   messages, safeLog details).
 * - Static scan that the CI workflow exists and uploads no raw .env / JSONL.
 * - Static scan that index.ts logs only via safeLog (no raw console.* with
 *   dynamic values).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  sanitizeForResponse,
  sanitizeErrorMessage,
} from "../../supabase/functions/sensor-ingest-webhook/sanitize";

const REDACTED = "[redacted]";

describe("sanitizeForResponse — value redaction", () => {
  it("redacts known secret-shaped strings", () => {
    expect(sanitizeForResponse("vbt_abcdefghijklmno_token")).toBe(REDACTED);
    expect(sanitizeForResponse("aaaaaaaa.bbbbbbbb.cccccccc")).toBe(REDACTED);
    expect(sanitizeForResponse("Bearer vbt_xyz1234567890")).toContain("[redacted]");
    expect(sanitizeForResponse("sb_abcdefghijklmnopqrstuv")).toBe(REDACTED);
    expect(sanitizeForResponse("SUPABASE_SERVICE_ROLE_KEY=xyz")).toBe(REDACTED);
  });

  it("leaves short / non-secret strings alone (no over-redaction of fingerprints)", () => {
    expect(sanitizeForResponse("invalid_payload")).toBe("invalid_payload");
    expect(sanitizeForResponse("ok")).toBe("ok");
    // A hex fingerprint — alphanumeric but not token-shaped.
    expect(sanitizeForResponse("a1b2c3d4e5f6")).toBe("a1b2c3d4e5f6");
  });

  it("redacts forbidden keys regardless of value", () => {
    const out = sanitizeForResponse({
      error: "invalid_payload",
      authorization: "Bearer x",
      token: "anything",
      api_key: "anything",
      service_role: "anything",
      password: "anything",
      Authorization: "Bearer x",
      token_hash: "abc",
      safe_field: "kept",
    }) as Record<string, unknown>;
    expect(out.error).toBe("invalid_payload");
    expect(out.safe_field).toBe("kept");
    expect(out.authorization).toBe(REDACTED);
    expect(out.token).toBe(REDACTED);
    expect(out.api_key).toBe(REDACTED);
    expect(out.service_role).toBe(REDACTED);
    expect(out.password).toBe(REDACTED);
    expect(out.Authorization).toBe(REDACTED);
    expect(out.token_hash).toBe(REDACTED);
  });

  it("handles nested objects + arrays without leaking", () => {
    const out = sanitizeForResponse({
      rejected: [
        { error: "bad_metric", reason: "vbt_leaked_token_value_here" },
      ],
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain("vbt_leaked");
  });
});

describe("sanitizeErrorMessage", () => {
  it("returns a short, single-line, sanitized string", () => {
    const s = sanitizeErrorMessage(new Error("boom\nBearer vbt_secrettokenvalue123"));
    expect(s).not.toContain("\n");
    expect(s).not.toContain("vbt_secrettokenvalue123");
    expect(s.length).toBeLessThanOrEqual(200);
  });

  it("caps unknown inputs to a string", () => {
    expect(typeof sanitizeErrorMessage(undefined)).toBe("string");
    expect(typeof sanitizeErrorMessage({ a: 1 })).toBe("string");
  });
});

describe("index.ts — logging discipline", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../../supabase/functions/sensor-ingest-webhook/index.ts"),
    "utf8",
  );

  it("only logs via safeLog (no remaining console.error/log with dynamic values)", () => {
    const calls = SRC.match(/console\.(log|info|warn|error|debug)\(/g) ?? [];
    expect(calls.length).toBe(0);
  });

  it("imports the sanitizer", () => {
    expect(SRC).toMatch(/from\s+["']\.\/sanitize\.ts["']/);
    expect(SRC).toMatch(/sanitizeForResponse/);
    expect(SRC).toMatch(/safeLog/);
  });

  it("json() helper sanitizes every response body", () => {
    expect(SRC).toMatch(/function json\([^)]*\)\s*\{[^}]*sanitizeForResponse/);
  });
});

describe("CI workflow — Deno edge tests", () => {
  const path = resolve(__dirname, "../../.github/workflows/sensor-ingest-webhook-edge-tests.yml");

  it("workflow file exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  it("runs the Deno cors_e2e_test and uses fake env only", () => {
    const wf = readFileSync(path, "utf8");
    expect(wf).toMatch(/deno test/);
    expect(wf).toMatch(/cors_e2e_test\.ts/);
    expect(wf).toMatch(/SUPABASE_URL:\s*https:\/\/example\.test/);
    expect(wf).toMatch(/SUPABASE_ANON_KEY:\s*test-anon-key/);
    // Must NOT upload .env, raw JSONL listener output, or local logs.
    expect(wf).not.toMatch(/\.env\b/);
    expect(wf).not.toMatch(/\.jsonl\b/);
    expect(wf).not.toMatch(/listener[-_]?log/i);
  });
});
