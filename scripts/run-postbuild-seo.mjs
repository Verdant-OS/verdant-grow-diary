#!/usr/bin/env node
/**
 * run-postbuild-seo
 *
 * Single entry point for the postbuild SEO stage.
 *
 * Previously `postbuild` was a long `&&` chain: generate artifacts, capture SSR
 * snapshots, then run the validators. That chain assumed dist stayed untouched
 * between the generate step and the validate step. When the hosted production
 * build wipes/re-creates dist (concurrent `vite build`, emptyOutDir, or a
 * harness that re-runs only part of the pipeline), the validators ran against
 * an empty dist and the head-fidelity gate failed with the misleading
 * "seo-manifest.json missing ... staticSocialRouteDocuments vite plugin must
 * run before this validator".
 *
 * This runner re-verifies the artifact preconditions immediately before
 * validating and regenerates them if they are absent. Regeneration failures are
 * still hard failures — nothing here can turn a real head-fidelity defect into
 * a pass.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`run-postbuild-seo: failed to spawn ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function countHtmlDocuments(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir)) {
    if (entry === "client" || entry === "server" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) total += countHtmlDocuments(full);
    else if (entry.endsWith(".html")) total += 1;
  }
  return total;
}

function artifactsPresent() {
  return existsSync(join(distDir, "seo-manifest.json")) && countHtmlDocuments(distDir) > 0;
}

function generateArtifacts() {
  run("bun", [resolve("scripts/generate-seo-artifacts.ts"), distDir]);
  run("node", [resolve("scripts/capture-ssr-head-snapshots-with-server.mjs"), distDir]);
}

generateArtifacts();

if (!artifactsPresent()) {
  console.error(
    `run-postbuild-seo: artifacts vanished from ${distDir} after generation — regenerating once.`,
  );
  generateArtifacts();
  if (!artifactsPresent()) {
    console.error(
      `run-postbuild-seo: BLOCKED — could not produce seo-manifest.json + pre-rendered documents in ${distDir}.`,
    );
    process.exit(1);
  }
}

const validators = [
  ["scripts/check-no-src-lib-imports.mjs", false],
  ["scripts/validate-jsonld-rich-results.mjs", true],
  ["scripts/validate-og-image-urls.mjs", true],
  ["scripts/validate-og-url-canonical-parity.mjs", true],
  ["scripts/validate-canonical-singleton.mjs", true],
  ["scripts/validate-canonical-shape.mjs", true],
  ["scripts/validate-title-description.mjs", true],
  ["scripts/validate-jsonld-id-canonical-parity.mjs", true],
  ["scripts/validate-static-route-head-fidelity.mjs", true],
  ["scripts/validate-public-image-budget.mjs", true],
];

for (const [script, takesDist] of validators) {
  if (takesDist && !artifactsPresent()) {
    console.error(
      `run-postbuild-seo: artifacts disappeared before ${script} — regenerating before validating.`,
    );
    generateArtifacts();
  }
  run("node", takesDist ? [resolve(script), distDir] : [resolve(script)]);
}
