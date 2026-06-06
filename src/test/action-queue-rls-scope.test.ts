import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

function stripSqlComments(sql: string): string {
  // Remove -- line comments and /* ... */ block comments so descriptive prose
  // in migration headers cannot trigger structural policy assertions.
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

function allMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => stripSqlComments(readFileSync(join(MIGRATIONS_DIR, name), "utf8")))
    .join("\n\n");
}


function allActionQueueMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .filter((sql) => /\baction_queue\b/i.test(sql))
    .join("\n\n");
}

function lastPolicyBlock(command: "INSERT" | "UPDATE"): string {
  const re = new RegExp(
    `CREATE\\s+POLICY\\s+"Users\\s+${command === "INSERT" ? "insert" : "update"}\\s+own\\s+action_queue"[\\s\\S]*?ON\\s+public\\.action_queue[\\s\\S]*?FOR\\s+${command}[\\s\\S]*?;`,
    "gi",
  );
  const matches = [...allActionQueueMigrations().matchAll(re)];
  return matches.length ? matches[matches.length - 1][0] : "";
}

function compact(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const ALL_MIGRATIONS = allMigrations();
const INSERT_POLICY = compact(lastPolicyBlock("INSERT"));
const UPDATE_POLICY = compact(lastPolicyBlock("UPDATE"));

describe("action_queue RLS scope regression", () => {
  it("does not contain the known bad self-comparison forms anywhere in policy SQL", () => {
    expect(ALL_MIGRATIONS).not.toMatch(/\bt\.grow_id\s*=\s*t\.grow_id\b/i);
    expect(ALL_MIGRATIONS).not.toMatch(/\bp\.grow_id\s*=\s*p\.grow_id\b/i);
    expect(ALL_MIGRATIONS).not.toMatch(/\bp\.tent_id\s*=\s*p\.tent_id\b/i);
  });

  it("latest INSERT policy binds grow ownership to action_queue.grow_id", () => {
    expect(INSERT_POLICY).toMatch(/auth\.uid\(\)\s*=\s*action_queue\.user_id/i);
    expect(INSERT_POLICY).toMatch(/g\.id\s*=\s*action_queue\.grow_id/i);
    expect(INSERT_POLICY).toMatch(/g\.user_id\s*=\s*auth\.uid\(\)/i);
  });

  it("latest INSERT policy rejects tents from another grow", () => {
    expect(INSERT_POLICY).toMatch(/action_queue\.tent_id\s+IS\s+NULL\s+OR\s*\(/i);
    expect(INSERT_POLICY).toMatch(/t\.id\s*=\s*action_queue\.tent_id/i);
    expect(INSERT_POLICY).toMatch(/t\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(INSERT_POLICY).toMatch(/t\.grow_id\s*=\s*action_queue\.grow_id/i);
    expect(INSERT_POLICY).not.toMatch(/t\.grow_id\s*=\s*grow_id/i);
  });

  it("latest INSERT policy rejects plants from another grow", () => {
    expect(INSERT_POLICY).toMatch(/action_queue\.plant_id\s+IS\s+NULL\s+OR\s*\(/i);
    expect(INSERT_POLICY).toMatch(/p\.id\s*=\s*action_queue\.plant_id/i);
    expect(INSERT_POLICY).toMatch(/p\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(INSERT_POLICY).toMatch(/p\.grow_id\s*=\s*action_queue\.grow_id/i);
    expect(INSERT_POLICY).not.toMatch(/p\.grow_id\s*=\s*grow_id/i);
  });

  it("latest INSERT policy rejects plant/tent mismatches when both are present", () => {
    expect(INSERT_POLICY).toMatch(
      /action_queue\.plant_id\s+IS\s+NULL\s+OR\s+action_queue\.tent_id\s+IS\s+NULL\s+OR\s*\(/i,
    );
    expect(INSERT_POLICY).toMatch(/p\.tent_id\s*=\s*action_queue\.tent_id/i);
    expect(INSERT_POLICY).not.toMatch(/p\.tent_id\s*=\s*tent_id/i);
  });

  it("latest UPDATE policy mirrors the same explicit grow/tent/plant scope checks", () => {
    expect(UPDATE_POLICY).toMatch(/USING\s*\(\s*auth\.uid\(\)\s*=\s*action_queue\.user_id\s*\)/i);
    expect(UPDATE_POLICY).toMatch(/auth\.uid\(\)\s*=\s*action_queue\.user_id/i);
    expect(UPDATE_POLICY).toMatch(/g\.id\s*=\s*action_queue\.grow_id/i);
    expect(UPDATE_POLICY).toMatch(/t\.id\s*=\s*action_queue\.tent_id/i);
    expect(UPDATE_POLICY).toMatch(/t\.grow_id\s*=\s*action_queue\.grow_id/i);
    expect(UPDATE_POLICY).toMatch(/p\.id\s*=\s*action_queue\.plant_id/i);
    expect(UPDATE_POLICY).toMatch(/p\.grow_id\s*=\s*action_queue\.grow_id/i);
    expect(UPDATE_POLICY).toMatch(/p\.tent_id\s*=\s*action_queue\.tent_id/i);
    expect(UPDATE_POLICY).not.toMatch(/t\.grow_id\s*=\s*grow_id/i);
    expect(UPDATE_POLICY).not.toMatch(/p\.grow_id\s*=\s*grow_id/i);
    expect(UPDATE_POLICY).not.toMatch(/p\.tent_id\s*=\s*tent_id/i);
  });
});
