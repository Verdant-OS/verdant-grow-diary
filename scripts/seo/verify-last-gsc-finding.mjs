#!/usr/bin/env node
/**
 * Verdant SEO Monitoring — verify the last tracked GSC finding is resolved.
 *
 * Reads config/seo-last-gsc-finding.json and re-inspects its affected URLs
 * via the Search Console URL Inspection API, comparing observed state to
 * expected_resolution flags.
 *
 * Flags:
 *   --previous <path>                       Prior verification JSON (default:
 *                                           artifacts/seo/previous/gsc-last-finding-verification.json)
 *   --fail-only-previously-resolved-expired Regression-only mode: skip GSC
 *                                           calls and exit non-zero ONLY when
 *                                           a URL that was previously resolved
 *                                           would now be unresolved because an
 *                                           expired allowlist entry covers it.
 *   --now <iso>                             Override "now" (deterministic tests).
 *   --allowlist <path>                      Override allowlist path.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadGscCredentials, getAccessToken, inspectUrl, summarizeInspection } from "./gscClient.mjs";
import {
  loadAllowlist,
  findExpiredEntriesMatchingUrls,
  DEFAULT_ALLOWLIST_PATH,
} from "./seoAllowlist.mjs";

const CONFIG_PATH = resolve(process.cwd(), "config/seo-last-gsc-finding.json");
const ARTIFACT_DIR = resolve(process.cwd(), "artifacts/seo");
const DEFAULT_PREVIOUS = resolve(process.cwd(), "artifacts/seo/previous/gsc-last-finding-verification.json");

function parseArgs(argv) {
  const out = {
    previousPath: DEFAULT_PREVIOUS,
    failOnlyRegression: false,
    now: null,
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--previous") out.previousPath = resolve(argv[++i]);
    else if (a === "--fail-only-previously-resolved-expired") out.failOnlyRegression = true;
    else if (a === "--now") out.now = argv[++i];
    else if (a === "--allowlist") out.allowlistPath = resolve(argv[++i]);
  }
  return out;
}

function readPreviousResults(path) {
  if (!path || !existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    return raw;
  } catch {
    return null;
  }
}

function evaluate(summary, expected) {
  const checks = [];
  if (expected.indexing_allowed) {
    const ok = summary.verdict === "PASS" || summary.verdict === "NEUTRAL";
    checks.push({ name: "indexing_allowed", ok, observed: summary.verdict });
  }
  if (expected.robots_allowed) {
    const ok = !summary.robotsTxtState || summary.robotsTxtState === "ALLOWED";
    checks.push({ name: "robots_allowed", ok, observed: summary.robotsTxtState });
  }
  if (expected.noindex_absent) {
    const ok = !summary.indexingState || !/BLOCKED_BY_META_TAG|BLOCKED_BY_HTTP_HEADER/i.test(summary.indexingState);
    checks.push({ name: "noindex_absent", ok, observed: summary.indexingState });
  }
  if (expected.canonical_matches) {
    const ok =
      !summary.userCanonical ||
      !summary.googleCanonical ||
      summary.userCanonical === summary.googleCanonical;
    checks.push({
      name: "canonical_matches",
      ok,
      observed: { user: summary.userCanonical, google: summary.googleCanonical },
    });
  }
  return checks;
}

/**
 * Regression-only mode: no GSC calls. For each affected URL:
 *   - was it resolved in the previous verification artifact?
 *   - is it currently covered by an expired allowlist entry?
 * A URL is a regression if BOTH answers are yes. Exits 4 if any regression
 * is found so operators can distinguish this failure from other modes.
 */
function runRegressionOnlyMode({ config, allowlistPath, previousPath, now }) {
  const previous = readPreviousResults(previousPath);
  const previousResolvedUrls = new Set(
    (previous?.results ?? []).filter((r) => r.resolved).map((r) => r.url),
  );
  const allowlist = loadAllowlist(allowlistPath);
  const urls = config.affected_urls ?? [];
  const perUrl = urls.map((url) => {
    const expiredCovering = findExpiredEntriesMatchingUrls(allowlist, [url], now ?? undefined);
    const wasResolved = previousResolvedUrls.has(url);
    const regressed = wasResolved && expiredCovering.length > 0;
    return {
      url,
      previously_resolved: wasResolved,
      expired_allowlist_entries_covering_url: expiredCovering,
      regressed,
    };
  });
  const regressions = perUrl.filter((r) => r.regressed);
  const status = regressions.length > 0 ? "regression" : "no_regression";
  const payload = {
    mode: "fail-only-previously-resolved-expired",
    status,
    finding_id: config.finding_id,
    description: config.description,
    generated_at: new Date().toISOString(),
    previous_source: previousPath,
    previous_available: previous != null,
    regression_count: regressions.length,
    urls: perUrl,
  };
  writeFileSync(
    resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
    JSON.stringify(payload, null, 2),
  );
  const md = [
    "# Last GSC Finding — Regression Check",
    "",
    `Mode: **fail-only-previously-resolved-expired**`,
    `Status: **${status}**`,
    `Previous verification: ${previous ? "\`" + previousPath + "\`" : "_(none — baseline mode, cannot regress)_"}`,
    "",
    "| URL | Previously resolved | Expired allowlist coverage | Regression |",
    "| --- | --- | --- | --- |",
    ...perUrl.map(
      (r) =>
        `| ${r.url} | ${r.previously_resolved ? "yes" : "no"} | ${
          r.expired_allowlist_entries_covering_url
            .map((e) => `\`${e.section}[${e.id}]\` (${e.expires_on})`)
            .join(", ") || "—"
        } | ${r.regressed ? "❌" : "✅"} |`,
    ),
    "",
  ].join("\n");
  writeFileSync(resolve(ARTIFACT_DIR, "gsc-last-finding-verification.md"), md);
  console.log(`Regression-only check: ${status} (${regressions.length} regression(s)).`);
  process.exit(regressions.length > 0 ? 4 : 0);
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(CONFIG_PATH)) {
    console.log(`No tracked finding at ${CONFIG_PATH} — nothing to verify.`);
    writeFileSync(
      resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
      JSON.stringify({ status: "skipped", reason: "no_config" }, null, 2),
    );
    process.exit(0);
  }
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const isPlaceholder =
    !config.description ||
    /placeholder/i.test(config.description) ||
    !Array.isArray(config.affected_urls) ||
    config.affected_urls.length === 0;

  if (args.failOnlyRegression) {
    if (isPlaceholder) {
      writeFileSync(
        resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
        JSON.stringify(
          {
            mode: "fail-only-previously-resolved-expired",
            status: "skipped",
            reason: "config_is_placeholder",
          },
          null,
          2,
        ),
      );
      console.log("Regression-only mode: config is a placeholder — nothing to compare.");
      process.exit(0);
    }
    return runRegressionOnlyMode({
      config,
      allowlistPath: args.allowlistPath,
      previousPath: args.previousPath,
      now: args.now,
    });
  }

  const creds = loadGscCredentials();
  if (!creds.ok) {
    writeFileSync(
      resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
      JSON.stringify({ status: "skipped", reason: "gsc_oauth_not_configured", missing: creds.missing }, null, 2),
    );
    console.log("GSC OAuth not configured — skipping last-finding verification.");
    process.exit(0);
  }
  if (isPlaceholder) {
    writeFileSync(
      resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
      JSON.stringify(
        {
          status: "skipped",
          reason: "config_is_placeholder",
          hint: "Update config/seo-last-gsc-finding.json with a real description and affected_urls before verification.",
        },
        null,
        2,
      ),
    );
    console.log("Last-finding config is a placeholder — refusing to mark resolved.");
    process.exit(0);
  }
  const accessToken = await getAccessToken(creds);
  const urls = config.affected_urls ?? [];
  const results = [];
  for (const url of urls) {
    try {
      const raw = await inspectUrl({ accessToken, siteUrl: creds.siteUrl, inspectionUrl: url });
      const summary = summarizeInspection(url, raw);
      const checks = evaluate(summary, config.expected_resolution ?? {});
      const resolved = checks.length > 0 && checks.every((c) => c.ok);
      results.push({ url, summary, checks, resolved });
    } catch (e) {
      results.push({ url, error: e.message, resolved: false });
    }
  }
  const allowlist = loadAllowlist(args.allowlistPath);
  const expiredCovering = findExpiredEntriesMatchingUrls(allowlist, urls, args.now ?? undefined);

  const allResolved =
    results.length > 0 && results.every((r) => r.resolved) && expiredCovering.length === 0;
  const status = expiredCovering.length > 0
    ? "unresolved_expired_allowlist"
    : allResolved
      ? "resolved"
      : "unresolved";
  const payload = {
    status,
    finding_id: config.finding_id,
    description: config.description,
    generated_at: new Date().toISOString(),
    expired_allowlist_entries_covering_finding: expiredCovering,
    results,
  };
  writeFileSync(
    resolve(ARTIFACT_DIR, "gsc-last-finding-verification.json"),
    JSON.stringify(payload, null, 2),
  );
  const md = [
    `# Last GSC Finding Verification`,
    ``,
    `- **finding_id:** ${config.finding_id}`,
    `- **status:** ${payload.status}`,
    `- **description:** ${config.description}`,
    ``,
    ...(expiredCovering.length
      ? [
          `⚠️ Refusing to mark resolved: ${expiredCovering.length} expired allowlist entr${expiredCovering.length === 1 ? "y" : "ies"} still cover the affected URLs.`,
          ...expiredCovering.map(
            (e) => `- \`${e.section}[${e.id}]\` expired on ${e.expires_on}`,
          ),
          ``,
        ]
      : []),
    ...results.map((r) => `- ${r.resolved ? "✅" : "❌"} ${r.url}`),
    ``,
  ].join("\n");
  writeFileSync(resolve(ARTIFACT_DIR, "gsc-last-finding-verification.md"), md);
  console.log(`Last finding verification: ${payload.status}`);
  process.exit(allResolved ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
