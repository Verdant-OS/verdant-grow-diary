/**
 * Migration version uniqueness — static guard.
 *
 * Two migrations sharing a version prefix break every `supabase db reset`
 * with a schema_migrations primary-key violation (SQLSTATE 23505) — the
 * version column is the primary key. This happened with 20260707120000
 * (breeding_workflow_v1 + pheno_reversals_and_cross_types) and turned the
 * security-db-local CI lane deterministically red on every PR until one
 * file was renamed. This guard makes the next collision fail here, in a
 * unit test, instead of in the Dockerized DB lane.
 *
 * Pure filesystem assertions — no DB, no client.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const VERSION_PREFIX = /^(\d{14})_.+\.sql$/;

describe("supabase/migrations version prefixes", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

  it("every migration filename starts with a 14-digit version prefix", () => {
    for (const f of files) {
      expect(f, `unexpected migration filename shape: ${f}`).toMatch(
        VERSION_PREFIX,
      );
    }
  });

  it("no two migrations share a version prefix", () => {
    const byVersion = new Map<string, string[]>();
    for (const f of files) {
      const version = f.match(VERSION_PREFIX)?.[1];
      if (!version) continue;
      byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
    }
    const collisions = [...byVersion.entries()].filter(
      ([, names]) => names.length > 1,
    );
    expect(
      collisions,
      `duplicate migration versions break supabase db reset: ${collisions
        .map(([v, names]) => `${v} → ${names.join(", ")}`)
        .join("; ")}`,
    ).toEqual([]);
  });
});
