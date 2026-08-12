/**
 * Static safety — Lab results (frontend + migration).
 *
 * Pins the surface's hard constraints:
 *   - frontend: no service_role / rpc / console logging; the hook selects
 *     explicit columns (never *); the panel fails toward hidden while the
 *     read is unresolved or unavailable; PlantDetail actually mounts it.
 *   - migration: RLS enabled, every policy own-scoped, no anon grant, and
 *     none of the abandoned breeder-mode draft's authenticated-wide read
 *     leak (`USING (true)`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const readStripped = (p: string) => stripSourceComments(read(p));

const FRONTEND_FILES = [
  "src/lib/labResultsRules.ts",
  "src/hooks/usePlantLabTests.ts",
  "src/hooks/useLabTestMutations.ts",
  "src/components/PlantLabResultsPanel.tsx",
];

const MIGRATION = "supabase/migrations/20260812000000_lab_tests_foundation.sql";

describe("lab results — frontend static safety", () => {
  for (const path of FRONTEND_FILES) {
    const src = readStripped(path);

    it(`${path}: no service_role / rpc / console logging`, () => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/console\.(log|warn|info|debug)\s*\(/);
    });
  }

  it("read hook selects explicit columns, never *", () => {
    const src = readStripped("src/hooks/usePlantLabTests.ts");
    expect(src).not.toMatch(/select\(\s*["'`]\s*\*/);
    expect(src).toMatch(/tested_at, created_at, thca_percent/);
  });

  it("read hook orders deterministically (tested_at, created_at, id)", () => {
    const src = readStripped("src/hooks/usePlantLabTests.ts");
    expect(src).toMatch(/order\("tested_at"[\s\S]*order\("created_at"[\s\S]*order\("id"/);
  });

  it("date labels are formatted in UTC so the entered calendar date never shifts", () => {
    const src = read("src/lib/labResultsRules.ts");
    expect(src).toContain('timeZone: "UTC"');
  });

  it("panel fails toward hidden while unresolved or unavailable", () => {
    const src = read("src/components/PlantLabResultsPanel.tsx");
    expect(src).toContain(
      "if (!plantId || isLoading || rows === undefined || rows === null) return null;",
    );
  });

  it("read hook degrades to null on error instead of throwing", () => {
    const src = read("src/hooks/usePlantLabTests.ts");
    expect(src).toContain("if (error) return null;");
  });

  it("PlantDetail mounts the panel", () => {
    const src = read("src/pages/PlantDetail.tsx");
    expect(src).toContain("PlantLabResultsPanel");
    expect(src).toMatch(/<PlantLabResultsPanel plantId=\{plant\.id\} \/>/);
  });
});

describe("lab results — migration static safety", () => {
  const sql = read(MIGRATION);

  it("enables RLS and grants nothing to anon", () => {
    expect(sql).toContain("ALTER TABLE public.lab_tests ENABLE ROW LEVEL SECURITY;");
    expect(sql).not.toMatch(/TO anon/);
    expect(sql).not.toMatch(/GRANT[^;]*\banon\b/);
  });

  it("every policy is own-scoped; no authenticated-wide read leak", () => {
    // The abandoned breeder-mode draft's leak shape must never reappear.
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    for (const policy of [
      "lab_tests_select_own",
      "lab_tests_insert_own",
      "lab_tests_update_own",
      "lab_tests_delete_own",
    ]) {
      expect(sql).toContain(policy);
    }
    // Ownership predicate appears in every policy body.
    const occurrences = sql.match(/auth\.uid\(\)\s*=\s*user_id/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
  });

  it("insert and update verify the referenced plant belongs to the caller", () => {
    const checks = sql.match(/WHERE p\.id = plant_id AND p\.user_id = auth\.uid\(\)/g) ?? [];
    expect(checks.length).toBe(2);
  });

  it("terpene validity and at-least-one-measurement are enforced at the DB boundary", () => {
    // Authenticated clients have direct INSERT/UPDATE, so app-side draft
    // validation alone cannot stop a tampered client — the database must
    // reject malformed evidence itself.
    expect(sql).toContain("CREATE FUNCTION public.lab_tests_terpenes_valid");
    expect(sql).toContain("CHECK (public.lab_tests_terpenes_valid(terpenes))");
    expect(sql).toContain("CONSTRAINT lab_tests_has_measurement");
    // The validator must be IMMUTABLE plain SQL — never SECURITY DEFINER.
    expect(sql).toMatch(/IMMUTABLE/);
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
  });
});
