#!/usr/bin/env node
/**
 * scripts/emit-release-receipt.mjs
 *
 * Local-only Release Receipt Emitter CLI.
 *
 * Reads a structured input JSON file describing validation command results,
 * runs the pure `emitReleaseReceiptArtifact` helper, and writes a
 * `release-receipt.v1` artifact JSON file.
 *
 * SCOPE / SAFETY
 *  - Local/manual use only. Not wired into any CI step in this slice.
 *  - No network calls. No Supabase. No GitHub API. No secrets read.
 *  - Reads only the file path you pass in; writes only to the output path.
 *  - The emitter validates through the parser, so unsafe metadata
 *    (service_role, bearer tokens, etc.) is rejected here too.
 *
 * USAGE
 *   node scripts/emit-release-receipt.mjs <input.json> <output.json>
 *
 * INPUT JSON SHAPE (camelCase, matches EmitReleaseReceiptInput):
 *   {
 *     "artifactId":   "ci-full-suite-...",
 *     "generatedAt":  "2026-06-30T12:00:00.000Z",
 *     "source":       "github_actions" | "local_parser" | "manual_import",
 *     "receiptKind":  "ci_full_suite" | "local_targeted" | "manual_operator_note",
 *     "summary":      "...",
 *     "commands":     [ { name, command, status, passed, failed, skipped, duration_ms, summary } ],
 *     "blockers":     [ { id, label, severity, active, summary } ],   // optional
 *     "metadata":     { ... },                                         // optional
 *     "sourceRunId":  "...",                                           // optional
 *     "commitSha":    "...",                                           // optional
 *     "branch":       "...",                                           // optional
 *     "workflowName": "...",                                           // optional
 *     "status":       "pass" | ...                                     // optional (derived if omitted)
 *   }
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function loadEmitter() {
  // Lazy import via tsx so the CLI works without a build step.
  const mod = await import(
    pathToFileURL(resolve(process.cwd(), "src/lib/releaseReceiptEmitter.ts")).href
  );
  return mod.emitReleaseReceiptArtifact;
}

function fail(msg, code = 1) {
  process.stderr.write(`emit-release-receipt: ${msg}\n`);
  process.exit(code);
}

async function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    fail("usage: node scripts/emit-release-receipt.mjs <input.json> <output.json>");
  }

  let raw;
  try {
    raw = readFileSync(resolve(inputPath), "utf8");
  } catch (e) {
    fail(`could not read input: ${e?.message ?? e}`);
  }

  let parsedInput;
  try {
    parsedInput = JSON.parse(raw);
  } catch (e) {
    fail(`input is not valid JSON: ${e?.message ?? e}`);
  }

  const emit = await loadEmitter();
  const result = emit(parsedInput);
  if (!result.ok) {
    process.stderr.write("emit-release-receipt: rejected by parser contract:\n");
    for (const err of result.errors) {
      process.stderr.write(`  - ${err}\n`);
    }
    process.exit(2);
  }

  const out = resolve(outputPath);
  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result.artifact, null, 2)}\n`, "utf8");
  } catch (e) {
    fail(`could not write output: ${e?.message ?? e}`);
  }

  process.stdout.write(
    `emit-release-receipt: wrote ${out} (status=${result.artifact.status}, kind=${result.artifact.receipt_kind})\n`,
  );
}

main().catch((e) => fail(`unexpected: ${e?.message ?? e}`));
