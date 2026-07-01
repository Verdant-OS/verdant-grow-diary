import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static safety proof for the Quick Log Typed Payloads v1 migration.
 *
 * These tests read the migration SQL as text — they do NOT hit the database.
 * The runtime harness (scripts/run-quicklog-typed-payloads-harness.ts) proves
 * live behavior; this file proves the migration file itself:
 *   - drops the exact old 10-arg signature
 *   - creates a single (non-overloaded) function with the appended
 *     p_water / p_feed jsonb params
 *   - preserves SECURITY DEFINER + search_path
 *   - keeps the full event allow-list (observation…cure_check)
 *   - uses the single reason code `invalid_typed_payload` for mismatches
 *   - reapplies grants and issues NOTIFY pgrst
 *   - does NOT create a _v2 variant, does NOT grant on subtype tables
 */
function findMigration(): string {
  const dir = "supabase/migrations";
  const candidates = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => join(dir, f))
    .filter((p) => {
      const s = readFileSync(p, "utf8");
      return (
        /DROP FUNCTION IF EXISTS public\.quicklog_save_event\(/.test(s) &&
        /p_water\s+jsonb/.test(s) &&
        /p_feed\s+jsonb/.test(s)
      );
    });
  if (candidates.length === 0) {
    throw new Error("Quick Log Typed Payloads v1 migration not found");
  }
  // If multiple exist, use the newest by name (timestamped prefix).
  return candidates.sort().at(-1)!;
}

const SQL = readFileSync(findMigration(), "utf8");

describe("Quick Log Typed Payloads v1 migration — static safety", () => {
  it("wraps in a transaction", () => {
    expect(SQL).toMatch(/^\s*BEGIN;/);
    expect(SQL).toMatch(/COMMIT;\s*$/);
  });

  it("drops the exact old 10-arg signature", () => {
    expect(SQL).toMatch(
      /DROP FUNCTION IF EXISTS public\.quicklog_save_event\(\s*text,\s*uuid,\s*text,\s*uuid,\s*uuid,\s*text,\s*text,\s*jsonb,\s*timestamptz,\s*jsonb\s*\)/,
    );
  });

  it("creates the recreated function with p_water and p_feed appended", () => {
    expect(SQL).toMatch(/CREATE FUNCTION public\.quicklog_save_event\(/);
    expect(SQL).toMatch(/p_water\s+jsonb\s+DEFAULT NULL/);
    expect(SQL).toMatch(/p_feed\s+jsonb\s+DEFAULT NULL/);
  });

  it("does not create a _v2 sibling or an overload alias", () => {
    expect(SQL).not.toMatch(/quicklog_save_event_v2/);
    // Only one CREATE FUNCTION for quicklog_save_event.
    const creates = SQL.match(/CREATE FUNCTION public\.quicklog_save_event\(/g) ?? [];
    expect(creates.length).toBe(1);
  });

  it("preserves SECURITY DEFINER and search_path", () => {
    expect(SQL).toMatch(/SECURITY DEFINER/);
    expect(SQL).toMatch(/SET search_path\s*=\s*public,\s*pg_temp/);
  });

  it("preserves the full event allow-list", () => {
    for (const t of [
      "observation",
      "watering",
      "feeding",
      "photo",
      "environment",
      "training",
      "harvest",
      "cure_check",
    ]) {
      expect(SQL).toContain(`'${t}'`);
    }
  });

  it("uses the single reason code invalid_typed_payload", () => {
    expect(SQL).toMatch(/'invalid_typed_payload'/);
    expect(SQL).not.toMatch(/payload_type_mismatch/);
  });

  it("reapplies EXECUTE grants (authenticated required; anon/service_role preserved if present)", () => {
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.quicklog_save_event[^;]*TO[^;]*authenticated/);
  });

  it("does not grant on subtype tables directly", () => {
    expect(SQL).not.toMatch(/GRANT[^;]+ON\s+(TABLE\s+)?public\.watering_events/i);
    expect(SQL).not.toMatch(/GRANT[^;]+ON\s+(TABLE\s+)?public\.feeding_events/i);
  });

  it("issues a PostgREST schema reload", () => {
    expect(SQL).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload schema'/);
  });

  it("does not touch validate_grow_event", () => {
    expect(SQL).not.toMatch(/validate_grow_event/);
  });
});
