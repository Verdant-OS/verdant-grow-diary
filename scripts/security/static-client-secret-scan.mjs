#!/usr/bin/env node
/**
 * Extended static secret / control-string scanner for client and
 * published code. Complements scripts/assert-client-secret-boundary.mjs
 * (which is narrow, source-only) by adding:
 *
 *  - broader forbidden patterns (Paddle/Stripe/bridge secrets)
 *  - published-bundle scan (`dist/`) when it exists
 *  - `public/` scan for accidentally-shipped secrets
 *
 * Scope of scan (opt-in dirs — only scanned when they exist):
 *   src/, public/, dist/
 *
 * Never scanned: .env*, .git, node_modules, .seo/, supabase/functions/
 * (server-only; may legitimately reference `service_role`), test fixtures
 * dedicated to this scanner (allow-listed by exact path).
 *
 * Uses strip-comments-and-string-literals scrubbing (borrowed from
 * assert-client-secret-boundary.mjs) so denylist string arrays and
 * documentation comments are permitted.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";

export const SCAN_ROOTS = ["src", "public", "dist"];

export const FILE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|html|css|json|map|txt|md)$/;

/**
 * Patterns that must never appear in scanned code, even as identifiers.
 * Regex flags: case-insensitive, global.
 */
export const FORBIDDEN_PATTERNS = [
  { name: "SUPABASE_SERVICE_ROLE_KEY", re: /SUPABASE_SERVICE_ROLE_KEY/ },
  { name: "service_role", re: /\bservice_role\b/ },
  { name: "supabase_service_role", re: /supabase_service_role/i },
  { name: "PADDLE_WEBHOOK_SECRET", re: /PADDLE_WEBHOOK_SECRET/ },
  { name: "PADDLE_API_KEY", re: /PADDLE_(SANDBOX|LIVE)?_?API_KEY/ },
  { name: "STRIPE_SECRET_KEY", re: /STRIPE_SECRET_KEY/ },
  { name: "BRIDGE_TOKEN_ENV", re: /VERDANT_BRIDGE_TOKEN/ },
  { name: "bridge_token_ident", re: /\bBRIDGE_TOKEN\b/ },
  { name: "paddle_ntfset_secret", re: /pdl_ntfset_[A-Za-z0-9_]{6,}/ },
  { name: "stripe_live_secret", re: /\bsk_live_[A-Za-z0-9]{6,}/ },
  { name: "stripe_test_secret", re: /\bsk_test_[A-Za-z0-9]{6,}/ },
  { name: "bearer_env_template", re: /Bearer \$\{\s*process\.env/ },
  { name: "authorization_header_log", re: /console\.log\([^)]*authorization/i },
];

/** Exact relative paths that may legitimately reference these strings
 *  (scanner tests, allowlist docs). Keep narrow. */
export const EXACT_PATH_ALLOWLIST = new Set([
  "scripts/security/static-client-secret-scan.mjs",
  "scripts/security/test-static-client-secret-scan.mjs",
  "scripts/assert-client-secret-boundary.mjs",
  "scripts/test-client-secret-boundary.mjs",
  "scripts/check-client-secret-boundary-ci.mjs",
  "scripts/test-check-client-secret-boundary-ci.mjs",
]);

/** Path prefixes that are exempt from scanning (test fixtures, generated
 *  artifacts). Keep this list narrow and justified. */
export const PREFIX_ALLOWLIST = [
  "src/test/",
  "src/__tests__/",
  "src/integrations/supabase/types.ts",
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
function stripLiteralsAndRegex(src) {
  let out = src.replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '""');
  out = out.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\\n])*'/g, "''");
  out = out.replace(
    /([=(,;:!&|?{}\[\n>])\s*\/(?:\\.|[^\/\\\n])+\/[gimsuy]*/g,
    "$1/_/",
  );
  return out;
}
export function scrubSource(src) {
  return stripLiteralsAndRegex(stripComments(src));
}

export function findOffending(src, { scrub = true } = {}) {
  const body = scrub ? scrubSource(src) : src;
  const hits = [];
  for (const p of FORBIDDEN_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes("i") ? "gi" : "g");
    if (re.test(body)) hits.push(p.name);
  }
  return hits;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (FILE_EXT.test(name)) {
      yield full;
    }
  }
}

export function scanRepo(rootDir = process.cwd()) {
  const violations = [];
  for (const rel of SCAN_ROOTS) {
    const root = resolve(rootDir, rel);
    if (!existsSync(root)) continue;
    for (const file of walk(root)) {
      const relPath = relative(rootDir, file).replace(/\\/g, "/");
      if (EXACT_PATH_ALLOWLIST.has(relPath)) continue;
      if (PREFIX_ALLOWLIST.some((p) => relPath.startsWith(p))) continue;
      let src;
      try {
        src = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      // For non-source assets (json/html/css/map/txt/md) do NOT scrub —
      // any occurrence is a real leak.
      const isCode = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relPath);
      const hits = findOffending(src, { scrub: isCode });
      if (hits.length > 0) violations.push({ file: relPath, hits });
    }
  }
  return violations;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const violations = scanRepo(process.cwd());
  if (violations.length > 0) {
    console.error("Static client/published secret-scan violations:");
    for (const v of violations) {
      console.error(`  ${v.file}: ${v.hits.join(", ")}`);
    }
    process.exit(1);
  }
  console.log("Static client/published secret-scan OK.");
}
