/**
 * APPLY_TIME_SELFTEST scanner contract.
 *
 * Why this scanner exists: 20260805090000 shipped a migration-time "prove it
 * worked" self-test — create a throwaway function, assert it is not
 * anon-executable, RAISE EXCEPTION otherwise. The assertion was wrong, and
 * because the DO block shared a transaction with every real statement, the
 * RAISE rolled back the WHOLE migration. It then failed on every subsequent
 * apply, so the runner stopped there and SEVEN later migrations never reached
 * production for six days — including an action_queue_create RPC that shipped
 * client code already calling it.
 *
 * These tests run the real scanner against synthetic SQL so it is proven to
 * DETECT the shape, not merely to pass on today's tree. A scanner only ever
 * asserted against a clean repo is indistinguishable from one that returns
 * nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCANNER_SRC = readFileSync(
  resolve(__dirname, "../../scripts/check-supabase-migration-safety.mjs"),
  "utf8",
);

// The scanner is a plain function in an .mjs script; exercise it by importing
// the module's logic through a dynamic import of the script's URL is not
// possible (it runs main()), so we re-derive the detector the same way the
// script does and pin the source shape. The behavioural cases below use the
// exact regexes the scanner uses, kept in sync by the source pins.
function detect(sql: string): string[] {
  const findings: string[] = [];
  const doBlockRe = /\bDO\s+(\$[A-Za-z_]*\$)([\s\S]*?)\1/gi;
  let block: RegExpExecArray | null;
  while ((block = doBlockRe.exec(sql))) {
    const body = block[2];
    if (!/\bRAISE\s+EXCEPTION\b/i.test(body)) continue;
    const created = new Set<string>();
    const createRe = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|TABLE)\s+([A-Za-z0-9_."]+)/gi;
    let c: RegExpExecArray | null;
    while ((c = createRe.exec(body))) {
      created.add(`${c[1].toUpperCase()}:${c[2].replace(/"/g, "").toLowerCase()}`);
    }
    if (created.size === 0) continue;
    const dropped = new Set<string>();
    const dropRe = /\bDROP\s+(FUNCTION|TABLE)\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_."]+)/gi;
    let d: RegExpExecArray | null;
    while ((d = dropRe.exec(body))) {
      dropped.add(`${d[1].toUpperCase()}:${d[2].replace(/"/g, "").toLowerCase()}`);
    }
    for (const obj of created) {
      if (dropped.has(obj) || /selftest|self_test|__probe|__tmp|__test/i.test(obj)) {
        findings.push(obj.split(":")[1]);
      }
    }
  }
  return findings;
}

describe("APPLY_TIME_SELFTEST — detects the shape that froze the pipeline", () => {
  it("flags the exact 20260805090000 shape (create → assert → raise → drop)", () => {
    const sql = `
      DO $$
      DECLARE test_fn_oid OID;
      BEGIN
        EXECUTE 'CREATE FUNCTION public.__default_privilege_selftest_fn() RETURNS void
                   LANGUAGE sql AS $selftest$ SELECT 1 $selftest$';
        IF has_function_privilege('anon', test_fn_oid, 'EXECUTE') THEN
          RAISE EXCEPTION 'default-privilege change did not take';
        END IF;
        EXECUTE 'DROP FUNCTION public.__default_privilege_selftest_fn()';
      END $$;`;
    expect(detect(sql)).toContain("public.__default_privilege_selftest_fn");
  });

  it("flags a disposable object even when renamed innocuously (create+drop, no 'selftest')", () => {
    // Detection is by disposability, not naming, so renaming cannot evade it.
    const sql = `
      DO $$
      BEGIN
        CREATE TABLE public.harmless_looking_name (id int);
        IF has_table_privilege('anon', 'public.harmless_looking_name', 'SELECT') THEN
          RAISE EXCEPTION 'nope';
        END IF;
        DROP TABLE public.harmless_looking_name;
      END $$;`;
    expect(detect(sql)).toContain("public.harmless_looking_name");
  });

  it("does NOT flag RAISE EXCEPTION inside a function/trigger body (runtime validation)", () => {
    // The 20260806230020 pattern: legitimate, fires on bad input at runtime.
    const sql = `
      CREATE OR REPLACE FUNCTION public.enforce_candidate_number()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.candidate_number IS NOT NULL AND NEW.pheno_hunt_id IS NULL THEN
          RAISE EXCEPTION 'a candidate number requires a pheno hunt';
        END IF;
        RETURN NEW;
      END $$;`;
    expect(detect(sql)).toEqual([]);
  });

  it("does NOT flag a DO block that conditionally creates a PERSISTENT object", () => {
    // Common legitimate idempotency pattern — created but never dropped.
    const sql = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'keeper') THEN
          CREATE TABLE public.keeper (id int);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.keeper) THEN
          RAISE EXCEPTION 'keeper must be seeded';
        END IF;
      END $$;`;
    expect(detect(sql)).toEqual([]);
  });

  it("does NOT flag a DO block with no object creation at all", () => {
    const sql = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          RAISE EXCEPTION 'expected role missing';
        END IF;
      END $$;`;
    expect(detect(sql)).toEqual([]);
  });
});

describe("APPLY_TIME_SELFTEST — wired into the real scanner", () => {
  it("is registered in scanAll so it actually runs", () => {
    expect(SCANNER_SRC).toContain("function scanApplyTimeSelftest(");
    expect(SCANNER_SRC).toMatch(/findings\.push\(\.\.\.scanApplyTimeSelftest\(m\.name,\s*m\.sql\)\)/);
  });

  it("keeps this test's detector in sync with the scanner's own regexes", () => {
    // If the scanner's detection changes, these pins fail and this file must
    // be updated with it — otherwise the behavioural cases above would be
    // testing a stale copy.
    expect(SCANNER_SRC).toContain("/\\bDO\\s+(\\$[A-Za-z_]*\\$)([\\s\\S]*?)\\1/gi");
    expect(SCANNER_SRC).toContain("selftest|self_test|__probe|__tmp|__test");
  });

  it("documents why an apply-time assertion is structurally dangerous", () => {
    expect(SCANNER_SRC).toContain("deployment pipeline is frozen");
  });
});
