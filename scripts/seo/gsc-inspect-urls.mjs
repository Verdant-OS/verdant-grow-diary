#!/usr/bin/env node
/**
 * Verdant SEO Monitoring v1 — bounded GSC URL Inspection runner.
 *
 * Reads credentials from env (CI) or .seo/gsc-token.local.json (local),
 * inspects a bounded set of URLs, applies the tracked SEO allowlist,
 * and writes sanitized reports to artifacts/seo/. Fails with non-zero
 * exit only on genuinely new critical issues.
 *
 * Flags:
 *   --urls a,b,c            Explicit URL list
 *   --sitemap <url>         Pull URLs from a sitemap.xml
 *   --max <n>               Max URLs to inspect (default 15, hard cap 50)
 *   --allow <a,b,c>         Ad-hoc URLs allowed to be non-indexable
 *   --expected-noindex      Treat every URL as expected-non-indexable
 *   --allowlist <path>      Tracked allowlist (default: config/seo-allowlist.json)
 *   --no-allowlist          Ignore the tracked allowlist entirely
 *   --dry-run-allowlist     Simulate allowlist behavior without calling GSC
 *   --no-fail-on-expired    Do not fail when allowlist entries are expired
 *   --list-expired-entries  Print expired allowlist entries and exit (no GSC calls)
 *   --now <iso>             Override "now" for deterministic tests
 *   --previous-dir <path>   Prior artifacts dir for diffing (default: artifacts/seo/previous)
 *   --no-diff               Skip writing suppression diff artifacts
 */
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadGscCredentials,
  getAccessToken,
  inspectUrl,
  summarizeInspection,
  classifyIssues,
} from "./gscClient.mjs";
import {
  loadAllowlist,
  applyAllowlist,
  isExpectedNoindex,
  isNeverAllowlisted,
  validateAllowlist,
  findExpiredEntries,
  simulateAllowlistForUrls,
  DEFAULT_ALLOWLIST_PATH,
} from "./seoAllowlist.mjs";
import {
  readPreviousSuppressions,
  diffSuppressions,
  renderSuppressionDiffMarkdown,
  renderCompactSuppressionTable,
  diffUrlClassifications,
  renderUrlDecisionTraceMarkdown,
  githubRunContext,
} from "./seoDiff.mjs";

/**
 * Best-effort read of the verifier's artifact so the runner's job summary can
 * mirror the last-finding + regression status. Always returns a stable object
 * (all keys present; null when the verifier has not run yet or on any error).
 * Never surfaces secrets — the verifier artifact contains none.
 */
function readVerifierSummary() {
  const p = resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json");
  const empty = {
    last_finding_status: null,
    regression_status: null,
    regression_outcome_groups: null,
  };
  if (!existsSync(p)) return empty;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    const isRegression = j?.mode === "fail-only-previously-resolved-expired";
    return {
      last_finding_status: typeof j?.status === "string" ? j.status : null,
      regression_status: isRegression && typeof j?.status === "string" ? j.status : null,
      regression_outcome_groups: isRegression ? (j?.outcome_groups ?? null) : null,
    };
  } catch {
    return empty;
  }
}

/** Compact per-URL classification record persisted as the cross-run baseline. */
function toUrlClassifications(simulated) {
  if (!Array.isArray(simulated)) return null;
  return simulated.map((s) => ({
    url: s.url,
    classification: s.classification,
    never_allowlisted: s.never_allowlisted,
    would_suppress_issue_types: s.would_suppress_issue_types ?? [],
    matched_allowlisted_issue_entries: (s.matched_allowlisted_issue_entries ?? []).map((e) => ({
      id: e.id,
    })),
    matched_expected_noindex_entries: (s.matched_expected_noindex_entries ?? []).map((e) => ({
      id: e.id,
    })),
    matched_expired_entries: (s.matched_expired_entries ?? []).map((e) => ({
      id: e.id,
      section: e.section,
    })),
  }));
}

const ARTIFACT_DIR = resolve(process.cwd(), "artifacts/seo");
const DEFAULT_PREVIOUS_DIR = resolve(process.cwd(), "artifacts/seo/previous");
const DEFAULT_URLS = [
  "https://verdantgrowdiary.com/",
  "https://verdantgrowdiary.com/welcome",
  "https://verdantgrowdiary.com/pricing",
  "https://verdantgrowdiary.com/hardware-integrations",
];
const HARD_CAP = 50;

// List of stable artifact paths that both the JSON summary and the
// markdown summary point at. Keeping these in one place means the
// operator always has a predictable index of what a run produced.
const STABLE_ARTIFACTS = [
  { key: "job_summary_md", path: "artifacts/seo/seo-job-summary.md" },
  { key: "job_summary_json", path: "artifacts/seo/seo-job-summary.json" },
  { key: "suppressions_json", path: "artifacts/seo/seo-allowlist-suppressions.json" },
  { key: "suppressions_md", path: "artifacts/seo/seo-allowlist-suppressions.md" },
  { key: "suppressions_diff_json", path: "artifacts/seo/seo-allowlist-suppressions-diff.json" },
  { key: "suppressions_diff_md", path: "artifacts/seo/seo-allowlist-suppressions-diff.md" },
  { key: "dry_run_json", path: "artifacts/seo/seo-allowlist-dry-run.json" },
  { key: "dry_run_md", path: "artifacts/seo/seo-allowlist-dry-run.md" },
  { key: "expired_json", path: "artifacts/seo/seo-allowlist-expired.json" },
  { key: "expired_md", path: "artifacts/seo/seo-allowlist-expired.md" },
  { key: "url_inspection_json", path: "artifacts/seo/gsc-url-inspection.json" },
  { key: "url_inspection_md", path: "artifacts/seo/gsc-url-inspection.md" },
  { key: "last_finding_json", path: "artifacts/seo/gsc-last-finding-verification.json" },
  { key: "last_finding_md", path: "artifacts/seo/gsc-last-finding-verification.md" },
];

function parseArgs(argv) {
  const out = {
    urls: null,
    sitemap: null,
    max: 15,
    allow: [],
    expectedNoindex: false,
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
    useAllowlist: true,
    dryRunAllowlist: false,
    failOnExpired: true,
    listExpired: false,
    now: null,
    previousDir: DEFAULT_PREVIOUS_DIR,
    noDiff: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--urls")
      out.urls = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === "--sitemap") out.sitemap = argv[++i];
    else if (a === "--max") out.max = Math.min(HARD_CAP, Math.max(1, Number(argv[++i]) || 15));
    else if (a === "--allow")
      out.allow = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === "--expected-noindex") out.expectedNoindex = true;
    else if (a === "--allowlist") out.allowlistPath = resolve(argv[++i]);
    else if (a === "--no-allowlist") out.useAllowlist = false;
    else if (a === "--dry-run-allowlist") out.dryRunAllowlist = true;
    else if (a === "--no-fail-on-expired") out.failOnExpired = false;
    else if (a === "--list-expired-entries") out.listExpired = true;
    else if (a === "--now") out.now = argv[++i];
    else if (a === "--previous-dir") out.previousDir = resolve(argv[++i]);
    else if (a === "--no-diff") out.noDiff = true;
  }
  return out;
}

function writeJobSummary(md, jsonPayload) {
  writeArtifact("seo-job-summary.md", md);
  writeArtifact("seo-job-summary.json", JSON.stringify(jsonPayload, null, 2));
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) {
    try {
      appendFileSync(target, md.endsWith("\n") ? md : md + "\n");
    } catch {
      // step summary is best-effort; artifact file is authoritative
    }
  }
}

function buildJobSummaryData({
  mode,
  status,
  allowlistSource,
  urls,
  simulated,
  expired,
  suppressed,
  failing,
  diff,
  notes,
  oauthConfigured = null,
  gscSkipped = null,
}) {
  const counts = simulated
    ? {
        never_allowlisted: simulated.filter((s) => s.classification === "never_allowlisted").length,
        suppressed: simulated.filter((s) => s.classification === "suppressed").length,
        expected_noindex: simulated.filter((s) => s.classification === "expected_noindex").length,
        expired_allowlist: simulated.filter((s) => s.classification === "expired_allowlist").length,
        no_match: simulated.filter((s) => s.classification === "no_match").length,
      }
    : null;
  const run = githubRunContext();
  const verification = readVerifierSummary();
  return {
    generated_at: new Date().toISOString(),
    mode,
    status,
    allowlist_source: allowlistSource,
    urls_evaluated: urls?.length ?? 0,
    workflow_run_url: run.run_url,
    oauth_configured: oauthConfigured,
    gsc_skipped: gscSkipped,
    previous_baseline_found: diff ? diff.previous_available : null,
    diff_comparison_ran: diff != null,
    simulated_classification_counts: counts,
    live_suppressed_issue_count: typeof suppressed === "number" ? suppressed : null,
    live_critical_issue_count: typeof failing === "number" ? failing : null,
    expired_entries: expired ?? [],
    expired_allowlist_ids: [...new Set((expired ?? []).map((e) => e.id))].sort(),
    suppression_diff: diff
      ? {
          previous_available: diff.previous_available,
          previous_generated_at: diff.previous_generated_at,
          added: diff.added.length,
          removed: diff.removed.length,
          unchanged: diff.unchanged.length,
        }
      : null,
    // Verifier-derived, best-effort. Keys are always present; null until the
    // verifier has run in the same job (decoupled — the verifier owns these).
    last_finding_status: verification.last_finding_status,
    regression_status: verification.regression_status,
    regression_outcome_groups: verification.regression_outcome_groups,
    artifacts: Object.fromEntries(STABLE_ARTIFACTS.map((a) => [a.key, a.path])),
    notes: notes ?? [],
  };
}

function buildJobSummary({
  mode,
  status,
  allowlistSource,
  urls,
  simulated,
  expired,
  suppressed,
  failing,
  diff,
  notes,
  oauthConfigured = null,
  gscSkipped = null,
}) {
  const data = buildJobSummaryData({
    mode,
    status,
    allowlistSource,
    urls,
    simulated,
    expired,
    suppressed,
    failing,
    diff,
    notes,
    oauthConfigured,
    gscSkipped,
  });
  const lines = [
    "## Verdant SEO Monitoring — Job Summary",
    "",
    `- **Mode:** ${mode}`,
    `- **Status:** ${status}`,
    `- **Allowlist:** ${allowlistSource ? "`" + allowlistSource + "`" : "(none)"}`,
    `- **URLs evaluated:** ${urls?.length ?? 0}`,
    data.workflow_run_url
      ? `- **Workflow run:** ${data.workflow_run_url}`
      : "- **Workflow run:** (not in GitHub Actions)",
    `- **OAuth configured:** ${data.oauth_configured === null ? "n/a" : data.oauth_configured ? "yes" : "no"}`,
    `- **GSC skipped:** ${data.gsc_skipped === null ? "n/a" : data.gsc_skipped ? "yes" : "no"}`,
    `- **Previous baseline found:** ${data.previous_baseline_found === null ? "n/a" : data.previous_baseline_found ? "yes" : "no (NO_BASELINE)"}`,
  ];
  if (data.simulated_classification_counts) {
    const c = data.simulated_classification_counts;
    lines.push(
      `- **Allowlisted suppressions:** ${c.suppressed}`,
      `- **Expected-noindex suppressions:** ${c.expected_noindex}`,
      `- **Never-allowlist matches:** ${c.never_allowlisted}`,
      `- **Expired matches:** ${c.expired_allowlist}`,
      `- **Unsuppressed URLs:** ${c.no_match}`,
    );
  }
  if (typeof suppressed === "number") lines.push(`- **Live suppressed issues:** ${suppressed}`);
  if (typeof failing === "number") lines.push(`- **Critical (unsuppressed) issues:** ${failing}`);
  if (diff) {
    lines.push(
      "",
      "### Suppression diff vs previous run",
      diff.previous_available
        ? `Previous: \`${diff.previous_generated_at ?? "unknown"}\``
        : "_No previous run available — baseline established._",
      `- **Added:** ${diff.added.length}`,
      `- **Removed:** ${diff.removed.length}`,
      `- **Unchanged:** ${diff.unchanged.length}`,
    );
  }
  if (data.last_finding_status || data.regression_status) {
    lines.push("", "### Last-finding & regression");
    if (data.last_finding_status)
      lines.push(`- **Last-finding status:** \`${data.last_finding_status}\``);
    if (data.regression_status)
      lines.push(`- **Regression status:** \`${data.regression_status}\``);
    const g = data.regression_outcome_groups;
    if (g) {
      const nonEmpty = Object.entries(g).filter(([, v]) => (v?.count ?? 0) > 0);
      lines.push(
        `- **Regression outcome groups:** ${
          nonEmpty.length
            ? nonEmpty.map(([name, v]) => `\`${name}\`=${v.count}`).join(", ")
            : "none"
        }`,
      );
    }
  }
  lines.push("", "### Expired allowlist entries");
  if (!expired || expired.length === 0) lines.push("None.");
  else
    for (const e of expired) lines.push(`- \`${e.section}[${e.id}]\` expired on ${e.expires_on}`);
  lines.push("", "### Stable artifact links");
  if (data.workflow_run_url) {
    lines.push(
      `Inside the uploaded \`seo-monitoring-reports\` artifact bundle for [this run](${data.workflow_run_url}):`,
    );
  } else {
    lines.push(
      "Stable relative paths inside the uploaded `seo-monitoring-reports` artifact bundle:",
    );
  }
  for (const a of STABLE_ARTIFACTS) lines.push(`- \`${a.path}\``);
  if (notes?.length) {
    lines.push("", "### Notes", ...notes.map((n) => `- ${n}`));
  }
  return { md: lines.join("\n") + "\n", data };
}

function emitJobSummary(args) {
  const { md, data } = buildJobSummary(args);
  writeJobSummary(md, data);
}

async function urlsFromSitemap(sitemapUrl) {
  const r = await fetch(sitemapUrl);
  if (!r.ok) throw new Error(`sitemap fetch failed: HTTP ${r.status}`);
  const xml = await r.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
}

function writeArtifact(name, content) {
  writeFileSync(resolve(ARTIFACT_DIR, name), content);
}

function writeSuppressionArtifacts({
  mode,
  suppressed,
  allowlistSource,
  expired,
  notes = [],
  simulated = null,
  previousDir = null,
}) {
  const bySource = new Map();
  for (const s of suppressed) {
    const key = s.suppressed_by ?? "(unknown)";
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(s);
  }
  const bySourceObj = Object.fromEntries(
    [...bySource].map(([k, v]) => [k, v.map(({ code, message }) => ({ code, message }))]),
  );

  // Per-URL classifications: persisted as the cross-run baseline and diffed
  // against the previous run for the decision trace. Absent from a previous
  // artifact => NO_BASELINE (diffUrlClassifications handles null prev).
  const urlClassifications = toUrlClassifications(simulated);
  let urlDiff = null;
  if (urlClassifications) {
    const prevPath = previousDir ? resolve(previousDir, "seo-allowlist-suppressions.json") : null;
    const prev = readPreviousSuppressions(prevPath);
    const prevUrls = Array.isArray(prev?.url_classifications) ? prev.url_classifications : null;
    urlDiff = diffUrlClassifications(prevUrls, urlClassifications);
  }

  const json = {
    mode,
    generated_at: new Date().toISOString(),
    allowlist_source: allowlistSource,
    suppressed_issue_count: suppressed.length,
    expired_entry_count: expired.length,
    suppressed_by_source: bySourceObj,
    expired_entries: expired,
    url_classifications: urlClassifications,
    notes,
  };
  writeArtifact("seo-allowlist-suppressions.json", JSON.stringify(json, null, 2));

  const md = [
    "# SEO Allowlist Suppressions",
    "",
    `Mode: **${mode}**`,
    `Allowlist: ${allowlistSource ? "`" + allowlistSource + "`" : "(none)"}`,
    `Suppressed issues: ${suppressed.length}`,
    `Expired entries: ${expired.length}`,
    "",
    "## Compact summary",
    renderCompactSuppressionTable(bySourceObj),
    "",
  ];
  // Compact per-URL table (near the top), then the detailed trace below.
  if (urlClassifications) {
    md.push("## Per-URL classification (compact)", "");
    md.push("| URL | Classification | Changed |", "| --- | --- | :---: |");
    const diffByUrl = new Map((urlDiff?.urls ?? []).map((u) => [u.url, u]));
    for (const u of [...urlClassifications].sort((a, b) => a.url.localeCompare(b.url))) {
      const d = diffByUrl.get(u.url);
      md.push(`| \`${u.url}\` | \`${u.classification}\` | ${d?.changed ? "yes" : "no"} |`);
    }
    md.push("");
  }
  if (notes.length) {
    md.push("## Notes", ...notes.map((n) => `- ${n}`), "");
  }
  md.push("## Suppressed issues by allowlist entry");
  if (bySource.size === 0) md.push("None.");
  else
    for (const [source, items] of bySource) {
      md.push("", `### ${source} (${items.length})`);
      for (const it of items) md.push(`- \`${it.code}\` — ${it.message}`);
    }
  if (urlClassifications) {
    md.push("", renderUrlDecisionTraceMarkdown(simulated, urlDiff));
  }
  md.push("", "## Expired allowlist entries");
  if (expired.length === 0) md.push("None.");
  else
    for (const e of expired)
      md.push(
        `- \`${e.section}[${e.id}]\` expired on ${e.expires_on} — patterns: ${(e.url_patterns ?? []).join(", ")}`,
      );
  writeArtifact("seo-allowlist-suppressions.md", md.join("\n") + "\n");
  return json;
}

const URL_DIFF_BUCKETS = [
  "newly_suppressed",
  "newly_expired",
  "newly_unsuppressed",
  "newly_never_allowlisted",
  "no_longer_never_allowlisted",
  "changed_classification",
];

function renderUrlDiffMarkdown(urlDiff) {
  const lines = ["", "## Per-URL suppression changes"];
  if (!urlDiff || urlDiff.previous_available === false) {
    lines.push(
      "",
      "`NO_BASELINE` — no comparable previous per-URL classifications (a prior run predating this feature, or first run). No per-URL delta computed.",
      "",
    );
    return lines.join("\n");
  }
  const b = urlDiff.buckets;
  const any = URL_DIFF_BUCKETS.some((k) => (b[k]?.length ?? 0) > 0);
  if (!any) {
    lines.push("", "No per-URL classification changes since the previous run.", "");
    return lines.join("\n");
  }
  lines.push("", "| Change | Count | Example URLs |", "| --- | ---: | --- |");
  for (const k of URL_DIFF_BUCKETS) {
    const urls = b[k] ?? [];
    if (urls.length === 0) continue;
    const ex = urls
      .slice(0, 3)
      .map((u) => "`" + u + "`")
      .join("<br>");
    lines.push(`| \`${k}\` | ${urls.length} | ${ex} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function writeSuppressionDiffArtifacts({ previousDir, currentPayload }) {
  const prevPath = previousDir ? resolve(previousDir, "seo-allowlist-suppressions.json") : null;
  const prev = readPreviousSuppressions(prevPath);
  const diff = diffSuppressions(prev, currentPayload);

  // Per-URL classification diff. A previous artifact lacking url_classifications
  // (predates this feature) => NO_BASELINE, not an error.
  const prevUrls = Array.isArray(prev?.url_classifications) ? prev.url_classifications : null;
  const currUrls = Array.isArray(currentPayload?.url_classifications)
    ? currentPayload.url_classifications
    : [];
  const urlDiff = diffUrlClassifications(prevUrls, currUrls);
  const urlDiffCounts = Object.fromEntries(
    URL_DIFF_BUCKETS.map((k) => [k, (urlDiff.buckets[k] ?? []).length]),
  );

  const json = {
    generated_at: new Date().toISOString(),
    previous_source: prevPath,
    previous_available: diff.previous_available,
    previous_generated_at: diff.previous_generated_at,
    current_generated_at: diff.current_generated_at,
    added: diff.added,
    removed: diff.removed,
    unchanged_count: diff.unchanged.length,
    url_diff: {
      baseline: urlDiff.previous_available ? "available" : "NO_BASELINE",
      previous_available: urlDiff.previous_available,
      counts: urlDiffCounts,
      buckets: urlDiff.buckets,
      urls: urlDiff.urls,
    },
  };
  writeArtifact("seo-allowlist-suppressions-diff.json", JSON.stringify(json, null, 2));
  writeArtifact(
    "seo-allowlist-suppressions-diff.md",
    renderSuppressionDiffMarkdown(diff) + renderUrlDiffMarkdown(urlDiff) + "\n",
  );
  return diff;
}

function writeDryRunArtifacts({ simulated, allowlistSource, expired }) {
  const totals = {
    total: simulated.length,
    never_allowlisted: simulated.filter((s) => s.classification === "never_allowlisted").length,
    suppressed: simulated.filter((s) => s.classification === "suppressed").length,
    expected_noindex: simulated.filter((s) => s.classification === "expected_noindex").length,
    expired_allowlist: simulated.filter((s) => s.classification === "expired_allowlist").length,
    no_match: simulated.filter((s) => s.classification === "no_match").length,
  };
  const json = {
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    allowlist_source: allowlistSource,
    inspected_count: simulated.length,
    expired_entry_count: expired.length,
    totals,
    urls: simulated,
    expired_entries: expired,
  };
  writeArtifact("seo-allowlist-dry-run.json", JSON.stringify(json, null, 2));

  const md = [
    "# SEO Allowlist Dry Run",
    "",
    "No Google Search Console API calls were made.",
    "",
    `Allowlist: ${allowlistSource ? "`" + allowlistSource + "`" : "(none)"}`,
    "",
    "## Totals",
    `- URLs simulated: **${totals.total}**`,
    `- Suppressed: **${totals.suppressed}**`,
    `- Expected-noindex: **${totals.expected_noindex}**`,
    `- Never-allowlisted: **${totals.never_allowlisted}**`,
    `- Expired-allowlist matches: **${totals.expired_allowlist}**`,
    `- Unsuppressed / no-match: **${totals.no_match}**`,
    `- Expired allowlist entries (any URL): **${expired.length}**`,
    "",
    "## Per-URL breakdown",
  ];
  for (const s of simulated) {
    md.push(
      "",
      `### ${s.url}`,
      `- **Classification:** \`${s.classification}\``,
      `- **Never-allowlisted:** ${s.never_allowlisted ? "yes" : "no"}`,
      `- **Matched allowlisted_issues:** ${
        s.matched_allowlisted_issue_entries.map((e) => `\`${e.id}\``).join(", ") || "—"
      }`,
      `- **Matched expected_noindex:** ${
        s.matched_expected_noindex_entries.map((e) => `\`${e.id}\``).join(", ") || "—"
      }`,
      `- **Matched expired entries:** ${
        s.matched_expired_entries
          .map((e) => `\`${e.section}[${e.id}]\` (expired ${e.expires_on})`)
          .join(", ") || "—"
      }`,
      `- **Would suppress issue types:** ${s.would_suppress_issue_types.join(", ") || "—"}`,
      `- **Suppression active:** ${
        s.matched_allowlisted_issue_entries.length > 0 && !s.never_allowlisted ? "yes" : "no"
      }`,
      `- **Never-allowlist overrides suppression:** ${s.never_allowlisted ? "yes" : "no"}`,
    );
    if (s.reasons.length) {
      md.push("- **Reasons:**");
      for (const r of s.reasons) md.push(`  - ${r}`);
    }
  }
  md.push("", "## Expired allowlist entries");
  if (expired.length === 0) md.push("None.");
  else
    for (const e of expired)
      md.push(
        `- \`${e.section}[${e.id}]\` expired on ${e.expires_on} — patterns: ${(e.url_patterns ?? []).join(", ")}`,
      );
  writeArtifact("seo-allowlist-dry-run.md", md.join("\n") + "\n");
}

function toInspectionMarkdown(results, allowlistSource) {
  const lines = [
    "# GSC URL Inspection Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    allowlistSource ? `Allowlist: \`${allowlistSource}\`` : "Allowlist: (none)",
    "",
    "| URL | Verdict | Coverage | Robots | Indexing | Fetch | Canonical Match | Mobile | Rich |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    const s = r.summary;
    const canonicalMatch =
      s.userCanonical && s.googleCanonical
        ? s.userCanonical === s.googleCanonical
          ? "yes"
          : "NO"
        : "-";
    lines.push(
      `| ${s.url} | ${s.verdict} | ${s.coverageState ?? "-"} | ${s.robotsTxtState ?? "-"} | ${s.indexingState ?? "-"} | ${s.pageFetchState ?? "-"} | ${canonicalMatch} | ${s.mobileVerdict ?? "-"} | ${s.richResultsVerdict ?? "-"} |`,
    );
  }
  const failing = results.flatMap((r) => r.issues);
  const suppressed = results.flatMap((r) => r.suppressed ?? []);
  lines.push("", `## Critical issues (${failing.length})`);
  if (failing.length === 0) lines.push("None.");
  else for (const i of failing) lines.push(`- \`${i.code}\` — ${i.message}`);
  lines.push("", `## Suppressed by allowlist (${suppressed.length})`);
  if (suppressed.length === 0) lines.push("None.");
  else
    for (const i of suppressed)
      lines.push(`- \`${i.code}\` — ${i.message} _(via ${i.suppressed_by})_`);
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const allowlist = args.useAllowlist
    ? loadAllowlist(args.allowlistPath)
    : loadAllowlist("/dev/null");
  if (args.useAllowlist) {
    const errs = validateAllowlist(allowlist);
    if (errs.length) {
      console.error("Allowlist validation failed:");
      for (const e of errs) console.error("  - " + e);
      writeSuppressionArtifacts({
        mode: "invalid",
        suppressed: [],
        allowlistSource: allowlist._source,
        expired: [],
        notes: ["Allowlist structural validation failed — see stderr."],
      });
      process.exit(2);
    }
  }

  const now = args.now ?? new Date().toISOString();
  const expired = args.useAllowlist ? findExpiredEntries(allowlist, now) : [];

  // ---- LIST-EXPIRED-ENTRIES PATH: no GSC calls, no URL evaluation ----
  if (args.listExpired) {
    const md = [
      "# Expired SEO Allowlist Entries",
      "",
      `Allowlist: ${allowlist._source ? "`" + allowlist._source + "`" : "(none)"}`,
      `Now: ${now}`,
      `Expired entries: ${expired.length}`,
      "",
    ];
    if (expired.length === 0) md.push("None. ✅");
    else
      for (const e of expired)
        md.push(
          `- \`${e.section}[${e.id}]\` expired on **${e.expires_on}** — patterns: ${(e.url_patterns ?? []).join(", ") || "(none)"}`,
        );
    writeArtifact("seo-allowlist-expired.md", md.join("\n") + "\n");
    writeArtifact(
      "seo-allowlist-expired.json",
      JSON.stringify(
        {
          mode: "list-expired-entries",
          generated_at: new Date().toISOString(),
          now,
          allowlist_source: allowlist._source,
          expired_entries: expired,
        },
        null,
        2,
      ),
    );
    emitJobSummary({
      mode: "list-expired-entries",
      status: expired.length === 0 ? "PASS" : args.failOnExpired ? "FAIL" : "WARN",
      allowlistSource: allowlist._source,
      urls: [],
      simulated: null,
      expired,
      notes: ["No URLs were evaluated in --list-expired-entries mode."],
    });
    for (const e of expired) console.log(`${e.section}[${e.id}] expired ${e.expires_on}`);
    process.exit(args.failOnExpired && expired.length > 0 ? 3 : 0);
  }

  // Determine URL set (used by dry-run and live paths).
  let urls = args.urls;
  if (!urls && args.sitemap && !args.dryRunAllowlist) {
    urls = await urlsFromSitemap(args.sitemap);
  }
  if (!urls || urls.length === 0) urls = DEFAULT_URLS;
  urls = urls.slice(0, args.max);

  // ---- DRY-RUN PATH: no GSC API calls ----
  if (args.dryRunAllowlist) {
    const simulated = simulateAllowlistForUrls(urls, allowlist, now);
    writeDryRunArtifacts({ simulated, allowlistSource: allowlist._source, expired });
    const currentPayload = writeSuppressionArtifacts({
      mode: "dry-run",
      suppressed: [],
      allowlistSource: allowlist._source,
      expired,
      notes: ["Dry-run mode — no GSC API calls were made."],
      simulated,
      previousDir: args.previousDir,
    });
    const diff = args.noDiff
      ? null
      : writeSuppressionDiffArtifacts({ previousDir: args.previousDir, currentPayload });
    const wouldSuppress = simulated.filter((s) => s.would_suppress_issue_types.length > 0).length;
    const willFail = args.failOnExpired && expired.length > 0;
    const status = willFail ? "FAIL" : expired.length > 0 ? "WARN" : "PASS";
    emitJobSummary({
      mode: "dry-run",
      status,
      allowlistSource: allowlist._source,
      urls,
      simulated,
      expired,
      diff,
      notes: ["Dry-run — no GSC API calls."],
      oauthConfigured: null,
      gscSkipped: false,
    });
    console.log(
      `Dry-run: ${urls.length} URL(s); ${wouldSuppress} would have issues suppressed; ${expired.length} expired allowlist entr${expired.length === 1 ? "y" : "ies"}.`,
    );
    if (willFail) {
      console.error("FAIL: expired allowlist entries — refresh or remove them.");
      for (const e of expired) console.error(`  - ${e.section}[${e.id}] expired ${e.expires_on}`);
      process.exit(3);
    }
    process.exit(0);
  }

  // Expired allowlist entries are a hard failure in live mode too.
  if (args.failOnExpired && expired.length > 0) {
    console.error("FAIL: expired allowlist entries — refresh or remove them:");
    for (const e of expired) console.error(`  - ${e.section}[${e.id}] expired ${e.expires_on}`);
    writeSuppressionArtifacts({
      mode: "expired",
      suppressed: [],
      allowlistSource: allowlist._source,
      expired,
      notes: ["Refused to run URL inspection because the allowlist has expired entries."],
    });
    emitJobSummary({
      mode: "live-blocked-expired",
      status: "FAIL",
      allowlistSource: allowlist._source,
      urls,
      simulated: null,
      expired,
      notes: ["Live inspection blocked: allowlist has expired entries."],
    });
    process.exit(3);
  }

  const creds = loadGscCredentials();
  if (!creds.ok) {
    const skipPayload = {
      status: "skipped",
      reason: "GSC OAuth not configured",
      missing: creds.missing,
      generated_at: new Date().toISOString(),
    };
    writeArtifact("gsc-url-inspection.json", JSON.stringify(skipPayload, null, 2));
    writeArtifact(
      "gsc-url-inspection.md",
      `# GSC URL Inspection Report\n\nSkipped: GSC OAuth is not configured.\n\nMissing: ${creds.missing.join(", ")}\n`,
    );
    const skipSimulated = args.useAllowlist ? simulateAllowlistForUrls(urls, allowlist, now) : null;
    writeSuppressionArtifacts({
      mode: "skipped-no-oauth",
      suppressed: [],
      allowlistSource: allowlist._source,
      expired,
      notes: ["GSC OAuth not configured — no live inspection performed."],
      simulated: skipSimulated,
      previousDir: args.previousDir,
    });
    emitJobSummary({
      mode: "live-skipped",
      status: "SKIPPED",
      allowlistSource: allowlist._source,
      urls,
      simulated: skipSimulated,
      expired,
      notes: [
        "GSC OAuth not configured — live inspection skipped. Missing env vars are logged but not shown here.",
      ],
      oauthConfigured: false,
      gscSkipped: true,
    });
    console.log("GSC OAuth not configured — skipping (missing: " + creds.missing.join(", ") + ")");
    process.exit(0);
  }

  const adhocAllow = new Set(args.allow);
  const accessToken = await getAccessToken(creds);
  const results = [];
  for (const url of urls) {
    try {
      const raw = await inspectUrl({ accessToken, siteUrl: creds.siteUrl, inspectionUrl: url });
      const summary = summarizeInspection(url, raw);
      const trackedNoindex = isExpectedNoindex(url, allowlist);
      const isNever = isNeverAllowlisted(url, allowlist);
      const expectedIndexable = isNever
        ? true
        : !(args.expectedNoindex || adhocAllow.has(url) || trackedNoindex);
      const raw_issues = classifyIssues(summary, { expectedIndexable });
      const { kept, suppressed } = isNever
        ? { kept: raw_issues, suppressed: [] }
        : applyAllowlist(url, raw_issues, allowlist);
      results.push({ summary, issues: kept, suppressed });
    } catch (e) {
      results.push({
        summary: { url, verdict: "ERROR" },
        issues: [{ code: "inspection_error", message: `${url}: ${e.message}` }],
        suppressed: [],
      });
    }
  }

  const failing = results.flatMap((r) => r.issues);
  const suppressed = results.flatMap((r) => r.suppressed ?? []);
  const payload = {
    status: failing.length ? "failed" : "passed",
    generated_at: new Date().toISOString(),
    site_url: creds.siteUrl,
    inspected_count: results.length,
    critical_issue_count: failing.length,
    suppressed_issue_count: suppressed.length,
    allowlist_source: allowlist._source,
    results,
  };
  writeArtifact("gsc-url-inspection.json", JSON.stringify(payload, null, 2));
  writeArtifact("gsc-url-inspection.md", toInspectionMarkdown(results, allowlist._source));
  const liveSimulated = args.useAllowlist ? simulateAllowlistForUrls(urls, allowlist, now) : null;
  const currentSuppressionPayload = writeSuppressionArtifacts({
    mode: "live",
    suppressed,
    allowlistSource: allowlist._source,
    expired,
    notes: [],
    simulated: liveSimulated,
    previousDir: args.previousDir,
  });
  const diff = args.noDiff
    ? null
    : writeSuppressionDiffArtifacts({
        previousDir: args.previousDir,
        currentPayload: currentSuppressionPayload,
      });
  emitJobSummary({
    mode: "live",
    status: failing.length ? "FAIL" : expired.length > 0 ? "WARN" : "PASS",
    allowlistSource: allowlist._source,
    urls,
    simulated: liveSimulated,
    expired,
    suppressed: suppressed.length,
    failing: failing.length,
    diff,
    notes: [],
    oauthConfigured: true,
    gscSkipped: false,
  });
  console.log(
    `Inspected ${results.length} URL(s); ${failing.length} critical, ${suppressed.length} suppressed by allowlist.`,
  );
  process.exit(failing.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
