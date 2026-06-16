/**
 * Static guardrails for the pi-ingest secret resolution plan.
 * Docs + static tests only. No Edge Function implementation,
 * encryption, decryption, or service_role usage may appear here.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  listTsFilesCached,
  readFileCached,
} from "./helpers/cachedSrcTextScan";

// Per-file timeout bump for filesystem-scanning / heavy-render guardrail; no logic changed.
import { vi as __vi_timeout } from "vitest";
__vi_timeout.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

const ROOT = resolve(__dirname, "../..");
const PLAN_PATH = resolve(ROOT, "docs/pi-ingest-secret-resolution-plan.md");
const PLAN = existsSync(PLAN_PATH) ? readFileSync(PLAN_PATH, "utf8") : "";
const FN_DIR = resolve(ROOT, "supabase/functions/pi-ingest-readings");
const FN_INDEX = resolve(FN_DIR, "index.ts");
const FN_SRC = existsSync(FN_INDEX) ? readFileSync(FN_INDEX, "utf8") : "";

describe("pi-ingest secret resolution plan — existence", () => {
  it("plan doc exists", () => {
    expect(existsSync(PLAN_PATH)).toBe(true);
  });
  it("declares docs + static-tests-only scope", () => {
    expect(PLAN).toMatch(/DOCS \+ STATIC TESTS ONLY/i);
    expect(PLAN).toMatch(/No\s+Edge\s+Function\s+implementation/i);
  });
});

describe("pi-ingest secret resolution plan — required content", () => {
  it.each<[string, RegExp]>([
    [
      "Edge Function is the only resolver",
      /Edge\s+Function\s+is\s+the\s+only\s+place[\s\S]{0,120}resolve\s+usable[\s\S]{0,40}bridge\s+secret/i,
    ],
    [
      "browser cannot read secret_hash",
      /never[\s\S]{0,200}`?secret_hash`?/i,
    ],
    [
      "browser cannot read secret_ciphertext",
      /never[\s\S]{0,240}`?secret_ciphertext`?/i,
    ],
    [
      "browser cannot read secret_nonce",
      /never[\s\S]{0,280}`?secret_nonce`?/i,
    ],
    [
      "browser cannot read secret_key_version",
      /never[\s\S]{0,320}`?secret_key_version`?/i,
    ],
    [
      "browser cannot read plaintext secret",
      /never[\s\S]{0,400}plaintext\s+bridge\s+secret/i,
    ],

    [
      "base table has no client SELECT access",
      /not have client SELECT access/i,
    ],
    [
      "decryption key is server-only",
      /decryption key[\s\S]{0,120}server-only/i,
    ],
    [
      "decryption key never in client config",
      /never[\s\S]{0,120}client config/i,
    ],
    [
      "decrypted secret is memory-only",
      /decrypted bridge secret is \*?\*?memory-only/i,
    ],
    [
      "decrypted secret is never logged",
      /decrypted secret must \*?\*?never be logged/i,
    ],
    [
      "HMAC verification before writes",
      /HMAC verification happens \*?\*?before\*?\*? any sensor or idempotency write/i,
    ],
    [
      "auth failure inserts zero rows",
      /Zero rows are inserted into[\s\S]{0,40}sensor_readings/i,
    ],
    [
      "invalid payload inserts zero rows",
      /Invalid-payload zero-write guarantee/i,
    ],
    [
      "no alert persistence",
      /must \*?\*?not\*?\*? create alerts/i,
    ],
    [
      "no Action Queue items",
      /must \*?\*?not\*?\*? create[\s\S]{0,40}action_queue/i,
    ],
    [
      "no device control",
      /must \*?\*?not\*?\*? call any device-control surface/i,
    ],
    [
      "no secret_hash → secret mapping",
      /`?secret_hash`?[\s\S]{0,120}must \*?\*?not\*?\*? map[\s\S]{0,80}`?BridgeCredential\.secret`?/i,
    ],
    [
      "no secret_ciphertext → secret mapping without decryption",
      /`?secret_ciphertext`?[\s\S]{0,200}without performing[\s\S]{0,40}decryption/i,
    ],
    [
      "decryption output is the only valid secret source",
      /only\*?\*? valid source of `?BridgeCredential\.secret`?/i,
    ],
    [
      "secret rotation deferred",
      /Secret rotation[\s\S]{0,40}\*?\*?deferred\*?\*?/i,
    ],
    [
      "metadata UI deferred",
      /Metadata UI is \*?\*?deferred/i,
    ],
  ])("plan documents: %s", (_label, re) => {
    expect(PLAN).toMatch(re);
  });
});

function srcTsFiles(): string[] {
  return listTsFilesCached(resolve(ROOT, "src"));
}

describe("pi-ingest secret resolution plan — repo guardrails", () => {
  it("no src/ file maps secret_hash to a secret field", () => {
    const forbidden = [
      /secret\s*:\s*[A-Za-z_.]*\.?secret_hash\b/,
      /\bsecret_hash\s+as\s+secret\b/,
    ];
    for (const f of srcTsFiles()) {
      if (f.endsWith("piIngestSecretResolutionPlan.test.ts")) continue;
      if (f.endsWith("piIngestBridgeSecretStrategy.test.ts")) continue;
      const text = readFileCached(f);
      for (const re of forbidden) {
        expect(text, `forbidden mapping in ${f}`).not.toMatch(re);
      }
    }
  });

  it("no src/ file maps secret_ciphertext directly to a secret field", () => {
    const forbidden = [
      /secret\s*:\s*[A-Za-z_.]*\.?secret_ciphertext\b/,
      /\bsecret_ciphertext\s+as\s+secret\b/,
    ];
    for (const f of srcTsFiles()) {
      if (f.endsWith("piIngestSecretResolutionPlan.test.ts")) continue;
      const text = readFileCached(f);
      for (const re of forbidden) {
        expect(text, `forbidden mapping in ${f}`).not.toMatch(re);
      }
    }
  });

  it("no src/ file contains decryption APIs", () => {
    const offenders: string[] = [];
    for (const f of srcTsFiles()) {
      const text = readFileCached(f);
      if (
        /crypto\.subtle\.decrypt\s*\(/.test(text) ||
        /\bcreateDecipheriv\s*\(/.test(text)
      ) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no src/ file imports resolver/crypto from the Edge Function dir", () => {
    const offenders: string[] = [];
    for (const f of srcTsFiles()) {
      const text = readFileCached(f);
      if (
        /from\s+["'][^"']*supabase\/functions\/pi-ingest-readings\/(secretResolver|crypto)["']/
          .test(text)
      ) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("if the Edge Function exists, its index.ts is decryption-free and does no direct writes", () => {
    if (!FN_SRC) return;
    for (const re of [
      /crypto\.subtle\.decrypt\s*\(/,
      /\bcreateDecipheriv\s*\(/,
      /\bsensor_readings\b/,
      /\bpi_ingest_idempotency_keys\b/,
      /from\(\s*["']alerts["']\s*\)/,
      /from\(\s*["']action_queue["']\s*\)/,
    ]) {
      expect(FN_SRC).not.toMatch(re);
    }
  });
});
