import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The module runs main() by DEFAULT (see the SKIP_MAIN_ENV note at the bottom
// of probe-migration-drift.mjs: default-run is the safe direction, because a
// guard that wrongly skips main would exit 0 having probed nothing). Opting
// out therefore has to happen before the module is evaluated, which means the
// env var must be set before a DYNAMIC import.
process.env.PROBE_MIGRATION_DRIFT_SKIP_MAIN = "1";
const { FIELD_SEP, LEDGER_QUERY, repoRecords, parseLedgerRows, matchLedger, ageInDays } =
  await import("./probe-migration-drift.mjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "probe-migration-drift.mjs"), "utf-8");

/** Build a throwaway migrations directory from a list of filenames. */
function fixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "drift-probe-"));
  for (const f of files) writeFileSync(join(dir, f), "-- fixture\n");
  return dir;
}

/** Build ledger rows the way psql -tA -F <sep> emits them. */
function ledger(rows) {
  const parsed = parseLedgerRows(
    rows.map(([v, n]) => `${v}${FIELD_SEP}${n ?? ""}`).join("\n") + "\n",
  );
  assert.deepEqual(parsed.malformed, [], "fixture rows must all be well formed");
  return parsed;
}

const unappliedFiles = (result) => result.unapplied.map((r) => r.file).sort();

// ── The defect this change exists to fix ──────────────────────────────────

test("Lovable convention: version is shifted, name carries the stem → APPLIED", () => {
  // The runbook's worked example. Under the previous version-only diff this
  // file was reported as drift on every run, because 20260721194325 !==
  // 20260721194327. 157 of 268 files in this repo use this convention.
  const file = "20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5.sql";
  const records = repoRecords(fixtureDir([file]));
  const result = matchLedger(
    records,
    ledger([["20260721194327", "20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5"]]),
  );
  assert.deepEqual(unappliedFiles(result), [], "a name-matched Lovable migration is applied");
  assert.equal(result.matchedBy.stem, 1);
  assert.equal(result.matchedBy.version, 0, "it must match on the stem, not the version");
});

test("hand-authored convention: ledger name is the bare slug → APPLIED", () => {
  // Version deliberately does NOT match, so only the slug path can pass.
  const file = "20260714231627_signup_acquisition_attribution.sql";
  const records = repoRecords(fixtureDir([file]));
  const result = matchLedger(
    records,
    ledger([["20260714231699", "signup_acquisition_attribution"]]),
  );
  assert.deepEqual(unappliedFiles(result), []);
  assert.equal(result.matchedBy.slug, 1);
});

test("exact version match with an empty name still counts → APPLIED", () => {
  const records = repoRecords(fixtureDir(["20260101000000_early_thing.sql"]));
  const result = matchLedger(records, ledger([["20260101000000", ""]]));
  assert.deepEqual(unappliedFiles(result), []);
  assert.equal(result.matchedBy.version, 1);
});

test("a genuinely absent migration is still reported", () => {
  const file = "20260813030000_signup_acquisition_forward_repair.sql";
  const records = repoRecords(fixtureDir([file]));
  const result = matchLedger(records, ledger([["20260101000000", "something_else"]]));
  assert.deepEqual(unappliedFiles(result), [file]);
});

// ── Trap 2: the tolerance window that must never be added ─────────────────

test("REGRESSION — adjacent one-second migrations are not conflated by a window", () => {
  // From the runbook's Trap 2. These two real files sit one second apart. A
  // tolerance window would see the ledger's ...21 and call the unapplied ...20
  // applied — classifying an UNAPPLIED migration as applied, which is the
  // worse error and the exact shape of the 2026-08-05 blind spot.
  const older = "20260806230020_candidate_number_maintenance_paths.sql";
  const newer = "20260806230021_candidate_number_membership_validate.sql";
  const records = repoRecords(fixtureDir([older, newer]));
  const result = matchLedger(
    records,
    ledger([["20260806230021", "candidate_number_membership_validate"]]),
  );
  assert.deepEqual(
    unappliedFiles(result),
    [older],
    "the one-second-older migration must still be reported unapplied",
  );
});

test("a version 2s away without a name match is NOT applied", () => {
  // Same distance as the Lovable shift, but nothing identifies it as this
  // file. Proximity alone must never satisfy the match.
  const file = "20260901000000_unrelated.sql";
  const records = repoRecords(fixtureDir([file]));
  const result = matchLedger(records, ledger([["20260901000002", "a_different_migration"]]));
  assert.deepEqual(unappliedFiles(result), [file]);
});

test("the source contains no version-proximity arithmetic", () => {
  // Guarding the absence of a forbidden construct is exactly what source
  // scanning is good for. If someone later "fixes" false drift with a window,
  // this fails and points them at the runbook.
  const body = SOURCE.split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  assert.doesNotMatch(body, /Math\.abs\s*\(/, "no absolute-difference comparison");
  assert.doesNotMatch(body, /TOLERANCE|WINDOW|withinSeconds|nearest/i, "no tolerance window");
  // Numeric coercion of a version is the tell for proximity arithmetic: the
  // matching path compares strings only.
  assert.doesNotMatch(body, /Number\s*\(\s*r\.ts\s*\)/, "versions are never coerced to numbers");
  assert.doesNotMatch(body, /parseInt\s*\(\s*r\.ts/, "versions are never parsed as integers");
});

// ── The empty-string hazards ──────────────────────────────────────────────

test("a bare <ts>.sql has an empty slug and must not match a NULL ledger name", () => {
  // coalesce(name,'') turns a NULL name into "". If the empty slug were
  // allowed to match it, this unapplied migration would be reported applied.
  const records = repoRecords(fixtureDir(["20260401000000.sql"]));
  assert.equal(records[0].slug, "", "fixture must actually produce an empty slug");
  const result = matchLedger(records, ledger([["20260101000000", ""]]));
  assert.deepEqual(unappliedFiles(result), ["20260401000000.sql"]);
});

test("parseLedgerRows refuses an empty separator instead of guessing", () => {
  // indexOf("") is 0, so every version would parse as "" and the probe would
  // call the entire repository unapplied — a false DRIFT indistinguishable
  // from a real one.
  assert.throws(() => parseLedgerRows("a\u001fb", ""), TypeError);
  assert.throws(() => parseLedgerRows("a\u001fb", undefined_separator()), TypeError);
  function undefined_separator() {
    return null;
  }
});

test("FIELD_SEP is a single non-printing character", () => {
  // Resolved value, per AGENTS.md: a contract test asserts on what the module
  // actually exports, never on how the source spells it.
  assert.equal(FIELD_SEP, "\u001f");
  assert.equal(FIELD_SEP.length, 1);
  // The only source assertion kept is an ABSENCE one, which is what the repo's
  // source-scanning rule sanctions: the raw control byte must not sit in the
  // file, because an editor or patch round-trip can silently drop it.
  assert.doesNotMatch(SOURCE, /FIELD_SEP = "\u001f"/, "separator must be written as an escape");
});

// ── Parsing robustness ────────────────────────────────────────────────────

test("parseLedgerRows tolerates blank lines, trailing newline and empty names", () => {
  const raw = `20260101000000${FIELD_SEP}alpha\n\n20260102000000${FIELD_SEP}\n`;
  const { versions, names } = parseLedgerRows(raw);
  assert.deepEqual([...versions].sort(), ["20260101000000", "20260102000000"]);
  assert.deepEqual([...names], ["alpha"], "an empty name is not added to the set");
});

test("parseLedgerRows keeps a name containing the separator intact after the first split", () => {
  const raw = `20260101000000${FIELD_SEP}weird${FIELD_SEP}name`;
  const { names } = parseLedgerRows(raw);
  assert.deepEqual([...names], [`weird${FIELD_SEP}name`]);
});

test("the query asks for both columns and coalesces NULL names", () => {
  // Resolved-value assertion, not a source regex: name-bound matching is
  // impossible if the query ever drops back to selecting version alone.
  assert.match(LEDGER_QUERY, /SELECT version, coalesce\(name, ''\) AS name/);
  assert.match(LEDGER_QUERY, /supabase_migrations\.schema_migrations/);
});

// ── Preserved behaviour ───────────────────────────────────────────────────

test("GAP detection survives: unapplied older than max applied is flagged", () => {
  const gapFile = "20260501000000_never_ran.sql";
  const tailFile = "20260901000000_later_pending.sql";
  const records = repoRecords(fixtureDir([gapFile, tailFile]));
  const result = matchLedger(records, ledger([["20260601000000", "something_applied"]]));
  assert.equal(result.maxApplied, "20260601000000");
  assert.ok(result.gaps.has("20260501000000"), "older than max applied → GAP");
  assert.ok(!result.gaps.has("20260901000000"), "newer than max applied → contiguous tail");
});

test("non-.sql files and files without a 14-digit prefix are ignored", () => {
  const records = repoRecords(fixtureDir(["README.md", "notes.txt", "not-a-timestamp_x.sql"]));
  assert.deepEqual(records, []);
});

test("two files sharing a timestamp are both kept", () => {
  // The previous Map keyed by version silently dropped one of them.
  const records = repoRecords(fixtureDir(["20260101000000_a.sql", "20260101000000_b.sql"]));
  assert.equal(records.length, 2);
});

test("output is deterministic and stably ordered", () => {
  const dir = fixtureDir([
    "20260301000000_c.sql",
    "20260101000000_a.sql",
    "20260201000000_b.sql",
  ]);
  const once = matchLedger(repoRecords(dir), ledger([]));
  const twice = matchLedger(repoRecords(dir), ledger([]));
  assert.deepEqual(unappliedFiles(once), unappliedFiles(twice));
  assert.deepEqual(
    once.unapplied.map((r) => r.ts),
    ["20260101000000", "20260201000000", "20260301000000"],
  );
});

test("ageInDays takes an injectable clock", () => {
  const now = Date.UTC(2026, 7, 15);
  assert.equal(ageInDays("20260805090000", now), 10);
  assert.equal(ageInDays("20260815000000", now), 0);
});

test("an empty ledger reports every migration unapplied, not zero", () => {
  // The failure mode that matters most: a probe that cannot see the ledger
  // must never look like a clean result.
  const records = repoRecords(fixtureDir(["20260101000000_a.sql", "20260102000000_b.sql"]));
  const result = matchLedger(records, ledger([]));
  assert.equal(result.unapplied.length, 2);
  assert.equal(result.maxApplied, null);
  assert.equal(result.gaps.size, 0, "with no max applied there is nothing to call a gap");
});

// ── The real repository ───────────────────────────────────────────────────

test("the real migrations directory parses into both conventions", () => {
  const records = repoRecords();
  assert.ok(records.length > 250, `expected the full migration set, got ${records.length}`);
  const lovable = records.filter((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(r.slug));
  assert.ok(
    lovable.length > 100,
    `expected many Lovable-convention files, got ${lovable.length} — if this collapsed, ` +
      "the stem/slug split is wrong and name-bound matching would silently do nothing",
  );
  assert.ok(
    records.some((r) => !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(r.slug)),
    "expected hand-authored files too — both conventions must coexist",
  );
});

// ── Regressions for defects found in adversarial review, 2026-08-15 ────────

test("REGRESSION — a malformed ledger line is refused, not read as a version", () => {
  // If -F were dropped, or a ~/.psqlrc banner reached stdout, every line would
  // lack the separator. Treating the whole line as a version turned a
  // fully-applied ledger into a repository-wide false DRIFT indistinguishable
  // from a real one. parseLedgerRows now reports these so the caller can bail.
  const psqlDefaultPipeOutput = "20260101000000|alpha\n20260102000000|beta";
  const parsed = parseLedgerRows(psqlDefaultPipeOutput);
  assert.equal(parsed.malformed.length, 2, "both lines lack the 0x1F separator");
  assert.equal(parsed.versions.size, 0, "and NOTHING is admitted as a version");
});

test("REGRESSION — a stray stdout line cannot poison max_applied_version", () => {
  const raw = `NOTICE: something chatty\n20260101000000${FIELD_SEP}alpha`;
  const parsed = parseLedgerRows(raw);
  assert.equal(parsed.malformed.length, 1);
  assert.deepEqual([...parsed.versions], ["20260101000000"]);
});

test("REGRESSION — two files sharing a slug are NOT both marked applied", () => {
  // One ledger row named `add_index` must not clear two different migrations.
  // This is the dangerous direction: an unapplied file reported as applied.
  const applied = "20260101000000_add_index.sql";
  const notApplied = "20261001000000_add_index.sql";
  const records = repoRecords(fixtureDir([applied, notApplied]));
  const result = matchLedger(records, ledger([["20260101000000", "add_index"]]));
  assert.ok(
    result.unapplied.some((r) => r.file === notApplied),
    "the later same-slug migration must still be reported unapplied",
  );
  assert.equal(result.ambiguous.slugs > 0, true, "and the refusal is surfaced");
});

test("REGRESSION — two files sharing a timestamp are NOT both marked applied", () => {
  const a = "20260101000000_alpha.sql";
  const b = "20260101000000_beta.sql";
  const records = repoRecords(fixtureDir([a, b]));
  // Ledger holds only the shared version, with no name that identifies either.
  const result = matchLedger(records, ledger([["20260101000000", ""]]));
  assert.equal(result.unapplied.length, 2, "an ambiguous version clears neither file");
  assert.ok(result.ambiguous.timestamps > 0, "and the refusal is surfaced");
});

test("an unambiguous slug still matches (the guard is not a blanket ban)", () => {
  const records = repoRecords(fixtureDir(["20260101000000_unique_slug.sql"]));
  const result = matchLedger(records, ledger([["20269999999999", "unique_slug"]]));
  assert.deepEqual(unappliedFiles(result), []);
  assert.equal(result.matchedBy.slug, 1);
});

test("REGRESSION — the probe still runs when invoked through a symlink", async () => {
  // The first version of this refactor gated main() on
  // `import.meta.url === pathToFileURL(process.argv[1]).href`. Node resolves
  // import.meta.url through realpath but leaves argv[1] alone, so ONE symlink
  // made the guard false: main() never ran, the process exited 0 having
  // emitted nothing, and the scheduled workflow reports exit 0 as "Production
  // is current". A probe that silently checks nothing while reporting success
  // is the exact failure this script exists to prevent.
  const { execFileSync } = await import("node:child_process");
  const { symlinkSync } = await import("node:fs");
  const link = join(mkdtempSync(join(tmpdir(), "drift-link-")), "probe-link.mjs");
  symlinkSync(join(HERE, "probe-migration-drift.mjs"), link);

  let code = 0;
  let stdout = "";
  try {
    stdout = execFileSync(process.execPath, [link, "--json"], {
      encoding: "utf-8",
      env: { ...process.env, SUPABASE_DB_URL: "", DATABASE_URL: "", PROBE_MIGRATION_DRIFT_SKIP_MAIN: "" },
    });
  } catch (error) {
    code = error.status;
    stdout = String(error.stdout ?? "");
  }
  assert.equal(code, 2, "must exit 2 (COULD NOT PROBE), never 0");
  assert.match(stdout, /could_not_probe/, "and must actually emit its verdict");
});

test("REGRESSION — the GAP count counts entries, not distinct timestamps", () => {
  // gaps is a Set of timestamps; two files can share one, so Set.size would
  // under-report the number of lines printed with the GAP marker.
  const records = repoRecords(
    fixtureDir(["20260101000000_a.sql", "20260101000000_b.sql", "20260901000000_c.sql"]),
  );
  const result = matchLedger(records, ledger([["20260601000000", "later_applied"]]));
  const flagged = result.unapplied.filter((r) => result.gaps.has(r.ts));
  assert.equal(flagged.length, 2, "both same-timestamp files are flagged");
  assert.equal(result.gaps.size, 1, "but the Set holds only one timestamp");
});

test("psql is invoked with -X so a ~/.psqlrc cannot override -F/-A", () => {
  // psql reads ~/.psqlrc AFTER parsing options, so a \pset there would win and
  // its banners would land on stdout. Absence-of-construct is not provable by
  // resolved value here, so this pins the argv shape.
  assert.match(SOURCE, /"-X"/, "psql must be invoked with -X");
  assert.match(SOURCE, /"-tA", "-F", FIELD_SEP/, "and with explicit unaligned two-column output");
});
