#!/usr/bin/env node
/**
 * Build a disposable Supabase workdir whose migration replay matches the
 * connected production history without mutating any published migration.
 *
 * A small, fingerprinted manifest identifies later Lovable migrations that
 * repeat canonical migrations already recorded by production. Every source
 * byte is verified before the duplicate is replaced with a no-op only inside
 * the disposable output directory. Fingerprinted local-only preconditions may
 * also be injected before an immutable migration that expects hosted legacy
 * defaults. Unknown drift fails closed.
 *
 * This script never connects to Supabase and never writes inside the source
 * repository. The caller must provide a new output directory outside it.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_MANIFEST_PATH = resolve(
  DEFAULT_SOURCE_ROOT,
  "config",
  "local-supabase-replay-compatibility.json",
);
const MIGRATION_PREFIX = "supabase/migrations/";
const TEMPLATE_PREFIX = "config/local-supabase-replay/";
const REPORT_NAME = "local-supabase-replay-report.json";

export class ReplayPreparationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReplayPreparationError";
    this.code = code;
  }
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256File(path) {
  const normalized = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  return sha256Text(normalized);
}

function fail(code, message) {
  throw new ReplayPreparationError(code, message);
}

function parseArgs(argv) {
  const args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    manifestPath: null,
    outputRoot: null,
    verifyCleanupWorkdir: null,
    verifyWorkdir: null,
    verifyOnly: false,
    json: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--source=")) args.sourceRoot = resolve(arg.slice(9));
    else if (arg.startsWith("--manifest=")) args.manifestPath = resolve(arg.slice(11));
    else if (arg.startsWith("--output=")) args.outputRoot = resolve(arg.slice(9));
    else if (arg.startsWith("--verify-cleanup-workdir=")) {
      args.verifyCleanupWorkdir = resolve(arg.slice("--verify-cleanup-workdir=".length));
    } else if (arg.startsWith("--verify-workdir=")) {
      args.verifyWorkdir = resolve(arg.slice("--verify-workdir=".length));
    } else if (arg === "--verify-only") args.verifyOnly = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") {
      return { ...args, help: true };
    } else {
      fail("invalid_argument", `Unknown argument: ${arg}`);
    }
  }
  if (!args.manifestPath) {
    args.manifestPath = resolve(
      args.sourceRoot,
      "config",
      "local-supabase-replay-compatibility.json",
    );
  }
  const selectedModes = [
    Boolean(args.outputRoot),
    Boolean(args.verifyCleanupWorkdir),
    Boolean(args.verifyWorkdir),
    args.verifyOnly,
  ].filter(Boolean).length;
  if (selectedModes > 1) {
    fail(
      "invalid_argument",
      "Choose exactly one of --output, --verify-workdir, --verify-cleanup-workdir, or --verify-only",
    );
  }
  return args;
}

function assertExistingDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    fail("missing_directory", `${label} is not a directory: ${path}`);
  }
}

function assertExistingFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail("missing_file", `${label} is not a file: ${path}`);
  }
}

function isInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function validateMigrationPath(sourceRoot, value, label) {
  if (typeof value !== "string" || !value.startsWith(MIGRATION_PREFIX)) {
    fail("invalid_manifest", `${label} must start with ${MIGRATION_PREFIX}`);
  }
  const resolved = resolve(sourceRoot, value);
  const migrationsRoot = resolve(sourceRoot, "supabase", "migrations");
  if (!isInside(migrationsRoot, resolved)) {
    fail("invalid_manifest", `${label} escapes supabase/migrations`);
  }
  assertExistingFile(resolved, label);
  return resolved;
}

function validateTemplatePath(sourceRoot, value, label) {
  if (typeof value !== "string" || !value.startsWith(TEMPLATE_PREFIX)) {
    fail("invalid_manifest", `${label} must start with ${TEMPLATE_PREFIX}`);
  }
  const resolved = resolve(sourceRoot, value);
  const templatesRoot = resolve(sourceRoot, "config", "local-supabase-replay");
  if (!isInside(templatesRoot, resolved)) {
    fail("invalid_manifest", `${label} escapes ${TEMPLATE_PREFIX}`);
  }
  assertExistingFile(resolved, label);
  return resolved;
}

function validateMigrationOutputPath(sourceRoot, value, label) {
  if (typeof value !== "string" || !value.startsWith(MIGRATION_PREFIX)) {
    fail("invalid_manifest", `${label} must start with ${MIGRATION_PREFIX}`);
  }
  const resolved = resolve(sourceRoot, value);
  const migrationsRoot = resolve(sourceRoot, "supabase", "migrations");
  if (!isInside(migrationsRoot, resolved)) {
    fail("invalid_manifest", `${label} escapes supabase/migrations`);
  }
  migrationVersion(resolved);
  if (existsSync(resolved)) {
    fail("invalid_manifest", `${label} already exists in the immutable source migrations`);
  }
  return resolved;
}

function migrationVersion(path) {
  const filename = path.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const match = filename.match(/^(\d{14})_.+\.sql$/);
  if (!match) fail("invalid_manifest", `Invalid migration filename: ${filename}`);
  return match[1];
}

function validateHash(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail("invalid_manifest", `${label} must be a lowercase SHA-256`);
  }
}

export function loadAndVerifyManifest({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  manifestPath = DEFAULT_MANIFEST_PATH,
} = {}) {
  const root = realpathSync(resolve(sourceRoot));
  assertExistingDirectory(resolve(root, "supabase"), "Supabase source");
  assertExistingFile(resolve(root, "supabase", "config.toml"), "Supabase config");
  assertExistingDirectory(resolve(root, "supabase", "migrations"), "Migration source");
  assertExistingFile(resolve(manifestPath), "Compatibility manifest");

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));
  } catch (error) {
    fail("invalid_manifest", `Compatibility manifest is not valid JSON: ${error.message}`);
  }

  if (
    manifest?.version !== 1 ||
    manifest?.hash_normalization !== "utf8_lf" ||
    !Array.isArray(manifest.compatibility_noops) ||
    (manifest.compatibility_injections !== undefined &&
      !Array.isArray(manifest.compatibility_injections)) ||
    (manifest.compatibility_patches !== undefined && !Array.isArray(manifest.compatibility_patches))
  ) {
    fail(
      "invalid_manifest",
      "Compatibility manifest must be version 1, use utf8_lf hashes, and include valid compatibility arrays",
    );
  }
  if (manifest.compatibility_noops.length === 0) {
    fail("invalid_manifest", "Compatibility manifest must not be empty");
  }

  const duplicatePaths = new Set();
  const entries = manifest.compatibility_noops.map((entry, index) => {
    const prefix = `compatibility_noops[${index}]`;
    const canonicalPath = validateMigrationPath(
      root,
      entry?.canonical_path,
      `${prefix}.canonical_path`,
    );
    const duplicatePath = validateMigrationPath(
      root,
      entry?.duplicate_path,
      `${prefix}.duplicate_path`,
    );
    validateHash(entry?.canonical_sha256, `${prefix}.canonical_sha256`);
    validateHash(entry?.duplicate_sha256, `${prefix}.duplicate_sha256`);
    if (typeof entry?.reason !== "string" || entry.reason.trim().length < 20) {
      fail("invalid_manifest", `${prefix}.reason must explain the production-history evidence`);
    }
    if (migrationVersion(canonicalPath) >= migrationVersion(duplicatePath)) {
      fail("invalid_manifest", `${prefix} canonical migration must precede its duplicate`);
    }
    if (duplicatePaths.has(entry.duplicate_path)) {
      fail("invalid_manifest", `${prefix}.duplicate_path is repeated`);
    }
    duplicatePaths.add(entry.duplicate_path);

    const canonicalActual = sha256File(canonicalPath);
    const duplicateActual = sha256File(duplicatePath);
    if (canonicalActual !== entry.canonical_sha256) {
      fail(
        "hash_mismatch",
        `${entry.canonical_path} SHA-256 changed; refusing compatibility replay`,
      );
    }
    if (duplicateActual !== entry.duplicate_sha256) {
      fail(
        "hash_mismatch",
        `${entry.duplicate_path} SHA-256 changed; refusing compatibility replay`,
      );
    }

    return {
      canonical_path: entry.canonical_path,
      canonical_sha256: canonicalActual,
      duplicate_path: entry.duplicate_path,
      duplicate_sha256: duplicateActual,
      reason: entry.reason.trim(),
    };
  });

  entries.sort((a, b) => a.duplicate_path.localeCompare(b.duplicate_path));

  const patchPaths = new Set();
  const patches = (manifest.compatibility_patches ?? []).map((entry, index) => {
    const prefix = `compatibility_patches[${index}]`;
    const sourcePath = validateMigrationPath(root, entry?.source_path, `${prefix}.source_path`);
    validateHash(entry?.source_sha256, `${prefix}.source_sha256`);
    validateHash(entry?.patched_sha256, `${prefix}.patched_sha256`);
    if (duplicatePaths.has(entry.source_path)) {
      fail("invalid_manifest", `${prefix}.source_path is also configured as a no-op`);
    }
    if (patchPaths.has(entry.source_path)) {
      fail("invalid_manifest", `${prefix}.source_path is repeated`);
    }
    patchPaths.add(entry.source_path);
    if (!Array.isArray(entry?.replacements) || entry.replacements.length === 0) {
      fail("invalid_manifest", `${prefix}.replacements must not be empty`);
    }
    if (typeof entry?.reason !== "string" || entry.reason.trim().length < 20) {
      fail("invalid_manifest", `${prefix}.reason must explain the local replay repair`);
    }

    const sourceActual = sha256File(sourcePath);
    if (sourceActual !== entry.source_sha256) {
      fail("hash_mismatch", `${entry.source_path} SHA-256 changed; refusing compatibility replay`);
    }

    let patchedSql = readFileSync(sourcePath, "utf8").replaceAll("\r\n", "\n");
    const replacements = entry.replacements.map((replacement, replacementIndex) => {
      const replacementPrefix = `${prefix}.replacements[${replacementIndex}]`;
      if (
        typeof replacement?.from !== "string" ||
        replacement.from.length === 0 ||
        typeof replacement?.to !== "string" ||
        replacement.to.length === 0 ||
        replacement.from === replacement.to
      ) {
        fail("invalid_manifest", `${replacementPrefix} must contain distinct text`);
      }
      const occurrences = patchedSql.split(replacement.from).length - 1;
      if (occurrences !== 1) {
        fail(
          "patch_mismatch",
          `${entry.source_path} expected exactly one ${replacementPrefix}.from match; found ${occurrences}`,
        );
      }
      patchedSql = patchedSql.replace(replacement.from, replacement.to);
      return { from: replacement.from, to: replacement.to };
    });

    if (sha256Text(patchedSql) !== entry.patched_sha256) {
      fail("patch_mismatch", `${entry.source_path} patched SHA-256 does not match the manifest`);
    }

    return {
      source_path: entry.source_path,
      source_sha256: sourceActual,
      patched_sha256: entry.patched_sha256,
      replacements,
      reason: entry.reason.trim(),
    };
  });
  patches.sort((a, b) => a.source_path.localeCompare(b.source_path));

  const outputPaths = new Set();
  const injections = (manifest.compatibility_injections ?? []).map((entry, index) => {
    const prefix = `compatibility_injections[${index}]`;
    const templatePath = validateTemplatePath(
      root,
      entry?.template_path,
      `${prefix}.template_path`,
    );
    validateHash(entry?.template_sha256, `${prefix}.template_sha256`);
    const templateActual = sha256File(templatePath);
    if (templateActual !== entry.template_sha256) {
      fail(
        "hash_mismatch",
        `${entry.template_path} SHA-256 changed; refusing compatibility replay`,
      );
    }

    const outputPath = validateMigrationOutputPath(
      root,
      entry?.output_path,
      `${prefix}.output_path`,
    );
    const requiredBeforePath = validateMigrationPath(
      root,
      entry?.required_before_path,
      `${prefix}.required_before_path`,
    );
    if (migrationVersion(outputPath) >= migrationVersion(requiredBeforePath)) {
      fail("invalid_manifest", `${prefix}.output_path must precede required_before_path`);
    }
    if (outputPaths.has(entry.output_path)) {
      fail("invalid_manifest", `${prefix}.output_path is repeated`);
    }
    outputPaths.add(entry.output_path);
    if (typeof entry?.reason !== "string" || entry.reason.trim().length < 20) {
      fail("invalid_manifest", `${prefix}.reason must explain the local replay precondition`);
    }

    return {
      template_path: entry.template_path,
      template_sha256: templateActual,
      output_path: entry.output_path,
      required_before_path: entry.required_before_path,
      reason: entry.reason.trim(),
    };
  });

  injections.sort((a, b) => a.output_path.localeCompare(b.output_path));
  return {
    sourceRoot: root,
    manifestPath: resolve(manifestPath),
    entries,
    patches,
    injections,
  };
}

function compatibilityNoop(entry) {
  return [
    "-- Disposable local-replay compatibility shim.",
    `-- Immutable source: ${entry.duplicate_path}`,
    `-- Canonical production-history migration: ${entry.canonical_path}`,
    "-- Both source fingerprints were verified before this file was generated.",
    "-- The repository migration remains byte-for-byte unchanged.",
    "SELECT 1;",
    "",
  ].join("\n");
}

function migrationFileFingerprints(sourceRoot) {
  const migrationsRoot = resolve(sourceRoot, "supabase", "migrations");
  assertExistingDirectory(migrationsRoot, "Migration source");
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .map((entry) => {
      if (!entry.isFile()) {
        fail(
          "invalid_migration_tree",
          `Migration tree entries must be regular files: ${entry.name}`,
        );
      }
      return {
        filename: entry.name,
        sha256: sha256File(resolve(migrationsRoot, entry.name)),
      };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

function migrationTreeSha256(entries) {
  const digest = createHash("sha256");
  for (const entry of entries) {
    digest.update(entry.filename, "utf8");
    digest.update("\0", "utf8");
    digest.update(entry.sha256, "utf8");
    digest.update("\n", "utf8");
  }
  return digest.digest("hex");
}

function optionalFileSha256(path) {
  return existsSync(path) ? sha256File(path) : null;
}

function preparedMigrationTreeSha256(verified) {
  const fingerprints = new Map(
    migrationFileFingerprints(verified.sourceRoot).map((entry) => [entry.filename, entry.sha256]),
  );

  for (const entry of verified.entries) {
    const filename = entry.duplicate_path.slice(MIGRATION_PREFIX.length);
    fingerprints.set(filename, sha256Text(compatibilityNoop(entry)));
  }
  for (const patch of verified.patches) {
    const filename = patch.source_path.slice(MIGRATION_PREFIX.length);
    let patchedSql = readFileSync(
      resolve(verified.sourceRoot, patch.source_path),
      "utf8",
    ).replaceAll("\r\n", "\n");
    for (const replacement of patch.replacements) {
      patchedSql = patchedSql.replace(replacement.from, replacement.to);
    }
    fingerprints.set(filename, sha256Text(patchedSql));
  }
  for (const injection of verified.injections) {
    const filename = injection.output_path.slice(MIGRATION_PREFIX.length);
    const templateSql = readFileSync(
      resolve(verified.sourceRoot, injection.template_path),
      "utf8",
    ).replaceAll("\r\n", "\n");
    fingerprints.set(filename, sha256Text(templateSql));
  }

  return migrationTreeSha256(
    [...fingerprints.entries()]
      .map(([filename, sha256]) => ({ filename, sha256 }))
      .sort((a, b) => a.filename.localeCompare(b.filename)),
  );
}

function buildReport(verified, mode) {
  return {
    version: 1,
    mode,
    source_migrations_unchanged: true,
    source_migration_tree_sha256: migrationTreeSha256(
      migrationFileFingerprints(verified.sourceRoot),
    ),
    source_config_sha256: sha256File(resolve(verified.sourceRoot, "supabase", "config.toml")),
    source_seed_sha256: optionalFileSha256(resolve(verified.sourceRoot, "supabase", "seed.sql")),
    source_manifest_sha256: sha256File(verified.manifestPath),
    prepared_migration_tree_sha256: preparedMigrationTreeSha256(verified),
    compatibility_entry_count: verified.entries.length,
    compatibility_patch_count: verified.patches.length,
    compatibility_injection_count: verified.injections.length,
    entries: verified.entries,
    patches: verified.patches,
    injections: verified.injections,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

export function verifyPreparedReplayWorkspace({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  manifestPath = DEFAULT_MANIFEST_PATH,
  verifyWorkdir,
} = {}) {
  if (!verifyWorkdir) fail("missing_workdir", "--verify-workdir is required");

  const verified = loadAndVerifyManifest({ sourceRoot, manifestPath });
  const requestedWorkdir = resolve(verifyWorkdir);
  assertExistingDirectory(requestedWorkdir, "Prepared replay workdir");
  const workdir = realpathSync(requestedWorkdir);
  if (workdir === verified.sourceRoot || isInside(verified.sourceRoot, workdir)) {
    fail("unsafe_workdir", "Prepared replay workdir must be outside the source repository");
  }

  const reportPath = resolve(workdir, REPORT_NAME);
  assertExistingFile(reportPath, "Prepared replay report");
  let actualReport;
  try {
    actualReport = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    fail("invalid_report", `Prepared replay report is not valid JSON: ${error.message}`);
  }

  const expectedReport = buildReport(verified, "prepared");
  if (
    JSON.stringify(canonicalJson(actualReport)) !== JSON.stringify(canonicalJson(expectedReport))
  ) {
    fail("stale_workdir", "Prepared replay report does not match the current source tree");
  }

  const actualMigrationTreeSha256 = migrationTreeSha256(migrationFileFingerprints(workdir));
  if (actualMigrationTreeSha256 !== expectedReport.prepared_migration_tree_sha256) {
    fail("workdir_drift", "Prepared replay migration tree no longer matches its report");
  }
  if (
    sha256File(resolve(workdir, "supabase", "config.toml")) !== expectedReport.source_config_sha256
  ) {
    fail("workdir_drift", "Prepared replay Supabase config no longer matches its source");
  }
  if (
    optionalFileSha256(resolve(workdir, "supabase", "seed.sql")) !==
    expectedReport.source_seed_sha256
  ) {
    fail("workdir_drift", "Prepared replay seed no longer matches its source");
  }

  return { ...expectedReport, mode: "verified_prepared" };
}

export function verifyCleanupReplayWorkspace({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  verifyCleanupWorkdir,
} = {}) {
  if (!verifyCleanupWorkdir) {
    fail("missing_workdir", "--verify-cleanup-workdir is required");
  }

  const requestedSource = resolve(sourceRoot);
  assertExistingDirectory(requestedSource, "Source repository");
  const source = realpathSync(requestedSource);
  const requestedWorkdir = resolve(verifyCleanupWorkdir);
  assertExistingDirectory(requestedWorkdir, "Prepared replay cleanup workdir");
  const workdir = realpathSync(requestedWorkdir);
  if (workdir === source || isInside(source, workdir)) {
    fail("unsafe_workdir", "Cleanup workdir must be outside the source repository");
  }
  assertExistingFile(resolve(workdir, "supabase", "config.toml"), "Prepared Supabase config");
  assertExistingDirectory(resolve(workdir, "supabase", "migrations"), "Prepared migrations");

  const reportPath = resolve(workdir, REPORT_NAME);
  assertExistingFile(reportPath, "Prepared replay report");
  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    fail("invalid_report", `Prepared replay report is not valid JSON: ${error.message}`);
  }

  const digestFields = [
    "source_migration_tree_sha256",
    "source_config_sha256",
    "source_manifest_sha256",
    "prepared_migration_tree_sha256",
  ];
  const validDigest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (
    report?.version !== 1 ||
    report?.mode !== "prepared" ||
    report?.source_migrations_unchanged !== true ||
    digestFields.some((field) => !validDigest(report[field])) ||
    (report?.source_seed_sha256 !== null && !validDigest(report?.source_seed_sha256)) ||
    !Array.isArray(report?.entries) ||
    !Array.isArray(report?.patches) ||
    !Array.isArray(report?.injections) ||
    report.compatibility_entry_count !== report.entries.length ||
    report.compatibility_patch_count !== report.patches.length ||
    report.compatibility_injection_count !== report.injections.length
  ) {
    fail("invalid_report", "Cleanup workdir does not contain a valid prepared replay report");
  }

  const actualMigrationTreeSha256 = migrationTreeSha256(migrationFileFingerprints(workdir));
  if (actualMigrationTreeSha256 !== report.prepared_migration_tree_sha256) {
    fail("workdir_drift", "Cleanup workdir migration tree does not match its prepared report");
  }
  if (sha256File(resolve(workdir, "supabase", "config.toml")) !== report.source_config_sha256) {
    fail("workdir_drift", "Cleanup workdir Supabase config does not match its prepared report");
  }
  if (optionalFileSha256(resolve(workdir, "supabase", "seed.sql")) !== report.source_seed_sha256) {
    fail("workdir_drift", "Cleanup workdir seed does not match its prepared report");
  }

  return { ...report, mode: "verified_for_cleanup" };
}

export function prepareReplayWorkspace({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  manifestPath = DEFAULT_MANIFEST_PATH,
  outputRoot,
  verifyOnly = false,
} = {}) {
  const verified = loadAndVerifyManifest({ sourceRoot, manifestPath });
  const requestedOutput = outputRoot ? resolve(outputRoot) : null;
  let output = requestedOutput;

  if (!verifyOnly) {
    if (!output) fail("missing_output", "--output is required unless --verify-only is used");
    if (existsSync(output)) {
      fail("output_exists", `Output path already exists: ${output}`);
    }
    if (isInside(verified.sourceRoot, output) || output === verified.sourceRoot) {
      fail("unsafe_output", "Output path must be outside the source repository");
    }

    const outputParent = dirname(output);
    assertExistingDirectory(outputParent, "Output parent");
    const realOutputCandidate = resolve(realpathSync(outputParent), basename(output));
    if (
      realOutputCandidate === verified.sourceRoot ||
      isInside(verified.sourceRoot, realOutputCandidate)
    ) {
      fail("unsafe_output", "Resolved output path must be outside the source repository");
    }

    mkdirSync(output, { recursive: false });
    output = realpathSync(output);
    if (output === verified.sourceRoot || isInside(verified.sourceRoot, output)) {
      fail("unsafe_output", "Created output path resolved inside the source repository");
    }
    const sourceSupabase = resolve(verified.sourceRoot, "supabase");
    cpSync(sourceSupabase, resolve(output, "supabase"), {
      recursive: true,
      filter: (source) => {
        const rel = relative(sourceSupabase, source);
        const firstSegment = rel.split(/[\\/]/)[0];
        return firstSegment !== ".temp";
      },
    });

    for (const entry of verified.entries) {
      const duplicateOutput = resolve(output, entry.duplicate_path);
      writeFileSync(duplicateOutput, compatibilityNoop(entry), "utf8");
    }
    for (const patch of verified.patches) {
      const patchOutput = resolve(output, patch.source_path);
      let patchedSql = readFileSync(patchOutput, "utf8").replaceAll("\r\n", "\n");
      for (const replacement of patch.replacements) {
        patchedSql = patchedSql.replace(replacement.from, replacement.to);
      }
      writeFileSync(patchOutput, patchedSql, "utf8");
    }
    for (const injection of verified.injections) {
      const templateSource = resolve(verified.sourceRoot, injection.template_path);
      const injectionOutput = resolve(output, injection.output_path);
      const normalizedSql = readFileSync(templateSource, "utf8").replaceAll("\r\n", "\n");
      writeFileSync(injectionOutput, normalizedSql, "utf8");
    }
  }

  const report = buildReport(verified, verifyOnly ? "verify_only" : "prepared");

  if (!verifyOnly) {
    writeFileSync(resolve(output, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

function printHelp() {
  console.log(`Usage:
  node scripts/prepare-local-supabase-replay.mjs --verify-only [--json]
  node scripts/prepare-local-supabase-replay.mjs --output=<new-dir> [--json]
  node scripts/prepare-local-supabase-replay.mjs --verify-workdir=<dir> [--json]
  node scripts/prepare-local-supabase-replay.mjs --verify-cleanup-workdir=<dir> [--json]

Options:
  --source=<repo-root>       Source repository (default: script repository)
  --manifest=<json-path>     Compatibility manifest override
  --output=<new-dir>         Disposable Supabase project workdir
  --verify-workdir=<dir>     Prove a prepared workdir matches current source
  --verify-cleanup-workdir=<dir>
                             Validate a stale workdir only for safe cleanup
  --verify-only              Verify immutable fingerprints without copying
  --json                     Emit the deterministic JSON report`);
}

function main() {
  try {
    const args = parseArgs(process.argv);
    if (args.help) {
      printHelp();
      return;
    }
    const report = args.verifyWorkdir
      ? verifyPreparedReplayWorkspace(args)
      : args.verifyCleanupWorkdir
        ? verifyCleanupReplayWorkspace(args)
        : prepareReplayWorkspace(args);
    if (args.json) console.log(JSON.stringify(report));
    else {
      console.log(
        `[supabase-replay] ${report.mode}: ${report.compatibility_entry_count} no-op entr${report.compatibility_entry_count === 1 ? "y" : "ies"}, ${report.compatibility_patch_count} patch${report.compatibility_patch_count === 1 ? "" : "es"}, and ${report.compatibility_injection_count} injection${report.compatibility_injection_count === 1 ? "" : "s"} verified`,
      );
    }
  } catch (error) {
    const code = error instanceof ReplayPreparationError ? error.code : "unexpected_error";
    console.error(`[supabase-replay] ${code}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
