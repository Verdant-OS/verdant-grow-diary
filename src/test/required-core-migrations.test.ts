/**
 * Unit tests for the core-schema manifest contract.
 *
 * Sibling of required-money-migrations-version.test.ts. These lock down the
 * invariants the core-schema deploy guard depends on:
 *
 *   1. `schemaKey()` produces the exact `table.column` string the guard both
 *      interpolates into its SQL and compares result rows against. If those
 *      two ever disagree about formatting, the guard reports every column
 *      missing (blocks all deploys) or every column present (silently passes
 *      an incomplete database).
 *   2. `schemaKey()` REJECTS anything that is not a plain Postgres
 *      identifier. This is the SQL-injection fence: the guard interpolates
 *      these values into a query, and validation is what makes that safe.
 *   3. Every manifest entry names a migration file that actually exists, and
 *      documents what breaks without it.
 *
 * The motivating incident (prod missing `plants.plant_type`, every plant
 * creation failing with PGRST204, presenting as "Create plant does nothing")
 * is the second failure mode in #1, so this file is deliberately strict.
 */
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_CORE_SCHEMA,
  ADVISORY_PRO_SCHEMA,
  REQUIRED_CORE_MIGRATIONS,
  manifestForScope,
  schemaKey,
  coreMigrationVersion,
} from "../../scripts/required-core-migrations.mjs";

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

describe("schemaKey()", () => {
  it("builds the exact table.column key the guard compares against", () => {
    expect(schemaKey({ table: "plants", column: "plant_type" })).toBe(
      "plants.plant_type",
    );
  });

  it("produces a key for every manifest entry", () => {
    for (const entry of REQUIRED_CORE_SCHEMA) {
      expect(schemaKey(entry)).toBe(`${entry.table}.${entry.column}`);
    }
  });

  it("rejects identifiers carrying quotes, whitespace, or SQL metacharacters", () => {
    // This is the injection fence — the guard interpolates these into SQL.
    // A quote or comment sequence reaching the query would be a security bug,
    // so each of these must throw rather than pass through.
    const hostile = [
      { table: "plants'; DROP TABLE plants;--", column: "x" },
      { table: "plants", column: "x') OR '1'='1" },
      { table: "plants", column: "has space" },
      { table: "Plants", column: "plant_type" }, // uppercase: not a bare identifier
      { table: "1plants", column: "plant_type" }, // may not start with a digit
      { table: "plants", column: "" },
      { table: "", column: "plant_type" },
    ];
    for (const entry of hostile) {
      expect(() => schemaKey(entry)).toThrow();
    }
  });

  it("rejects missing or non-string identifiers rather than coercing them", () => {
    expect(() => schemaKey({})).toThrow();
    expect(() => schemaKey({ table: "plants" })).toThrow();
    expect(() => schemaKey({ table: null, column: "x" })).toThrow();
    expect(() => schemaKey({ table: "plants", column: 42 })).toThrow();
    expect(() => schemaKey(undefined)).toThrow();
  });
});

describe("REQUIRED_CORE_SCHEMA manifest", () => {
  it("is non-empty — an empty manifest is a silently disabled gate", () => {
    expect(REQUIRED_CORE_SCHEMA.length).toBeGreaterThan(0);
  });

  it("contains no duplicate table.column entries", () => {
    const keys = REQUIRED_CORE_SCHEMA.map(schemaKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every entry a migration filename and a documented reason", () => {
    for (const entry of REQUIRED_CORE_SCHEMA) {
      expect(entry.migration, `${schemaKey(entry)} has no migration`).toBeTruthy();
      expect(
        entry.reason?.trim(),
        `${schemaKey(entry)} has no documented reason`,
      ).toBeTruthy();
    }
  });

  it("names only migration files that exist on disk", () => {
    const missing = REQUIRED_CORE_SCHEMA.filter(
      (e) => !existsSync(join(MIGRATIONS_DIR, e.migration)),
    ).map((e) => `${schemaKey(e)} -> ${e.migration}`);
    expect(missing).toEqual([]);
  });

  it("uses well-formed 14-digit migration filenames", () => {
    for (const entry of REQUIRED_CORE_SCHEMA) {
      expect(coreMigrationVersion(entry.migration)).toMatch(/^\d{14}$/);
    }
  });

  it("still guards plants.plant_type — the column whose absence caused the Create-Plant P0", () => {
    // Regression pin: this column being absent from prod broke every plant
    // creation with PGRST204 while CI stayed green. If someone drops it from
    // the manifest, that hole reopens silently.
    const keys = REQUIRED_CORE_SCHEMA.map(schemaKey);
    expect(keys).toContain("plants.plant_type");
  });
});

describe("core vs advisory separation", () => {
  it("keeps plants.candidate_number OUT of the blocking core manifest", () => {
    // Every Pheno route is wrapped in PhenoTrackerUpgradeGate and the migration
    // itself enforces has_pheno_tracker_entitlement, so this column is Pro-gated.
    // Listing it as core would block an unrelated release on an optional
    // paid-feature migration — the exact false-positive the criteria forbid.
    const coreKeys = REQUIRED_CORE_SCHEMA.map(schemaKey);
    expect(coreKeys).not.toContain("plants.candidate_number");
  });

  it("still tracks plants.candidate_number as advisory rather than dropping it", () => {
    // It IS genuinely missing from prod and does break the Pheno workspace for
    // entitled growers — demoting it must not mean losing the detection.
    const proKeys = ADVISORY_PRO_SCHEMA.map(schemaKey);
    expect(proKeys).toContain("plants.candidate_number");
  });

  it("shares no entries between the core and advisory manifests", () => {
    const coreKeys = new Set(REQUIRED_CORE_SCHEMA.map(schemaKey));
    const overlap = ADVISORY_PRO_SCHEMA.map(schemaKey).filter((k) => coreKeys.has(k));
    expect(overlap).toEqual([]);
  });

  it("holds advisory entries to the same shape contract as core entries", () => {
    for (const entry of ADVISORY_PRO_SCHEMA) {
      expect(schemaKey(entry)).toBe(`${entry.table}.${entry.column}`);
      expect(entry.migration).toBeTruthy();
      expect(entry.reason?.trim()).toBeTruthy();
      expect(existsSync(join(MIGRATIONS_DIR, entry.migration))).toBe(true);
    }
  });
});

describe("manifestForScope()", () => {
  it("defaults to the blocking core manifest when scope is unset or empty", () => {
    // An empty env var and an unset one are indistinguishable in shell and
    // GitHub Actions semantics, so both must land on the SAFE default — the
    // blocking core manifest. Defaulting the other way (or throwing) would
    // turn a trivial config slip into either a skipped check or a broken gate.
    expect(manifestForScope(undefined)).toBe(REQUIRED_CORE_SCHEMA);
    expect(manifestForScope("")).toBe(REQUIRED_CORE_SCHEMA);
    expect(manifestForScope("core")).toBe(REQUIRED_CORE_SCHEMA);
  });

  it("returns the advisory manifest for 'pro'", () => {
    expect(manifestForScope("pro")).toBe(ADVISORY_PRO_SCHEMA);
  });

  it("throws on an unknown scope rather than silently checking nothing", () => {
    // A typo'd scope must not degrade into an empty manifest — that would be a
    // gate reporting success having verified zero columns. Note 'Core' is
    // rejected too: scope matching is exact, never case-folded.
    expect(() => manifestForScope("prod")).toThrow();
    expect(() => manifestForScope("Core")).toThrow();
    expect(() => manifestForScope("PRO")).toThrow();
    expect(() => manifestForScope("sandbox")).toThrow();
  });
});

describe("REQUIRED_CORE_MIGRATIONS (derived)", () => {
  it("is de-duplicated even though several columns share one migration", () => {
    expect(new Set(REQUIRED_CORE_MIGRATIONS).size).toBe(
      REQUIRED_CORE_MIGRATIONS.length,
    );
  });

  it("covers exactly the migrations named by the schema manifest", () => {
    const fromSchema = new Set(
      [...REQUIRED_CORE_SCHEMA, ...ADVISORY_PRO_SCHEMA].map((e) => e.migration),
    );
    expect(new Set(REQUIRED_CORE_MIGRATIONS)).toEqual(fromSchema);
  });

  it("lists only files that exist in supabase/migrations/", () => {
    const missing = REQUIRED_CORE_MIGRATIONS.filter(
      (f) => !existsSync(join(MIGRATIONS_DIR, f)),
    );
    expect(missing).toEqual([]);
  });
});

describe("coreMigrationVersion()", () => {
  it("extracts the 14-digit prefix from a well-formed filename", () => {
    expect(coreMigrationVersion("20260722010000_plant_type_column.sql")).toBe(
      "20260722010000",
    );
  });

  it("preserves the prefix verbatim — no zero-padding, trimming, or normalizing", () => {
    expect(coreMigrationVersion("20260101000000_x.sql")).toBe("20260101000000");
  });

  it("throws on a filename without a 14-digit prefix rather than guessing", () => {
    expect(() => coreMigrationVersion("plant_type_column.sql")).toThrow();
    expect(() => coreMigrationVersion("2026072201_short.sql")).toThrow();
  });
});
