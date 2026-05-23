/**
 * Static guardrails for the fail-closed pi-ingest-readings Edge Function
 * skeleton. The skeleton exists only as a route boundary; it must reject
 * every POST with `secret_resolver_not_implemented` until the server-only
 * bridge secret resolver is implemented inside this Edge Function.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const FN_DIR = resolve(ROOT, "supabase/functions/pi-ingest-readings");
const FN_PATH = resolve(FN_DIR, "index.ts");
const SRC = existsSync(FN_PATH) ? readFileSync(FN_PATH, "utf8") : "";

describe("pi-ingest-readings Edge Function skeleton — existence", () => {
  it("Edge Function directory exists", () => {
    expect(existsSync(FN_DIR)).toBe(true);
  });
  it("index.ts exists", () => {
    expect(existsSync(FN_PATH)).toBe(true);
  });
  it("mentions pi-ingest-readings", () => {
    expect(SRC).toMatch(/pi-ingest-readings/);
  });
});

describe("pi-ingest-readings Edge Function skeleton — fail-closed behavior", () => {
  it("registers a request handler (Deno.serve)", () => {
    expect(SRC).toMatch(/Deno\.serve\s*\(/);
  });
  it("rejects non-POST with 405", () => {
    expect(SRC).toMatch(/method\s*!==?\s*["']POST["']/);
    expect(SRC).toMatch(/status:\s*405/);
  });
  it("returns secret_resolver_not_implemented", () => {
    expect(SRC).toMatch(/secret_resolver_not_implemented/);
  });
  it("returns a fail-closed status (503 or 501)", () => {
    expect(SRC).toMatch(/status:\s*(503|501)/);
  });
  it("never returns ok:true", () => {
    expect(SRC).not.toMatch(/ok\s*:\s*true/);
  });
});

describe("pi-ingest-readings Edge Function skeleton — forbidden surfaces", () => {
  const forbidden: Array<[string, RegExp]> = [
    ["service_role", /service_role/i],
    ["sensor_readings", /\bsensor_readings\b/],
    ["pi_ingest_idempotency_keys", /\bpi_ingest_idempotency_keys\b/],
    ["alerts table write", /from\(\s*["']alerts["']\s*\)/],
    ["action_queue table write", /from\(\s*["']action_queue["']\s*\)/],
    ["PI_INGEST_SECRET_KEY env read", /PI_INGEST_SECRET_KEY/],
    ["crypto.subtle.decrypt", /crypto\.subtle\.decrypt\s*\(/],
    ["createDecipheriv", /\bcreateDecipheriv\s*\(/],
    ["createCipheriv", /\bcreateCipheriv\s*\(/],
    ["secret_hash -> secret mapping", /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/],
    ["secret_ciphertext -> secret mapping", /secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/],
    ["createClient", /\bcreateClient\s*\(/],
    ["React import", /from\s+["']react["']/],
    ["browser supabase client", /@\/integrations\/supabase\/client/],
    ["raw body log", /console\.\w+\([^)]*\b(rawBody|raw_body|bodyText)\b/],
    ["signature log", /console\.\w+\([^)]*\bsignature\b/i],
    ["payload log", /console\.\w+\([^)]*\bpayload\b/i],
    ["decrypted secret expose", /decryptedSecret|decrypted_secret/],
    ["stack trace exposure", /err(or)?\.stack/i],
  ];
  it.each(forbidden)("does not contain %s", (_label, re) => {
    expect(SRC).not.toMatch(re);
  });
});
