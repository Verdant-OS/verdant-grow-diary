#!/usr/bin/env node
/**
 * Asserts the batched Vitest workflow is configured safely:
 *  - manual dispatch, full 16-job matrix, batches=16 guard,
 *  - runner invoked with --chunk-size=1 (+ round-robin/isolate/forks),
 *  - 4 GB heap cap, all safety gates present,
 *  - no deploy/publish/Supabase-migration commands.
 *
 * Pure-text audit (Node built-ins only) so it runs identically in CI and tests.
 * Exported `auditWorkflow(text)` is reused by the test suite; the CLI reads the
 * workflow file and exits nonzero with clear messages on any violation.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WORKFLOW_PATH = ".github/workflows/vitest-batched-full-suite.yml";

const REQUIRED_GATES = [
  "bun run typecheck",
  "node scripts/sensor-safety-check.mjs",
  "node scripts/assert-sensor-intelligence-safety.mjs --quiet",
  "bun run test:docs-demo-safety",
  "node scripts/test-vitest-batch-utils.mjs",
];

// Deploy/publish/migration commands that must NOT appear in a read-only CI gate.
const FORBIDDEN = [
  /npm\s+publish/,
  /bun\s+publish/,
  /yarn\s+publish/,
  /supabase\s+functions\s+deploy/,
  /supabase\s+db\s+push/,
  /supabase\s+migration\s+up/,
  /vercel\s+(deploy|--prod)/,
  /netlify\s+deploy/,
  /gh\s+release\s+create/,
];

/**
 * @param {string} text raw workflow YAML
 * @returns {{ok:boolean, errors:string[], checks:{name:string,ok:boolean}[]}}
 */
export function auditWorkflow(text) {
  const errors = [];
  const checks = [];
  const check = (name, ok, msg) => {
    checks.push({ name, ok });
    if (!ok) errors.push(msg || name);
  };

  check("workflow_dispatch present", /workflow_dispatch\s*:/.test(text), "Missing workflow_dispatch trigger.");

  // Matrix must list all 16 indices 0..15.
  const matrixMatch = text.match(/batch\s*:\s*\[([^\]]*)\]/);
  let matrixOk = false;
  if (matrixMatch) {
    const nums = matrixMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length)
      .map((s) => Number(s));
    const set = new Set(nums);
    matrixOk = nums.length === 16 && [...Array(16).keys()].every((i) => set.has(i));
  }
  check(
    "matrix runs all 16 batches [0..15]",
    matrixOk,
    `Matrix must list exactly batches 0..15 (found: ${matrixMatch ? matrixMatch[1].trim() : "none"}).`,
  );

  // batches=16 guard: a step that fails when inputs.batches != "16".
  const hasGuard = /inputs\.batches\s*\}\}["']?\s*!=\s*["']?16/.test(text) ||
    /!=\s*["']?16["']?\s*\]/.test(text);
  check("batches=16 guard present", hasGuard, "Missing guard that fails when batches != 16.");

  // Runner invocation flags.
  check(
    "runner passes --batches (inputs.batches or 16) with guard",
    (/--batches=\$\{\{\s*inputs\.batches\s*\}\}/.test(text) || /--batches=16\b/.test(text)) && hasGuard,
    "Runner must pass --batches=${{ inputs.batches }} (with the batches=16 guard) or --batches=16.",
  );
  check("runner uses --strategy=round-robin", /--strategy=round-robin\b/.test(text), "Missing --strategy=round-robin.");

  const chunkMatch = text.match(/--chunk-size=(\d+)/);
  check(
    "runner uses --chunk-size=1",
    !!chunkMatch && chunkMatch[1] === "1",
    `--chunk-size must be 1 (found: ${chunkMatch ? chunkMatch[1] : "none"}).`,
  );
  check("runner uses --isolate", /--isolate\b/.test(text), "Missing --isolate.");
  check("runner uses --pool=forks", /--pool=forks\b/.test(text), "Missing --pool=forks.");

  check(
    "NODE_OPTIONS heap cap 4096",
    /NODE_OPTIONS\s*:\s*--max-old-space-size=4096\b/.test(text),
    "Missing NODE_OPTIONS=--max-old-space-size=4096.",
  );

  for (const gate of REQUIRED_GATES) {
    check(`safety gate present: ${gate}`, text.includes(gate), `Missing required safety gate: ${gate}`);
  }

  for (const pat of FORBIDDEN) {
    const m = text.match(pat);
    check(`no deploy/publish/migration command (${pat.source})`, !m, `Forbidden command present: ${m ? m[0] : pat.source}`);
  }

  return { ok: errors.length === 0, errors, checks };
}

function main() {
  let text;
  try {
    text = readFileSync(resolve(process.cwd(), WORKFLOW_PATH), "utf8");
  } catch {
    console.error(`✗ Cannot read ${WORKFLOW_PATH}`);
    process.exit(2);
  }
  const { ok, errors, checks } = auditWorkflow(text);
  for (const c of checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
  if (!ok) {
    console.error(`\n✗ Batched workflow safety check failed (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`\n✓ Batched workflow safety check passed (${checks.length} invariants).`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
