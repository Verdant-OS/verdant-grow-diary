// Pure helpers for the tracked SEO allowlist at config/seo-allowlist.json.
// No I/O side effects beyond the optional loader. Deterministic.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const DEFAULT_ALLOWLIST_PATH = resolve(process.cwd(), "config/seo-allowlist.json");

/** Convert a glob-ish pattern (supports trailing `*` and `/*`) to a RegExp. */
function patternToRegex(pattern) {
  // Escape regex metachars except `*`, then translate `*` → `.*`.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function nowIso() {
  return new Date().toISOString();
}

function isActive(entry, now = nowIso()) {
  if (!entry.expires_on) return true;
  return now.slice(0, 10) <= String(entry.expires_on).slice(0, 10);
}

function matchesAny(url, patterns) {
  return patterns.some((p) => patternToRegex(p).test(url));
}

/** Load and normalize the allowlist config. Returns an empty allowlist if missing. */
export function loadAllowlist(path = DEFAULT_ALLOWLIST_PATH) {
  if (!existsSync(path)) {
    return { allowlisted_issues: [], expected_noindex: [], never_allowlist: [], _source: null };
  }
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    allowlisted_issues: raw.allowlisted_issues ?? [],
    expected_noindex: raw.expected_noindex ?? [],
    never_allowlist: raw.never_allowlist ?? [],
    _source: path,
  };
}

/**
 * Return every entry (in `allowlisted_issues` and `expected_noindex`)
 * whose `expires_on` has passed as of `now` (ISO string).
 * Returned shape: [{ section, id, expires_on, url_patterns }].
 */
export function findExpiredEntries(allowlist, now = nowIso()) {
  const today = now.slice(0, 10);
  const out = [];
  for (const section of ["allowlisted_issues", "expected_noindex"]) {
    for (const e of allowlist[section] ?? []) {
      if (e.expires_on && String(e.expires_on).slice(0, 10) < today) {
        out.push({
          section,
          id: e.id ?? "(no-id)",
          expires_on: e.expires_on,
          url_patterns: e.url_patterns ?? [],
        });
      }
    }
  }
  return out;
}

/**
 * Dry-run: describe what the allowlist would do for a set of URLs, without
 * calling any external API. For each URL, list matching allowlist entries,
 * the issue codes they would suppress, and any override flags.
 */
export function simulateAllowlistForUrls(urls, allowlist, now = nowIso()) {
  const activeIssues = (allowlist.allowlisted_issues ?? []).filter((e) => isActive(e, now));
  const activeNoindex = (allowlist.expected_noindex ?? []).filter((e) => isActive(e, now));
  return urls.map((url) => {
    const isNever = isNeverAllowlisted(url, allowlist);
    const matchedIssues = isNever
      ? []
      : activeIssues
          .filter((e) => matchesAny(url, e.url_patterns ?? []))
          .map((e) => ({ id: e.id, issue_types: e.issue_types ?? [] }));
    const matchedNoindex = isNever
      ? []
      : activeNoindex
          .filter((e) => matchesAny(url, e.url_patterns ?? []))
          .map((e) => ({ id: e.id }));
    return {
      url,
      never_allowlisted: isNever,
      would_be_expected_noindex: matchedNoindex.length > 0,
      matched_expected_noindex_entries: matchedNoindex,
      would_suppress_issue_types: [
        ...new Set(matchedIssues.flatMap((m) => m.issue_types)),
      ],
      matched_allowlisted_issue_entries: matchedIssues,
    };
  });
}

/** True if the URL is listed in `never_allowlist` (exact match, case-sensitive). */
export function isNeverAllowlisted(url, allowlist) {
  return (allowlist.never_allowlist ?? []).includes(url);
}

/**
 * True if the URL should be treated as expected-noindex per the tracked
 * config. Ignores expired entries. Never applies to `never_allowlist` URLs.
 */
export function isExpectedNoindex(url, allowlist, now = nowIso()) {
  if (isNeverAllowlisted(url, allowlist)) return false;
  return (allowlist.expected_noindex ?? [])
    .filter((e) => isActive(e, now))
    .some((e) => matchesAny(url, e.url_patterns ?? []));
}

/**
 * Filter classifier issues through the allowlist. Returns:
 *   { kept: Issue[], suppressed: SuppressedIssue[] }
 * A suppressed issue records the matching allowlist entry id for audit.
 * `never_allowlist` URLs are never suppressed.
 */
export function applyAllowlist(url, issues, allowlist, now = nowIso()) {
  if (isNeverAllowlisted(url, allowlist)) {
    return { kept: [...issues], suppressed: [] };
  }
  const entries = (allowlist.allowlisted_issues ?? []).filter((e) => isActive(e, now));
  const kept = [];
  const suppressed = [];
  for (const issue of issues) {
    const match = entries.find(
      (e) =>
        (e.issue_types ?? []).includes(issue.code) && matchesAny(url, e.url_patterns ?? []),
    );
    if (match) {
      suppressed.push({ ...issue, suppressed_by: match.id });
    } else {
      kept.push(issue);
    }
  }
  return { kept, suppressed };
}

/**
 * Structural validation. Returns an array of error messages; empty = OK.
 * Enforces: shape, non-empty patterns, no `never_allowlist` URL captured by
 * any `expected_noindex` or `allowlisted_issues` pattern.
 */
export function validateAllowlist(allowlist) {
  const errs = [];
  const arr = (name) => Array.isArray(allowlist[name]) ? allowlist[name] : [];
  const check = (name) => {
    for (const e of arr(name)) {
      if (!e.id || typeof e.id !== "string") errs.push(`${name}: entry missing id`);
      if (!Array.isArray(e.url_patterns) || e.url_patterns.length === 0)
        errs.push(`${name}[${e.id}]: url_patterns must be a non-empty array`);
      if (name === "allowlisted_issues") {
        if (!Array.isArray(e.issue_types) || e.issue_types.length === 0)
          errs.push(`allowlisted_issues[${e.id}]: issue_types must be non-empty`);
      }
    }
  };
  check("allowlisted_issues");
  check("expected_noindex");
  const never = arr("never_allowlist");
  const trapped = (name) => {
    for (const e of arr(name)) {
      for (const url of never) {
        if (matchesAny(url, e.url_patterns ?? [])) {
          errs.push(
            `${name}[${e.id}] pattern captures never_allowlist URL ${url} — this would silence a critical page`,
          );
        }
      }
    }
  };
  trapped("allowlisted_issues");
  trapped("expected_noindex");
  return errs;
}
