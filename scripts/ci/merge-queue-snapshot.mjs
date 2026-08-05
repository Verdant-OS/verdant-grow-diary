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
 *   node scripts/ci/merge-queue-snapshot.mjs --no-scale
 *   bun run merge-queue:snapshot
 *   bun run merge-queue:snapshot:alert
 *
 * Env:
 *   GITHUB_REPOSITORY              owner/name (default Verdant-OS/verdant-grow-diary)
 *   MERGE_QUEUE_BRANCH             branch name (default verdant-grow-diary)
 *   MERGE_QUEUE_THRESHOLDS_PATH    path to thresholds JSON
 *   MERGE_QUEUE_STRICT_MAX_DEPTH   legacy --strict depth ceiling (default 5)
 *   MERGE_QUEUE_SCALE              "0" or "false" disables dynamic scaling
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
const noScaleCli = args.has("--no-scale");
const scaleEnv = process.env.MERGE_QUEUE_SCALE;
const scaleDisabled =
  noScaleCli || scaleEnv === "0" || String(scaleEnv || "").toLowerCase() === "false";

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

export const DEFAULT_SCALING = {
  enabled: true,
  baseline_open_prs: 10,
  min_factor: 1.0,
  max_factor: 2.5,
  count_metrics: ["dirty_open_prs", "behind_open_prs", "blocked_open_prs", "auto_merge_waiting"],
  depth_metrics: ["queue_depth"],
  depth_max_cap: 5,
  age_metrics: [],
  ratio_alerts: {
    enabled: true,
    min_open_prs: 4,
    dirty_ratio: { warn: 0.45, critical: 0.7 },
    behind_ratio: { warn: 0.4, critical: 0.65 },
  },
};

/** @param {number} n @param {number} lo @param {number} hi */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

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
    return {
      source: "defaults",
      path: resolved,
      thresholds: structuredClone(DEFAULT_THRESHOLDS),
      scaling: structuredClone(DEFAULT_SCALING),
    };
  }
  const raw = JSON.parse(readFileSync(resolved, "utf8"));
  const thresholds = structuredClone(DEFAULT_THRESHOLDS);
  for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
    if (raw[key] && typeof raw[key] === "object") {
      thresholds[key] = {
        warn: Number(raw[key].warn ?? DEFAULT_THRESHOLDS[key].warn),
        critical: Number(raw[key].critical ?? DEFAULT_THRESHOLDS[key].critical),
      };
    }
  }
  const scaling = structuredClone(DEFAULT_SCALING);
  if (raw.scaling && typeof raw.scaling === "object") {
    Object.assign(scaling, raw.scaling);
    if (raw.scaling.ratio_alerts && typeof raw.scaling.ratio_alerts === "object") {
      scaling.ratio_alerts = {
        ...DEFAULT_SCALING.ratio_alerts,
        ...raw.scaling.ratio_alerts,
        dirty_ratio: {
          ...DEFAULT_SCALING.ratio_alerts.dirty_ratio,
          ...(raw.scaling.ratio_alerts.dirty_ratio || {}),
        },
        behind_ratio: {
          ...DEFAULT_SCALING.ratio_alerts.behind_ratio,
          ...(raw.scaling.ratio_alerts.behind_ratio || {}),
        },
      };
    }
  }
  return { source: "file", path: resolved, thresholds, scaling, meta: raw };
}

/**
 * Scale absolute count/depth thresholds by open-PR load.
 * Ages stay fixed (timeout-bound). Never lowers floors below base (min_factor >= 1).
 *
 * factor = clamp(openPrTotal / baseline_open_prs, min_factor, max_factor)
 *
 * @param {typeof DEFAULT_THRESHOLDS} base
 * @param {{ openPrTotal: number }} context
 * @param {typeof DEFAULT_SCALING} scaling
 * @param {{ disabled?: boolean }} [opts]
 */
export function scaleThresholds(base, context, scaling = DEFAULT_SCALING, opts = {}) {
  const openPrTotal = Math.max(0, Number(context.openPrTotal) || 0);
  const enabled = scaling?.enabled !== false && !opts.disabled;
  const baseline = Math.max(1, Number(scaling.baseline_open_prs) || 10);
  const minF = Number(scaling.min_factor) || 1;
  const maxF = Number(scaling.max_factor) || 2.5;
  const factor = enabled ? clamp(openPrTotal / baseline, minF, maxF) : 1;

  /** @type {typeof DEFAULT_THRESHOLDS} */
  const effective = structuredClone(base);
  const scaledMetrics = [];

  const countSet = new Set(scaling.count_metrics || DEFAULT_SCALING.count_metrics);
  const depthSet = new Set(scaling.depth_metrics || DEFAULT_SCALING.depth_metrics);
  const depthCap = Number(scaling.depth_max_cap) || 5;

  for (const metric of Object.keys(effective)) {
    if (!enabled || factor === 1) continue;
    if (countSet.has(metric)) {
      const b = base[metric];
      let warn = Math.max(b.warn, Math.ceil(b.warn * factor));
      let critical = Math.max(b.critical, Math.ceil(b.critical * factor));
      if (critical <= warn) critical = warn + 1;
      effective[metric] = { warn, critical };
      scaledMetrics.push(metric);
    } else if (depthSet.has(metric)) {
      const b = base[metric];
      // Mild scale; never exceed queue build capacity cap for critical
      let warn = Math.max(b.warn, Math.min(depthCap, Math.ceil(b.warn * Math.min(factor, 1.5))));
      let critical = Math.max(b.critical, Math.min(depthCap, Math.ceil(b.critical * Math.min(factor, 1.5))));
      if (critical < warn) critical = warn;
      // critical at least warn; if both hit cap, leave equal (depth at cap is already critical)
      effective[metric] = { warn, critical };
      scaledMetrics.push(metric);
    }
  }

  return {
    enabled,
    factor: Math.round(factor * 1000) / 1000,
    openPrTotal,
    baseline_open_prs: baseline,
    min_factor: minF,
    max_factor: maxF,
    scaledMetrics,
    base,
    effective,
    scaling,
  };
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
 * Evaluate snapshot metrics against (possibly scaled) thresholds + ratio bands.
 * Null metrics (e.g. empty queue ages) do not alert.
 *
 * @param {{ queue: { depth: number, maxAgeSec: number|null, medianAgeSec: number|null }, openPrs: { total?: number, counts: Record<string, number>, autoMergeCount: number } }} snap
 * @param {typeof DEFAULT_THRESHOLDS} thresholds effective thresholds
 * @param {{ ratio_alerts?: typeof DEFAULT_SCALING.ratio_alerts }} [scaling]
 */
export function evaluateAlerts(snap, thresholds = DEFAULT_THRESHOLDS, scaling = DEFAULT_SCALING) {
  /** @type {Array<{ metric: string, severity: 'warn'|'critical', value: number, warn: number, critical: number, message: string, kind?: string }>} */
  const alerts = [];

  /** @param {string} metric @param {number|null|undefined} value @param {{warn:number, critical:number}} band @param {string} [kind] */
  function check(metric, value, band, kind = "absolute") {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    const { warn, critical } = band;
    if (value >= critical) {
      alerts.push({
        metric,
        severity: "critical",
        value,
        warn,
        critical,
        kind,
        message: `${metric}=${value} >= critical ${critical} (${kind})`,
      });
    } else if (value >= warn) {
      alerts.push({
        metric,
        severity: "warn",
        value,
        warn,
        critical,
        kind,
        message: `${metric}=${value} >= warn ${warn} (${kind})`,
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

  const ratioCfg = scaling?.ratio_alerts;
  const openTotal = snap.openPrs.total ?? Object.values(snap.openPrs.counts || {}).reduce((a, b) => a + b, 0);
  if (ratioCfg?.enabled !== false && openTotal >= (ratioCfg?.min_open_prs ?? 4)) {
    const dirty = snap.openPrs.counts.DIRTY ?? 0;
    const behind = snap.openPrs.counts.BEHIND ?? 0;
    const dirtyRatio = dirty / openTotal;
    const behindRatio = behind / openTotal;
    if (ratioCfg.dirty_ratio) {
      check("dirty_ratio", Math.round(dirtyRatio * 1000) / 1000, ratioCfg.dirty_ratio, "ratio");
    }
    if (ratioCfg.behind_ratio) {
      check("behind_ratio", Math.round(behindRatio * 1000) / 1000, ratioCfg.behind_ratio, "ratio");
    }
  }

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
  const openPrTotal = prs.length;
  const scaled = scaleThresholds(
    loaded.thresholds,
    { openPrTotal },
    loaded.scaling,
    { disabled: scaleDisabled },
  );

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
      base: scaled.base,
      effective: scaled.effective,
      scaling: {
        enabled: scaled.enabled,
        factor: scaled.factor,
        openPrTotal: scaled.openPrTotal,
        baseline_open_prs: scaled.baseline_open_prs,
        min_factor: scaled.min_factor,
        max_factor: scaled.max_factor,
        scaledMetrics: scaled.scaledMetrics,
        ratio_alerts: scaled.scaling.ratio_alerts,
      },
    },
    queue: queueSummary,
    openPrs: {
      total: openPrTotal,
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
  snap.alertEvaluation = evaluateAlerts(snap, scaled.effective, scaled.scaling);
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
    const sc = snap.thresholds.scaling;
    lines.push("");
    lines.push(
      `thresholds source=${snap.thresholds.source} path=${snap.thresholds.path}`,
    );
    lines.push(
      `scaling enabled=${sc.enabled} factor=${sc.factor} open=${sc.openPrTotal} baseline=${sc.baseline_open_prs} clamp=[${sc.min_factor},${sc.max_factor}] metrics=${(sc.scaledMetrics || []).join(",") || "(none)"}`,
    );
    const t = snap.thresholds.effective;
    const b = snap.thresholds.base;
    lines.push(
      `  effective queue_depth warn=${t.queue_depth.warn} crit=${t.queue_depth.critical} (base ${b.queue_depth.warn}/${b.queue_depth.critical})`,
    );
    lines.push(
      `  effective dirty_open_prs warn=${t.dirty_open_prs.warn} crit=${t.dirty_open_prs.critical} (base ${b.dirty_open_prs.warn}/${b.dirty_open_prs.critical})`,
    );
    lines.push(
      `  ages (fixed) max_age_sec warn=${t.max_age_sec.warn} crit=${t.max_age_sec.critical}`,
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
