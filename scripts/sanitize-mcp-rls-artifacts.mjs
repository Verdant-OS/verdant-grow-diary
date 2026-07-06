#!/usr/bin/env node
/**
 * CI-side sanitizer for MCP local RLS harness failure artifacts.
 *
 * Rewrites every file in the given directory (default:
 * artifacts/mcp-local-rls) in place, redacting token/secret-like content
 * before the workflow uploads it. Mirrors the redaction rules in
 * src/test/helpers/mcpRlsHarnessOps.ts:
 *   - JWT-like strings
 *   - Bearer tokens
 *   - Supabase sb_secret_/sb_publishable_ key formats
 *   - live values of LOCAL_SUPABASE_* / SUPABASE_* key env vars
 *
 * Node built-ins only. Never fails the job: sanitization problems must
 * not mask the original test failure — but a file it cannot sanitize is
 * deleted rather than uploaded raw.
 */
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const REDACTED = "[REDACTED]";
const RULES = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g,
  /bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g,
];
const SENSITIVE_ENV_NAMES = [
  "LOCAL_SUPABASE_ANON_KEY",
  "LOCAL_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const dir = process.argv[2] || "artifacts/mcp-local-rls";
if (!existsSync(dir)) {
  console.log(`sanitize-mcp-rls-artifacts: nothing to do (${dir} missing)`);
  process.exit(0);
}

const envSecrets = SENSITIVE_ENV_NAMES.map((n) => process.env[n]).filter(
  (v) => typeof v === "string" && v.length >= 8,
);

let sanitized = 0;
for (const name of readdirSync(dir)) {
  const file = join(dir, name);
  if (!statSync(file).isFile()) continue;
  try {
    let text = readFileSync(file, "utf8");
    for (const secret of envSecrets) text = text.split(secret).join(REDACTED);
    for (const re of RULES) text = text.replace(re, REDACTED);
    writeFileSync(file, text, "utf8");
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
