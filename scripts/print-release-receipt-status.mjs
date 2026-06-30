#!/usr/bin/env node
/**
 * scripts/print-release-receipt-status.mjs
 *
 * Parses a release-receipt.v1.json artifact through the trusted v1 contract
 * and prints derived status / outcome / blocker count.
 *
 * Usage:
 *   bun scripts/print-release-receipt-status.mjs [path]
 *
 * Default path: artifacts/release-readiness/release-receipt.v1.json
 *
 * SAFETY
 *  - No network. No backend. No mutation. No secrets, raw payloads, or
 *    private IDs printed.
 *  - Outcome mapping:
 *      pass    → PASS
 *      blocked → BLOCKED  (also forced BLOCKED when active blockers exist)
 *      fail    → FAIL
 *      other   → FAIL
 *  - Exits nonzero on invalid / unparseable receipt.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PATH = "artifacts/release-readiness/release-receipt.v1.json";

function fail(msg, code = 1) {
  process.stderr.write(`print-release-receipt-status: ${msg}\n`);
  process.exit(code);
}

async function loadParser() {
  const mod = await import(
    pathToFileURL(resolve(process.cwd(), "src/lib/releaseReceiptParser.ts"))
      .href,
  );
  return mod.parseReleaseReceiptArtifact;
}

function deriveOutcome(status, activeBlockerCount) {
  if (activeBlockerCount > 0) return "BLOCKED";
  if (status === "pass") return "PASS";
  if (status === "blocked") return "BLOCKED";
  return "FAIL";
}

async function main() {
  const inputPath = resolve(process.argv[2] ?? DEFAULT_PATH);
  let raw;
  try {
    raw = readFileSync(inputPath, "utf8");
  } catch (e) {
    fail(`could not read receipt at ${inputPath}: ${e?.message ?? e}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    fail(`receipt is not valid JSON: ${e?.message ?? e}`);
  }

  const parse = await loadParser();
  const result = parse(json);
  if (!result.ok) {
    process.stderr.write(
      "print-release-receipt-status: trusted v1 contract rejected the receipt:\n",
    );
    for (const err of result.errors) {
      process.stderr.write(`  - ${err}\n`);
    }
    process.exit(2);
  }

  const artifact = result.artifact;
  const blockers = Array.isArray(artifact.blockers) ? artifact.blockers : [];
  const activeCount = blockers.filter((b) => b && b.active === true).length;
  const outcome = deriveOutcome(artifact.status, activeCount);

  process.stdout.write(`Release receipt status: ${artifact.status}\n`);
  process.stdout.write(`Release receipt outcome: ${outcome}\n`);
  process.stdout.write(`Release receipt blockers: ${activeCount}\n`);
  process.stdout.write("Release receipt trusted contract: validated\n");
}

main().catch((e) => fail(`unexpected: ${e?.message ?? e}`));
