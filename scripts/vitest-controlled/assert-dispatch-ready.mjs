// Dispatch checkout guard for the controlled Vitest CI final gate.
//
// Verifies the working tree matches an exact commit + branch and is clean.
// Never mutates git state. Never fetches. Never dispatches.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const EXIT_OK = 0;
export const EXIT_NOT_READY = 2;
export const EXIT_USAGE = 64;

const SHA_RE = /^[0-9a-f]{40}$/i;

/** Pure evaluation — does not touch git. */
export function evaluateDispatchReadiness({ expectedSha, expectedBranch, actual }) {
  const reasons = [];
  if (!expectedSha || !SHA_RE.test(String(expectedSha))) {
    reasons.push({ code: "invalid_expected_sha", value: expectedSha ?? null });
  }
  if (!expectedBranch || typeof expectedBranch !== "string") {
    reasons.push({ code: "invalid_expected_branch", value: expectedBranch ?? null });
  }
  const actualSha = actual?.sha ?? null;
  const actualBranch = actual?.branch ?? null;
  const dirty = !!actual?.dirty;
  const dirtyPaths = actual?.dirtyPaths ?? [];

  if (expectedSha && actualSha && actualSha.toLowerCase() !== String(expectedSha).toLowerCase()) {
    reasons.push({ code: "sha_mismatch", expected: expectedSha, actual: actualSha });
  }
  if (expectedBranch && actualBranch && actualBranch !== expectedBranch) {
    reasons.push({
      code: "branch_mismatch",
      expected: expectedBranch,
      actual: actualBranch,
    });
  }
  if (dirty) {
    reasons.push({ code: "dirty_worktree", paths: dirtyPaths.slice(0, 50) });
  }
  return {
    ok: reasons.length === 0,
    clean: !dirty,
    expectedSha: expectedSha ?? null,
    expectedBranch: expectedBranch ?? null,
    actualSha,
    actualBranch,
    reasons,
  };
}

/** Inspect the on-disk git state read-only. */
export function inspectGitState({ repoRoot = process.cwd(), exec = execFileSync } = {}) {
  const run = (args) =>
    exec("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .replace(/\r?\n$/, "");
  let sha = null;
  let branch = null;
  let porcelain = "";
  try {
    sha = run(["rev-parse", "HEAD"]);
  } catch {
    sha = null;
  }
  try {
    branch = run(["branch", "--show-current"]) || null;
  } catch {
    branch = null;
  }
  try {
    porcelain = run(["status", "--porcelain=v1"]);
  } catch {
    porcelain = "";
  }
  const dirtyPaths = porcelain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return { sha, branch, dirty: dirtyPaths.length > 0, dirtyPaths };
}

function parseArgv(argv) {
  const out = { sha: null, branch: null, repoRoot: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sha") out.sha = argv[++i];
    else if (a === "--branch") out.branch = argv[++i];
    else if (a === "--repo-root") out.repoRoot = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

export async function main(argv, { exec = execFileSync } = {}) {
  const args = parseArgv(argv);
  if (!args.sha || !args.branch) {
    process.stderr.write("Usage: assert-dispatch-ready.mjs --sha <40-hex> --branch <name>\n");
    return EXIT_USAGE;
  }
  const actual = inspectGitState({ repoRoot: args.repoRoot, exec });
  const result = evaluateDispatchReadiness({
    expectedSha: args.sha,
    expectedBranch: args.branch,
    actual,
  });
  if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else {
    process.stdout.write(
      `ok=${result.ok} clean=${result.clean} sha=${result.actualSha ?? "?"} branch=${result.actualBranch ?? "?"}\n`,
    );
    for (const r of result.reasons) process.stdout.write(`- ${r.code}\n`);
  }
  return result.ok ? EXIT_OK : EXIT_NOT_READY;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(String(err?.stack || err) + "\n");
      process.exit(1);
    },
  );
}
