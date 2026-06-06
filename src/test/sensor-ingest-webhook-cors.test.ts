/**
 * Static safety guard for sensor-ingest-webhook CORS contract.
 *
 * The Edge Function lives in a Deno runtime and is not invoked by Vitest; this
 * test reads its source and verifies that the response-shape invariants hold:
 *
 *   - corsHeaders object exists with Access-Control-Allow-Origin,
 *     Access-Control-Allow-Headers (including authorization, x-client-info,
 *     apikey, content-type), and Access-Control-Allow-Methods (POST + OPTIONS).
 *   - OPTIONS short-circuits at the top of the handler, BEFORE any auth check,
 *     bridge-token parsing, JSON parse, payload validation, tent lookup, or
 *     database call.
 *   - Every status-bearing response is built via the json() helper, which
 *     merges corsHeaders — so 200/400/401/403/405/503 paths all include CORS.
 *   - No response path leaks service role keys, bridge tokens, authorization
 *     headers, or other secrets in the response body.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/sensor-ingest-webhook/index.ts"),
  "utf8",
);

describe("sensor-ingest-webhook CORS static contract", () => {
  it("defines corsHeaders with required headers", () => {
    expect(SRC).toMatch(/Access-Control-Allow-Origin/);
    expect(SRC).toMatch(/Access-Control-Allow-Headers/);
    // Headers value is allowed to live on the next line; collapse whitespace.
    const collapsed = SRC.replace(/\s+/g, " ");
    expect(collapsed).toMatch(/authorization, x-client-info, apikey, content-type/);
    expect(collapsed).toMatch(/Access-Control-Allow-Methods[^"]*"POST, OPTIONS/);
  });

  it("OPTIONS short-circuits BEFORE auth / JSON parse / DB calls", () => {
    const optionsIdx = SRC.indexOf('req.method === "OPTIONS"');
    expect(optionsIdx).toBeGreaterThan(0);

    // None of these auth/parse/db gates may appear before the OPTIONS check.
    const beforeOptions = SRC.slice(0, optionsIdx);
    expect(beforeOptions).not.toMatch(/authenticateBearer\s*\(/);
    expect(beforeOptions).not.toMatch(/req\.json\s*\(/);
    expect(beforeOptions).not.toMatch(/normalizeWebhookIngestPayload\s*\(/);
    expect(beforeOptions).not.toMatch(/\.from\(/);
    expect(beforeOptions).not.toMatch(/createClient\s*\(/);
    expect(beforeOptions).not.toMatch(/Authorization/);

    // And the OPTIONS branch must respond with corsHeaders.
    const optionsBranch = SRC.slice(optionsIdx, optionsIdx + 240);
    expect(optionsBranch).toMatch(/headers:\s*corsHeaders/);
  });

  it("json() response helper always merges corsHeaders", () => {
    // The helper must spread corsHeaders into the response headers.
    expect(SRC).toMatch(
      /function\s+json[^}]*headers:\s*\{\s*\.\.\.corsHeaders/,
    );
  });

  it("every error/success response is built via json() (so CORS is included)", () => {
    // Every error code path returns through json(...) — never `new Response`
    // outside the OPTIONS branch.
    const requiredPaths = [
      /json\(\{\s*error:\s*"method_not_allowed"\s*\}\s*,\s*405\)/,
      /json\(\{\s*error:\s*"unauthorized"\s*\}\s*,\s*401\)/,
      /json\(\{\s*error:\s*"server_misconfigured"\s*\}\s*,\s*503\)/,
      /json\(\{\s*error:\s*"invalid_json"\s*\}\s*,\s*400\)/,
      /json\(\{\s*error:\s*"invalid_payload"/,
      /json\(\{\s*error:\s*"forbidden_tent"\s*\}\s*,\s*403\)/,
      /json\(\{\s*error:\s*"tent_lookup_failed"\s*\}\s*,\s*503\)/,
      /json\(\{\s*error:\s*"insert_failed"\s*\}\s*,\s*400\)/,
      /json\(\{\s*[\s\S]{0,40}ok:\s*true/,
    ];
    for (const re of requiredPaths) {
      expect(SRC).toMatch(re);
    }

    // Two raw `new Response(` calls are allowed: one inside the `json()`
    // helper (which always merges corsHeaders) and one OPTIONS short-circuit.
    // Any additional raw Response would bypass corsHeaders.
    const responseCount = (SRC.match(/new\s+Response\s*\(/g) ?? []).length;
    expect(responseCount).toBe(2);
  });

  it("does not leak service role, bridge tokens, or authorization in responses", () => {
    // SERVICE_ROLE may be read from env but must never appear in a response body.
    const jsonCalls = SRC.match(/json\([^)]*\)/g) ?? [];
    for (const call of jsonCalls) {
      expect(call).not.toMatch(/SERVICE_ROLE/);
      expect(call).not.toMatch(/Authorization/);
      expect(call).not.toMatch(/rawToken/);
      expect(call).not.toMatch(/token_hash/);
      expect(call).not.toMatch(/vbt_/);
    }
  });

  it("does not write to action_queue or contain device-control patterns", () => {
    expect(SRC).not.toMatch(/action_queue/);
    expect(SRC).not.toMatch(/device_command/i);
    expect(SRC).not.toMatch(/relay|actuator/i);
  });
});
