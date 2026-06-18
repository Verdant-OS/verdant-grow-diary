/**
 * Pheno Hunt Persistence v1 — migration & hook static safety.
 *
 * Asserts:
 *  - both pheno hunt tables enable RLS in the migration
 *  - migration grants do not expose service_role to anon/authenticated
 *  - persistence rules + create hook are free of AI / alerts /
 *    Action Queue / device-control / service_role / token imports
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

function findMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR);
  for (const f of files) {
    const src = readFileSync(resolve(MIGRATIONS_DIR, f), "utf8");
    if (src.includes("CREATE TABLE public.pheno_hunts")) return src;
  }
  throw new Error("pheno_hunts migration not found");
}

const MIG = findMigration();
const RULES = readFileSync(resolve(ROOT, "src/lib/phenoHuntPersistenceRules.ts"), "utf8");
const HOOK = readFileSync(resolve(ROOT, "src/hooks/useCreatePhenoHunt.ts"), "utf8");

describe("pheno hunt persistence — static safety", () => {
  it("migration enables RLS on pheno_hunts", () => {
    expect(MIG).toMatch(/ALTER TABLE public\.pheno_hunts ENABLE ROW LEVEL SECURITY/);
  });

  it("migration enables RLS on pheno_hunt_candidates", () => {
    expect(MIG).toMatch(/ALTER TABLE public\.pheno_hunt_candidates ENABLE ROW LEVEL SECURITY/);
  });

  it("migration grants only authenticated + service_role (no anon)", () => {
    // pheno_hunts: no public/anon grant
    expect(MIG).not.toMatch(/GRANT[^;]*ON public\.pheno_hunts[^;]*TO\s+anon/i);
    expect(MIG).not.toMatch(/GRANT[^;]*ON public\.pheno_hunt_candidates[^;]*TO\s+anon/i);
    expect(MIG).toMatch(/GRANT[^;]*ON public\.pheno_hunts[^;]*TO authenticated/);
    expect(MIG).toMatch(/GRANT[^;]*ON public\.pheno_hunt_candidates[^;]*TO authenticated/);
  });

  it("migration does not embed service_role keys or bridge tokens", () => {
    expect(MIG).not.toMatch(/SERVICE_ROLE_KEY/i);
    expect(MIG).not.toMatch(/bridge_token/i);
  });

  it("persistence rules are pure (no React/Supabase/toast)", () => {
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/@\/integrations\/supabase/);
    expect(RULES).not.toMatch(/sonner/);
  });

  it("create hook + rules avoid AI / alerts / Action Queue / device-control", () => {
    for (const src of [RULES, HOOK]) {
      expect(src).not.toMatch(/@\/lib\/ai\//);
      expect(src).not.toMatch(/aiDoctor|aiCoach/i);
      expect(src).not.toMatch(/openai|anthropic/i);
      expect(src).not.toMatch(/@\/lib\/alerts/);
      expect(src).not.toMatch(/actionQueue/i);
      expect(src).not.toMatch(/deviceControl|device_control/);
      expect(src).not.toMatch(/bridgeToken|bridge_token/i);
      expect(src).not.toMatch(/SERVICE_ROLE/i);
      expect(src).not.toMatch(/customerMode|publicMode/);
    }
  });

  it("create hook writes only to pheno_hunts and pheno_hunt_candidates", () => {
    const fromCalls = HOOK.match(/\.from\((["'])([^"']+)\1\)/g) ?? [];
    for (const call of fromCalls) {
      expect(call).toMatch(/pheno_hunts|pheno_hunt_candidates/);
    }
  });
});
