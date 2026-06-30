#!/usr/bin/env node
/**
 * scripts/build-release-receipt-input.mjs
 *
 * CI-safe Release Receipt INPUT builder.
 *
 * Reads a structured `command-results` JSON file (an array of structured
 * validation results — NOT raw terminal output) plus a few CLI flags that
 * describe the run, and emits a `release-receipt.v1` artifact JSON file via
 * the pure `emitReleaseReceiptArtifact` helper.
 *
 * SCOPE / SAFETY
 *  - Pure local transformer. No network, no fetch, no Supabase, no GitHub
 *    API, no CI polling, no clock reads (caller passes `--generated-at`).
 *  - Reads ONLY the files passed as args; writes ONLY the `--out` path.
 *  - Does NOT parse raw test stdout. Callers must structure results first.
 *  - Round-trips through the parser contract before writing.
 *  - This script does NOT unlock Release GO. It only produces an artifact
 *    file. Consumers are still required to validate via the parser.
 *
 * USAGE
 *   node scripts/build-release-receipt-input.mjs \
 *     --out path/to/release-receipt.json \
 *     --artifact-id ci-full-suite-2026-06-30-001 \
 *     --generated-at 2026-06-30T12:00:00.000Z \
 *     --source github_actions \
 *     --source-run-id 1234 \
 *     --commit-sha abcdef0123456789abcdef0123456789abcdef01 \
 *     --branch main \
 *     --workflow-name "Verdant CI — Full Suite" \
 *     --receipt-kind ci_full_suite \
 *     --command-results path/to/results.json \
 *     [--blockers path/to/blockers.json] \
 *     [--metadata path/to/metadata.json] \
 *     [--summary "All batches green."] \
 *     [--status pass]
 *
 * COMMAND-RESULTS JSON SHAPE (array):
 *   [
 *     {
 *       "name": "typecheck",
 *       "command": "bunx tsgo --noEmit",
 *       "status": "pass" | "fail" | "blocked" | "skipped" | "unknown",
 *       "passed": 0,
 *       "failed": 0,
 *       "skipped": 0,
 *       "duration_ms": 12000,
 *       "summary": "Typecheck clean"
 *     }
 *   ]
 *
 * EXIT CODES
 *   0  artifact written
 *   1  bad usage / missing flags / unreadable input
 *   2  emitter/parser rejected the input (errors printed to stderr)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ALLOWED_SOURCES = new Set([
  "github_actions",
  "local_parser",
  "manual_import",
]);
const ALLOWED_KINDS = new Set([
  "ci_full_suite",
  "local_targeted",
  "manual_operator_note",
]);
const ALLOWED_STATUSES = new Set([
  "pass",
  "fail",
  "blocked",
  "pending",
  "unknown",
]);

function fail(msg, code = 1) {
  process.stderr.write(`build-release-receipt-input: ${msg}\n`);
  process.exit(code);
}

function toCamel(k) {
  return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = toCamel(k.slice(2));
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function readJson(label, p) {
  try {
    return JSON.parse(readFileSync(resolve(p), "utf8"));
  } catch (e) {
    fail(`could not read ${label} (${p}): ${e?.message ?? e}`);
    return undefined; // unreachable
  }
}

function nullableFlag(v) {
  if (v === undefined) return null;
  if (v === "null" || v === "") return null;
  return String(v);
}

/**
 * Pure builder. Exported for tests. Validates input flags + command-results
 * shape and returns the structured emitter input. Does not invoke the
 * emitter or do any I/O.
 */
export function buildEmitterInput(flags, commandResults, blockers, metadata) {
  if (!flags.artifactId) throw new Error("missing --artifact-id");
  if (!flags.generatedAt) throw new Error("missing --generated-at");
  if (!flags.source || !ALLOWED_SOURCES.has(flags.source)) {
    throw new Error(`invalid --source (${flags.source ?? "<missing>"})`);
  }
  if (!flags.receiptKind || !ALLOWED_KINDS.has(flags.receiptKind)) {
    throw new Error(`invalid --receipt-kind (${flags.receiptKind ?? "<missing>"})`);
  }
  if (flags.status !== undefined && !ALLOWED_STATUSES.has(flags.status)) {
    throw new Error(`invalid --status (${flags.status})`);
  }
  if (!Array.isArray(commandResults)) {
    throw new Error("command-results JSON must be an array");
  }
  for (const [i, c] of commandResults.entries()) {
    if (!c || typeof c !== "object") {
      throw new Error(`command-results[${i}] must be an object`);
    }
    for (const field of [
      "name",
      "command",
      "status",
      "passed",
      "failed",
      "skipped",
      "summary",
    ]) {
      if (!(field in c)) {
        throw new Error(`command-results[${i}] missing field \`${field}\``);
      }
    }
    if (!("duration_ms" in c)) {
      throw new Error(`command-results[${i}] missing field \`duration_ms\``);
    }
  }
  if (blockers !== undefined && !Array.isArray(blockers)) {
    throw new Error("blockers JSON must be an array");
  }
  if (
    metadata !== undefined &&
    (metadata === null || typeof metadata !== "object" || Array.isArray(metadata))
  ) {
    throw new Error("metadata JSON must be an object");
  }

  const input = {
    artifactId: String(flags.artifactId),
    generatedAt: String(flags.generatedAt),
    source: flags.source,
    receiptKind: flags.receiptKind,
    summary:
      typeof flags.summary === "string" && flags.summary.length > 0
        ? flags.summary
        : `Release receipt for ${flags.receiptKind} (${commandResults.length} commands).`,
    commands: commandResults,
    blockers: blockers ?? [],
    metadata: metadata ?? {},
    sourceRunId: nullableFlag(flags.sourceRunId),
    commitSha: nullableFlag(flags.commitSha),
    branch: nullableFlag(flags.branch),
    workflowName: nullableFlag(flags.workflowName),
  };
  if (flags.status !== undefined) {
    input.status = flags.status;
  }
  return input;
}

async function loadEmitter() {
  const mod = await import(
    pathToFileURL(resolve(process.cwd(), "src/lib/releaseReceiptEmitter.ts"))
      .href
  );
  return mod.emitReleaseReceiptArtifact;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.out) fail("missing --out <path>");
  if (!flags.commandResults) fail("missing --command-results <path>");

  const commandResults = readJson("--command-results", flags.commandResults);
  const blockers = flags.blockers
    ? readJson("--blockers", flags.blockers)
    : undefined;
  const metadata = flags.metadata
    ? readJson("--metadata", flags.metadata)
    : undefined;

  let emitterInput;
  try {
    emitterInput = buildEmitterInput(flags, commandResults, blockers, metadata);
  } catch (e) {
    fail(e?.message ?? String(e));
  }

  const emit = await loadEmitter();
  const result = emit(emitterInput);
  if (!result.ok) {
    process.stderr.write(
      "build-release-receipt-input: rejected by parser contract:\n",
    );
    for (const err of result.errors) {
      process.stderr.write(`  - ${err}\n`);
    }
    process.exit(2);
  }

  const outPath = resolve(flags.out);
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(
      outPath,
      `${JSON.stringify(result.artifact, null, 2)}\n`,
      "utf8",
    );
  } catch (e) {
    fail(`could not write --out (${outPath}): ${e?.message ?? e}`);
  }

  process.stdout.write(
    `build-release-receipt-input: wrote ${outPath} (status=${result.artifact.status}, kind=${result.artifact.receipt_kind})\n`,
  );
}

// Only run main when invoked as a CLI, not when imported by tests.
const invokedDirectly =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (invokedDirectly) {
  main().catch((e) => fail(`unexpected: ${e?.message ?? e}`));
}
