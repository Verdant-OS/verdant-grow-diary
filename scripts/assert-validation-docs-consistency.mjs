#!/usr/bin/env node
/**
 * Verdant validation docs/script/CI consistency verifier.
 *
 * Asserts that docs/test-validation-notes.md, package.json, and
 * .github/workflows/ci.yml stay in lockstep for the one-click
 * validation surface (localStorage helper enforcement, sensor safety,
 * docs demo safety, and the ecowitt bridge CI artifact path).
 *
 * Safety: read-only. Node built-ins only. No env/secrets printed.
 */
import { readFileSync } from "node:fs";

const DOCS_PATH = "docs/test-validation-notes.md";
const PKG_PATH = "package.json";
const CI_PATH = ".github/workflows/ci.yml";

const docs = readFileSync(DOCS_PATH, "utf8");
const pkgRaw = readFileSync(PKG_PATH, "utf8");
const pkg = JSON.parse(pkgRaw);
const ci = readFileSync(CI_PATH, "utf8");

const failures = [];
const fail = (msg) => failures.push(msg);

const ECOWITT_PARITY =
  "NODE_OPTIONS=--max-old-space-size=4096 bunx vitest run src/test/ecowitt-bridge-status-page.test.tsx --reporter=verbose --isolate --pool=forks";

const DOC_COMMANDS = [
  "bun run test:localstorage-helper-enforcement",
  "bun run test:ecowitt-bridge:ci",
  "bun run test:ecowitt-bridge:ci:artifact",
  "node scripts/sensor-safety-check.mjs",
  "node scripts/assert-sensor-intelligence-safety.mjs --quiet",
  "bun run test:docs-demo-safety",
];
for (const cmd of DOC_COMMANDS) {
  if (!docs.includes(cmd)) {
    fail(`docs/test-validation-notes.md is missing command: ${cmd}`);
  }
}

const PKG_SCRIPTS = [
  "test:localstorage-helper-enforcement",
  "test:ecowitt-bridge:ci",
  "test:ecowitt-bridge:ci:artifact",
];
for (const name of PKG_SCRIPTS) {
  if (!pkg.scripts || typeof pkg.scripts[name] !== "string") {
    fail(`package.json is missing script: ${name}`);
  }
}

// Ecowitt parity command must appear verbatim in docs, package.json,
// CI workflow, and local artifact script.
if (!docs.includes(ECOWITT_PARITY)) {
  fail(`docs/test-validation-notes.md missing exact ecowitt parity command:\n  ${ECOWITT_PARITY}`);
}
if (
  !pkg.scripts ||
  pkg.scripts["test:ecowitt-bridge:ci"] !== ECOWITT_PARITY
) {
  fail(`package.json#test:ecowitt-bridge:ci must equal the exact ecowitt parity command:\n  ${ECOWITT_PARITY}`);
}
if (!ci.includes(ECOWITT_PARITY)) {
  fail(`.github/workflows/ci.yml missing exact ecowitt parity command (single-line form):\n  ${ECOWITT_PARITY}`);
}

const localArtifactScript = readFileSync(
  "scripts/run-ecowitt-bridge-ci-validation.mjs",
  "utf8",
);
if (!localArtifactScript.includes(ECOWITT_PARITY)) {
  fail("scripts/run-ecowitt-bridge-ci-validation.mjs missing exact ecowitt parity command string.");
}

// CI workflow must upload the artifact with the exact name and paths.
const CI_INVARIANTS = [
  "name: ecowitt-bridge-ci-validation",
  "artifacts/ecowitt-bridge-ci-output.txt",
  "artifacts/ecowitt-bridge-ci-exit-code.txt",
  "if: always()",
];
for (const needle of CI_INVARIANTS) {
  if (!ci.includes(needle)) {
    fail(`.github/workflows/ci.yml missing required artifact invariant: ${needle}`);
  }
}

// CI step must initialize the exit-code file before running and always
// upload artifacts even on failure.
if (!ci.includes('"not-run"') && !ci.includes("not-run")) {
  fail(".github/workflows/ci.yml ecowitt step must pre-initialize exit-code file with 'not-run'.");
}
if (!ci.includes("PIPESTATUS[0]")) {
  fail(".github/workflows/ci.yml ecowitt step must capture status via PIPESTATUS[0].");
}

if (failures.length > 0) {
  console.error("Validation docs consistency check FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("Validation docs consistency check passed.");
console.log(`  docs:    ${DOCS_PATH}`);
console.log(`  package: ${PKG_PATH}`);
console.log(`  ci:     ${CI_PATH}`);
console.log(`  ecowitt parity command verified in all 4 surfaces.`);
