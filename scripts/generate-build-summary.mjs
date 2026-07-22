#!/usr/bin/env node
/**
 * generate-build-summary.mjs
 *
 * Emits a self-contained build summary as JSON + Markdown so every
 * production build produces one downloadable audit artifact covering:
 *
 *   - commit lineage (SHA, short SHA, branch/ref, actor, run URL)
 *   - validator results (env-provided; each stage: pass/fail/skipped)
 *   - edge-shared drift status (re-checked at summary time so the
 *     artifact is trustworthy even if an earlier step was `continue-on-error`)
 *   - build inputs (Node/Bun version, dist size when present)
 *
 * Never prints secrets, env vars, tokens, PII, or raw payloads. All
 * inputs come from either the local filesystem or explicitly-passed
 * BUILD_SUMMARY_* environment variables.
 *
 * Env inputs (all optional; unknowns render as `unknown` / `skipped`):
 *   OUT_DIR                    — output directory (default: artifacts/build-summary)
 *   GITHUB_SHA / GITHUB_REF_NAME / GITHUB_ACTOR / GITHUB_RUN_ID / GITHUB_SERVER_URL / GITHUB_REPOSITORY
 *   BUILD_SUMMARY_VALIDATORS   — JSON array: [{ name, result: "pass"|"fail"|"skipped", detail? }]
 *   BUILD_SUMMARY_TRIGGER      — freeform label (e.g. "pull_request", "push", "local")
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT_DIR = resolve(process.env.OUT_DIR ?? "artifacts/build-summary");
mkdirSync(OUT_DIR, { recursive: true });

function safe(fn, fallback = "unknown") {
  try {
    const v = fn();
    return v == null || v === "" ? fallback : v;
  } catch {
    return fallback;
  }
}

const sha = process.env.GITHUB_SHA ?? safe(() => execSync("git rev-parse HEAD").toString().trim());
const shortSha = sha === "unknown" ? "unknown" : sha.slice(0, 12);
const ref = process.env.GITHUB_REF_NAME ?? safe(() => execSync("git rev-parse --abbrev-ref HEAD").toString().trim());
const actor = process.env.GITHUB_ACTOR ?? "local";
const trigger = process.env.BUILD_SUMMARY_TRIGGER ?? (process.env.GITHUB_EVENT_NAME ?? "local");
const runUrl =
  process.env.GITHUB_RUN_ID && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

// Edge-shared drift: re-check at summary time so the artifact is
// independently trustworthy. Never throws — records the verdict.
let edgeShared = { status: "unknown", detail: "" };
try {
  execSync("node scripts/verify-edge-shared-in-sync.mjs --check-only", {
    stdio: ["ignore", "pipe", "pipe"],
  });
  edgeShared = { status: "in-sync", detail: "verify-edge-shared-in-sync.mjs --check-only passed" };
} catch (err) {
  edgeShared = {
    status: "drift",
    detail: (err?.stderr?.toString() || err?.stdout?.toString() || err?.message || "drift detected").slice(0, 2000),
  };
}

// Validator results: opt-in via BUILD_SUMMARY_VALIDATORS JSON so any
// stage can register its outcome without this script hard-coding them.
let validators = [];
if (process.env.BUILD_SUMMARY_VALIDATORS) {
  try {
    const parsed = JSON.parse(process.env.BUILD_SUMMARY_VALIDATORS);
    if (Array.isArray(parsed)) {
      validators = parsed
        .filter((v) => v && typeof v.name === "string")
        .map((v) => ({
          name: String(v.name),
          result: ["pass", "fail", "skipped"].includes(v.result) ? v.result : "unknown",
          detail: v.detail ? String(v.detail).slice(0, 500) : "",
        }));
    }
  } catch {
    validators = [{ name: "BUILD_SUMMARY_VALIDATORS", result: "unknown", detail: "invalid JSON — ignored" }];
  }
}

// dist size (informational). Skipped silently if dist/ absent.
function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(p);
    else total += statSync(p).size;
  }
  return total;
}
let distBytes = null;
try {
  distBytes = dirSizeBytes(resolve("dist"));
} catch {
  distBytes = null;
}

const summary = {
  generatedAt: new Date().toISOString(),
  trigger,
  commit: { sha, shortSha, ref, actor, runUrl },
  runtime: {
    node: process.version,
    bun: safe(() => execSync("bun --version").toString().trim(), "not-installed"),
  },
  edgeShared,
  validators,
  build: {
    distBytes,
    distMegabytes: distBytes == null ? null : +(distBytes / (1024 * 1024)).toFixed(2),
  },
};

const overallFail =
  edgeShared.status === "drift" || validators.some((v) => v.result === "fail");
summary.overall = overallFail ? "fail" : "pass";

writeFileSync(join(OUT_DIR, "build-summary.json"), JSON.stringify(summary, null, 2));

const validatorRows = validators.length
  ? validators
      .map((v) => `| ${v.name} | \`${v.result}\` | ${v.detail || ""} |`)
      .join("\n")
  : "| _none provided_ | | |";

const md = `# Build summary

**Overall:** \`${summary.overall}\`
**Generated:** ${summary.generatedAt}
**Trigger:** \`${trigger}\`

## Commit
- SHA: \`${sha}\`
- Short: \`${shortSha}\`
- Ref: \`${ref}\`
- Actor: \`${actor}\`
${runUrl ? `- Workflow run: ${runUrl}` : ""}

## Runtime
- Node: \`${summary.runtime.node}\`
- Bun: \`${summary.runtime.bun}\`

## Edge-shared mirror
- Status: \`${edgeShared.status}\`
${edgeShared.detail ? `- Detail: \`\`\`\n${edgeShared.detail}\n\`\`\`` : ""}

## Validators
| Name | Result | Detail |
|------|--------|--------|
${validatorRows}

## Build output
- dist size: ${summary.build.distMegabytes == null ? "_not built_" : `${summary.build.distMegabytes} MB`}
`;

writeFileSync(join(OUT_DIR, "build-summary.md"), md);

console.log(`Build summary written to ${OUT_DIR}/build-summary.{json,md} — overall: ${summary.overall}`);
// Informational only — never fails the build. Upstream steps own their own gates.
process.exit(0);
