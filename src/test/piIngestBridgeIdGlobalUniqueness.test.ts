/**
 * Static guardrails for global bridge_id uniqueness on
 * public.pi_ingest_bridge_credentials.
 *
 * Migration + tests only. No Edge Function behavior change, no
 * lookup implementation, no Supabase client in the Edge Function,
 * no service_role runtime usage, no sensor/idempotency/alert/
 * Action Queue/automation/device/AI Doctor/UI changes.
 *
 * Satisfies Option A of
 * docs/pi-ingest-bridge-credential-lookup-contract.md so a future
 * singular `loadBridgeCredentialRow(bridgeId)` lookup becomes safe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function loadUniquenessMigration(): { name: string; text: string } {
  const files = readdirSync(MIG_DIR).sort();
  for (const f of files) {
    const txt = readFileSync(join(MIG_DIR, f), "utf8");
    if (
      /pi_ingest_bridge_credentials_bridge_id_global_unique/.test(txt) ||
      (/pi_ingest_bridge_credentials/.test(txt) &&
        /UNIQUE\s*\(\s*bridge_id\s*\)/i.test(txt))
    ) {
      return { name: f, text: txt };
    }
  }
  return { name: "", text: "" };
}

const MIG = loadUniquenessMigration();

describe("pi_ingest_bridge_credentials global bridge_id uniqueness migration", () => {
  it("migration file exists", () => {
    expect(MIG.name).not.toBe("");
    expect(MIG.text.length).toBeGreaterThan(0);
  });

  it("targets public.pi_ingest_bridge_credentials", () => {
    expect(/public\.pi_ingest_bridge_credentials/.test(MIG.text)).toBe(true);
  });

  it("adds a GLOBAL unique constraint or index on bridge_id (not partial)", () => {
    // Full global uniqueness: an ALTER TABLE ADD CONSTRAINT ... UNIQUE (bridge_id)
    // or a CREATE UNIQUE INDEX ... (bridge_id) with no WHERE clause.
    const hasConstraint =
      /ADD\s+CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*bridge_id\s*\)/i.test(MIG.text);
    const indexMatch = MIG.text.match(
      /CREATE\s+UNIQUE\s+INDEX[\s\S]*?\(\s*bridge_id\s*\)([^;]*);/i,
    );
    const hasFullIndex = !!indexMatch && !/\bWHERE\b/i.test(indexMatch[1] ?? "");
    expect(hasConstraint || hasFullIndex).toBe(true);
  });

  it("rejects partial-only active uniqueness as the sole mechanism", () => {
    // If the only uniqueness statement is a partial index gated on is_active,
    // that is insufficient. Ensure no WHERE is_active=... gate on the only
    // bridge_id uniqueness expression.
    const partialOnly =
      /CREATE\s+UNIQUE\s+INDEX[^;]*\(\s*bridge_id\s*\)[^;]*WHERE[^;]*is_active/i
        .test(MIG.text) &&
      !/ADD\s+CONSTRAINT[^;]*UNIQUE\s*\(\s*bridge_id\s*\)/i.test(MIG.text);
    expect(partialOnly).toBe(false);
  });

  it("includes a duplicate-bridge_id precondition guard that RAISES", () => {
    expect(/RAISE\s+EXCEPTION/i.test(MIG.text)).toBe(true);
    expect(/duplicate/i.test(MIG.text)).toBe(true);
    expect(/bridge_id/.test(MIG.text)).toBe(true);
    expect(/HAVING\s+COUNT\s*\(\s*\*\s*\)\s*>\s*1/i.test(MIG.text)).toBe(true);
  });

  it("does not silently delete, merge, or rename duplicate rows", () => {
    expect(/DELETE\s+FROM\s+public\.pi_ingest_bridge_credentials/i.test(MIG.text))
      .toBe(false);
    expect(/UPDATE\s+public\.pi_ingest_bridge_credentials/i.test(MIG.text)).toBe(
      false,
    );
    expect(/MERGE\s+INTO\s+public\.pi_ingest_bridge_credentials/i.test(MIG.text))
      .toBe(false);
  });

  it("does not drop existing (user_id, bridge_id) uniqueness", () => {
    expect(
      /DROP\s+CONSTRAINT[^;]*pi_ingest_bridge_credentials_user_bridge_unique/i
        .test(MIG.text),
    ).toBe(false);
    expect(/DROP\s+INDEX[^;]*user_id[^;]*bridge_id/i.test(MIG.text)).toBe(false);
  });

  it("does not alter encrypted secret columns", () => {
    for (const col of [
      "secret_ciphertext",
      "secret_nonce",
      "secret_key_version",
      "secret_status",
      "secret_hash",
    ]) {
      expect(
        new RegExp(`ALTER\\s+COLUMN\\s+${col}|DROP\\s+COLUMN\\s+${col}`, "i")
          .test(MIG.text),
      ).toBe(false);
    }
  });

  it("does not alter sensor_readings", () => {
    expect(/sensor_readings/i.test(MIG.text)).toBe(false);
  });

  it("does not alter pi_ingest_idempotency_keys", () => {
    expect(/pi_ingest_idempotency_keys/i.test(MIG.text)).toBe(false);
  });

  it("does not alter alerts or action_queue", () => {
    expect(/\balerts\b/i.test(MIG.text)).toBe(false);
    expect(/action_queue/i.test(MIG.text)).toBe(false);
  });

  it("does not add a service_role grant", () => {
    expect(/GRANT[\s\S]*?TO\s+service_role/i.test(MIG.text)).toBe(false);
  });

  it("does not add a DELETE policy", () => {
    expect(/CREATE\s+POLICY[^;]*FOR\s+DELETE/i.test(MIG.text)).toBe(false);
  });
});

describe("Option A precondition satisfied for bridge credential lookup contract", () => {
  it("a global bridge_id uniqueness migration is present in the repo", () => {
    expect(MIG.name).not.toBe("");
  });

  it("contract doc still warns that singular lookup is unsafe without global uniqueness", () => {
    const doc = readFileSync(
      resolve(ROOT, "docs/pi-ingest-bridge-credential-lookup-contract.md"),
      "utf8",
    );
    expect(/loadBridgeCredentialRow/.test(doc)).toBe(true);
    expect(/global(ly)?\s+unique/i.test(doc)).toBe(true);
  });
});

describe("Edge Function remains fail-closed and lookup unimplemented", () => {
  it("index.ts still returns secret_resolver_not_implemented on POST", () => {
    const idx = readFileSync(
      resolve(ROOT, "supabase/functions/pi-ingest-readings/index.ts"),
      "utf8",
    );
    expect(idx.includes("secret_resolver_not_implemented")).toBe(true);
  });

  it("no credential lookup implementation file exists yet", () => {
    const dir = resolve(ROOT, "supabase/functions/pi-ingest-readings");
    const files = readdirSync(dir);
    for (const f of [
      "bridgeCredentialLookup.ts",
      "loadBridgeCredential.ts",
      "credentialLookup.ts",
    ]) {
      expect(files.includes(f)).toBe(false);
    }
  });

  it("no Supabase client import in Edge Function dir", () => {
    const dir = resolve(ROOT, "supabase/functions/pi-ingest-readings");
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const txt = readFileSync(join(dir, f), "utf8");
      expect(/@supabase\/supabase-js/.test(txt)).toBe(false);
      expect(/\bcreateClient\s*\(/.test(txt)).toBe(false);
    }
  });

  it("no SUPABASE_SERVICE_ROLE_KEY runtime read in src/", () => {
    function walk(dir: string, out: string[] = []): string[] {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
      }
      return out;
    }
    const files = walk(resolve(ROOT, "src"));
    for (const p of files) {
      if (!/\.(ts|tsx)$/.test(p)) continue;
      if (/\.test\.(ts|tsx)$/.test(p)) continue;
      const txt = readFileSync(p, "utf8");
      expect(
        /SUPABASE_SERVICE_ROLE_KEY/.test(txt),
        `${p} must not reference SUPABASE_SERVICE_ROLE_KEY`,
      ).toBe(false);
    }
  });
});
