// Pure helpers for diffing SEO suppression reports between runs.
// No I/O side effects. Deterministic.
import { existsSync, readFileSync } from "node:fs";

/**
 * Read a previously-written suppressions JSON artifact. Returns null if
 * the file is missing or unparseable — callers treat that as "no baseline".
 */
export function readPreviousSuppressions(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

function suppressionKey(source, item) {
  return `${source}::${item.code}::${item.message ?? ""}`;
}

function flatten(bySource) {
  const out = [];
  if (!bySource || typeof bySource !== "object") return out;
  for (const [source, items] of Object.entries(bySource)) {
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      out.push({
        source,
        code: it.code ?? "(no-code)",
        message: it.message ?? "",
        key: suppressionKey(source, it),
      });
    }
  }
  return out;
}

/**
 * Diff two suppression payloads (either the raw JSON artifact or a
 * `{ suppressed_by_source }` slice). Returns:
 *   { added, removed, unchanged, previous_generated_at, current_generated_at }
 * `added` = suppressions present now but not in the previous run.
 * `removed` = suppressions present previously but not now.
 */
export function diffSuppressions(prev, curr) {
  const prevItems = flatten(prev?.suppressed_by_source);
  const currItems = flatten(curr?.suppressed_by_source);
  const prevMap = new Map(prevItems.map((i) => [i.key, i]));
  const currMap = new Map(currItems.map((i) => [i.key, i]));
  const added = currItems.filter((i) => !prevMap.has(i.key));
  const removed = prevItems.filter((i) => !currMap.has(i.key));
  const unchanged = currItems.filter((i) => prevMap.has(i.key));
  return {
    added,
    removed,
    unchanged,
    previous_generated_at: prev?.generated_at ?? null,
    current_generated_at: curr?.generated_at ?? null,
    previous_available: prev != null,
  };
}

/**
 * Render a compact GitHub-flavored markdown summary of a diff. Deterministic
 * ordering (source → code) so snapshot tests are stable.
 */
export function renderSuppressionDiffMarkdown(diff) {
  const sortFn = (a, b) => a.source.localeCompare(b.source) || a.code.localeCompare(b.code);
  const lines = [
    "# SEO Suppression Diff (vs previous run)",
    "",
    diff.previous_available
      ? `Previous run: \`${diff.previous_generated_at ?? "unknown"}\``
      : "_No previous suppressions artifact was available — showing current run only._",
    `Current run:  \`${diff.current_generated_at ?? "unknown"}\``,
    "",
    `- **Added suppressions:** ${diff.added.length}`,
    `- **Removed suppressions:** ${diff.removed.length}`,
    `- **Unchanged suppressions:** ${diff.unchanged.length}`,
    "",
  ];
  const section = (title, items) => {
    lines.push(`## ${title} (${items.length})`);
    if (items.length === 0) lines.push("None.", "");
    else {
      lines.push("| Allowlist entry | Code | Message |");
      lines.push("| --- | --- | --- |");
      for (const i of [...items].sort(sortFn)) {
        const msg = String(i.message).replace(/\|/g, "\\|").replace(/\n/g, " ");
        lines.push(`| \`${i.source}\` | \`${i.code}\` | ${msg} |`);
      }
      lines.push("");
    }
  };
  section("Added", diff.added);
  section("Removed", diff.removed);
  return lines.join("\n") + "\n";
}

/**
 * Build a compact suppression summary table (top-of-file) that groups the
 * current run's suppressions by allowlist entry with counts, so operators can
 * see the picture at a glance without scrolling through per-issue lists.
 */
export function renderCompactSuppressionTable(bySource) {
  const rows = Object.entries(bySource ?? {})
    .map(([source, items]) => ({
      source,
      count: Array.isArray(items) ? items.length : 0,
      codes: Array.isArray(items)
        ? [...new Set(items.map((i) => i.code ?? "(no-code)"))].sort()
        : [],
    }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  const lines = ["| Allowlist entry | Suppressed | Issue codes |", "| --- | ---: | --- |"];
  if (rows.length === 0) {
    lines.push("| _(none)_ | 0 | — |");
  } else {
    for (const r of rows) {
      lines.push(
        `| \`${r.source}\` | ${r.count} | ${r.codes.map((c) => "`" + c + "`").join(", ") || "—"} |`,
      );
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// v1.4 diagnostics helpers — all pure, deterministic, no I/O.
// ---------------------------------------------------------------------------

/**
 * Resolve the GitHub Actions run URL from environment variables. Returns a
 * stable object; every field is null outside Actions. Never reads secrets.
 * `${server}/${repo}/actions/runs/${runId}` is documented and public.
 */
export function githubRunContext(env = process.env) {
  const server_url = env.GITHUB_SERVER_URL || null;
  const repository = env.GITHUB_REPOSITORY || null;
  const run_id = env.GITHUB_RUN_ID || null;
  const run_url =
    server_url && repository && run_id
      ? `${server_url}/${repository}/actions/runs/${run_id}`
      : null;
  return { server_url, repository, run_id, run_url };
}

function uniqSorted(values) {
  return [...new Set(values.filter((v) => v != null && v !== ""))].sort();
}

function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

/**
 * The six regression outcome buckets, in stable order, with the exit-code
 * semantics documented per bucket.
 */
export const REGRESSION_OUTCOME_GROUPS = [
  "unresolved_expired_allowlist",
  "no_baseline",
  "still_unresolved",
  "resolved",
  "blocked",
  "other",
];

const REGRESSION_EXIT_BEHAVIOR = {
  unresolved_expired_allowlist: "contributes to exit 4 (regression)",
  no_baseline: "exit 0 (no previous baseline to compare)",
  still_unresolved: "exit 0 (was already unresolved; not a new regression)",
  resolved: "exit 0 (still resolved)",
  blocked: "exit 0 (verification skipped — placeholder config or OAuth not configured)",
  other: "exit 0 (uncategorized)",
};

/**
 * Group regression-only per-URL outcomes into the six stable buckets.
 *
 * `urlResults`: array of {
 *    url, was_resolved (bool), in_previous_baseline (bool),
 *    regressed (bool), expired_allowlist_ids: string[], expected_noindex_ids: string[]
 * }
 * `opts`: { previousAvailable: bool, runBlocked?: bool }
 *
 * Run-level states (no previous artifact → `no_baseline`; skipped run →
 * `blocked`) place every affected URL in that one bucket. When a baseline
 * exists, each URL is bucketed per-URL. Returns an object keyed by the six
 * group names; each group carries count, ≤3 example URLs, the union of matched
 * expired-allowlist / expected-noindex ids, and exit-code behavior.
 */
export function groupRegressionOutcomes(urlResults, opts = {}) {
  const { previousAvailable = true, runBlocked = false } = opts;
  const list = Array.isArray(urlResults) ? urlResults : [];

  const bucketOf = (r) => {
    if (runBlocked) return "blocked";
    if (!previousAvailable) return "no_baseline";
    if (r.regressed) return "unresolved_expired_allowlist";
    if (r.was_resolved) return "resolved";
    if (r.in_previous_baseline) return "still_unresolved";
    // baseline exists but this URL was never recorded in it
    if (!r.in_previous_baseline) return "no_baseline";
    return "other";
  };

  const acc = {};
  for (const name of REGRESSION_OUTCOME_GROUPS) {
    acc[name] = { urls: [], expired: [], expectedNoindex: [] };
  }
  for (const r of list) {
    const b = REGRESSION_OUTCOME_GROUPS.includes(bucketOf(r)) ? bucketOf(r) : "other";
    acc[b].urls.push(r.url);
    acc[b].expired.push(...(r.expired_allowlist_ids ?? []));
    acc[b].expectedNoindex.push(...(r.expected_noindex_ids ?? []));
  }

  const groups = {};
  for (const name of REGRESSION_OUTCOME_GROUPS) {
    const g = acc[name];
    const urls = [...g.urls].sort();
    groups[name] = {
      count: urls.length,
      example_urls: urls.slice(0, 3),
      expired_allowlist_ids: uniqSorted(g.expired),
      expected_noindex_ids: uniqSorted(g.expectedNoindex),
      exit_code_behavior: REGRESSION_EXIT_BEHAVIOR[name],
    };
  }
  return groups;
}

/** Render the regression outcome groups as Markdown. Deterministic. */
export function renderRegressionGroupsMarkdown(groups) {
  const lines = ["## Regression outcome groups", ""];
  const any = REGRESSION_OUTCOME_GROUPS.some((n) => (groups?.[n]?.count ?? 0) > 0);
  if (!any) {
    lines.push("_No affected URLs to group._", "");
    return lines.join("\n");
  }
  lines.push(
    "| Group | Count | Example URLs | Expired IDs | Expected-noindex IDs | Exit behavior |",
  );
  lines.push("| --- | ---: | --- | --- | --- | --- |");
  for (const name of REGRESSION_OUTCOME_GROUPS) {
    const g = groups?.[name];
    if (!g || g.count === 0) continue;
    const ex = g.example_urls.map((u) => "`" + u + "`").join("<br>") || "—";
    const exp = g.expired_allowlist_ids.map((i) => "`" + i + "`").join(", ") || "—";
    const noi = g.expected_noindex_ids.map((i) => "`" + i + "`").join(", ") || "—";
    lines.push(`| \`${name}\` | ${g.count} | ${ex} | ${exp} | ${noi} | ${g.exit_code_behavior} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function classificationOf(entry) {
  return entry && typeof entry.classification === "string" ? entry.classification : null;
}

function matchedIdsOf(entry) {
  if (!entry) return [];
  return uniqSorted([
    ...(entry.matched_allowlisted_issue_entries ?? []).map((e) => e.id),
    ...(entry.matched_expected_noindex_entries ?? []).map((e) => e.id),
    ...(entry.matched_expired_entries ?? []).map((e) => e.id),
  ]);
}

const SUPPRESSED_CLASSES = new Set(["suppressed", "expected_noindex", "expired_allowlist"]);

/**
 * Diff per-URL allowlist classifications across runs.
 *
 * `prev` / `curr`: arrays of simulate-style per-URL objects (see
 * simulateAllowlistForUrls) OR null. When `prev` is null/absent (including a
 * previous artifact that predates url_classifications), `previous_available`
 * is false and no per-URL deltas are computed — the NO_BASELINE case.
 *
 * Returns { previous_available, urls: [...per-URL trace...], buckets: {...} }.
 */
export function diffUrlClassifications(prev, curr) {
  const currList = Array.isArray(curr) ? curr : [];
  const previousAvailable = Array.isArray(prev);
  const prevMap = new Map((Array.isArray(prev) ? prev : []).map((e) => [e.url, e]));

  const buckets = {
    newly_suppressed: [],
    newly_expired: [],
    newly_unsuppressed: [],
    newly_never_allowlisted: [],
    no_longer_never_allowlisted: [],
    changed_classification: [],
  };

  const urls = currList.map((c) => {
    const p = prevMap.get(c.url) ?? null;
    const prevClass = classificationOf(p);
    const currClass = classificationOf(c);
    const prevIds = matchedIdsOf(p);
    const currIds = matchedIdsOf(c);
    const prevTypes = uniqSorted(p?.would_suppress_issue_types ?? []);
    const currTypes = uniqSorted(c?.would_suppress_issue_types ?? []);

    const hasPrev = previousAvailable && p != null;
    const changed = hasPrev && prevClass !== currClass;
    const changed_matched_ids = hasPrev && !sameSet(prevIds, currIds);
    const changed_issue_types = hasPrev && !sameSet(prevTypes, currTypes);

    const newly_suppressed = hasPrev && currClass === "suppressed" && prevClass !== "suppressed";
    const newly_expired =
      hasPrev && currClass === "expired_allowlist" && prevClass !== "expired_allowlist";
    const newly_unsuppressed =
      hasPrev && SUPPRESSED_CLASSES.has(prevClass) && currClass === "no_match";
    const newly_never_allowlisted =
      hasPrev && currClass === "never_allowlisted" && prevClass !== "never_allowlisted";
    const no_longer_never_allowlisted =
      hasPrev && prevClass === "never_allowlisted" && currClass !== "never_allowlisted";

    if (newly_suppressed) buckets.newly_suppressed.push(c.url);
    if (newly_expired) buckets.newly_expired.push(c.url);
    if (newly_unsuppressed) buckets.newly_unsuppressed.push(c.url);
    if (newly_never_allowlisted) buckets.newly_never_allowlisted.push(c.url);
    if (no_longer_never_allowlisted) buckets.no_longer_never_allowlisted.push(c.url);
    if (changed) buckets.changed_classification.push(c.url);

    return {
      url: c.url,
      previous_classification: hasPrev ? prevClass : null,
      current_classification: currClass,
      changed,
      changed_matched_ids,
      changed_issue_types,
      newly_suppressed,
      newly_expired,
      newly_unsuppressed,
      newly_never_allowlisted,
      no_longer_never_allowlisted,
      previous_matched_ids: hasPrev ? prevIds : null,
      current_matched_ids: currIds,
    };
  });

  for (const k of Object.keys(buckets)) buckets[k].sort();
  return { previous_available: previousAvailable, urls, buckets };
}

/**
 * Render a per-URL decision trace section. `curr` are simulate-style per-URL
 * objects; `urlDiff` is the output of diffUrlClassifications (or null). The
 * compact suppression table stays above this — this is the detailed trace.
 */
export function renderUrlDecisionTraceMarkdown(curr, urlDiff) {
  const currList = Array.isArray(curr) ? [...curr].sort((a, b) => a.url.localeCompare(b.url)) : [];
  const diffByUrl = new Map((urlDiff?.urls ?? []).map((u) => [u.url, u]));
  const baseline = urlDiff?.previous_available ?? false;

  const lines = ["## Per-URL decision trace", ""];
  if (currList.length === 0) {
    lines.push("_No URLs evaluated._", "");
    return lines.join("\n");
  }
  lines.push(
    baseline
      ? "Baseline: previous run available."
      : "Baseline: `NO_BASELINE` (no comparable previous run).",
  );
  lines.push("");
  lines.push(
    "| URL | Classification | Matched IDs | Expected-noindex | Never-allowlist | Expired | Suppressed types | Prev classification | Changed | Delta |",
  );
  lines.push("| --- | --- | --- | --- | --- | :---: | --- | --- | :---: | --- |");

  for (const c of currList) {
    const d = diffByUrl.get(c.url) ?? null;
    const matchedIds = matchedIdsOf(c);
    const noiIds = uniqSorted((c.matched_expected_noindex_entries ?? []).map((e) => e.id));
    const expiredIds = uniqSorted((c.matched_expired_entries ?? []).map((e) => e.id));
    const types = uniqSorted(c.would_suppress_issue_types ?? []);
    const deltas = [];
    if (d?.newly_suppressed) deltas.push("newly-suppressed");
    if (d?.newly_expired) deltas.push("newly-expired");
    if (d?.newly_unsuppressed) deltas.push("newly-unsuppressed");
    if (d?.newly_never_allowlisted) deltas.push("newly-never-allowlisted");
    if (d?.no_longer_never_allowlisted) deltas.push("no-longer-never-allowlisted");
    if (d?.changed_matched_ids) deltas.push("ids-changed");
    if (d?.changed_issue_types) deltas.push("types-changed");
    const cell = (arr) => (arr.length ? arr.map((x) => "`" + x + "`").join(", ") : "—");
    lines.push(
      `| \`${c.url}\` | \`${c.classification}\` | ${cell(matchedIds)} | ${cell(noiIds)} | ${c.never_allowlisted ? "yes" : "no"} | ${expiredIds.length ? "yes" : "no"} | ${cell(types)} | ${d && d.previous_classification ? "`" + d.previous_classification + "`" : baseline ? "—" : "n/a"} | ${d?.changed ? "yes" : "no"} | ${deltas.join(", ") || "—"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
