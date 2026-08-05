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
 *   node scripts/ci/merge-queue-snapshot.mjs --alert
 *   node scripts/ci/merge-queue-snapshot.mjs --alert --json
 *   bun run merge-queue:snapshot
 *   bun run merge-queue:snapshot:alert
 *
 * Env:
 *   GITHUB_REPOSITORY              owner/name (default Verdant-OS/verdant-grow-diary)
 *   MERGE_QUEUE_BRANCH             branch name (default verdant-grow-diary)
 *   MERGE_QUEUE_THRESHOLDS_PATH    path to thresholds JSON (default scripts/ci/merge-queue-thresholds.json)
 *   MERGE_QUEUE_STRICT_MAX_DEPTH   legacy --strict depth ceiling (default 5)
 *
 * Exit codes:
 *   0  snapshot ok; no critical alerts (warn-only still 0 unless --fail-on-warn)
 *   2  gh/network/parse failure
 *   3  --strict and queue depth exceeds MERGE_QUEUE_STRICT_MAX_DEPTH
 *   4  --alert and one or more critical threshold breaches
 *   5  --alert --fail-on-warn and warn (or critical) breaches
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.GITHUB_REPOSITORY || "Verdant-OS/verdant-grow-diary";
const BRANCH = process.env.MERGE_QUEUE_BRANCH || "verdant-grow-diary";
const STRICT_MAX = Number(process.env.MERGE_QUEUE_STRICT_MAX_DEPTH || "5");
const DEFAULT_THRESHOLDS_PATH = join(HERE, "merge-queue-thresholds.json");

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const strict = args.has("--strict");
const alertMode = args.has("--alert");
const failOnWarn = args.has("--fail-on-warn");

/** Built-in defaults if the JSON file is missing (kept in sync with merge-queue-thresholds.json). */
export const DEFAULT_THRESHOLDS = {
  queue_depth: { warn: 3, critical: 5 },
  max_age_sec: { warn: 1800, critical: 5400 },
  median_age_sec: { warn: 900, critical: 2700 },
  dirty_open_prs: { warn: 5, critical: 10 },
  behind_open_prs: { warn: 5, critical: 12 },
  blocked_open_prs: { warn: 8, critical: 15 },
  auto_merge_waiting: { warn: 3, critical: 6 },
};

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
 * @param {string} [path]
 */
export function loadThresholds(path = process.env.MERGE_QUEUE_THRESHOLDS_PATH || DEFAULT_THRESHOLDS_PATH) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    return { source: "defaults", path: resolved, thresholds: { ...DEFAULT_THRESHOLDS } };
  }
  const raw = JSON.parse(readFileSync(resolved, "utf8"));
  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
    if (raw[key] && typeof raw[key] === "object") {
      thresholds[key] = {
        warn: Number(raw[key].warn ?? DEFAULT_THRESHOLDS[key].warn),
        critical: Number(raw[key].critical ?? DEFAULT_THRESHOLDS[key].critical),
      };
    }
  }
  return { source: "file", path: resolved, thresholds, meta: raw };
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

/**
 * Evaluate snapshot metrics against thresholds.
 * Null metrics (e.g. empty queue ages) do not alert.
 *
 * @param {{ queue: { depth: number, maxAgeSec: number|null, medianAgeSec: number|null }, openPrs: { counts: Record<string, number>, autoMergeCount: number } }} snap
 * @param {typeof DEFAULT_THRESHOLDS} thresholds
 */
export function evaluateAlerts(snap, thresholds = DEFAULT_THRESHOLDS) {
  /** @type {Array<{ metric: string, severity: 'warn'|'critical', value: number, warn: number, critical: number, message: string }>} */
  const alerts = [];

  /** @param {string} metric @param {number|null|undefined} value @param {{warn:number, critical:number}} band */
  function check(metric, value, band) {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    const { warn, critical } = band;
    if (value >= critical) {
      alerts.push({
        metric,
        severity: "critical",
        value,
        warn,
        critical,
        message: `${metric}=${value} >= critical ${critical}`,
      });
    } else if (value >= warn) {
      alerts.push({
        metric,
        severity: "warn",
        value,
        warn,
        critical,
        message: `${metric}=${value} >= warn ${warn}`,
      });
    }
  }

  check("queue_depth", snap.queue.depth, thresholds.queue_depth);
  check("max_age_sec", snap.queue.maxAgeSec, thresholds.max_age_sec);
  check("median_age_sec", snap.queue.medianAgeSec, thresholds.median_age_sec);
  check("dirty_open_prs", snap.openPrs.counts.DIRTY ?? 0, thresholds.dirty_open_prs);
  check("behind_open_prs", snap.openPrs.counts.BEHIND ?? 0, thresholds.behind_open_prs);
  check("blocked_open_prs", snap.openPrs.counts.BLOCKED ?? 0, thresholds.blocked_open_prs);
  check("auto_merge_waiting", snap.openPrs.autoMergeCount ?? 0, thresholds.auto_merge_waiting);

  const critical = alerts.filter((a) => a.severity === "critical");
  const warn = alerts.filter((a) => a.severity === "warn");
  return {
    ok: critical.length === 0,
    warnOnly: critical.length === 0 && warn.length > 0,
    alerts,
    criticalCount: critical.length,
    warnCount: warn.length,
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
  const loaded = loadThresholds();
  const snap = {
    capturedAt: now.toISOString(),
    repository: REPO,
    branch: BRANCH,
    tip,
    queueUrl: queue?.url || `https://github.com/${REPO}/queue/${BRANCH}`,
    ruleset: ruleset
      ? { id: ruleset.id, name: ruleset.name, enforcement: ruleset.enforcement }
      : null,
    thresholds: {
      source: loaded.source,
      path: loaded.path,
      values: loaded.thresholds,
    },
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
  snap.alertEvaluation = evaluateAlerts(snap, loaded.thresholds);
  return snap;
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

  if (snap.thresholds) {
    lines.push("");
    lines.push(
      `thresholds source=${snap.thresholds.source} path=${snap.thresholds.path}`,
    );
    const t = snap.thresholds.values;
    lines.push(
      `  queue_depth warn=${t.queue_depth.warn} crit=${t.queue_depth.critical} | max_age_sec warn=${t.max_age_sec.warn} crit=${t.max_age_sec.critical}`,
    );
    lines.push(
      `  dirty_open_prs warn=${t.dirty_open_prs.warn} crit=${t.dirty_open_prs.critical} | behind warn=${t.behind_open_prs.warn} crit=${t.behind_open_prs.critical}`,
    );
  }

  const ev = snap.alertEvaluation;
  if (ev) {
    lines.push("");
    lines.push(
      `alerts critical=${ev.criticalCount} warn=${ev.warnCount} status=${ev.ok ? (ev.warnOnly ? "WARN" : "OK") : "CRITICAL"}`,
    );
    for (const a of ev.alerts) {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.message}`);
    }
    if (!ev.alerts.length) lines.push("  (none)");
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
    if (alertMode) {
      const ev = snap.alertEvaluation;
      if (ev.criticalCount > 0) {
        console.error(`ALERT: ${ev.criticalCount} critical threshold breach(es)`);
        process.exit(4);
      }
      if (failOnWarn && ev.warnCount > 0) {
        console.error(`ALERT: ${ev.warnCount} warn threshold breach(es) (--fail-on-warn)`);
        process.exit(5);
      }
    }
    process.exit(0);
  } catch (e) {
    console.error("merge-queue-snapshot failed:", e instanceof Error ? e.message : e);
    process.exit(2);
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("merge-queue-snapshot.mjs") ||
    process.argv[1].includes("merge-queue-snapshot"));

if (isMain) main();
