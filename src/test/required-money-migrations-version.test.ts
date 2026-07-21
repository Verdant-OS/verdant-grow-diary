/**
 * Unit tests for the money-migration version-prefix contract.
 *
 * These lock down the two invariants the applied-check depends on:
 *
 *   1. `migrationVersion()` extracts the leading 14-digit timestamp that
 *      Supabase stores in `supabase_migrations.schema_migrations.version`.
 *   2. The applied-check's set-membership comparison (Set<string> keyed by
 *      that same 14-digit prefix) correctly classifies each required file
 *      as applied vs missing.
 *
 * If either invariant drifts, the deploy guard silently passes on an
 * out-of-date live database. That's a money regression, so this file is
 * intentionally strict about the exact string shape rather than "close
 * enough".
 */
import { describe, expect, it } from "vitest";
import {
  REQUIRED_MONEY_MIGRATIONS,
  migrationVersion,
} from "../../scripts/required-money-migrations.mjs";

describe("migrationVersion()", () => {
  it("extracts the 14-digit prefix from a well-formed filename", () => {
    expect(migrationVersion("20260721103000_ai_credit_grants.sql")).toBe(
      "20260721103000",
    );
  });

  it("returns exactly 14 characters, all digits, for every required file", () => {
    for (const file of REQUIRED_MONEY_MIGRATIONS) {
      const v = migrationVersion(file);
      expect(v).toHaveLength(14);
      expect(v).toMatch(/^\d{14}$/);
    }
  });

  it("produces a unique version per required file (no accidental collisions)", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("preserves the exact prefix — does not zero-pad, trim, or normalize", () => {
    // A leading zero in a hypothetical future prefix must survive verbatim,
    // otherwise the Set<string> lookup against psql's text output misses.
    expect(migrationVersion("01234567890123_seed.sql")).toBe("01234567890123");
  });

  it("rejects filenames without a 14-digit prefix", () => {
    expect(() => migrationVersion("no_prefix.sql")).toThrow(/Malformed/);
    expect(() => migrationVersion("2026072110300_short.sql")).toThrow(/Malformed/);
    expect(() => migrationVersion("202607211030000_long.sql")).toThrow(/Malformed/);
    expect(() => migrationVersion("20260721103000-dash.sql")).toThrow(/Malformed/);
  });

  it("rejects prefixes that contain non-digits", () => {
    expect(() => migrationVersion("2026072110300a_bad.sql")).toThrow(/Malformed/);
  });
});

/**
 * Mirror of the comparison the applied-check performs after psql returns
 * the trimmed version list. Reproducing it here (rather than shelling out
 * to psql) lets us test the classification logic deterministically.
 */
function classifyApplied(
  required: readonly string[],
  psqlStdout: string,
): { applied: string[]; missing: string[] } {
  const applied = new Set(
    psqlStdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const expected = required.map((f) => ({ file: f, version: migrationVersion(f) }));
  return {
    applied: expected.filter((e) => applied.has(e.version)).map((e) => e.file),
    missing: expected.filter((e) => !applied.has(e.version)).map((e) => e.file),
  };
}

describe("applied-check comparison logic", () => {
  it("marks every required file applied when psql returns all versions", () => {
    const stdout = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\n");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
    expect(applied).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("marks every required file missing when psql returns nothing", () => {
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, "");
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("flags exactly the omitted version as missing", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    // Drop the last version from psql's output.
    const stdout = versions.slice(0, -1).join("\n");
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([REQUIRED_MONEY_MIGRATIONS[REQUIRED_MONEY_MIGRATIONS.length - 1]]);
  });

  it("tolerates psql's whitespace: trailing newlines, blank lines, indented rows", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = `\n  ${versions[0]}  \n\n${versions.slice(1).join("\n")}\n\n`;
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
  });

  it("does NOT match on partial / substring prefixes", () => {
    // Simulate a truncated / off-by-one prefix in the tracker output.
    // The Set lookup must be exact, otherwise a partially-migrated env
    // silently reads as fully applied.
    const truncated = REQUIRED_MONEY_MIGRATIONS.map((f) =>
      migrationVersion(f).slice(0, 13),
    ).join("\n");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, truncated);
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("ignores unrelated versions present in the tracker (superset is OK)", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = ["19990101000000", ...versions, "29991231235959"].join("\n");
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
  });
});

describe("applied-check comparison — tricky whitespace & line endings", () => {
  it("tolerates Windows CRLF newlines (\\r\\n) between rows", () => {
    const stdout = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("\r\n") + "\r\n";
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
  });

  it("tolerates a stray \\r appended to each version (old-Mac / mixed shells)", () => {
    const stdout = REQUIRED_MONEY_MIGRATIONS.map((f) => `${migrationVersion(f)}\r`).join("\n");
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
  });

  it("tolerates mixed LF and CRLF line endings in the same payload", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = versions
      .map((v, i) => (i % 2 === 0 ? `${v}\n` : `${v}\r\n`))
      .join("");
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
  });

  it("tolerates tabs and mixed-width padding around each version", () => {
    const stdout = REQUIRED_MONEY_MIGRATIONS.map(
      (f) => `\t  ${migrationVersion(f)}\t\t  `,
    ).join("\n");
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
  });

  it("ignores duplicate rows for the same version (Set dedupes)", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = [...versions, ...versions, ...versions].join("\n");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
    expect(applied).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("tolerates a lone CRLF-only payload as 'nothing applied' (not a false positive)", () => {
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, "\r\n\r\n\r\n");
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });
});

describe("applied-check comparison — partial-file corruption", () => {
  it("does not match when a version is truncated by one leading digit", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = versions.map((v) => v.slice(1)).join("\n"); // 13 chars, drops first digit
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("does not match when a version has an extra trailing digit appended", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = versions.map((v) => `${v}9`).join("\n"); // 15 chars
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("does not match when versions are glued together without a separator", () => {
    // Simulates a corrupt psql fetch where newlines were stripped and rows concatenated.
    const stdout = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("does not match when a version has an internal non-digit character", () => {
    // e.g. a stray column separator or NUL byte injected mid-prefix.
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = versions.map((v) => `${v.slice(0, 8)}X${v.slice(9)}`).join("\n");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("does not match a version embedded inside a longer token", () => {
    // e.g. psql accidentally returns `<schema>.<version>_<name>` in one column.
    const stdout = REQUIRED_MONEY_MIGRATIONS.map(
      (f) => `public.${migrationVersion(f)}_extra`,
    ).join("\n");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("classifies only the corrupted subset as missing, not the entire required list", () => {
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    // Corrupt exactly the first row; the rest are clean.
    const corrupted = [`${versions[0]}X`, ...versions.slice(1)].join("\n");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, corrupted);
    expect(missing).toEqual([REQUIRED_MONEY_MIGRATIONS[0]]);
    expect(applied).toEqual(REQUIRED_MONEY_MIGRATIONS.slice(1));
  });

  it("does not falsely apply when the payload contains only a UTF-8 BOM + versions on one line", () => {
    // BOM at start + no newline separator between the concatenated versions.
    const stdout = "\uFEFF" + REQUIRED_MONEY_MIGRATIONS.map(migrationVersion).join("");
    const { applied, missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(applied).toEqual([]);
    expect(missing).toEqual([...REQUIRED_MONEY_MIGRATIONS]);
  });

  it("tolerates a UTF-8 BOM (U+FEFF) prefixed on each row — trim() strips it", () => {
    // String.prototype.trim() treats U+FEFF as whitespace, so a BOM-prefixed
    // row still matches the Set lookup. Lock this in so future refactors that
    // swap trim() for a stricter stripper don't silently start missing rows.
    const versions = REQUIRED_MONEY_MIGRATIONS.map(migrationVersion);
    const stdout = versions.map((v) => `\uFEFF${v}`).join("\n");
    const { missing } = classifyApplied(REQUIRED_MONEY_MIGRATIONS, stdout);
    expect(missing).toEqual([]);
  });

});

