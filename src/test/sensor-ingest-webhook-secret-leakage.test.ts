/**
 * Static safety: sensor-ingest-webhook must never echo or log bridge tokens,
 * Authorization headers, token hashes, or the service-role key on any code
 * path (success, error, or thrown). Pairs with the runtime CORS e2e Deno
 * test that exercises each response path.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/sensor-ingest-webhook/index.ts"),
  "utf8",
);
const codeOnly = SRC.replace(/\/\/[^\n]*/g, "");

const FORBIDDEN_BODY_TOKENS = [
  "authHeader",
  "rawToken",
  "bridgeToken",
  "token_hash",
  "serviceRoleKey",
  "SUPABASE_SERVICE_ROLE_KEY",
];

describe("sensor-ingest-webhook secret leakage — response bodies", () => {
  // Every JSON response is built via `json(req, { ... }, status)`. Scan each
  // such literal and assert it never references token-bearing identifiers.
  const jsonBodies = SRC.match(/json\(\s*req\s*,\s*\{[^}]*\}/g) ?? [];

  it("covers every json(req, ...) response site", () => {
    // Sanity: there are at least 9 distinct error paths plus the success.
    expect(jsonBodies.length).toBeGreaterThanOrEqual(9);
  });

  for (const forbidden of FORBIDDEN_BODY_TOKENS) {
    it(`response bodies never include "${forbidden}"`, () => {
      for (const body of jsonBodies) {
        expect(body, `forbidden token "${forbidden}" found in: ${body}`).not.toContain(forbidden);
      }
    });
  }

  it("response bodies never include `Authorization` or `Bearer` substrings", () => {
    for (const body of jsonBodies) {
      expect(body).not.toMatch(/Authorization/);
      expect(body).not.toMatch(/Bearer\s/);
    }
  });

  it("includes terse error codes for every documented error path", () => {
    for (const code of [
      "unauthorized",
      "server_misconfigured",
      "invalid_json",
      "invalid_payload",
      "forbidden_tent",
      "tent_lookup_failed",
      "insert_failed",
      "method_not_allowed",
      "internal_error",
    ]) {
      expect(SRC).toMatch(new RegExp(`error:\\s*["']${code}["']`));
    }
  });
});

describe("sensor-ingest-webhook secret leakage — logging", () => {
  // Capture every console.* argument list and prove no token-bearing
  // identifier or wholesale request-header object is logged.
  const logCalls = SRC.match(/console\.(log|info|warn|error|debug)\([^;]*\)/g) ?? [];

  it("never logs raw token / header identifiers", () => {
    for (const call of logCalls) {
      for (const forbidden of [
        "authHeader",
        "rawToken",
        "bridgeToken",
        "token_hash",
        "serviceRoleKey",
        "SUPABASE_SERVICE_ROLE_KEY",
        "Authorization",
      ]) {
        expect(call, `forbidden identifier in log: ${call}`).not.toContain(forbidden);
      }
    }
  });

  it("never logs the raw request headers object wholesale", () => {
    for (const call of logCalls) {
      expect(call).not.toMatch(/req\.headers\b(?!\.get)/);
    }
  });

  it("never logs the raw request body or json() return shape", () => {
    for (const call of logCalls) {
      expect(call).not.toMatch(/\bbody\b/);
      expect(call).not.toMatch(/\binsErr\.message\b/);
      expect(call).not.toMatch(/\brawIdemHeader\b/);
    }
  });

  it("does not stringify `auth` or `authRes` wholesale (could contain token id)", () => {
    for (const call of logCalls) {
      expect(call).not.toMatch(/JSON\.stringify\(\s*auth(Res)?\s*\)/);
    }
  });
});

describe("sensor-ingest-webhook secret leakage — source-level guards", () => {
  it("never returns the rawToken value anywhere", () => {
    // `rawToken` is computed once; ensure it is not embedded in any Response.
    expect(codeOnly).not.toMatch(/new Response\([^)]*rawToken/);
    expect(codeOnly).not.toMatch(/Response\.json\([^)]*rawToken/);
  });

  it("never returns the Authorization header value anywhere", () => {
    expect(codeOnly).not.toMatch(/new Response\([^)]*authHeader/);
    expect(codeOnly).not.toMatch(/Response\.json\([^)]*authHeader/);
  });

  it("never inlines the service-role key into a response", () => {
    expect(codeOnly).not.toMatch(/Response[^)]*SUPABASE_SERVICE_ROLE_KEY/);
  });
});
