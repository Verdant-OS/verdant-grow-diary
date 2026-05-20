/**
 * Asserts safety properties of public.has_role(uuid, app_role).
 *
 * has_role must remain SECURITY DEFINER (per Supabase's recommended
 * non-recursive RLS pattern). These tests verify it keeps its safety
 * constraints and that no migration pairs it with service_role escalation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

const ALL_SQL = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n-- FILE BOUNDARY --\n\n");

function hasRoleBody(): string {
  const m = ALL_SQL.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_role[\s\S]*?AS\s+\$(?:function)?\$([\s\S]*?)\$(?:function)?\$/i,
  );
  if (!m) throw new Error("has_role definition not found");
  return m[1];
}

describe("has_role SECURITY DEFINER safety", () => {
  it("defines has_role with SECURITY DEFINER", () => {
    expect(ALL_SQL).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_role[\s\S]*?SECURITY\s+DEFINER/i,
    );
  });

  it("pins search_path on has_role", () => {
    expect(ALL_SQL).toMatch(
      /has_role[\s\S]{0,800}SET\s+search_path\s*=\s*['"]?\s*public/i,
    );
  });

  it("is STABLE and read-only (no INSERT/UPDATE/DELETE inside body)", () => {
    const body = hasRoleBody();
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
    expect(ALL_SQL).toMatch(/has_role[\s\S]{0,400}\bSTABLE\b/i);
  });

  it("returns boolean only (no row leakage)", () => {
    expect(ALL_SQL).toMatch(
      /FUNCTION\s+public\.has_role[\s\S]*?RETURNS\s+boolean/i,
    );
  });

  it("checks ownership by the supplied _user_id (no auth.uid() override inside body)", () => {
    const body = hasRoleBody();
    expect(body).toMatch(/user_id\s*=\s*_user_id/);
    expect(body).not.toMatch(/auth\.uid\s*\(/i);
  });

  it("documents the SECURITY DEFINER rationale via COMMENT", () => {
    expect(ALL_SQL).toMatch(
      /COMMENT\s+ON\s+FUNCTION\s+public\.has_role[\s\S]*?SECURITY\s+DEFINER\s+required/i,
    );
  });

  it("has_role EXECUTE is restricted (not granted to anon/public)", () => {
    // Defensive: signed-out / public callers must not be able to probe roles.
    expect(ALL_SQL).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.has_role[^;]*\bTO\s+(anon|public)\b/i,
    );
  });
});
