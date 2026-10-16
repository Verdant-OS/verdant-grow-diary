import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(
  __dirname,
  "..",
  "..",
  "docs",
  "release",
  "merged-unshipped-server-changes-2026-10-03.md",
);

const MIGRATIONS_DIR = resolve(__dirname, "..", "..", "supabase", "migrations");

/** Supabase version strings sort lexicographically in apply order. */
function assertVersionOrder(versions: string[]): void {
  for (let i = 1; i < versions.length; i += 1) {
    expect(versions[i]! > versions[i - 1]!, `${versions[i - 1]} must precede ${versions[i]}`).toBe(
      true,
    );
  }
}

function migrationFileForVersion(version: string): string | undefined {
  return readdirSync(MIGRATIONS_DIR).find((name) => name.startsWith(`${version}_`));
}

describe("merged unshipped server changes migration order (docs/static-only)", () => {
  it("doc file exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  const PRE_TABLE_APPLY_CHAIN = [
    "20260916111000",
    "20260917183000",
    "20260924120000",
    "20260925090000",
  ] as const;

  const TABLE_VERSIONS = [
    "20260927002000",
    "20260927012000",
    "20260927094000",
    "20260927160000",
    "20260928183000",
    "20261001140000",
  ] as const;

  it("documents parked #1460/#1545 and #1704 before the six-row inventory table", () => {
    expect(doc).toContain("### Parked earlier migrations: `20260916111000` (#1460)");
    expect(doc).toContain("### Also not recorded as shipped: `20260925090000` (#1704");
    expect(doc).toMatch(
      /`20260924120000` \(#1703\) and `20260925090000` \(#1704\); see the sections above/,
    );
  });

  it("records #1704 merge metadata and applied state as NOT_MEASURED", () => {
    expect(doc).toContain(
      "| #1704 | 2026-09-25 20:30 | `0f7b12dbf7a935bf6440beb77077e66a468d6b39` | Migration |",
    );
    expect(doc).toContain("20260925090000_user_roles_client_grant_hardening.sql");
    expect(doc).toMatch(/no entry for `20260925090000`, so its applied[\s\S]*\*\*NOT_MEASURED\*\*/);
  });

  it("requires owner production checks before version-ordered apply", () => {
    expect(doc).toContain(
      "**Before any version-ordered apply, the owner checks whether `20260916111000` and",
    );
    expect(doc).toContain(
      "**Before any version-ordered apply, the owner checks whether `20260925090000` is",
    );
    expect(doc).toContain("didn't read production");
  });

  it("lists every pre-table and table migration file on disk", () => {
    for (const version of [...PRE_TABLE_APPLY_CHAIN, ...TABLE_VERSIONS]) {
      const file = migrationFileForVersion(version);
      expect(file, `missing migration file for ${version}`).toBeTruthy();
      expect(existsSync(resolve(MIGRATIONS_DIR, file!))).toBe(true);
      expect(doc).toContain(version);
    }
  });

  it("keeps the documented apply chain in strict version order", () => {
    assertVersionOrder([...PRE_TABLE_APPLY_CHAIN, ...TABLE_VERSIONS]);
  });

  it("keeps the six-row inventory table in ascending version order", () => {
    const tableSection = doc.split("## Migrations in dependency order")[1]?.split("## ")[0] ?? "";
    const rows = [...tableSection.matchAll(/\|\s*\d+\s*\|\s*(\d{14})\s*\|/g)].map((m) => m[1]!);
    expect(rows).toEqual([...TABLE_VERSIONS]);
    assertVersionOrder(rows);
  });

  it("names post-inventory migrations that do not change order below", () => {
    expect(doc).toContain("20261001160000");
    expect(doc).toContain("20261013180000");
    expect(doc).toContain("This doc does not cover them.");
  });
});
