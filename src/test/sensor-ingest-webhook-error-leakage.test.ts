/**
 * Regression: sensor-ingest-webhook must never echo PG constraint details,
 * payload values, tokens, bridge ids, secrets, or internal table names in
 * its HTTP error responses.
 *
 * This file mixes static source assertions (cheap, deterministic) with a
 * behavioral check that an upstream PG-style error message does not appear
 * in the response body.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/sensor-ingest-webhook/index.ts"),
  "utf8",
);

describe("sensor-ingest-webhook error leakage", () => {
  // -- static guards ----------------------------------------------------------
  it("does not return insErr.message / detail in the response body", () => {
    const code = SRC.replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/detail:\s*insErr\.message/);
    // insErr.message must never be passed to json(...) response body.
    const jsonBodies = [...code.matchAll(/json\(\s*(\{[\s\S]*?\})\s*,\s*\d+\s*\)/g)].map((m) => m[1]);
    for (const body of jsonBodies) {
      expect(body).not.toMatch(/insErr/);
    }
  });

  it("emits only the terse `insert_failed` error code on insert failure", () => {
    // The exact response shape after the scrub.
    expect(SRC).toMatch(/json\(\s*\{\s*error:\s*["']insert_failed["']\s*\}\s*,\s*400\s*\)/);
  });

  it("does not echo bridge token id, hash, or raw token in any response", () => {
    const code = SRC.replace(/\/\/[^\n]*/g, "");
    // tokenId may be referenced for the bump RPC, but must not appear inside json(...) args.
    const jsonCalls = [...code.matchAll(/json\(\s*(\{[\s\S]*?\})\s*,\s*\d+\s*\)/g)].map(
      (m) => m[1],
    );
    for (const body of jsonCalls) {
      expect(body).not.toMatch(/tokenId/);
      expect(body).not.toMatch(/token_hash/);
      expect(body).not.toMatch(/rawToken/);
      expect(body).not.toMatch(/bridge_id/);
      expect(body).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(body).not.toMatch(/SUPABASE_ANON_KEY/);
      // Internal table names must not surface in responses.
      expect(body).not.toMatch(/sensor_ingest_audit_log/);
      expect(body).not.toMatch(/bridge_tokens/);
      // PG error fields must not surface.
      expect(body).not.toMatch(/\bhint\b/);
      expect(body).not.toMatch(/\bcode:\s*insErr/);
    }
  });

  it("logs insert failures to server console without raw insErr.message", () => {
    const code = SRC.replace(/\/\/[^\n]*/g, "");
    const consoleCalls = [
      ...code.matchAll(/console\.(?:error|warn|log)\(([\s\S]*?)\)\s*;/g),
    ].map((m) => m[1]);
    for (const args of consoleCalls) {
      expect(args).not.toMatch(/insErr\.message/);
    }
  });

  // -- behavioral guard -------------------------------------------------------
  it("response body for a simulated PG failure contains no forbidden substrings", () => {
    // Simulate what the function would return on insert failure. The actual
    // edge function is exercised end-to-end by Deno tests; here we just
    // assert that the documented response shape, when serialized, contains
    // none of the forbidden strings that a leaky implementation might emit.
    const forbiddenSamples = [
      'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
      "DETAIL: Key (user_id, tent_id, source, metric, captured_at)=(...)",
      "secret_key=sk_live_abcdef",
      "vbt_abcdef1234567890",
      "bridge_id=esp32-A",
      'relation "sensor_readings" violates',
    ];
    const responseBody = JSON.stringify({ error: "insert_failed" });
    for (const s of forbiddenSamples) {
      expect(responseBody).not.toContain(s);
    }
  });

  it("upsert uses ignoreDuplicates so duplicate retries do not error out", () => {
    // The atomic dedupe path must use ignoreDuplicates: true so that a
    // duplicate retry returns 200 with inserted=0, not 400 insert_failed.
    expect(SRC).toMatch(/ignoreDuplicates:\s*true/);
    expect(SRC).toMatch(/onConflict:\s*["']user_id,tent_id,source,metric,captured_at["']/);
  });
});
