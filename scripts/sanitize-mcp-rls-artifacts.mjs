#!/usr/bin/env node
/**
 * CI-side sanitizer for MCP local RLS harness failure artifacts.
 *
 * Rewrites every file in the given directory (default:
 * artifacts/mcp-local-rls) in place, redacting token/secret-like content
 * before the workflow uploads it. The workflow also uploads the raw
 * vitest-output.log on failure, and a failing leakage assertion prints
 * the received payload verbatim — so this mirrors the sensitive-key
 * rules in src/test/mcp-local-rls-integration.test.ts for free text,
 * not just bare token formats:
 *   - JWT-like strings
 *   - Bearer tokens
 *   - Supabase sb_secret_/sb_publishable_ key formats
 *   - refresh/access/bridge token and client-secret key/value pairs
 *     (`refresh_token=xyz`, `"client_secret": "…"`)
 *   - authorization/cookie/api-key header values (redacted to
 *     end-of-line — over-redacting a header line is fail-safe)
 *   - raw_payload values
 *   - live values of LOCAL_SUPABASE_* / SUPABASE_* key env vars
 *
 * Node built-ins only. Never fails the job: sanitization problems must
 * not mask the original test failure — but a file it cannot sanitize is
 * deleted rather than uploaded raw.
 *
 * Exports sanitizeText() so the redaction rules are unit-tested directly
 * (src/test/mcp-rls-artifact-sanitizer.test.ts); the directory rewrite
 * only runs when invoked as a CLI.
 */
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const REDACTED = "[REDACTED]";

/** Bare secret formats, redacted wherever they appear. */
const BARE_SECRET_RULES = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g,
];

/**
 * Sensitive key/value pairs in free text. Keeps the key visible (useful
 * when debugging what leaked) and redacts only the value. Values may be
 * quoted JSON strings or bare `key=value` / `key: value` forms.
 */
const QUOTED_OR_BARE_VALUE = /"(?:[^"\\]|\\.)*"|'[^'\r\n]*'|[^\s,;&)}\]]+/;
const KEYED_VALUE_RULES = [
  // refresh_token / access_token / bridge_token / bridge-token …
  new RegExp(
    `("?(?:refresh|access|bridge)[_-]?token"?\\s*[:=]\\s*)(${QUOTED_OR_BARE_VALUE.source})`,
    "gi",
  ),
  // client_secret / client-secret
  new RegExp(`("?client[_-]?secret"?\\s*[:=]\\s*)(${QUOTED_OR_BARE_VALUE.source})`, "gi"),
  // raw_payload — object/array values redact to end of line (nested JSON
  // cannot be bounded safely by a regex; over-redacting is fail-safe).
  new RegExp(`("?raw_payload"?\\s*[:=]\\s*)("(?:[^"\\\\]|\\\\.)*"|[^\\r\\n]+)`, "gi"),
];

/** Header-style lines: redact everything after the separator. */
const HEADER_VALUE_RULES = [
  /(["']?(?:authorization|proxy-authorization|x-api-key|api[_-]?key|cookie|set-cookie)["']?\s*[:=]\s*)[^\r\n]+/gi,
];

export function sanitizeText(text, extraSecrets = []) {
  let out = text;
  for (const secret of extraSecrets) out = out.split(secret).join(REDACTED);
  for (const re of BARE_SECRET_RULES) out = out.replace(re, REDACTED);
  for (const re of HEADER_VALUE_RULES) out = out.replace(re, `$1${REDACTED}`);
  for (const re of KEYED_VALUE_RULES) out = out.replace(re, `$1${REDACTED}`);
  return out;
}

const SENSITIVE_ENV_NAMES = [
  "LOCAL_SUPABASE_ANON_KEY",
  "LOCAL_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function main() {
  const dir = process.argv[2] || "artifacts/mcp-local-rls";
  if (!existsSync(dir)) {
    console.log(`sanitize-mcp-rls-artifacts: nothing to do (${dir} missing)`);
    return;
  }

  const envSecrets = SENSITIVE_ENV_NAMES.map((n) => process.env[n]).filter(
    (v) => typeof v === "string" && v.length >= 8,
  );

  let sanitized = 0;
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (!statSync(file).isFile()) continue;
    try {
      const text = readFileSync(file, "utf8");
      writeFileSync(file, sanitizeText(text, envSecrets), "utf8");
      sanitized += 1;
    } catch {
      // Never upload a file we could not sanitize.
      try {
        rmSync(file, { force: true });
        console.log(`sanitize-mcp-rls-artifacts: removed unsanitizable file ${name}`);
      } catch {
        /* best effort */
      }
    }
  }
  console.log(`sanitize-mcp-rls-artifacts: sanitized ${sanitized} file(s) in ${dir}`);
}

// Run the directory rewrite only when executed directly (CLI), never on
// import from the unit tests.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
