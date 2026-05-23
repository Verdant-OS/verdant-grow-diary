/**
 * Static guardrails for the pi-ingest server-only bridge secret resolver
 * IMPLEMENTATION PLAN. The plan is docs-only; no resolver runtime,
 * decryption, or Edge Function behavior change may appear in this task.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PLAN_PATH = resolve(
  ROOT,
  "docs/pi-ingest-server-secret-resolver-implementation-plan.md",
);
const FN_DIR = resolve(ROOT, "supabase/functions/pi-ingest-readings");
const FN_INDEX = resolve(FN_DIR, "index.ts");

const PLAN = existsSync(PLAN_PATH) ? readFileSync(PLAN_PATH, "utf8") : "";
const FN_SRC = existsSync(FN_INDEX) ? readFileSync(FN_INDEX, "utf8") : "";

describe("server-secret resolver implementation plan — existence", () => {
  it("plan doc exists", () => {
    expect(existsSync(PLAN_PATH)).toBe(true);
  });
  it("declares docs-only status", () => {
    expect(PLAN).toMatch(/DOCS ONLY/i);
    expect(PLAN).toMatch(/no resolver code/i);
  });
});

describe("server-secret resolver implementation plan — required sections", () => {
  it.each([
    /##\s*1\.\s*Purpose/,
    /##\s*2\.\s*Files to create later/,
    /##\s*3\.\s*Runtime boundary/,
    /##\s*4\.\s*Inputs/,
    /##\s*5\.\s*Output/,
    /##\s*6\.\s*Failure reasons/,
    /##\s*7\.\s*Step-by-step algorithm/,
    /##\s*8\.\s*Lifetime and zeroization/,
    /##\s*9\.\s*Hard "must not" rules/,
    /##\s*10\.\s*Test plan/,
    /##\s*11\.\s*Stop-ship conditions/,
    /##\s*12\.\s*Out of scope/,
  ])("contains section %s", (re) => {
    expect(PLAN).toMatch(re);
  });
});

describe("server-secret resolver implementation plan — content invariants", () => {
  it("names the future resolver file", () => {
    expect(PLAN).toContain(
      "supabase/functions/pi-ingest-readings/secretResolver.ts",
    );
  });
  it("names the optional crypto wrapper file", () => {
    expect(PLAN).toContain(
      "supabase/functions/pi-ingest-readings/crypto.ts",
    );
  });
  it("documents Edge-Function-only runtime boundary", () => {
    expect(PLAN).toMatch(/only inside the `?pi-ingest-readings`? Edge Function/i);
    expect(PLAN).toMatch(/must not.*src\/lib/i);
    expect(PLAN).toMatch(/must not.*browser\/client bundle/i);
  });
  it.each([
    "secret_ciphertext",
    "secret_nonce",
    "secret_key_version",
    "secret_status",
    "bridgeId",
  ])("declares input field %s", (field) => {
    expect(PLAN).toContain(field);
  });
  it.each([
    "missing_credential",
    "inactive_credential",
    "invalid_secret_status",
    "missing_ciphertext",
    "missing_nonce",
    "missing_key_version",
    "unknown_key_version",
    "missing_env_key",
    "decrypt_failed",
  ])("declares failure reason %s", (reason) => {
    expect(PLAN).toContain(reason);
  });
  it("declares discriminated success output { ok:true, bridgeId, secret }", () => {
    expect(PLAN).toMatch(/ok:\s*true/);
    expect(PLAN).toMatch(/bridgeId/);
    expect(PLAN).toMatch(/secret:\s*string/);
  });
  it("forbids logging / returning / caching the secret", () => {
    expect(PLAN).toMatch(/no caching/i);
    expect(PLAN).toMatch(/MUST NOT.*log/i);
    expect(PLAN).toMatch(/MUST NOT.*return the secret/i);
  });
  it("forbids secret_hash → secret and raw secret_ciphertext → secret mappings", () => {
    expect(PLAN).toMatch(/secret_hash.*→.*secret/);
    expect(PLAN).toMatch(/secret_ciphertext.*→.*secret/);
  });
  it("forbids resolver writes to readings / idempotency / alerts / action_queue", () => {
    expect(PLAN).toContain("sensor_readings");
    expect(PLAN).toContain("pi_ingest_idempotency_keys");
    expect(PLAN).toContain("alerts");
    expect(PLAN).toContain("action_queue");
  });
  it("documents single-request lifetime / zeroization", () => {
    expect(PLAN).toMatch(/one request/i);
    expect(PLAN).toMatch(/drop the reference/i);
  });
  it("references the auth rules verifier as the only consumer", () => {
    expect(PLAN).toContain("verifyBridgeRequest");
    expect(PLAN).toContain("src/lib/piIngestAuthRules.ts");
  });
});

describe("server-secret resolver implementation plan — repo state", () => {
  it("no resolver file exists yet under the Edge Function dir", () => {
    const forbidden = ["secretResolver.ts", "crypto.ts"];
    if (!existsSync(FN_DIR)) return;
    const entries = readdirSync(FN_DIR);
    for (const f of forbidden) {
      expect(entries.includes(f), `${f} must not exist yet`).toBe(false);
    }
  });

  it("Edge Function skeleton remains fail-closed and decryption-free", () => {
    if (!FN_SRC) return;
    expect(FN_SRC).toMatch(
      /(secret_resolver_not_implemented|buildSecretResolverNotImplementedResponseBody)/,
    );
    for (const re of [
      /crypto\.subtle\.decrypt\s*\(/,
      /\bcreateDecipheriv\s*\(/,
      /Deno\.env\.get\(\s*["']PI_INGEST_SECRET_KEY/,
      /\bcreateClient\s*\(/,
      /service_role/i,
      /\bsensor_readings\b/,
      /\bpi_ingest_idempotency_keys\b/,
      /from\(\s*["']alerts["']\s*\)/,
      /from\(\s*["']action_queue["']\s*\)/,
      /ok\s*:\s*true/,
    ]) {
      expect(FN_SRC).not.toMatch(re);
    }
  });

  it("no src/ file imports a resolver from the Edge Function dir", () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = resolve(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) {
          walk(p);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          if (
            /from\s+["'][^"']*supabase\/functions\/pi-ingest-readings\/(secretResolver|crypto)["']/
              .test(text)
          ) {
            offenders.push(p);
          }
        }
      }
    }
    walk(resolve(ROOT, "src"));
    expect(offenders).toEqual([]);
  });

  it("no src/ file contains decrypt APIs (resolver must live in Edge Function)", () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = resolve(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) {
          walk(p);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          if (
            /crypto\.subtle\.decrypt\s*\(/.test(text) ||
            /\bcreateDecipheriv\s*\(/.test(text)
          ) {
            offenders.push(p);
          }
        }
      }
    }
    walk(resolve(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});
