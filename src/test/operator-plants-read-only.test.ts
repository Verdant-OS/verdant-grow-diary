/**
 * @source-scan-justified: a migration is SQL text; no Postgres is available to
 * Vitest, so the only resolvable artifact is the file itself. Runtime behavior
 * is proven separately on a disposable local PostgreSQL (see the handoff).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as permissions from "@/lib/permissions";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const FILE = "20261112030000_operator_plants_read_only.sql";
const PATH = resolve(MIGRATIONS, FILE);
const sql = (): string => readFileSync(PATH, "utf8");
const statements = (): string =>
  sql()
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();

describe("operator plants read-only", () => {
  it("ships a new migration that drops the operator UPDATE policy on plants", () => {
    expect(existsSync(PATH)).toBe(true);
    expect(statements()).toContain(
      'drop policy if exists "operators update all plants" on public.plants;',
    );
  });

  it("is the newest migration, so it applies after the policy's creator", () => {
    const newest = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .at(-1);
    expect(newest).toBe(FILE);
  });

  it("creates no policy and grants nothing", () => {
    expect(existsSync(PATH)).toBe(true);
    const body = statements();
    expect(body).not.toMatch(/create policy/);
    expect(body).not.toMatch(/\bgrant\b/);
    expect(body).not.toMatch(/disable row level security/);
  });

  it("leaves operator read access and grower write access untouched", () => {
    expect(existsSync(PATH)).toBe(true);
    const body = statements();
    expect(body).not.toContain('"operators view all plants"');
    expect(body).not.toContain('"users update own plants"');
  });

  it("fails closed if an operator UPDATE policy on plants survives", () => {
    expect(existsSync(PATH)).toBe(true);
    const body = statements();
    expect(body).toMatch(/from pg_catalog\.pg_policies/);
    expect(body).toMatch(/raise exception/);
  });

  it("no longer exports the client helper that relied on that policy", () => {
    expect("moderatePlantAsOperator" in permissions).toBe(false);
  });
});
