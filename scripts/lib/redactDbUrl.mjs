/**
 * redactDbUrl — strip database credentials out of anything we are about to
 * print, upload, or publish.
 *
 * WHY THIS EXISTS
 *
 * scripts/probe-migration-drift.mjs passes the production connection string to
 * psql as an argv element. When psql fails WITHOUT writing to stderr (killed
 * before it emits diagnostics, OOM, a signal), the probe fell back to
 * String(error) for its diagnostic — and for an execFileSync failure that
 * string is "Error: Command failed: psql <the full URL> -tAc ...".
 *
 * That diagnostic is not merely logged. The scheduled probe writes it to
 * drift.json and the workflow copies it verbatim into a GitHub tracking issue,
 * so a password would have been published to an issue body. GitHub Actions
 * masks registered secrets in LOG output, but that masking does not extend to
 * issue bodies created through the API.
 *
 * The rule this module enforces: no code path may emit a connection string,
 * including paths nobody enumerated. It is deliberately pattern-based rather
 * than a list of known-bad strings, so a URL variant we were never handed —
 * one psql echoed back, one inside a stack frame — is caught too.
 */

/** What replaces anything credential-shaped. Recognisable in an issue body. */
export const REDACTION_PLACEHOLDER = "[redacted-db-url]";

/**
 * Any libpq connection URL embedded in surrounding text. Stops at whitespace
 * and at the quoting/markup characters that would normally delimit a URL, so a
 * URL at the end of a sentence or inside a fence is still fully consumed.
 *
 * Exported because .github/workflows/migration-drift-probe.yml inlines this
 * same pattern as a second, independent layer at the publishing boundary, and
 * a test pins the two together. Two hand-maintained copies of a security regex
 * drift apart; a pinned one cannot.
 */
export const CONNECTION_URL = /postgres(?:ql)?:\/\/[^\s"'`<>]+/gi;

/**
 * A password shorter than this is not redacted on its own. Real credentials
 * are long; blanket-replacing a short one would mangle unrelated prose (a
 * password of "postgres" would corrupt every "postgresql://" in the text).
 * The URL forms above are redacted regardless of password length.
 */
const MIN_STANDALONE_PASSWORD = 8;

/** Password of a connection URL, in both encoded and decoded form. */
function passwordVariants(url) {
  let encoded = "";
  try {
    encoded = new URL(url).password || "";
  } catch {
    return [];
  }
  if (!encoded) return [];
  const variants = [encoded];
  try {
    // Throws URIError on a bare '%' that is not valid percent-encoding, which
    // is legal inside a password. A failed decode must not break redaction.
    const decoded = decodeURIComponent(encoded);
    if (decoded !== encoded) variants.push(decoded);
  } catch {
    /* encoded form alone is still redacted */
  }
  return variants;
}

/**
 * Remove credential material from `text`.
 *
 * @param {unknown} text   anything about to be emitted
 * @param {string} [dbUrl] the connection string this process was handed, if known
 * @returns {string} the text with every connection URL and password replaced
 */
export function redactDbUrl(text, dbUrl) {
  if (text === null || text === undefined) return text;
  let out = String(text);

  // The exact URL we hold, first. Plain string splitting, not a regex, so a
  // metacharacter inside a password can never break the match.
  if (typeof dbUrl === "string" && dbUrl.length > 0) {
    out = out.split(dbUrl).join(REDACTION_PLACEHOLDER);
    for (const password of passwordVariants(dbUrl)) {
      if (password.length >= MIN_STANDALONE_PASSWORD) {
        out = out.split(password).join(REDACTION_PLACEHOLDER);
      }
    }
  }

  // Then any connection URL at all, however it reached us.
  return out.replace(CONNECTION_URL, REDACTION_PLACEHOLDER);
}
