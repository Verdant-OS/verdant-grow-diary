const MIGRATION_FILENAME = /^(\d{14})_(.+)\.sql$/;
const MIGRATION_VERSION = /^\d{14}$/;

export class MigrationLedgerFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationLedgerFormatError";
  }
}

export class MigrationLedgerAmbiguityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "MigrationLedgerAmbiguityError";
    this.details = Object.freeze({ ...details });
  }
}

/**
 * Derive the stable identities used by Verdant's mixed migration ledger.
 *
 * - version: 14-digit filename prefix
 * - stem: filename without `.sql` (Lovable ledger convention)
 * - slug: filename after `<version>_` (hand-authored name convention)
 */
export function migrationIdentityFromFilename(filename) {
  if (typeof filename !== "string") return null;
  const match = MIGRATION_FILENAME.exec(filename);
  if (!match) return null;

  return Object.freeze({
    version: match[1],
    stem: filename.slice(0, -4),
    slug: match[2],
    filename,
  });
}

/** Parse newline-delimited JSON from the single read-only ledger SELECT. */
export function parseMigrationLedgerRows(raw) {
  if (typeof raw !== "string") {
    throw new MigrationLedgerFormatError("Migration ledger output must be text.");
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        throw new MigrationLedgerFormatError(
          `Migration ledger row ${index + 1} is not valid JSON.`,
        );
      }

      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new MigrationLedgerFormatError(`Migration ledger row ${index + 1} is not an object.`);
      }
      if (typeof value.version !== "string" || !MIGRATION_VERSION.test(value.version)) {
        throw new MigrationLedgerFormatError(
          `Migration ledger row ${index + 1} has an invalid version.`,
        );
      }
      if (value.name !== null && typeof value.name !== "string") {
        throw new MigrationLedgerFormatError(
          `Migration ledger row ${index + 1} has an invalid name.`,
        );
      }

      return Object.freeze({
        version: value.version,
        name: value.name,
      });
    });
}

function compareMigrations(left, right) {
  return left.version.localeCompare(right.version) || left.filename.localeCompare(right.filename);
}

function addIndex(index, key, migration) {
  const values = index.get(key) ?? [];
  values.push(migration);
  index.set(key, values);
}

function filenames(values) {
  return values.map((value) => value.filename).sort();
}

/**
 * Reconcile the complete repository migration set against the ledger.
 *
 * Load-bearing properties:
 * - one ledger row may satisfy at most one repository migration;
 * - one repository migration may be satisfied by at most one ledger row;
 * - exact full-stem names outrank the shifted numeric ledger version;
 * - duplicate slug/version keys must be disambiguated by the other identity;
 * - raw ledger versions never determine GAP status.
 *
 * A row whose exact name identifies migration A while its shifted version equals
 * migration B is assigned to A only. The collision is reported, and B remains
 * unapplied. This closes the false-"current" case without a timestamp window.
 */
export function reconcileMigrationLedger(repoMigrations, ledgerRows) {
  if (!Array.isArray(repoMigrations) || !Array.isArray(ledgerRows)) {
    throw new MigrationLedgerFormatError("Repository migrations and ledger rows must be arrays.");
  }

  const migrations = repoMigrations
    .filter((migration) => migration && typeof migration.filename === "string")
    .slice()
    .sort(compareMigrations);

  const byStem = new Map();
  const bySlug = new Map();
  const byVersion = new Map();
  const indexByFilename = new Map();

  migrations.forEach((migration, index) => {
    addIndex(byStem, migration.stem, migration);
    addIndex(bySlug, migration.slug, migration);
    addIndex(byVersion, migration.version, migration);
    indexByFilename.set(migration.filename, index);
  });

  const matchedByFilename = new Map();
  const matches = [];
  const unmatchedLedgerRows = [];
  const identityConflicts = [];

  ledgerRows.forEach((row, rowIndex) => {
    const name = typeof row.name === "string" && row.name.length > 0 ? row.name : null;
    const stemCandidates = name ? byStem.get(name) ?? [] : [];
    const slugCandidates = stemCandidates.length === 0 && name ? bySlug.get(name) ?? [] : [];
    const versionCandidates = byVersion.get(row.version) ?? [];

    let chosen = null;
    let matchedBy = null;

    if (stemCandidates.length === 1) {
      chosen = stemCandidates[0];
      matchedBy = "stem";
    } else if (stemCandidates.length > 1) {
      throw new MigrationLedgerAmbiguityError(
        `Ledger row ${rowIndex + 1} matches more than one repository migration by full stem.`,
        { row, candidates: filenames(stemCandidates) },
      );
    } else if (slugCandidates.length === 1) {
      chosen = slugCandidates[0];
      matchedBy = "slug";
    } else if (slugCandidates.length > 1) {
      const versionSet = new Set(versionCandidates.map((candidate) => candidate.filename));
      const intersection = slugCandidates.filter((candidate) => versionSet.has(candidate.filename));
      if (intersection.length !== 1) {
        throw new MigrationLedgerAmbiguityError(
          `Ledger row ${rowIndex + 1} has an ambiguous migration slug.`,
          {
            row,
            slug_candidates: filenames(slugCandidates),
            version_candidates: filenames(versionCandidates),
          },
        );
      }
      chosen = intersection[0];
      matchedBy = "slug_and_version";
    } else if (versionCandidates.length === 1) {
      chosen = versionCandidates[0];
      matchedBy = "version";
    } else if (versionCandidates.length > 1) {
      throw new MigrationLedgerAmbiguityError(
        `Ledger row ${rowIndex + 1} has an ambiguous migration version.`,
        { row, candidates: filenames(versionCandidates) },
      );
    }

    if (!chosen) {
      unmatchedLedgerRows.push(Object.freeze({ row_index: rowIndex, row }));
      return;
    }

    const prior = matchedByFilename.get(chosen.filename);
    if (prior) {
      throw new MigrationLedgerAmbiguityError(
        `More than one ledger row satisfies repository migration ${chosen.filename}.`,
        {
          migration: chosen.filename,
          first_row_index: prior.row_index,
          duplicate_row_index: rowIndex,
        },
      );
    }

    const contradictoryVersionCandidates = versionCandidates.filter(
      (candidate) => candidate.filename !== chosen.filename,
    );
    if (contradictoryVersionCandidates.length > 0) {
      identityConflicts.push(
        Object.freeze({
          row_index: rowIndex,
          ledger_version: row.version,
          ledger_name: row.name,
          assigned_migration: chosen.filename,
          version_also_identifies: filenames(contradictoryVersionCandidates),
        }),
      );
    }

    const match = Object.freeze({
      row_index: rowIndex,
      row,
      migration: chosen,
      matched_by: matchedBy,
    });
    matchedByFilename.set(chosen.filename, match);
    matches.push(match);
  });

  const unmatchedMigrations = migrations.filter(
    (migration) => !matchedByFilename.has(migration.filename),
  );
  const matchedMigrations = migrations.filter((migration) =>
    matchedByFilename.has(migration.filename),
  );
  const highestMatchedRepoIndex = matchedMigrations.reduce(
    (highest, migration) => Math.max(highest, indexByFilename.get(migration.filename) ?? -1),
    -1,
  );
  const gaps = unmatchedMigrations.filter(
    (migration) =>
      (indexByFilename.get(migration.filename) ?? Number.POSITIVE_INFINITY) <
      highestMatchedRepoIndex,
  );
  const gapFilenames = new Set(gaps.map((migration) => migration.filename));
  const tail = unmatchedMigrations.filter((migration) => !gapFilenames.has(migration.filename));
  const latestMatchedMigration =
    highestMatchedRepoIndex >= 0 ? migrations[highestMatchedRepoIndex] : null;

  return Object.freeze({
    migrations: Object.freeze(migrations),
    matches: Object.freeze(matches),
    matched_migrations: Object.freeze(matchedMigrations),
    unmatched_migrations: Object.freeze(unmatchedMigrations),
    gaps: Object.freeze(gaps),
    tail: Object.freeze(tail),
    latest_matched_migration: latestMatchedMigration,
    unmatched_ledger_rows: Object.freeze(unmatchedLedgerRows),
    identity_conflicts: Object.freeze(identityConflicts),
  });
}

/**
 * Compatibility helper for callers/tests that check one migration. The
 * production probe must use reconcileMigrationLedger over the full repository
 * set so cross-identity collisions cannot count twice.
 */
export function isMigrationRecorded(migration, ledgerRows) {
  return reconcileMigrationLedger([migration], ledgerRows).matched_migrations.length === 1;
}
