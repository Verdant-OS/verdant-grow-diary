#!/usr/bin/env node
/**
 * scripts/ci/pr-file-overlap-audit.mjs
 *
 * Read-only audit of which open PRs touch the same files. Replaces the by-hand
 * "re-list open PRs before any collision claim" step in CURRENT_STATE.md with a
 * reproducible artifact. Calls GitHub via `gh` CLI only; never comments, labels,
 * assigns, merges, or edits any PR.
 *
 * Usage:
 *   node scripts/ci/pr-file-overlap-audit.mjs
 *   node scripts/ci/pr-file-overlap-audit.mjs --json
 *   node scripts/ci/pr-file-overlap-audit.mjs --json-out out.json --text-out out.txt
 *   node scripts/ci/pr-file-overlap-audit.mjs --fail-on-hot
 *
 * Env:
 *   GITHUB_REPOSITORY        owner/name (default Verdant-OS/verdant-grow-diary)
 *   PR_OVERLAP_BASE_BRANCH   only PRs targeting this base (default verdant-grow-diary)
 *   PR_OVERLAP_MAX_PRS       cap on PRs fetched (default 100)
 *
 * Exit codes:
 *   0  audit ok
 *   2  gh/network/parse failure
 *   4  --fail-on-hot and at least one hot-path collision was found
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const REPO = process.env.GITHUB_REPOSITORY || "Verdant-OS/verdant-grow-diary";
const BASE = process.env.PR_OVERLAP_BASE_BRANCH || "verdant-grow-diary";
const MAX_PRS = Number(process.env.PR_OVERLAP_MAX_PRS || "100");

/**
 * Hot paths named in the collision brief. A file matches a hot path when it
 * starts with the prefix or contains the substring (case-sensitive).
 * Kept as data so the list is reviewable without reading logic.
 */
export const HOT_PATHS = [
  {
    key: "architecture-docs",
    prefixes: ["docs/architecture/", "docs/agents/"],
    contains: ["ARCHITECTURE", "CURRENT_STATE"],
  },
  {
    key: "ci-runners",
    prefixes: [".github/workflows/", ".github/actions/", "scripts/ci/"],
    contains: [],
  },
  {
    key: "signup-migration-hardening",
    prefixes: ["supabase/migrations/"],
    contains: ["signup", "auth"],
  },
  {
    key: "quick-log",
    prefixes: ["src/lib/quicklog/", "src/lib/quick-log/"],
    contains: ["quicklog", "quick-log", "remembered"],
  },
  {
    key: "billing",
    prefixes: ["src/lib/entitlements/", "src/lib/billing/"],
    contains: ["billing", "entitlement", "paddle"],
  },
];

/** @param {string[]} ghArgs */
export function runGh(ghArgs, { timeoutMs = 60_000 } = {}) {
  const r = spawnSync("gh", ghArgs, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0)
    throw new Error((r.stderr || r.stdout || "").trim() || `gh exited ${r.status}`);
  return (r.stdout || "").trim();
}

/**
 * Classify a path against HOT_PATHS. Deterministic; returns [] for null/empty.
 * @param {string | null | undefined} file
 * @returns {string[]} hot-path keys, in HOT_PATHS order
 */
export function classifyHotPaths(file) {
  if (typeof file !== "string" || file.length === 0) return [];
  const keys = [];
  for (const hp of HOT_PATHS) {
    const byPrefix = hp.prefixes.some((p) => file.startsWith(p));
    const bySub = hp.contains.some((s) => file.includes(s));
    if (byPrefix || bySub) keys.push(hp.key);
  }
  return keys;
}

/**
 * Pure overlap computation.
 * @param {Array<{number:number, title?:string, isDraft?:boolean, headRefName?:string, files:string[]}>} prs
 * @returns {{
 *   generated_at: string,
 *   pr_count: number,
 *   overlapping_pairs: Array<{a:number,b:number,shared:string[],hot:string[]}>,
 *   files_by_pr_count: Array<{file:string,prs:number[],hot:string[]}>,
 *   hot_collisions: Array<{a:number,b:number,shared:string[],hot:string[]}>,
 *   prs: Array<{number:number,title:string,isDraft:boolean,head:string,file_count:number}>
 * }}
 */
export function computeOverlaps(prs, now = new Date()) {
  const safe = Array.isArray(prs) ? prs.filter((p) => p && Number.isFinite(Number(p.number))) : [];
  /** @type {Map<string, Set<number>>} */
  const fileToPrs = new Map();
  for (const p of safe) {
    const files = Array.isArray(p.files) ? p.files : [];
    for (const f of files) {
      if (typeof f !== "string" || !f) continue;
      if (!fileToPrs.has(f)) fileToPrs.set(f, new Set());
      fileToPrs.get(f).add(Number(p.number));
    }
  }

  /** @type {Map<string, {a:number,b:number,shared:string[]}>} */
  const pairs = new Map();
  for (const [file, set] of fileToPrs) {
    const nums = [...set].sort((x, y) => x - y);
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${nums[i]}:${nums[j]}`;
        if (!pairs.has(key)) pairs.set(key, { a: nums[i], b: nums[j], shared: [] });
        pairs.get(key).shared.push(file);
      }
    }
  }

  const overlapping_pairs = [...pairs.values()]
    .map((pr) => {
      const shared = [...pr.shared].sort();
      const hot = [...new Set(shared.flatMap(classifyHotPaths))];
      return { a: pr.a, b: pr.b, shared, hot };
    })
    .sort((x, y) => y.shared.length - x.shared.length || x.a - y.a || x.b - y.b);

  const files_by_pr_count = [...fileToPrs]
    .filter(([, set]) => set.size > 1)
    .map(([file, set]) => ({
      file,
      prs: [...set].sort((x, y) => x - y),
      hot: classifyHotPaths(file),
    }))
    .sort((x, y) => y.prs.length - x.prs.length || x.file.localeCompare(y.file));

  return {
    generated_at: now.toISOString(),
    pr_count: safe.length,
    overlapping_pairs,
    files_by_pr_count,
    hot_collisions: overlapping_pairs.filter((p) => p.hot.length > 0),
    prs: safe
      .map((p) => ({
        number: Number(p.number),
        title: String(p.title ?? ""),
        isDraft: Boolean(p.isDraft),
        head: String(p.headRefName ?? ""),
        file_count: Array.isArray(p.files) ? p.files.length : 0,
      }))
      .sort((x, y) => x.number - y.number),
  };
}

/** @param {ReturnType<typeof computeOverlaps>} report */
export function renderText(report) {
  const L = [];
  L.push(`PR file-overlap audit — ${REPO} (base: ${BASE})`);
  L.push(`generated: ${report.generated_at}`);
  L.push(`open PRs audited: ${report.pr_count}`);
  L.push(`overlapping pairs: ${report.overlapping_pairs.length}`);
  L.push(`hot-path collisions: ${report.hot_collisions.length}`);
  L.push("");
  if (report.hot_collisions.length) {
    L.push("HOT-PATH COLLISIONS (review before claiming a slice):");
    for (const p of report.hot_collisions) {
      L.push(`  #${p.a} <-> #${p.b}  [${p.hot.join(", ")}]  ${p.shared.length} shared file(s)`);
      for (const f of p.shared.slice(0, 8)) L.push(`      ${f}`);
      if (p.shared.length > 8) L.push(`      … +${p.shared.length - 8} more`);
    }
    L.push("");
  }
  L.push("FILES TOUCHED BY >1 OPEN PR (top 25):");
  for (const f of report.files_by_pr_count.slice(0, 25)) {
    L.push(
      `  ${f.prs.length}x  ${f.file}  (#${f.prs.join(", #")})${f.hot.length ? `  [${f.hot.join(", ")}]` : ""}`,
    );
  }
  if (!report.files_by_pr_count.length) L.push("  none");
  L.push("");
  L.push("This report is read-only evidence. It does not decide ownership; OWNERSHIP.md does.");
  return L.join("\n");
}

function fetchOpenPrs() {
  // REST only (no `gh pr list`, which uses GraphQL): works with github.token in
  // Actions and with restricted agent-session tokens alike.
  const listRaw = runGh([
    "api",
    "--paginate",
    `repos/${REPO}/pulls?state=open&base=${encodeURIComponent(BASE)}&per_page=100`,
    "--jq",
    ".[] | {number, title, isDraft: .draft, headRefName: .head.ref}",
  ]);
  const list = listRaw
    ? listRaw
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .slice(0, MAX_PRS)
    : [];
  return list.map((p) => {
    const filesRaw = runGh([
      "api",
      "--paginate",
      `repos/${REPO}/pulls/${p.number}/files`,
      "--jq",
      ".[].filename",
    ]);
    const files = filesRaw ? filesRaw.split("\n").filter(Boolean) : [];
    return { ...p, files };
  });
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };

  let report;
  try {
    report = computeOverlaps(fetchOpenPrs());
  } catch (e) {
    console.error(`pr-file-overlap-audit: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  const text = renderText(report);
  const jsonOut = opt("--json-out");
  const textOut = opt("--text-out");
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n");
  if (textOut) writeFileSync(textOut, text + "\n");
  console.log(flag("--json") ? JSON.stringify(report, null, 2) : text);
  if (flag("--fail-on-hot") && report.hot_collisions.length > 0) process.exit(4);
}

if (process.argv[1] && /pr-file-overlap-audit\.mjs$/.test(process.argv[1])) main();
