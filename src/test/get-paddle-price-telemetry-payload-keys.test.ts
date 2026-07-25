/**
 * get-paddle-price telemetry payload — key-set leak guard.
 *
 * The `logCatalogUnavailable` emitter in supabase/functions/get-paddle-price
 * is the single point where fail-closed diagnostic events reach edge-fn
 * logs. Its payload contract, per the surrounding comment block, is
 * intentionally minimal:
 *
 *   { event, plan, reason, environment, env_var_configured, stage }
 *
 * This test parses the emitter's `JSON.stringify({...})` object literal
 * from source and asserts:
 *   1. The emitted key set is exactly the six documented keys.
 *   2. The three request-scoped diagnostic keys the operator relies on —
 *      `plan`, `stage`, and `env_var_configured` — are always present.
 *   3. None of the forbidden identifier / auth / request-context keys
 *      appear in the payload, nor anywhere else inside the emitter body
 *      (guarding against a future refactor that adds `user_id: ...`).
 *
 * Runtime import is not viable here — the module runs under Deno and
 * top-levels `Deno.serve`. Source-parse coverage is the correct level:
 * the emitter is a pure object literal, so parsing is exact.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE_PATH = path.resolve(
  __dirname,
  "../../supabase/functions/get-paddle-price/index.ts",
);
const SOURCE = readFileSync(SOURCE_PATH, "utf8");

// Isolate the emitter function body so assertions are scoped to it.
function extractEmitterBody(source: string): string {
  const start = source.indexOf("function logCatalogUnavailable");
  expect(start, "logCatalogUnavailable emitter not found").toBeGreaterThan(-1);
  // Walk braces from the first `{` after the signature to the matching close.
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error("unterminated logCatalogUnavailable body");
}

function extractEmittedKeys(emitterBody: string): string[] {
  const openMatch = /JSON\.stringify\s*\(\s*\{/.exec(emitterBody);
  expect(openMatch, "JSON.stringify object literal not found").not.toBeNull();
  const startIdx = openMatch!.index + openMatch![0].length - 1; // index of the '{'
  // Walk braces to find matching close.
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < emitterBody.length; i++) {
    const ch = emitterBody[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  expect(endIdx, "unterminated JSON.stringify literal").toBeGreaterThan(-1);
  const literal = emitterBody.slice(startIdx, endIdx + 1);
    const ch = emitterBody[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  expect(endIdx, "unterminated JSON.stringify literal").toBeGreaterThan(-1);
  const literal = emitterBody.slice(startIdx + marker.length - 1, endIdx + 1);
  // Match top-level `key:` occurrences. Keys are bare identifiers here.
  const keys: string[] = [];
  const keyRegex = /(^|[\s,{])([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
  let match: RegExpExecArray | null;
  let localDepth = 0;
  // Track depth so nested object keys (if any) are excluded.
  for (let i = 0; i < literal.length; i++) {
    const ch = literal[i];
    if (ch === "{") localDepth++;
    else if (ch === "}") localDepth--;
  }
  // Simple top-level scan: reset regex and only accept matches where
  // the char index sits at depth 1 (inside the outermost braces).
  const depthAt: number[] = new Array(literal.length).fill(0);
  {
    let d = 0;
    for (let i = 0; i < literal.length; i++) {
      const ch = literal[i];
      if (ch === "{") {
        d++;
        depthAt[i] = d;
      } else if (ch === "}") {
        depthAt[i] = d;
        d--;
      } else {
        depthAt[i] = d;
      }
    }
  }
  while ((match = keyRegex.exec(literal)) !== null) {
    const keyStart = match.index + match[1].length;
    if (depthAt[keyStart] === 1) keys.push(match[2]);
  }
  return keys;
}

const EXPECTED_KEYS = [
  "event",
  "plan",
  "reason",
  "environment",
  "env_var_configured",
  "stage",
];

const REQUIRED_OPERATOR_KEYS = ["plan", "stage", "env_var_configured"];

// Any of these appearing in the emitter body — as a key, a field access,
// or a bare token — indicates a real regression. Auth headers, JWT
// claims, network context, and grower content are all forbidden.
const FORBIDDEN_TOKENS = [
  "user_id",
  "userId",
  "user.id",
  "sub",
  "email",
  "jwt",
  "JWT",
  "access_token",
  "accessToken",
  "authorization",
  "Authorization",
  "auth_header",
  "authHeader",
  "bearer",
  "Bearer",
  "session",
  "cookie",
  "ip_address",
  "ipAddress",
  "remote_addr",
  "remoteAddr",
  "user_agent",
  "userAgent",
  "referer",
  "referrer",
  "price_id",
  "priceId",
  "paddle_customer_id",
  "customer_id",
  "customerId",
  "raw_body",
  "rawBody",
  "request_body",
  "requestBody",
  "headers",
  "stack",
  "error_stack",
  "errorStack",
];

describe("get-paddle-price logCatalogUnavailable — payload key-set guard", () => {
  const emitterBody = extractEmitterBody(SOURCE);
  const emittedKeys = extractEmittedKeys(emitterBody);

  it("emits exactly the six documented keys — no more, no less", () => {
    expect([...emittedKeys].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("always emits plan, stage, and env_var_configured for operator diagnosis", () => {
    for (const key of REQUIRED_OPERATOR_KEYS) {
      expect(
        emittedKeys,
        `required operator diagnostic key "${key}" missing from emitted payload`,
      ).toContain(key);
    }
  });

  it("does not emit any user identifier or JWT-derived field", () => {
    for (const token of FORBIDDEN_TOKENS) {
      expect(
        emitterBody,
        `forbidden identifier / auth / request-context token "${token}" appears in emitter`,
      ).not.toContain(token);
    }
  });

  it("emits under the stable event tag consumers grep for", () => {
    expect(emitterBody).toContain('event: "get_paddle_price_catalog_unavailable"');
  });

  it("writes a single console.warn JSON line — never console.log/error/info", () => {
    // console.warn once, nothing else — keeps log ingestion deterministic.
    const warnCount = (emitterBody.match(/console\.warn\s*\(/g) ?? []).length;
    expect(warnCount).toBe(1);
    for (const forbidden of [
      "console.log",
      "console.error",
      "console.info",
      "console.debug",
    ]) {
      expect(emitterBody).not.toContain(forbidden);
    }
  });
});
