#!/usr/bin/env node
/**
 * scripts/validate-release-receipt-artifact.mjs
 *
 * Validates a release-receipt.v1.json artifact through the trusted v1 parser
 * contract. Pure read + validate. No mutation. No network. No backend.
 *
 * Usage:
 *   bun scripts/validate-release-receipt-artifact.mjs [path]
 *
 * Default path: artifacts/release-readiness/release-receipt.v1.json
 *
 * Exits 0 only when the receipt conforms to the v1 contract.
 * Prints exactly: "Release receipt trusted contract: validated"
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PATH = "artifacts/release-readiness/release-receipt.v1.json";

function fail(msg, code = 1) {
  process.stderr.write(`validate-release-receipt-artifact: ${msg}\n`);
  process.exit(code);
}

async function loadParser() {
  const mod = await import(
    pathToFileURL(resolve(process.cwd(), "src/lib/releaseReceiptParser.ts"))
      .href,
  );
  return mod.parseReleaseReceiptArtifact;
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
      "validate-release-receipt-artifact: trusted v1 contract rejected the receipt:\n",
    );
    for (const err of result.errors) {
      process.stderr.write(`  - ${err}\n`);
    }
    process.exit(2);
  }
  process.stdout.write("Release receipt trusted contract: validated\n");
}

main().catch((e) => fail(`unexpected: ${e?.message ?? e}`));
