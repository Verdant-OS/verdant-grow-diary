#!/usr/bin/env node
/**
 * assert-seo-manifest-present
 *
 * Hard precondition gate for the SEO fidelity validators: fails loudly when
 * dist/seo-manifest.json is absent (or unreadable/empty), before any validator
 * runs. Without this, a wiped dist makes every validator report "0 documents"
 * and the real failure surfaces only as a confusing missing-manifest message
 * from the last validator in the chain.
 *
 * This script never generates or repairs artifacts — it only reports.
 *
 * Usage: node scripts/assert-seo-manifest-present.mjs [distDir]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist");
const manifestPath = join(distDir, "seo-manifest.json");

function fail(message) {
  console.error(`assert-seo-manifest-present: FAIL — ${message}`);
  process.exit(1);
}

if (!existsSync(distDir)) {
  fail(`build output directory missing at ${distDir}. Run \`bun run build\` first.`);
}
if (!existsSync(manifestPath)) {
  fail(
    `${manifestPath} missing. It is produced by scripts/generate-seo-artifacts.ts during postbuild; ` +
      `the SEO fidelity validators cannot run without it.`,
  );
}
if (!statSync(manifestPath).isFile()) {
  fail(`${manifestPath} exists but is not a file.`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  fail(`${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : error}`);
}

if (!Array.isArray(manifest?.documents) || manifest.documents.length === 0) {
  fail(`${manifestPath} lists no documents; the SEO validators would vacuously pass.`);
}

console.log(
  `assert-seo-manifest-present: OK — ${manifestPath} present with ${manifest.documents.length} document(s).`,
);
