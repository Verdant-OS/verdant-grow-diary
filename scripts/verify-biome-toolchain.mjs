#!/usr/bin/env node
/**
 * Biome toolchain phase verifier (docs/biome-workflow.md).
 *
 * Exit 0 when Phases 1–8 gates that are still enforceable post-migration pass.
 * Does not re-run full product typecheck/build.
 *
 * Usage:
 *   node scripts/verify-biome-toolchain.mjs
 *   node scripts/verify-biome-toolchain.mjs --quick   # skip format:check + lint:ci
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quick = process.argv.includes("--quick");

/** @type {{ phase: string; ok: boolean; detail: string }[]} */
const results = [];

function record(phase, ok, detail) {
  results.push({ phase, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${phase}: ${detail}`);
}

function readJson(rel) {
  return JSON.parse(readFileSync(path.join(root, rel), "utf8"));
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    ...opts,
  });
}

/**
 * Prefer local node_modules/.bin/biome, then bunx, then npx.
 * Keeps the verifier green in CI (bun) and agent sandboxes (npx/local bin).
 * @returns {{ cmd: string; argsPrefix: string[] }}
 */
function resolveBiomeLauncher() {
  const local = path.join(root, "node_modules", ".bin", "biome");
  if (existsSync(local)) {
    return { cmd: local, argsPrefix: [] };
  }
  const bunx = run("bunx", ["--version"]);
  if (bunx.status === 0) {
    return { cmd: "bunx", argsPrefix: ["biome"] };
  }
  return { cmd: "npx", argsPrefix: ["biome"] };
}

/**
 * Prefer `bun run <script>`, fall back to `npm run <script>`.
 * @param {string} script
 */
function runPackageScript(script) {
  const bun = run("bun", ["--version"]);
  if (bun.status === 0) {
    return run("bun", ["run", script], { maxBuffer: 16 * 1024 * 1024 });
  }
  return run("npm", ["run", script], { maxBuffer: 16 * 1024 * 1024 });
}

// --- Phase 0: workspace ---
record(
  "0.preconditions",
  existsSync(path.join(root, "package.json")) && existsSync(path.join(root, "bun.lock")),
  "package.json + bun.lock present",
);

// --- Phase 1: install + scripts ---
const pkg = readJson("package.json");
const biomeVer = pkg.devDependencies?.["@biomejs/biome"] ?? pkg.dependencies?.["@biomejs/biome"];
record(
  "1.install",
  typeof biomeVer === "string" && biomeVer.length > 0,
  `@biomejs/biome=${biomeVer ?? "missing"}`,
);

const requiredScripts = ["lint", "lint:ci", "format", "format:check", "check"];
const missingScripts = requiredScripts.filter((s) => !pkg.scripts?.[s]?.includes("biome"));
record(
  "1.scripts",
  missingScripts.length === 0,
  missingScripts.length === 0
    ? requiredScripts.join(", ")
    : `missing biome scripts: ${missingScripts.join(", ")}`,
);

const lintStaged = pkg["lint-staged"] ?? {};
const stagedUsesBiome = JSON.stringify(lintStaged).includes("biome");
record(
  "1.lint-staged",
  stagedUsesBiome,
  stagedUsesBiome ? "lint-staged uses biome" : "lint-staged does not invoke biome",
);

// --- Phase 2–3: prettier/eslint migration artifacts should be gone post Phase 8 ---
const bannedPkgs = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((k) =>
  /^(eslint|prettier|@eslint\/|eslint-|typescript-eslint)/.test(k),
);
record(
  "8.packages-removed",
  bannedPkgs.length === 0,
  bannedPkgs.length === 0
    ? "no eslint/prettier packages"
    : `still present: ${bannedPkgs.join(", ")}`,
);

const bannedFiles = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  "prettier.config.js",
  "prettier.config.cjs",
  ".prettierignore",
];
const foundBanned = bannedFiles.filter((f) => existsSync(path.join(root, f)));
record(
  "8.configs-removed",
  foundBanned.length === 0,
  foundBanned.length === 0
    ? "no eslint/prettier config files"
    : `still present: ${foundBanned.join(", ")}`,
);

// --- Phase 4: biome.json + migrate ---
const biomeJsonPath = path.join(root, "biome.json");
const hasBiomeJson = existsSync(biomeJsonPath);
record("1.biome-json", hasBiomeJson, hasBiomeJson ? "biome.json present" : "biome.json missing");

const biomeLaunch = resolveBiomeLauncher();

if (hasBiomeJson) {
  const cfg = readJson("biome.json");
  const a11y = cfg?.linter?.rules?.a11y ?? {};
  const a11yOk = a11y.recommended === undefined || a11y.preset !== undefined;
  record(
    "4.a11y-preset",
    a11yOk,
    a11y.recommended !== undefined
      ? `deprecated a11y.recommended still set (${JSON.stringify(a11y.recommended)}); run biome migrate --write`
      : `a11y.preset=${JSON.stringify(a11y.preset ?? "(unset)")}`,
  );

  const migrate = run(biomeLaunch.cmd, [...biomeLaunch.argsPrefix, "migrate"], {
    maxBuffer: 4 * 1024 * 1024,
  });
  const migrateOut = `${migrate.stdout ?? ""}\n${migrate.stderr ?? ""}${migrate.error?.message ?? ""}`;
  const upToDate =
    migrate.status === 0 &&
    (/no migration needed/i.test(migrateOut) || /up to date/i.test(migrateOut));
  record(
    "4.migrate",
    upToDate,
    upToDate
      ? "biome migrate: up to date"
      : `biome migrate exit=${migrate.status}: ${migrateOut.slice(0, 400)}`,
  );
}

// --- Phase 5–6: gates ---
if (!quick) {
  const lintCi = runPackageScript("lint:ci");
  record(
    "5.lint-ci",
    lintCi.status === 0,
    lintCi.status === 0
      ? "lint:ci clean"
      : `lint:ci failed (exit ${lintCi.status}${lintCi.error ? ` ${lintCi.error.message}` : ""})`,
  );

  const formatCheck = runPackageScript("format:check");
  record(
    "6.format-check",
    formatCheck.status === 0,
    formatCheck.status === 0
      ? "format:check clean"
      : `format:check failed (exit ${formatCheck.status}${formatCheck.error ? ` ${formatCheck.error.message}` : ""})`,
  );
} else {
  record("5.lint-ci", true, "skipped (--quick)");
  record("6.format-check", true, "skipped (--quick)");
}

// --- Phase 7: CI workflow mentions biome ---
const lintYml = existsSync(path.join(root, ".github/workflows/lint.yml"))
  ? readFileSync(path.join(root, ".github/workflows/lint.yml"), "utf8")
  : "";
const ciMentionsBiome = /biome|lint:ci/.test(lintYml);
record(
  "7.ci-lint-workflow",
  ciMentionsBiome,
  ciMentionsBiome ? "lint.yml uses Biome" : "lint.yml missing Biome gate",
);

// --- Phase 9: docs ---
const docsOk =
  existsSync(path.join(root, "docs/biome-workflow.md")) &&
  existsSync(path.join(root, "docs/biome-adoption.md"));
record("9.docs", docsOk, docsOk ? "biome-workflow + biome-adoption present" : "missing biome docs");

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(
  `Biome toolchain: ${results.length - failed.length}/${results.length} phase checks passed`,
);
if (failed.length) {
  console.error("Failed:");
  for (const f of failed) console.error(`  - ${f.phase}: ${f.detail}`);
  process.exit(1);
}
process.exit(0);
