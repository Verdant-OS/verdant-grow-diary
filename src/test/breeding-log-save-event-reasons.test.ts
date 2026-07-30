/**
 * Drift guard + grower-safe copy for `breeding_log_save_event` refusal reasons.
 *
 * The RPC's reason codes are an internal contract. Before this, the wrapper
 * typed `reason` as bare `string | null` and BreedingLogContainer rendered it
 * verbatim, so a refusal reached the grower as
 * "Failed to save event: plant_not_in_tent" — schema vocabulary in the UI, and
 * no signal at all if the server introduced a code the client didn't know.
 *
 * These tests pin the reason list against the migration's own SQL text, so a
 * server-side rename fails here instead of degrading the UI silently.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  BREEDING_LOG_SAVE_EVENT_REASON_COPY,
  BREEDING_LOG_SAVE_EVENT_REASONS,
  BREEDING_LOG_SAVE_EVENT_UNKNOWN_REASON_COPY,
  describeBreedingLogSaveEventReason,
  isBreedingLogSaveEventReason,
} from "@/lib/genetics/breedingLogSaveEventRpc";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

/**
 * Resolve the migration that currently DEFINES the RPC.
 *
 * Applied migrations are immutable, so a future change to
 * `breeding_log_save_event` arrives as a NEW migration rather than an edit to
 * 20260728163100. Pinning this guard to a single hard-coded filename would
 * therefore keep scanning stale SQL and pass while the live function drifted
 * away from the client union — exactly the regression this file exists to
 * prevent. Filenames are timestamp-prefixed, so the lexicographically last
 * definer is the active one.
 */
function readActiveRpcDefinition(): { fileName: string; sql: string } {
  const definers = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) =>
      /(?:CREATE|CREATE\s+OR\s+REPLACE)\s+FUNCTION\s+public\.breeding_log_save_event/i.test(
        readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"),
      ),
    )
    .sort();
  if (definers.length === 0) {
    throw new Error("No migration defines public.breeding_log_save_event");
  }
  const fileName = definers[definers.length - 1];
  return { fileName, sql: readFileSync(resolve(MIGRATIONS_DIR, fileName), "utf8") };
}

const ACTIVE_DEFINITION = readActiveRpcDefinition();
const MIGRATION = ACTIVE_DEFINITION.sql;
const CONTAINER = readFileSync(
  resolve(ROOT, "src/components/genetics/BreedingLogContainer.tsx"),
  "utf8",
);

describe("reason list stays in lockstep with the migration", () => {
  it("scans the NEWEST migration that defines the RPC, not a hard-coded one", () => {
    // Two migrations already define this function; the guard must follow the
    // latest so a future redefinition cannot pass against stale SQL.
    const definers = readdirSync(MIGRATIONS_DIR)
      .filter((n) => n.endsWith(".sql"))
      .filter((n) =>
        /(?:CREATE|CREATE\s+OR\s+REPLACE)\s+FUNCTION\s+public\.breeding_log_save_event/i.test(
          readFileSync(resolve(MIGRATIONS_DIR, n), "utf8"),
        ),
      )
      .sort();
    expect(definers.length).toBeGreaterThan(1);
    expect(ACTIVE_DEFINITION.fileName).toBe(definers[definers.length - 1]);
  });

  it("every typed reason is actually returned by the RPC", () => {
    for (const reason of BREEDING_LOG_SAVE_EVENT_REASONS) {
      expect(MIGRATION, reason).toContain(`'${reason}'`);
    }
  });

  it("every reason the RPC can return is typed here", () => {
    // Collect the reason literals the RPC builds into its refusal envelopes.
    const returned = new Set(
      [...MIGRATION.matchAll(/'reason',\s*\n?\s*'([a-z_]+)'/g)].map((m) => m[1]),
    );
    // Older jsonb_build_object formatting keeps them on one line too.
    for (const m of MIGRATION.matchAll(/'reason',\s*'([a-z_]+)'/g)) returned.add(m[1]);
    expect(returned.size).toBeGreaterThan(0);
    const untyped = [...returned].filter((r) => !isBreedingLogSaveEventReason(r));
    expect(untyped, `RPC reasons missing from the typed union: ${untyped.join(", ")}`).toEqual([]);
  });

  it("has no duplicates", () => {
    expect(new Set(BREEDING_LOG_SAVE_EVENT_REASONS).size).toBe(
      BREEDING_LOG_SAVE_EVENT_REASONS.length,
    );
  });
});

describe("describeBreedingLogSaveEventReason", () => {
  it("returns grower-safe copy for every known reason", () => {
    for (const reason of BREEDING_LOG_SAVE_EVENT_REASONS) {
      const copy = describeBreedingLogSaveEventReason(reason);
      expect(copy, reason).toBe(BREEDING_LOG_SAVE_EVENT_REASON_COPY[reason]);
      expect(copy.length, reason).toBeGreaterThan(10);
      // Never leaks the internal code or backend vocabulary.
      expect(copy, reason).not.toContain(reason);
      expect(copy, reason).not.toMatch(/PGRST|jsonb|auth\.uid|RPC|SQL|_id\b/i);
    }
  });

  it("degrades unknown, null, and undefined reasons to the generic sentence", () => {
    for (const value of ["brand_new_server_reason", null, undefined, "", 42 as never]) {
      expect(describeBreedingLogSaveEventReason(value as never)).toBe(
        BREEDING_LOG_SAVE_EVENT_UNKNOWN_REASON_COPY,
      );
    }
  });

  it("never implies the event was saved", () => {
    for (const reason of BREEDING_LOG_SAVE_EVENT_REASONS) {
      // Only success CLAIMS are forbidden. Negations like "could not be
      // saved" and "Nothing was recorded" are exactly the copy we want.
      expect(describeBreedingLogSaveEventReason(reason), reason).not.toMatch(
        /\b(?:your |the )?(?:event|entry)\s+(?:was|has been)\s+(?:saved|logged|recorded)\b|\bsuccessfully\s+(?:saved|logged|recorded)\b/i,
      );
    }
    expect(BREEDING_LOG_SAVE_EVENT_UNKNOWN_REASON_COPY).toMatch(/[Nn]othing was recorded/);
  });
});

describe("BreedingLogContainer renders copy, not codes", () => {
  it("no longer interpolates the raw reason into the toast", () => {
    expect(CONTAINER).not.toMatch(/Failed to save event: \$\{result\.reason/);
    expect(CONTAINER).toContain("describeBreedingLogSaveEventReason");
  });
});
