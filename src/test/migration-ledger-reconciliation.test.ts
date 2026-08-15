import { describe, expect, it } from "vitest";
import {
  MigrationLedgerAmbiguityError,
  migrationIdentityFromFilename,
  reconcileMigrationLedger,
} from "../../scripts/lib/migrationLedgerMatching.mjs";

function migration(filename: string) {
  const value = migrationIdentityFromFilename(filename);
  expect(value).not.toBeNull();
  if (!value) throw new Error(`expected migration identity for ${filename}`);
  return value;
}

describe("migration ledger one-to-one reconciliation", () => {
  it("lets a shifted name/version collision satisfy one migration only", () => {
    const first = migration("20260806230020_candidate_number_maintenance_paths.sql");
    const second = migration("20260806230021_candidate_number_membership_validate.sql");

    const result = reconcileMigrationLedger([first, second], [
      { version: second.version, name: first.slug },
    ]);

    expect(result.matched_migrations.map((item) => item.filename)).toEqual([first.filename]);
    expect(result.unmatched_migrations.map((item) => item.filename)).toEqual([second.filename]);
    expect(result.identity_conflicts).toHaveLength(1);
    expect(result.identity_conflicts[0].version_also_identifies).toEqual([second.filename]);
  });

  it("derives gap status from matched repository order rather than raw ledger version", () => {
    const first = migration("20260806230020_a.sql");
    const second = migration("20260806230021_b.sql");
    const third = migration("20260806230022_c.sql");

    const result = reconcileMigrationLedger([first, second, third], [
      { version: second.version, name: first.stem },
      { version: third.version, name: third.slug },
    ]);

    expect(result.gaps.map((item) => item.filename)).toEqual([second.filename]);
    expect(result.latest_matched_migration?.filename).toBe(third.filename);
  });

  it("keeps a stopped tail from being mislabeled as a gap by a shifted raw version", () => {
    const first = migration("20260806230020_a.sql");
    const second = migration("20260806230021_b.sql");

    const result = reconcileMigrationLedger([first, second], [
      { version: second.version, name: first.stem },
    ]);

    expect(result.gaps).toEqual([]);
    expect(result.tail.map((item) => item.filename)).toEqual([second.filename]);
    expect(result.latest_matched_migration?.filename).toBe(first.filename);
  });

  it("fails closed when duplicate ledger rows satisfy one migration", () => {
    const first = migration("20260806230020_a.sql");

    expect(() =>
      reconcileMigrationLedger([first], [
        { version: first.version, name: first.slug },
        { version: "20260806230022", name: first.stem },
      ]),
    ).toThrow(MigrationLedgerAmbiguityError);
  });

  it("uses exact version to disambiguate a duplicate slug", () => {
    const first = migration("20260806230020_repeat.sql");
    const second = migration("20260806230021_repeat.sql");

    const result = reconcileMigrationLedger([first, second], [
      { version: second.version, name: "repeat" },
    ]);

    expect(result.matched_migrations.map((item) => item.filename)).toEqual([second.filename]);
  });

  it("fails closed on a duplicate slug without exact-version disambiguation", () => {
    const first = migration("20260806230020_repeat.sql");
    const second = migration("20260806230021_repeat.sql");

    expect(() =>
      reconcileMigrationLedger([first, second], [
        { version: "20260806230099", name: "repeat" },
      ]),
    ).toThrow(MigrationLedgerAmbiguityError);
  });

  it("does not turn an unknown ledger row into an applied repository migration", () => {
    const first = migration("20260806230020_a.sql");
    const result = reconcileMigrationLedger([first], [
      { version: "20260806239999", name: "external_migration" },
    ]);

    expect(result.matched_migrations).toHaveLength(0);
    expect(result.unmatched_migrations).toHaveLength(1);
    expect(result.unmatched_ledger_rows).toHaveLength(1);
  });
});
