#!/usr/bin/env node
/**
 * Build a disposable Supabase workdir whose migration replay matches the
 * connected production history without mutating any published migration.
 *
 * A small, fingerprinted manifest identifies later Lovable migrations that
 * repeat canonical migrations already recorded by production. Every source
 * byte is verified before the duplicate is replaced with a no-op only inside
 * the disposable output directory. Unknown drift fails closed.
 *
 * This script never connects to Supabase and never writes inside the source
 * repository. The caller must provide a new output directory outside it.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_MANIFEST_PATH = resolve(
  DEFAULT_SOURCE_ROOT,
  "config",
  "local-supabase-replay-compatibility.json",
);
const MIGRATION_PREFIX = "supabase/migrations/";
const REPORT_NAME = "local-supabase-replay-report.json";

export class ReplayPreparationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReplayPreparationError";
    this.code = code;
  }
}

export function sha256File(path) {
  const normalized = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function fail(code, message) {
  throw new ReplayPreparationError(code, message);
}

function parseArgs(argv) {
  const args = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    manifestPath: null,
    outputRoot: null,
    verifyOnly: false,
    json: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--source=")) args.sourceRoot = resolve(arg.slice(9));
    else if (arg.startsWith("--manifest=")) args.manifestPath = resolve(arg.slice(11));
    else if (arg.startsWith("--output=")) args.outputRoot = resolve(arg.slice(9));
    else if (arg === "--verify-only") args.verifyOnly = true;
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
    !Array.isArray(manifest.compatibility_noops)
  ) {
    fail(
      "invalid_manifest",
      "Compatibility manifest must be version 1, use utf8_lf hashes, and include compatibility_noops",
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
  return { sourceRoot: root, manifestPath: resolve(manifestPath), entries };
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

export function prepareReplayWorkspace({
  sourceRoot = DEFAULT_SOURCE_ROOT,
  manifestPath = DEFAULT_MANIFEST_PATH,
  outputRoot,
  verifyOnly = false,
} = {}) {
  const verified = loadAndVerifyManifest({ sourceRoot, manifestPath });
  const output = outputRoot ? resolve(outputRoot) : null;

  if (!verifyOnly) {
    if (!output) fail("missing_output", "--output is required unless --verify-only is used");
    if (existsSync(output)) {
      fail("output_exists", `Output path already exists: ${output}`);
    }
    if (isInside(verified.sourceRoot, output) || output === verified.sourceRoot) {
      fail("unsafe_output", "Output path must be outside the source repository");
    }

    mkdirSync(output, { recursive: false });
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
  }

  const report = {
    version: 1,
    mode: verifyOnly ? "verify_only" : "prepared",
    source_migrations_unchanged: true,
    compatibility_entry_count: verified.entries.length,
    entries: verified.entries,
  };

  if (!verifyOnly) {
    writeFileSync(resolve(output, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

function printHelp() {
  console.log(`Usage:
  node scripts/prepare-local-supabase-replay.mjs --verify-only [--json]
  node scripts/prepare-local-supabase-replay.mjs --output=<new-dir> [--json]

Options:
  --source=<repo-root>       Source repository (default: script repository)
  --manifest=<json-path>     Compatibility manifest override
  --output=<new-dir>         Disposable Supabase project workdir
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
    const report = prepareReplayWorkspace(args);
    if (args.json) console.log(JSON.stringify(report));
    else {
      console.log(
        `[supabase-replay] ${report.mode}: ${report.compatibility_entry_count} fingerprinted compatibility entr${report.compatibility_entry_count === 1 ? "y" : "ies"} verified`,
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
