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
 *   --now <iso>             Override "now" for deterministic tests
 */
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadGscCredentials, getAccessToken, inspectUrl, summarizeInspection, classifyIssues } from "./gscClient.mjs";
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

const ARTIFACT_DIR = resolve(process.cwd(), "artifacts/seo");
const DEFAULT_URLS = [
  "https://verdantgrowdiary.com/",
  "https://verdantgrowdiary.com/welcome",
  "https://verdantgrowdiary.com/pricing",
  "https://verdantgrowdiary.com/hardware-integrations",
];
const HARD_CAP = 50;

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
    now: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--urls") out.urls = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--sitemap") out.sitemap = argv[++i];
    else if (a === "--max") out.max = Math.min(HARD_CAP, Math.max(1, Number(argv[++i]) || 15));
    else if (a === "--allow") out.allow = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--expected-noindex") out.expectedNoindex = true;
    else if (a === "--allowlist") out.allowlistPath = resolve(argv[++i]);
    else if (a === "--no-allowlist") out.useAllowlist = false;
    else if (a === "--dry-run-allowlist") out.dryRunAllowlist = true;
    else if (a === "--no-fail-on-expired") out.failOnExpired = false;
    else if (a === "--now") out.now = argv[++i];
  }
  return out;
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

function writeSuppressionArtifacts({ mode, suppressed, allowlistSource, expired, notes = [] }) {
  const bySource = new Map();
  for (const s of suppressed) {
    const key = s.suppressed_by ?? "(unknown)";
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(s);
  }
  const json = {
    mode,
    generated_at: new Date().toISOString(),
    allowlist_source: allowlistSource,
    suppressed_issue_count: suppressed.length,
    expired_entry_count: expired.length,
    suppressed_by_source: Object.fromEntries(
      [...bySource].map(([k, v]) => [k, v.map(({ code, message }) => ({ code, message }))]),
    ),
    expired_entries: expired,
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
  ];
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
  md.push("", "## Expired allowlist entries");
  if (expired.length === 0) md.push("None.");
  else
    for (const e of expired)
      md.push(
        `- \`${e.section}[${e.id}]\` expired on ${e.expires_on} — patterns: ${(e.url_patterns ?? []).join(", ")}`,
      );
  writeArtifact("seo-allowlist-suppressions.md", md.join("\n") + "\n");
}

function writeDryRunArtifacts({ simulated, allowlistSource, expired }) {
  const json = {
    mode: "dry-run",
    generated_at: new Date().toISOString(),
    allowlist_source: allowlistSource,
    inspected_count: simulated.length,
    expired_entry_count: expired.length,
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
    `URLs simulated: ${simulated.length}`,
    `Expired entries: ${expired.length}`,
    "",
    "| URL | Never-allowlisted | Would be expected-noindex | Would suppress issue types | Matching entry IDs |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const s of simulated) {
    md.push(
      `| ${s.url} | ${s.never_allowlisted ? "yes" : "no"} | ${
        s.would_be_expected_noindex ? "yes" : "no"
      } | ${s.would_suppress_issue_types.join(", ") || "—"} | ${[
        ...s.matched_allowlisted_issue_entries.map((e) => e.id),
        ...s.matched_expected_noindex_entries.map((e) => e.id),
      ].join(", ") || "—"} |`,
    );
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
      s.userCanonical && s.googleCanonical ? (s.userCanonical === s.googleCanonical ? "yes" : "NO") : "-";
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
  else for (const i of suppressed) lines.push(`- \`${i.code}\` — ${i.message} _(via ${i.suppressed_by})_`);
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const allowlist = args.useAllowlist ? loadAllowlist(args.allowlistPath) : loadAllowlist("/dev/null");
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
    writeSuppressionArtifacts({
      mode: "dry-run",
      suppressed: [],
      allowlistSource: allowlist._source,
      expired,
      notes: ["Dry-run mode — no GSC API calls were made."],
    });
    const wouldSuppress = simulated.filter((s) => s.would_suppress_issue_types.length > 0).length;
    console.log(
      `Dry-run: ${urls.length} URL(s); ${wouldSuppress} would have issues suppressed; ${expired.length} expired allowlist entr${expired.length === 1 ? "y" : "ies"}.`,
    );
    if (args.failOnExpired && expired.length > 0) {
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
    writeSuppressionArtifacts({
      mode: "skipped-no-oauth",
      suppressed: [],
      allowlistSource: allowlist._source,
      expired,
      notes: ["GSC OAuth not configured — no live inspection performed."],
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
  writeSuppressionArtifacts({
    mode: "live",
    suppressed,
    allowlistSource: allowlist._source,
    expired,
    notes: [],
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
