#!/usr/bin/env node
/**
 * Download + validate the Client Secret Boundary CI proof artifacts.
 *
 * Behavior:
 *   - Uses `gh` to find the latest successful runs of ci.yml and
 *     docs-safety.yml on the given branch (or honors explicit --ci-run-id /
 *     --docs-run-id).
 *   - Downloads the two trusted proof artifacts:
 *       client-secret-boundary-proof-ci
 *       client-secret-boundary-proof-docs-safety
 *   - Validates the fixed, non-secret marker contents of each proof file.
 *   - Validates that no contamination (raw logs, JWTs, Bearer tokens,
 *     bridge-secret column names, env-dump assignments) leaked into the proof.
 *   - Prints ONLY a short sanitized summary. Never prints proof bodies,
 *     logs, env, or secrets.
 *
 * Exit 0 iff both artifacts present, downloaded, and valid.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const DEFAULT_REPO = "Verdant-OS/verdant-grow-diary";
export const DEFAULT_BRANCH = "verdant-grow-diary";
export const DEFAULT_OUT_DIR = "artifacts/client-secret-boundary-proof-check";

export const ARTIFACTS = [
  { workflow: "ci.yml", artifact: "client-secret-boundary-proof-ci", subdir: "ci" },
  {
    workflow: "docs-safety.yml",
    artifact: "client-secret-boundary-proof-docs-safety",
    subdir: "docs-safety",
  },
];

export const REQUIRED_MARKERS = [
  "Client secret boundary guard: PASS",
  "Command: bun run test:client-secret-boundary",
  "Scanned client roots: src/components, src/pages, src/hooks, src/lib",
  "Blocked executable-code terms: SUPABASE_SERVICE_ROLE_KEY, service_role",
  "Secrets printed: no",
  "Raw logs uploaded: no",
];

/**
 * Patterns that must NEVER appear in a proof file body.
 *
 * Notes:
 *   - We allow the literal phrases "SUPABASE_SERVICE_ROLE_KEY" and
 *     "service_role" because the proof file names them as blocked terms.
 *     We forbid assignment forms (=value) instead.
 */
export const FORBIDDEN_PATTERNS = [
  { name: "JWT-shaped token", re: /eyJ[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}/ },
  { name: "Bearer token", re: /Bearer\s+\S+/i },
  { name: "service_role assignment", re: /service_role\s*[:=]\s*\S+/i },
  { name: "SUPABASE_SERVICE_ROLE_KEY assignment", re: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*\S+/ },
  { name: "secret_ciphertext column", re: /secret_ciphertext/i },
  { name: "secret_nonce column", re: /secret_nonce/i },
  { name: "secret_hash column", re: /secret_hash/i },
  { name: "token_hash column", re: /token_hash/i },
  // Raw log fragments
  { name: "GitHub Actions log timestamp", re: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/ },
  { name: "GitHub Actions group marker", re: /##\[(group|endgroup|debug|error|warning|command)\]/ },
  { name: "env dump pipe", re: /\benv\s*\|/ },
  { name: "add-mask directive", re: /::add-mask::/ },
];

export function parseArgs(argv) {
  const out = {
    repo: DEFAULT_REPO,
    branch: DEFAULT_BRANCH,
    outDir: DEFAULT_OUT_DIR,
    ciRunId: null,
    docsRunId: null,
  };
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "repo") out.repo = v;
    else if (k === "branch") out.branch = v;
    else if (k === "out-dir") out.outDir = v;
    else if (k === "ci-run-id") out.ciRunId = v;
    else if (k === "docs-run-id") out.docsRunId = v;
  }
  return out;
}

export function sanitizeLine(line) {
  if (typeof line !== "string") return "";
  let s = line.replace(
    /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
    "[redacted-jwt]",
  );
  s = s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  s = s.replace(/(SUPABASE_SERVICE_ROLE_KEY|service_role)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  s = s.replace(/(token|secret|key|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

/**
 * Validate proof file contents. Returns { ok, missingMarkers, contamination }.
 * NEVER includes the body text in the result — only structural booleans
 * and category labels.
 */
export function validateProofContent(text) {
  const missingMarkers = REQUIRED_MARKERS.filter((m) => !text.includes(m));
  const contamination = FORBIDDEN_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
  return {
    ok: missingMarkers.length === 0 && contamination.length === 0,
    missingMarkers,
    contamination,
  };
}

export function formatSummary(entry) {
  return [
    `workflow:      ${entry.workflow}`,
    `artifact:      ${entry.artifact}`,
    `run id:        ${entry.runId ?? "(none)"}`,
    `proof file:    ${entry.proofFileName ?? "(missing)"}`,
    `missing keys:  ${entry.missingMarkers?.length ?? "n/a"}`,
    `contamination: ${entry.contamination?.length ?? "n/a"}`,
    `result:        ${entry.pass ? "PASS" : "FAIL"}`,
  ].map(sanitizeLine);
}

function runGh(args) {
  const res = spawnSync("gh", args, { encoding: "utf8" });
  if (res.error) throw new Error(`gh CLI not available: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`gh ${args[0]} exited ${res.status}: ${sanitizeLine(res.stderr || "")}`);
  }
  return res.stdout ?? "";
}

export function findLatestSuccessRunId({ repo, branch, workflow }) {
  const out = runGh([
    "run", "list", "--repo", repo, "--workflow", workflow, "--branch", branch,
    "--status", "success", "--limit", "1",
    "--json", "databaseId",
  ]);
  const arr = JSON.parse(out);
  return Array.isArray(arr) && arr[0] ? String(arr[0].databaseId) : null;
}

export function downloadArtifact({ repo, runId, artifactName, targetDir }) {
  mkdirSync(targetDir, { recursive: true });
  runGh([
    "run", "download", String(runId), "--repo", repo,
    "--name", artifactName, "--dir", targetDir,
  ]);
}

/** Find the single .txt proof file inside a downloaded artifact dir. */
export function locateProofFile(dir) {
  if (!existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of readdirSync(cur)) {
      const p = join(cur, name);
      const st = statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (name.endsWith(".txt")) return p;
    }
  }
  return null;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  console.log("# Client Secret Boundary — Artifact verifier");
  console.log(`repo:    ${sanitizeLine(args.repo)}`);
  console.log(`branch:  ${sanitizeLine(args.branch)}`);
  console.log(`out dir: ${sanitizeLine(args.outDir)}`);
  console.log("");

  const results = [];
  for (const { workflow, artifact, subdir } of ARTIFACTS) {
    const entry = { workflow, artifact, runId: null, proofFileName: null, pass: false };
    try {
      let runId =
        workflow === "ci.yml" ? args.ciRunId :
        workflow === "docs-safety.yml" ? args.docsRunId : null;
      if (!runId) runId = findLatestSuccessRunId({ repo: args.repo, branch: args.branch, workflow });
      entry.runId = runId;
      if (!runId) throw new Error("no successful run found");

      const targetDir = resolve(args.outDir, subdir);
      downloadArtifact({ repo: args.repo, runId, artifactName: artifact, targetDir });

      const proofPath = locateProofFile(targetDir);
      if (!proofPath) throw new Error("no .txt proof file in artifact");
      entry.proofFileName = proofPath.split("/").slice(-1)[0];

      const text = readFileSync(proofPath, "utf8");
      const v = validateProofContent(text);
      entry.missingMarkers = v.missingMarkers.map((m) => m.slice(0, 40));
      entry.contamination = v.contamination;
      entry.pass = v.ok;
    } catch (err) {
      console.error(sanitizeLine(`error[${workflow}]: ${err.message}`));
    }
    results.push(entry);
    for (const line of formatSummary(entry)) console.log(line);
    console.log("");
  }

  const allPass = results.length === ARTIFACTS.length && results.every((r) => r.pass);
  console.log(`overall: ${allPass ? "PASS" : "FAIL"}`);
  return allPass ? 0 : 1;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  main().then((code) => process.exit(code));
}
