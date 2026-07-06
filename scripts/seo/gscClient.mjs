// Shared GSC helpers: credential loading + token refresh + URL Inspection.
// Read-only. No secrets logged.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN_PATH = resolve(process.cwd(), ".seo/gsc-token.local.json");

export function loadGscCredentials() {
  const env = process.env;
  let refreshToken = env.GSC_REFRESH_TOKEN || null;
  let siteUrl = env.GSC_SITE_URL || null;
  const clientId = env.GSC_CLIENT_ID || null;
  const clientSecret = env.GSC_CLIENT_SECRET || null;

  if (!refreshToken && existsSync(TOKEN_PATH)) {
    try {
      const local = JSON.parse(readFileSync(TOKEN_PATH, "utf8"));
      refreshToken = refreshToken || local.refresh_token || null;
      siteUrl = siteUrl || local.site_url || null;
    } catch {
      // ignore malformed local token; fall through
    }
  }

  const missing = [];
  if (!clientId) missing.push("GSC_CLIENT_ID");
  if (!clientSecret) missing.push("GSC_CLIENT_SECRET");
  if (!refreshToken) missing.push("GSC_REFRESH_TOKEN or .seo/gsc-token.local.json");
  if (!siteUrl) missing.push("GSC_SITE_URL");
  if (missing.length) return { ok: false, missing };
  return { ok: true, clientId, clientSecret, refreshToken, siteUrl };
}

export async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    // Do NOT include response body — it may echo tokens/ids.
    throw new Error(`GSC token refresh failed: HTTP ${r.status}`);
  }
  const j = await r.json();
  return j.access_token;
}

export async function inspectUrl({ accessToken, siteUrl, inspectionUrl }) {
  const r = await fetch(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl, siteUrl }),
    },
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`URL Inspection failed for ${inspectionUrl}: HTTP ${r.status} ${text.slice(0, 200)}`);
  }
  return r.json();
}

/** Extract a compact, redaction-safe summary from the inspection response. */
export function summarizeInspection(inspectionUrl, raw) {
  const idx = raw?.inspectionResult?.indexStatusResult ?? {};
  const mob = raw?.inspectionResult?.mobileUsabilityResult ?? null;
  const rich = raw?.inspectionResult?.richResultsResult ?? null;
  return {
    url: inspectionUrl,
    verdict: idx.verdict ?? "VERDICT_UNSPECIFIED",
    coverageState: idx.coverageState ?? null,
    robotsTxtState: idx.robotsTxtState ?? null,
    indexingState: idx.indexingState ?? null,
    pageFetchState: idx.pageFetchState ?? null,
    googleCanonical: idx.googleCanonical ?? null,
    userCanonical: idx.userCanonical ?? null,
    lastCrawlTime: idx.lastCrawlTime ?? null,
    mobileVerdict: mob?.verdict ?? null,
    richResultsVerdict: rich?.verdict ?? null,
  };
}

/**
 * Classify a summary into critical issues.
 * Returns an array of { code, message } — empty means clean.
 */
export function classifyIssues(summary, { expectedIndexable = true } = {}) {
  const issues = [];
  const { url } = summary;
  if (expectedIndexable) {
    if (summary.verdict && summary.verdict !== "PASS" && summary.verdict !== "NEUTRAL") {
      issues.push({ code: "verdict_not_pass", message: `${url}: verdict=${summary.verdict}` });
    }
    if (summary.coverageState && /not indexed|excluded|error/i.test(summary.coverageState)) {
      issues.push({ code: "not_indexed", message: `${url}: coverage=${summary.coverageState}` });
    }
    if (summary.robotsTxtState && summary.robotsTxtState !== "ALLOWED") {
      issues.push({ code: "blocked_by_robots", message: `${url}: robots=${summary.robotsTxtState}` });
    }
    if (summary.indexingState && /BLOCKED_BY_META_TAG|BLOCKED_BY_HTTP_HEADER/i.test(summary.indexingState)) {
      issues.push({ code: "noindex_detected", message: `${url}: indexingState=${summary.indexingState}` });
    }
    if (summary.pageFetchState && summary.pageFetchState !== "SUCCESSFUL") {
      issues.push({ code: "fetch_failed", message: `${url}: pageFetchState=${summary.pageFetchState}` });
    }
    if (
      summary.userCanonical &&
      summary.googleCanonical &&
      summary.userCanonical !== summary.googleCanonical
    ) {
      issues.push({
        code: "canonical_mismatch",
        message: `${url}: userCanonical=${summary.userCanonical} googleCanonical=${summary.googleCanonical}`,
      });
    }
  }
  if (summary.mobileVerdict && summary.mobileVerdict !== "PASS" && summary.mobileVerdict !== "VERDICT_UNSPECIFIED") {
    issues.push({ code: "mobile_usability", message: `${url}: mobileVerdict=${summary.mobileVerdict}` });
  }
  if (summary.richResultsVerdict && summary.richResultsVerdict === "FAIL") {
    issues.push({ code: "rich_results", message: `${url}: richResultsVerdict=FAIL` });
  }
  return issues;
}
