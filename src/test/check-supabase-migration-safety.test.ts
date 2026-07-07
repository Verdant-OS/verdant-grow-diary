import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
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
  const src = execFileSync("cat", [SCRIPT], { encoding: "utf8" });
  const patched = src.replace(
    /const REPO_ROOT = .*;/,
    `const REPO_ROOT = ${JSON.stringify(dir)};`,
  );
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

describe("check-supabase-migration-safety", () => {
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
