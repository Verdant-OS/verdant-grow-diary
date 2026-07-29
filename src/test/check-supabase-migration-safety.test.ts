import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const SCRIPT = resolve(__dirname, "..", "..", "scripts", "check-supabase-migration-safety.mjs");

/**
 * Contract test for the CI safety scanner. Uses the real script binary
 * against a synthetic migrations tree via a wrapping child process. The
 * test never touches supabase/migrations or the real baseline file — it
 * shells out to `node` with a temp cwd that exposes fake paths through
 * env, so we instead run the script's exported logic by re-import.
 *
 * To keep the surface small, the test runs the CLI in a fresh temp repo
 * built with the same file layout the scanner expects:
 *   <tmp>/supabase/migrations/*.sql
 *   <tmp>/config/supabase-migration-safety-baseline.json (initialized)
 * and copies the script in verbatim, adjusting REPO_ROOT via a shim.
 */
function makeSandbox(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "supa-sec-"));
  mkdirSync(join(dir, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, "supabase", "migrations", name), sql);
  }
  // Shim script: import the real one but override its constants via env.
  // Simpler: copy the script and rewrite REPO_ROOT to the sandbox.
  const src = readFileSync(SCRIPT, "utf8");
  const patched = src.replace(/const REPO_ROOT = .*;/, `const REPO_ROOT = ${JSON.stringify(dir)};`);
  const scriptPath = join(dir, "scripts", "check.mjs");
  writeFileSync(scriptPath, patched);
  return { dir, scriptPath };
}

function run(scriptPath: string, extra: string[] = []): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("node", [scriptPath, ...extra], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out, err: "" };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: err.stdout ?? "", err: err.stderr ?? "" };
  }
}

describe("check-supabase-migration-safety", { timeout: 15_000 }, () => {
  it("passes when a well-formed migration adds SECURITY DEFINER with search_path", () => {
    const { scriptPath } = makeSandbox({
      "20260101_ok.sql": `
        CREATE TABLE public.notes (id uuid primary key);
        ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
        CREATE OR REPLACE FUNCTION public.f_ok()
          RETURNS void
          LANGUAGE plpgsql
          SECURITY DEFINER
          SET search_path = public, pg_temp
        AS $$ BEGIN RETURN; END; $$;
      `,
    });
    // initialize empty baseline
    run(scriptPath, ["--update-baseline"]);
    const r = run(scriptPath);
    expect(r.code).toBe(0);
  });

  it("fails when a NEW SECURITY DEFINER function has no search_path", () => {
    const { scriptPath, dir } = makeSandbox({
      "20260101_ok.sql": `
        CREATE OR REPLACE FUNCTION public.f_ok()
          RETURNS void LANGUAGE plpgsql SECURITY DEFINER
          SET search_path = public, pg_temp
        AS $$ BEGIN RETURN; END; $$;
      `,
    });
    run(scriptPath, ["--update-baseline"]); // clean baseline
    // Add a new bad migration AFTER baseline.
    writeFileSync(
      join(dir, "supabase", "migrations", "20260202_bad.sql"),
      `CREATE OR REPLACE FUNCTION public.f_bad()
         RETURNS void LANGUAGE plpgsql SECURITY DEFINER
       AS $$ BEGIN RETURN; END; $$;`,
    );
    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("SEARCH_PATH_MUTABLE");
    expect(r.err).toContain("f_bad");
  });

  it("fails when a NEW policy uses WITH CHECK (true) on INSERT", () => {
    const { scriptPath, dir } = makeSandbox({
      "20260101_ok.sql": `-- empty`,
    });
    run(scriptPath, ["--update-baseline"]);
    writeFileSync(
      join(dir, "supabase", "migrations", "20260202_bad.sql"),
      `CREATE POLICY "insert_all" ON public.notes
         FOR INSERT TO authenticated
         WITH CHECK (true);`,
    );
    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
  });

  it("clears a historical permissive finding after an exact DROP and safe recreation", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "Anyone can submit feedback" ON public.customer_feedback
          FOR INSERT TO anon, authenticated
          WITH CHECK (true);
      `,
      "20260102_fixed.sql": `
        DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.customer_feedback;
        CREATE POLICY "Public can submit bounded feedback" ON public.customer_feedback
          FOR INSERT TO anon, authenticated
          WITH CHECK (user_id IS NOT DISTINCT FROM (select auth.uid()));
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain("PERMISSIVE_POLICY");
  });

  it("keeps a permissive finding when a later DROP targets a different table", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_wrong_drop.sql": `
        DROP POLICY IF EXISTS "public_insert" ON public.contact_messages;
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
    expect(r.err).toContain("20260101_bad.sql");
  });

  it("keeps a permissive finding when a later DROP targets a different policy name", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_wrong_drop.sql": `
        DROP POLICY IF EXISTS "other_policy" ON public.customer_feedback;
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
  });

  it("does not treat a commented-out or string-literal DROP as effective DDL", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_not_a_drop.sql": `
        -- DROP POLICY IF EXISTS "public_insert" ON public.customer_feedback;
        SELECT 'DROP POLICY IF EXISTS "public_insert" ON public.customer_feedback';
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
  });

  it("keeps qualified and unqualified policy targets distinct", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_ambiguous_drop.sql": `
        DROP POLICY IF EXISTS "public_insert" ON customer_feedback;
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
  });

  it("reports only an unrelated active permissive policy after an exact repair", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "fixed_later" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_fixed.sql": `
        DROP POLICY IF EXISTS "fixed_later" ON public.customer_feedback;
        CREATE POLICY "fixed_later" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (user_id IS NULL);
      `,
      "20260103_still_bad.sql": `
        CREATE POLICY "still_bad" ON public.contact_messages
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
    });

    const r = run(scriptPath, ["--json"]);
    expect(r.code).toBe(1);
    const report = JSON.parse(r.out) as {
      new: Array<{ migration: string; subject: string }>;
    };
    expect(report.new).toHaveLength(1);
    expect(report.new[0]?.migration).toBe("20260103_still_bad.sql");
    expect(report.new[0]?.subject).toContain("still_bad");
  });

  it("matches quoted lowercase identifiers to their unquoted PostgreSQL form", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_exact_drop.sql": `
        DROP POLICY IF EXISTS public_insert ON "public"."customer_feedback";
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(0);
  });

  it("preserves quoted identifier case when matching policy targets", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "Public_Insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_wrong_case_drop.sql": `
        DROP POLICY IF EXISTS public_insert ON public.customer_feedback;
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
  });

  it("flags a policy that becomes permissive again after a safe replacement", () => {
    const { scriptPath } = makeSandbox({
      "20260101_safe.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (user_id IS NULL);
      `,
      "20260102_regression.sql": `
        DROP POLICY IF EXISTS "public_insert" ON public.customer_feedback;
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
    expect(r.err).toContain("20260102_regression.sql");
  });

  it("does not hide a same-line permissive recreation after an exact DROP", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_regression.sql": `
        DROP POLICY IF EXISTS "public_insert" ON public.customer_feedback; CREATE POLICY "public_insert" ON public.customer_feedback FOR INSERT TO anon WITH CHECK (true);
      `,
    });

    const r = run(scriptPath, ["--json"]);
    expect(r.code).toBe(1);
    const report = JSON.parse(r.out) as {
      new: Array<{ migration: string; subject: string }>;
    };
    expect(report.new).toHaveLength(1);
    expect(report.new[0]?.migration).toBe("20260102_regression.sql");
  });

  it("flags an ALTER POLICY that makes a safe write policy permissive", () => {
    const { scriptPath } = makeSandbox({
      "20260101_safe.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (user_id IS NULL);
      `,
      "20260102_regression.sql": `
        ALTER POLICY "public_insert" ON public.customer_feedback
          WITH CHECK (true);
      `,
    });

    const r = run(scriptPath, ["--json"]);
    expect(r.code).toBe(1);
    const report = JSON.parse(r.out) as {
      new: Array<{ migration: string; subject: string }>;
    };
    expect(report.new).toHaveLength(1);
    expect(report.new[0]?.migration).toBe("20260102_regression.sql");
    expect(report.new[0]?.subject).toContain("public_insert");
  });

  it("flags direct TRUE through nested parentheses and SQL comments", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (
            (
              /* formatting comment */
              (TRUE)
            )
          );
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("PERMISSIVE_POLICY");
  });

  it("clears a permissive policy after a later safe ALTER POLICY", () => {
    const { scriptPath } = makeSandbox({
      "20260101_bad.sql": `
        CREATE POLICY "public_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (true);
      `,
      "20260102_fixed.sql": `
        ALTER POLICY "public_insert" ON public.customer_feedback
          WITH CHECK (user_id IS NOT DISTINCT FROM (select auth.uid()));
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain("PERMISSIVE_POLICY");
  });

  it("does not flag TRUE inside a condition, comment, or string literal", () => {
    const { scriptPath } = makeSandbox({
      "20260101_safe.sql": `
        CREATE POLICY "conditional_insert" ON public.customer_feedback
          FOR INSERT TO anon
          WITH CHECK (
            enabled = true
            AND note <> 'WITH CHECK (true)'
            /* WITH CHECK (true) is intentionally not the policy expression. */
          );
        CREATE POLICY "conditional_update" ON public.customer_feedback
          FOR UPDATE TO authenticated
          USING (true AND user_id IS NOT DISTINCT FROM (select auth.uid()))
          WITH CHECK (approved = true);
      `,
    });

    const r = run(scriptPath);
    expect(r.code).toBe(0);
    expect(r.err).not.toContain("PERMISSIVE_POLICY");
  });

  it("fails when a NEW public table is created without ENABLE ROW LEVEL SECURITY", () => {
    const { scriptPath, dir } = makeSandbox({
      "20260101_ok.sql": `-- empty`,
    });
    run(scriptPath, ["--update-baseline"]);
    writeFileSync(
      join(dir, "supabase", "migrations", "20260202_bad.sql"),
      `CREATE TABLE public.leaky (id uuid primary key);`,
    );
    const r = run(scriptPath);
    expect(r.code).toBe(1);
    expect(r.err).toContain("TABLE_WITHOUT_RLS");
    expect(r.err).toContain("public.leaky");
  });

  it("ignores SELECT policies that use USING (true) as public-read pattern", () => {
    const { scriptPath } = makeSandbox({
      "20260101_ok.sql": `CREATE POLICY "read_all" ON public.notes
         FOR SELECT TO anon USING (true);`,
    });
    run(scriptPath, ["--update-baseline"]);
    const r = run(scriptPath);
    expect(r.code).toBe(0);
  });
});

// Cleanup: individual tests leak tmp dirs — CI runners are ephemeral so
// this is acceptable. Local runs can `rm -rf $TMPDIR/supa-sec-*` if
// disk usage becomes a concern.
void rmSync;
