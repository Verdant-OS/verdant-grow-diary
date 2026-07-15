/**
 * Static RLS contract test for the `sensor_readings` INSERT policy.
 *
 * Verifies that INSERTs are gated by BOTH:
 *   1. auth.uid() = user_id  (the caller owns the row), AND
 *   2. an EXISTS check against public.tents proving auth.uid() also owns
 *      the referenced tent_id (no cross-tenant tent-history pollution).
 *
 * This is a deterministic, dependency-free scan over the current
 * supabase/migrations tree. It picks the LAST `CREATE POLICY ... FOR INSERT`
 * targeting public.sensor_readings and asserts both fences are present in
 * its WITH CHECK clause. If a future migration weakens either fence, this
 * test fails at PR time.
 *
 * No DB connection. No service_role. No secrets.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

interface InsertPolicy {
  file: string;
  body: string;
  withCheck: string;
}

function loadSensorReadingsInsertPolicies(): InsertPolicy[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const found: InsertPolicy[] = [];
  // Matches: CREATE POLICY "..." ON public.sensor_readings ... FOR INSERT ... WITH CHECK ( ... );
  const policyRe =
    /CREATE\s+POLICY[\s\S]*?ON\s+public\.sensor_readings[\s\S]*?FOR\s+INSERT[\s\S]*?WITH\s+CHECK\s*\(([\s\S]*?)\)\s*;/gi;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const match of sql.matchAll(policyRe)) {
      found.push({ file, body: match[0], withCheck: match[1] });
    }
  }
  return found;
}

describe("sensor_readings INSERT RLS: tent-ownership fence", () => {
  const policies = loadSensorReadingsInsertPolicies();

  it("at least one INSERT policy is defined on public.sensor_readings", () => {
    expect(policies.length).toBeGreaterThan(0);
  });

  it("the most recent INSERT policy requires auth.uid() = user_id", () => {
    const latest = policies[policies.length - 1];
    expect(latest, "no INSERT policy found").toBeDefined();
    expect(latest.withCheck).toMatch(/auth\.uid\(\)\s*=\s*user_id/i);
  });

  it("the most recent INSERT policy requires an EXISTS check against public.tents", () => {
    const latest = policies[policies.length - 1];
    expect(latest.withCheck).toMatch(/EXISTS\s*\(/i);
    expect(latest.withCheck).toMatch(/public\.tents/i);
  });

  it("the tent-ownership EXISTS clause scopes both tent.id and tent.user_id", () => {
    const latest = policies[policies.length - 1];
    // tent row must match the sensor_readings.tent_id being inserted…
    expect(latest.withCheck).toMatch(/\.id\s*=\s*sensor_readings\.tent_id/i);
    // …AND the tent must be owned by the calling user.
    expect(latest.withCheck).toMatch(/\.user_id\s*=\s*auth\.uid\(\)/i);
  });

  it("the INSERT policy is scoped to the authenticated role (no anon inserts)", () => {
    const latest = policies[policies.length - 1];
    expect(latest.body).toMatch(/TO\s+authenticated/i);
    expect(latest.body).not.toMatch(/TO\s+anon\b/i);
  });

  it("no INSERT policy on sensor_readings uses a permissive WITH CHECK (true)", () => {
    for (const p of policies) {
      expect(
        /WITH\s+CHECK\s*\(\s*true\s*\)/i.test(p.body),
        `permissive INSERT policy found in ${p.file}`,
      ).toBe(false);
    }
  });
});
