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
 * (server-only; may legitimately reference `service_role`), and test files.
 * Scanner fixtures outside those roots remain allow-listed by exact path.
 *
 * Uses TypeScript AST masking so comments, ordinary strings, and
 * regular-expression literals are ignored without confusing comment markers
 * or quote characters inside another token class. Concrete Stripe/Paddle
 * secret-shaped string literals receive a separate fail-closed scan.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const SCAN_ROOTS = ["src", "public", "dist"];

export const FILE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|html|css|json|map|txt|md)$/;

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

/** Concrete credential shapes must also be detected inside string/template
 *  literals in source and minified bundles. Control-string patterns stay on
 *  the executable-code pass so harmless copy and audit labels remain usable. */
export const LITERAL_SECRET_PATTERN_NAMES = new Set([
  "paddle_ntfset_secret",
  "stripe_live_secret",
  "stripe_test_secret",
]);

const LITERAL_SECRET_PATTERNS = FORBIDDEN_PATTERNS.filter((pattern) =>
  LITERAL_SECRET_PATTERN_NAMES.has(pattern.name),
);

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

export const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

export function isTestFilePath(relPath) {
  const normalized = relPath.replace(/\\/g, "/");
  return (
    normalized.startsWith("src/test/") ||
    normalized.includes("/__tests__/") ||
    TEST_FILE_RE.test(normalized)
  );
}

const MASKED_SYNTAX_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

const LITERAL_SECRET_SYNTAX_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

// Minifiers may rewrite a quoted RLS-audit key into `.service_role`. The
// source pass remains strict; only static property names in published bundles
// are masked so generated syntax cannot create a false violation.
const PUBLISHED_STATIC_PROPERTY_NAMES = new Set(["service_role"]);

function isLineBreak(ch) {
  return ch === "\n" || ch === "\r";
}

function scriptKindForPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function blankRange(out, start, end) {
  for (let index = start; index < end; index += 1) {
    if (!isLineBreak(out[index])) out[index] = " ";
  }
}

function blankComments(out) {
  let index = 0;
  while (index < out.length) {
    if (out[index] !== "/") {
      index += 1;
      continue;
    }

    if (out[index + 1] === "/") {
      const start = index;
      index += 2;
      while (index < out.length && !isLineBreak(out[index])) index += 1;
      blankRange(out, start, index);
      continue;
    }

    if (out[index + 1] === "*") {
      const start = index;
      index += 2;
      while (index < out.length && !(out[index] === "*" && out[index + 1] === "/")) {
        index += 1;
      }
      if (index < out.length) index += 2;
      blankRange(out, start, index);
      continue;
    }

    index += 1;
  }
}

function isPublishedStaticPropertyName(node) {
  if (!ts.isIdentifier(node) || !PUBLISHED_STATIC_PROPERTY_NAMES.has(node.text)) return false;

  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isGetAccessorDeclaration(parent) && parent.name === node) ||
    (ts.isSetAccessorDeclaration(parent) && parent.name === node)
  );
}

function createSourceFile(src, filePath) {
  return ts.createSourceFile(
    filePath,
    src,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(filePath),
  );
}

function patternMatches(pattern, body) {
  const re = new RegExp(pattern.re.source, pattern.re.flags.includes("i") ? "gi" : "g");
  return re.test(body);
}

function analyzeSource(src, filePath, { maskPublishedPropertyNames = false } = {}) {
  const out = src.split("");
  const sourceFile = createSourceFile(src, filePath);

  // Malformed published code is suspicious. Scan the raw source so a parser
  // failure cannot hide a concrete credential.
  if (sourceFile.parseDiagnostics.length > 0) {
    return {
      body: src,
      literalHits: new Set(
        LITERAL_SECRET_PATTERNS.filter((pattern) => patternMatches(pattern, src)).map(
          (pattern) => pattern.name,
        ),
      ),
    };
  }

  const literalHits = new Set();
  function visit(node) {
    if (maskPublishedPropertyNames && isPublishedStaticPropertyName(node)) {
      blankRange(out, node.getStart(sourceFile), node.end);
      return;
    }
    if (LITERAL_SECRET_SYNTAX_KINDS.has(node.kind)) {
      const text = typeof node.text === "string" ? node.text : node.getText(sourceFile);
      for (const pattern of LITERAL_SECRET_PATTERNS) {
        if (patternMatches(pattern, text)) literalHits.add(pattern.name);
      }
    }
    if (MASKED_SYNTAX_KINDS.has(node.kind)) {
      blankRange(out, node.getStart(sourceFile), node.end);
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  blankComments(out);
  return { body: out.join(""), literalHits };
}

export function scrubSource(
  src,
  filePath = "scan.ts",
  { maskPublishedPropertyNames = false } = {},
) {
  return analyzeSource(src, filePath, { maskPublishedPropertyNames }).body;
}

export function findOffending(src, { scrub = true, filePath = "scan.ts", published = false } = {}) {
  const analysis = scrub
    ? analyzeSource(src, filePath, { maskPublishedPropertyNames: published })
    : { body: src, literalHits: new Set() };
  const hits = [];
  for (const p of FORBIDDEN_PATTERNS) {
    if (patternMatches(p, analysis.body) || analysis.literalHits.has(p.name)) hits.push(p.name);
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
      if (isTestFilePath(relPath)) continue;
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
      const hits = findOffending(src, {
        scrub: isCode,
        filePath: relPath,
        published: isCode && relPath.startsWith("dist/"),
      });
      if (hits.length > 0) violations.push({ file: relPath, hits });
    }
  }
  return violations;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

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
