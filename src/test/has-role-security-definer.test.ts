/**
 * Asserts safety properties of public.has_role(uuid, app_role).
 *
 * has_role must remain SECURITY DEFINER (per Supabase's recommended
 * non-recursive RLS pattern). These tests verify that the function
 * keeps its safety constraints and that no other code path bypasses
 * tenant ownership via service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const ALL_SQL = migrationFiles
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n-- FILE BOUNDARY --\n\n");

const SRC_DIR = resolve(ROOT, "src");
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}
const ALL_SRC = walk(SRC_DIR)
  .filter((p) => !p.includes("/test/"))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

describe("has_role SECURITY DEFINER safety", () => {
  it("defines has_role with SECURITY DEFINER", () => {
    expect(ALL_SQL).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_role[\s\S]*?SECURITY\s+DEFINER/i,
    );
  });

  it("pins search_path on has_role", () => {
    // The definition (or a later ALTER) must set search_path explicitly.
    expect(ALL_SQL).toMatch(
      /has_role[\s\S]{0,800}SET\s+search_path\s*=\s*['"]?public/i,
    );
  });

  it("is STABLE and read-only (no INSERT/UPDATE/DELETE inside body)", () => {
    const match = ALL_SQL.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_role[\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
    );
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
    // Function declaration includes STABLE.
    expect(ALL_SQL).toMatch(/has_role[\s\S]{0,400}\bSTABLE\b/i);
  });

  it("returns boolean only (no row leakage)", () => {
    expect(ALL_SQL).toMatch(
      /FUNCTION\s+public\.has_role[\s\S]*?RETURNS\s+boolean/i,
    );
  });

  it("checks ownership by _user_id parameter (no auth.uid() override inside body)", () => {
    const match = ALL_SQL.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_role[\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
    );
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toMatch(/user_id\s*=\s*_user_id/);
  });

  it("documents the SECURITY DEFINER rationale via COMMENT", () => {
    expect(ALL_SQL).toMatch(
      /COMMENT\s+ON\s+FUNCTION\s+public\.has_role[\s\S]*?SECURITY\s+DEFINER\s+required/i,
    );
  });

  it("application code never references service_role for has_role bypass", () => {
    expect(ALL_SRC).not.toMatch(/service_role/i);
  });

  it("no application code calls has_role via rpc with a forged user id", () => {
    // Defensive: if has_role is ever exposed via rpc, callers must pass
    // auth.uid() (handled in policies). Verify no client passes a literal
    // uuid arg directly to a has_role rpc invocation.
    const rpcForged = /\.rpc\(\s*['"]has_role['"]\s*,\s*\{[^}]*_user_id\s*:\s*['"]/;
    expect(ALL_SRC).not.toMatch(rpcForged);
  });
});
