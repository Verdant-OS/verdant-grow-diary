#!/usr/bin/env node
/**
 * scripts/ci/merge-queue-snapshot.mjs
 *
 * Operator / agent snapshot of the verdant-grow-diary merge queue and open PR
 * mergeability classes. Read-only: calls GitHub via `gh` CLI only.
 *
 * Usage:
 *   node scripts/ci/merge-queue-snapshot.mjs
 *   node scripts/ci/merge-queue-snapshot.mjs --json
 *   bun run merge-queue:snapshot
 *
 * Env:
 *   GITHUB_REPOSITORY   owner/name (default Verdant-OS/verdant-grow-diary)
 *   MERGE_QUEUE_BRANCH  branch name (default verdant-grow-diary)
 *
 * Exit codes:
 *   0  snapshot printed (including empty queue)
 *   2  gh/network/parse failure
 *   3  --strict and queue depth exceeds MERGE_QUEUE_STRICT_MAX_DEPTH (default 5)
 */
import { spawnSync } from "node:child_process";

const REPO = process.env.GITHUB_REPOSITORY || "Verdant-OS/verdant-grow-diary";
const BRANCH = process.env.MERGE_QUEUE_BRANCH || "verdant-grow-diary";
const STRICT_MAX = Number(process.env.MERGE_QUEUE_STRICT_MAX_DEPTH || "5");

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const strict = args.has("--strict");

/** @param {string[]} ghArgs */
export function runGh(ghArgs, { timeoutMs = 60_000 } = {}) {
  const r = spawnSync("gh", ghArgs, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").trim() || `gh exited ${r.status}`;
    throw new Error(err);
  }
  return (r.stdout || "").trim();
}

/**
 * Classify a PR into Verdant conflict-resolution buckets.
 * @param {{ mergeable?: string|null, mergeStateStatus?: string|null, autoMergeRequest?: unknown }} pr
 */
export function classifyPr(pr) {
  const mergeable = pr.mergeable || "UNKNOWN";
  const status = pr.mergeStateStatus || "UNKNOWN";
  if (mergeable === "CONFLICTING" || status === "DIRTY") return "DIRTY";
  if (status === "BEHIND") return "BEHIND";
  if (status === "BLOCKED") return "BLOCKED";
  if (status === "UNSTABLE") return "UNSTABLE";
  if (status === "CLEAN" || (mergeable === "MERGEABLE" && status === "HAS_HOOKS")) {
    return "CLEAN";
  }
  if (mergeable === "MERGEABLE") return "MERGEABLE_OTHER";
  return "UNKNOWN";
}

/**
 * @param {Array<{ number: number, title: string, mergeable?: string, mergeStateStatus?: string, autoMergeRequest?: unknown }>} prs
 */
export function summarizeOpenPrs(prs) {
  const buckets = {
    DIRTY: [],
    BEHIND: [],
    BLOCKED: [],
    UNSTABLE: [],
    CLEAN: [],
    MERGEABLE_OTHER: [],
    UNKNOWN: [],
    AUTO_MERGE: [],
  };
  for (const p of prs) {
    const cls = classifyPr(p);
    buckets[cls].push(p);
    if (p.autoMergeRequest) buckets.AUTO_MERGE.push(p);
  }
  return buckets;
}

/**
 * @param {{ entries?: { totalCount?: number, nodes?: Array<Record<string, unknown>> }, nextEntryEstimatedTimeToMerge?: number|null }} queue
 * @param {Date} [now]
 */
export function summarizeQueue(queue, now = new Date()) {
  const nodes = queue?.entries?.nodes || [];
  const depth = queue?.entries?.totalCount ?? nodes.length;
  const nowMs = now.getTime();
  const ages = nodes
    .map((n) => {
      const enq = n.enqueuedAt ? Date.parse(String(n.enqueuedAt)) : NaN;
      if (!Number.isFinite(enq)) return null;
      return Math.round((nowMs - enq) / 1000);
    })
    .filter((x) => x !== null);
  const maxAgeSec = ages.length ? Math.max(...ages) : null;
  const medianAgeSec =
    ages.length === 0
      ? null
      : (() => {
          const s = [...ages].sort((a, b) => a - b);
          const mid = Math.floor(s.length / 2);
          return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
        })();
  return {
    depth,
    nextEntryEstimatedTimeToMerge: queue?.nextEntryEstimatedTimeToMerge ?? null,
    entries: nodes.map((n) => ({
      position: n.position,
      state: n.state,
      enqueuedAt: n.enqueuedAt,
      estimatedTimeToMerge: n.estimatedTimeToMerge,
      ageSec:
        n.enqueuedAt && Number.isFinite(Date.parse(String(n.enqueuedAt)))
          ? Math.round((nowMs - Date.parse(String(n.enqueuedAt))) / 1000)
          : null,
      prNumber: n.pullRequest?.number ?? null,
      prTitle: n.pullRequest?.title ?? null,
      prUrl: n.pullRequest?.url ?? null,
    })),
    maxAgeSec,
    medianAgeSec,
  };
}

function fetchSnapshot() {
  const [owner, name] = REPO.split("/");
  if (!owner || !name) throw new Error(`Bad GITHUB_REPOSITORY: ${REPO}`);

  const gql = `
query($owner:String!, $name:String!, $branch:String!) {
  repository(owner:$owner, name:$name) {
    mergeQueue(branch:$branch) {
      id
      url
      nextEntryEstimatedTimeToMerge
      entries(first: 30) {
        totalCount
        nodes {
          position
          enqueuedAt
          estimatedTimeToMerge
          state
          pullRequest { number title state url }
        }
      }
    }
  }
}`;

  const gqlOut = runGh([
    "api",
    "graphql",
    "-f",
    `query=${gql}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${name}`,
    "-F",
    `branch=${BRANCH}`,
  ]);
  const gqlJson = JSON.parse(gqlOut);
  if (gqlJson.errors?.length) {
    throw new Error(JSON.stringify(gqlJson.errors));
  }
  const queue = gqlJson.data?.repository?.mergeQueue || null;

  const prOut = runGh([
    "pr",
    "list",
    "--repo",
    REPO,
    "--base",
    BRANCH,
    "--state",
    "open",
    "--limit",
    "50",
    "--json",
    "number,title,mergeable,mergeStateStatus,autoMergeRequest,url,updatedAt",
  ]);
  const prs = JSON.parse(prOut || "[]");

  let ruleset = null;
  try {
    const rsOut = runGh(["api", `repos/${REPO}/rulesets`]);
    const all = JSON.parse(rsOut || "[]");
    ruleset =
      all.find((r) => /merge queue/i.test(r.name || "") && r.enforcement === "active") ||
      all.find((r) => /merge queue/i.test(r.name || "")) ||
      null;
  } catch {
    ruleset = null;
  }

  const tipOut = runGh([
    "api",
    `repos/${REPO}/commits/${BRANCH}`,
    "--jq",
    "{sha: .sha[0:7], date: .commit.committer.date, msg: .commit.message|split(\"\\n\")[0]}",
  ]);
  const tip = JSON.parse(tipOut);

  const now = new Date();
  const queueSummary = summarizeQueue(queue || { entries: { totalCount: 0, nodes: [] } }, now);
  const openSummary = summarizeOpenPrs(prs);

  return {
    capturedAt: now.toISOString(),
    repository: REPO,
    branch: BRANCH,
    tip,
    queueUrl: queue?.url || `https://github.com/${REPO}/queue/${BRANCH}`,
    ruleset: ruleset
      ? { id: ruleset.id, name: ruleset.name, enforcement: ruleset.enforcement }
      : null,
    queue: queueSummary,
    openPrs: {
      total: prs.length,
      counts: Object.fromEntries(
        Object.entries(openSummary)
          .filter(([k]) => k !== "AUTO_MERGE")
          .map(([k, v]) => [k, v.length]),
      ),
      autoMergeCount: openSummary.AUTO_MERGE.length,
      samples: Object.fromEntries(
        Object.entries(openSummary).map(([k, list]) => [
          k,
          list.slice(0, 8).map((p) => ({
            number: p.number,
            title: (p.title || "").slice(0, 72),
            mergeable: p.mergeable,
            mergeStateStatus: p.mergeStateStatus,
            url: p.url,
          })),
        ]),
      ),
    },
  };
}

function printText(snap) {
  const lines = [];
  lines.push(`MERGE_QUEUE_SNAPSHOT ${snap.capturedAt}`);
  lines.push(`repo=${snap.repository} branch=${snap.branch}`);
  lines.push(`tip=${snap.tip.sha} ${snap.tip.date} ${snap.tip.msg}`);
  if (snap.ruleset) {
    lines.push(
      `ruleset id=${snap.ruleset.id} name=${JSON.stringify(snap.ruleset.name)} enforcement=${snap.ruleset.enforcement}`,
    );
  } else {
    lines.push("ruleset=(not found via list API)");
  }
  lines.push(`queue_url=${snap.queueUrl}`);
  lines.push(
    `queue_depth=${snap.queue.depth} median_age_sec=${snap.queue.medianAgeSec ?? "n/a"} max_age_sec=${snap.queue.maxAgeSec ?? "n/a"} next_eta=${snap.queue.nextEntryEstimatedTimeToMerge ?? "n/a"}`,
  );
  if (snap.queue.entries.length) {
    lines.push("queue_entries:");
    for (const e of snap.queue.entries) {
      lines.push(
        `  #${e.prNumber} pos=${e.position} state=${e.state} age_sec=${e.ageSec ?? "n/a"} ${e.prTitle || ""}`,
      );
    }
  } else {
    lines.push("queue_entries: (empty)");
  }
  lines.push(`open_prs total=${snap.openPrs.total} auto_merge=${snap.openPrs.autoMergeCount}`);
  lines.push(
    `open_by_class ${Object.entries(snap.openPrs.counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`,
  );
  for (const cls of ["DIRTY", "BEHIND", "BLOCKED", "UNSTABLE", "CLEAN", "MERGEABLE_OTHER", "UNKNOWN"]) {
    const samples = snap.openPrs.samples[cls] || [];
    if (!samples.length) continue;
    lines.push(`${cls}:`);
    for (const s of samples) {
      lines.push(`  #${s.number} ${s.mergeStateStatus}/${s.mergeable} ${s.title}`);
    }
  }
  lines.push("");
  lines.push("disposition_hint:");
  lines.push("  DIRTY     → CONFLICT_RECONCILIATION / CLOSE_SUPERSEDED / REBASE");
  lines.push("  BEHIND    → update branch; rerun CI; never reuse old-head greens");
  lines.push("  BLOCKED   → required checks/reviews — not a content conflict");
  lines.push("  UNSTABLE  → non-required reds; may enqueue if required green");
  lines.push("  empty queue + high DIRTY → ownership/serialisation issue, not queue latency");
  process.stdout.write(lines.join("\n") + "\n");
}

function main() {
  try {
    const snap = fetchSnapshot();
    if (asJson) {
      process.stdout.write(JSON.stringify(snap, null, 2) + "\n");
    } else {
      printText(snap);
    }
    if (strict && snap.queue.depth > STRICT_MAX) {
      console.error(
        `STRICT: queue depth ${snap.queue.depth} exceeds MERGE_QUEUE_STRICT_MAX_DEPTH=${STRICT_MAX}`,
      );
      process.exit(3);
    }
    process.exit(0);
  } catch (e) {
    console.error("merge-queue-snapshot failed:", e instanceof Error ? e.message : e);
    process.exit(2);
  }
}

// Only run when executed directly (vitest can import helpers).
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("merge-queue-snapshot.mjs") ||
    process.argv[1].includes("merge-queue-snapshot"));

if (isMain) main();
