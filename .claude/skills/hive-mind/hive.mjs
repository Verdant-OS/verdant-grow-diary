#!/usr/bin/env node
// hive.mjs — Verdant hive-mind driver.
// Fuses every coordination surface (worktrees, branches, canonical shift report,
// open PRs) into one SITREP and derives a deterministic, ranked decision queue.
//
// Usage:
//   node .claude/skills/hive-mind/hive.mjs            # human SITREP
//   node .claude/skills/hive-mind/hive.mjs --json     # machine-readable
//   node .claude/skills/hive-mind/hive.mjs --fetch    # git fetch origin first
//   HIVE_NOW=2026-08-12T00:00:00Z ...                 # injectable clock (tests)
//
// Read-only by design: never writes, commits, pushes, or touches other agents'
// worktrees beyond `git status` reads. Sensor, not controller.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const DEPLOY_REF = "origin/verdant-grow-diary";
const MAIN_REF = "origin/main";
const STATE_PATH = "docs/agents/CURRENT_STATE.md";
const STALE_DAYS = 7;
const NOW = process.env.HIVE_NOW ? new Date(process.env.HIVE_NOW) : new Date();

const argv = process.argv.slice(2);
const JSON_MODE = argv.includes("--json");
const DO_FETCH = argv.includes("--fetch");

function git(args, opts = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    }).trimEnd();
  } catch (e) {
    if (opts.soft) return null;
    throw e;
  }
}

function softGit(args, opts = {}) {
  return git(args, { ...opts, soft: true });
}

// ---------------------------------------------------------------- gather

if (DO_FETCH) softGit(["fetch", "origin", "--quiet"]);

const repoRoot = git(["rev-parse", "--show-toplevel"]);
const here = {
  path: repoRoot,
  branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  head: git(["rev-parse", "--short", "HEAD"]),
  dirty: git(["status", "--porcelain"]) !== "",
};

// Branch topology truth: which ref actually ships.
const mainVsDeploy = (softGit([
  "rev-list", "--left-right", "--count", `${MAIN_REF}...${DEPLOY_REF}`,
]) ?? "? ?").split(/\s+/).map(Number);
const topology = {
  deployRef: DEPLOY_REF,
  mainOnlyCommits: mainVsDeploy[0],
  deployOnlyCommits: mainVsDeploy[1],
};

// Worktree census.
function parseWorktrees(porcelain) {
  const out = [];
  let cur = null;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur) out.push(cur);
      cur = { path: line.slice(9), branch: null, head: null, detached: false };
    } else if (line.startsWith("HEAD ")) cur.head = line.slice(5, 14);
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace("refs/heads/", "");
    else if (line === "detached") cur.detached = true;
  }
  if (cur) out.push(cur);
  return out;
}

function agentOf(wt) {
  const p = wt.path.toLowerCase();
  const b = (wt.branch ?? "").toLowerCase();
  if (p.includes("/.codex/") || b.startsWith("codex/")) return "codex";
  if (p.includes("/.claude/") || b.startsWith("claude/")) return "claude";
  if (b.startsWith("agent/")) return "gpt";
  return "other";
}

const worktrees = parseWorktrees(git(["worktree", "list", "--porcelain"])).map((wt) => {
  const enriched = { ...wt, agent: agentOf(wt), missing: !existsSync(wt.path) };
  if (wt.head) {
    const lr = softGit([
      "rev-list", "--left-right", "--count", `${DEPLOY_REF}...${wt.head}`,
    ]);
    if (lr) {
      const [behind, ahead] = lr.split(/\s+/).map(Number);
      enriched.aheadOfDeploy = ahead;
      enriched.behindDeploy = behind;
      enriched.mergedIntoDeploy = ahead === 0;
    }
    if (wt.branch) {
      enriched.pushed = softGit(["rev-parse", "--verify", "--quiet", `origin/${wt.branch}`]) !== null;
    }
  }
  return enriched;
});
// Stable order: agent, then path (explicit tie-breakers, no Map iteration luck).
worktrees.sort((a, b) => a.agent.localeCompare(b.agent) || a.path.localeCompare(b.path));

// Canonical shift report — from the DEPLOY branch, never the local copy.
const canonicalState = softGit(["show", `${DEPLOY_REF}:${STATE_PATH}`]);
const localStateBlob = softGit(["hash-object", `${repoRoot}/${STATE_PATH}`]);
const canonicalStateBlob = softGit(["rev-parse", `${DEPLOY_REF}:${STATE_PATH}`]);
const stateInSync = !!localStateBlob && localStateBlob === canonicalStateBlob;

function parseState(md) {
  if (!md) return { status: "BLOCKED", reason: `could not read ${DEPLOY_REF}:${STATE_PATH}` };
  const updatedMatch = md.match(/\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  const lastUpdated = updatedMatch ? updatedMatch[1] : null;
  const ageDays = lastUpdated
    ? Math.floor((NOW - new Date(`${lastUpdated}T00:00:00Z`)) / 86_400_000)
    : null;

  // Prefix-matched, NO multiline flag: with /m a lazy [\s\S]*? stops at the
  // first blank line's `$` and every section silently parses empty.
  const section = (titlePrefix) => {
    const m = md.match(new RegExp(`(?:^|\\n)## ${titlePrefix}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`));
    return m ? m[1] : "";
  };

  const clip = (s, n = 160) => {
    const one = s.replace(/\s+/g, " ").trim();
    return one.length > n ? `${one.slice(0, n - 1)}…` : one;
  };

  // Blockers: table rows (old shape) or numbered prose items (current shape).
  const blockersMd = section("Known blockers");
  const blockers = [];
  for (const row of blockersMd.split("\n")) {
    const m = row.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (m) blockers.push({ n: Number(m[1]), blocker: clip(m[2]), owner: m[3].replace(/\*/g, "").trim(), resolved: false });
  }
  if (blockers.length === 0) {
    let cur = null;
    for (const line of blockersMd.split("\n")) {
      const m = line.match(/^(\d+)\.\s+(.*)$/);
      if (m) {
        if (cur) blockers.push(cur);
        cur = { n: Number(m[1]), text: m[2] };
      } else if (cur && /^\s+\S/.test(line)) cur.text += ` ${line.trim()}`;
      else if (cur && line.trim() === "") { blockers.push(cur); cur = null; }
    }
    if (cur) blockers.push(cur);
    for (const b of blockers) {
      b.resolved = /\bRESOLVED\b/.test(b.text);
      b.owner = /\bowner must\b/i.test(b.text) ? "Cheek (owner)" : "agents";
      b.blocker = clip(b.text);
      delete b.text;
    }
  }

  // Slice: numbered list (old "Next approved slice") or bold-labeled prose
  // (current "Current approved slices").
  const slice = [];
  for (const line of section("Next approved slice").split("\n")) {
    const m = line.match(/^(\d+)\.\s+(.*)$/);
    if (m) slice.push({ n: m[1], label: `step ${m[1]}`, step: clip(m[2]) });
  }
  if (slice.length === 0) {
    const labeled = section("Current approved slices").matchAll(/\*\*([^*]+):\*\*\s*([\s\S]*?)(?=\n\s*\n|\n\*\*|$)/g);
    for (const m of labeled) slice.push({ label: m[1].trim(), step: clip(m[2]) });
  }

  const assignments = [];
  for (const row of section("Agents currently assigned").split("\n")) {
    const m = row.match(/^\|\s*([A-Za-z][A-Za-z ]*?)\s*\|\s*([^|]+?)\s*\|/);
    if (m && m[1] !== "Agent") assignments.push({ agent: m[1], status: m[2] });
  }

  return { status: "PASS", lastUpdated, ageDays, blockers, slice, assignments };
}
const state = parseState(canonicalState);

// Open PRs — best effort. gh here is unauthenticated by default; borrow the
// credential-manager token. BLOCKED is a valid answer, never invented data.
function fetchPrs() {
  try {
    const cred = execFileSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\n\n",
      encoding: "utf8",
    });
    const token = (cred.match(/^password=(.+)$/m) ?? [])[1];
    if (!token) return { status: "BLOCKED", reason: "no credential-manager token" };
    const raw = execFileSync(
      "gh",
      ["pr", "list", "--limit", "40", "--json", "number,title,headRefName,isDraft,author"],
      { encoding: "utf8", env: { ...process.env, GH_TOKEN: token }, timeout: 30_000 },
    );
    const prs = JSON.parse(raw)
      .map((p) => ({
        number: p.number,
        title: p.title,
        branch: p.headRefName,
        draft: p.isDraft,
        author: p.author?.login ?? "?",
      }))
      .sort((a, b) => a.number - b.number);
    return { status: "PASS", prs };
  } catch (e) {
    return { status: "BLOCKED", reason: String(e.message ?? e).split("\n")[0] };
  }
}
const prReport = fetchPrs();

// ---------------------------------------------------------------- decide
// Deterministic rules engine: same state in, same ranked queue out.
// Rank bands: 0 safety-of-information, 1 owner-blockers, 2 approved slice,
// 3 shipping hygiene, 4 housekeeping.

const decisions = [];
const add = (band, id, decision, why) => decisions.push({ band, id, decision, why });

if (state.status === "BLOCKED") {
  add(0, "state-unreadable", `Restore access to ${DEPLOY_REF}:${STATE_PATH}`,
    "Every agent is required to read the shift report before acting; the hive is blind without it.");
} else {
  if (!stateInSync)
    add(0, "state-drift", "Treat the local CURRENT_STATE.md as stale — act on the deploy-branch copy shown here",
      "Local blob differs from the canonical deploy-branch blob; worktrees branch from stale main.");
  if (state.ageDays !== null && state.ageDays > STALE_DAYS)
    add(0, "state-old", `Verify and refresh the shift report (last updated ${state.lastUpdated}, ${state.ageDays}d ago)`,
      `Older than the ${STALE_DAYS}-day trust window; AGENTS.md says update it rather than work from it.`);
  for (const b of (state.blockers ?? []).filter((b) => !b.resolved))
    add(b.owner.includes("Cheek") ? 1 : 2, `blocker-${String(b.n).padStart(2, "0")}`,
      `${b.owner.includes("Cheek") ? "Owner action" : "Agent action"}: clear blocker #${b.n}`,
      b.blocker);
  const active = (state.slice ?? []).find((s) => /active|mandatory|next/i.test(s.label)) ?? state.slice?.[0];
  if (active)
    add(2, "slice-next", `Advance the approved slice — ${active.label}`,
      active.step);
}

const unpushed = worktrees.filter((w) => w.branch && w.pushed === false && !w.mergedIntoDeploy);
if (unpushed.length) {
  const names = unpushed.map((w) => w.branch);
  const shown = names.slice(0, 6).join(", ") + (names.length > 6 ? `, … ${names.length - 6} more (see --json)` : "");
  add(3, "unpushed", `Push or explicitly archive ${unpushed.length} never-pushed worktree branch(es): ${shown}`,
    "Work that exists on one machine only is invisible to the hive and unrecoverable if the disk dies.");
}

const pruneable = worktrees.filter((w) => w.mergedIntoDeploy && w.path !== repoRoot);
if (pruneable.length >= 5)
  add(4, "prune", `Prune ${pruneable.length} worktrees already fully merged into ${DEPLOY_REF}`,
    "Merged worktrees are dead weight and make the census noisy. Confirm with each owner before removing.");

if (prReport.status === "BLOCKED")
  add(4, "prs-blocked", "Restore gh auth to see open PRs (git credential fill → GH_TOKEN)",
    `PR visibility is BLOCKED: ${prReport.reason}`);

decisions.sort((a, b) => a.band - b.band || a.id.localeCompare(b.id));
const horizon = decisions.slice(0, 5);

// ---------------------------------------------------------------- report

const byAgent = {};
for (const w of worktrees) byAgent[w.agent] = (byAgent[w.agent] ?? 0) + 1;

const result = {
  generatedAt: NOW.toISOString(),
  you: here,
  topology,
  census: { total: worktrees.length, byAgent, worktrees },
  shiftReport: { ...state, localCopyInSync: stateInSync },
  pullRequests: prReport,
  decisionQueue: decisions,
};

if (JSON_MODE) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s ?? "").padEnd(n);
console.log(`HIVE SITREP — ${NOW.toISOString().slice(0, 16)}Z`);
console.log(`you: ${here.branch} @ ${here.head}${here.dirty ? " (dirty)" : " (clean)"}`);
console.log(`truth ref: ${DEPLOY_REF}  (main is ${topology.deployOnlyCommits} commits behind it — never audit main)`);
console.log("");
console.log(`census: ${worktrees.length} worktrees  ${Object.entries(byAgent).map(([a, n]) => `${a}:${n}`).join("  ")}`);
const interesting = worktrees.filter((w) => !w.mergedIntoDeploy && w.path !== repoRoot);
console.log(`in-flight (not merged into deploy): ${interesting.length}`);
for (const w of interesting) {
  console.log(`  ${pad(w.agent, 7)} ${pad(w.branch ?? `(detached ${w.head})`, 52)} +${w.aheadOfDeploy ?? "?"}${w.pushed === false ? "  UNPUSHED" : ""}`);
}
console.log("");
if (state.status === "PASS") {
  console.log(`shift report: ${state.lastUpdated} (${state.ageDays}d old)  local copy in sync: ${stateInSync ? "yes" : "NO — stale"}`);
  for (const a of state.assignments) console.log(`  ${pad(a.agent, 7)} ${a.status}`);
} else {
  console.log(`shift report: BLOCKED — ${state.reason}`);
}
console.log("");
if (prReport.status === "PASS") {
  console.log(`open PRs: ${prReport.prs.length}`);
  for (const p of prReport.prs) console.log(`  #${pad(p.number, 5)} ${p.draft ? "[draft] " : ""}${p.title}`);
} else {
  console.log(`open PRs: BLOCKED — ${prReport.reason}`);
}
console.log("");
console.log("DECISION QUEUE (next few, ranked — the lookahead):");
horizon.forEach((d, i) => {
  console.log(`  ${i + 1}. ${d.decision}`);
  console.log(`     why: ${d.why}`);
});
if (decisions.length > horizon.length)
  console.log(`  … ${decisions.length - horizon.length} more in --json output`);
