#!/usr/bin/env node
/**
 * assert-premium-workbook-placeholder-safety
 * -----------------------------------------
 * Static scanner that enforces the Premium Workbook Copy access contract
 * documented in:
 *   - docs/commercial-release-review-traceability-workbook-spec.md §8
 *   - docs/seed-production-tracking-workbook-spec.md (any premium copy refs)
 *
 * Rules enforced across all public docs under `docs/`:
 *
 *  1. The placeholder token `{{PREMIUM_WORKBOOK_COPY_URL}}` is the ONLY
 *     workbook-copy URL allowed to appear in public docs. No real
 *     Google Sheets / Drive / Notion / Dropbox / OneDrive / signed URL
 *     may be inlined as a "premium workbook copy" link.
 *  2. The Commercial Release Review spec MUST contain both the placeholder
 *     and the exact fallback text so consumers know what to render.
 *  3. No entitlement / access secrets may appear in docs
 *     (`service_role`, bearer tokens, signed query params, bucket paths).
 *
 * Exit codes:
 *   0 — OK
 *   1 — at least one violation
 *
 * Pure read-only. No network. No writes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "docs");
const ALLOW_MARKER = "PREMIUM-WORKBOOK-SAFETY: ALLOW";

const PLACEHOLDER = "{{PREMIUM_WORKBOOK_COPY_URL}}";
const FALLBACK_TEXT_FRAGMENT =
  "Workbook copy link not configured. Premium subscribers should contact";

const REQUIRED_PRESENCE = [
  {
    file: "docs/commercial-release-review-traceability-workbook-spec.md",
    must: [
      { needle: PLACEHOLDER, reason: "placeholder token must be present" },
      { needle: FALLBACK_TEXT_FRAGMENT, reason: "exact fallback text must be present" },
    ],
  },
];

// Patterns that look like real workbook URLs. These trigger only when the
// surrounding context is premium-workbook-ish (within ~6 lines of a
// "premium workbook" / "workbook copy" / placeholder reference).
const REAL_URL_PATTERNS = [
  { name: "google-sheets", re: /https?:\/\/(?:docs\.google\.com\/spreadsheets|sheets\.google\.com)\/\S+/i },
  { name: "google-drive", re: /https?:\/\/drive\.google\.com\/\S+/i },
  { name: "notion", re: /https?:\/\/(?:[\w-]+\.)?notion\.so\/\S+/i },
  { name: "dropbox", re: /https?:\/\/(?:www\.)?dropbox\.com\/\S+/i },
  { name: "onedrive", re: /https?:\/\/(?:1drv\.ms|onedrive\.live\.com)\/\S+/i },
  { name: "signed-url-token", re: /https?:\/\/\S+[?&](?:token|signature|sig|expires|x-amz-signature)=\S+/i },
];

const PREMIUM_CONTEXT_RE =
  /(premium[- ]?(workbook|copy|link)|workbook copy|copy the workbook|premium subscribers|\{\{PREMIUM_WORKBOOK_COPY_URL\}\})/i;

// Two tiers of secret detection:
//   - SECRET_PATTERNS_ALWAYS: always violations regardless of context
//     (actual literal credentials).
//   - SECRET_PATTERNS_PREMIUM_ONLY: violations only inside premium-workbook
//     context — bare-word `service_role` / `SUPABASE_SERVICE_ROLE_KEY`
//     legitimately appear in security/architecture docs as guidance.
const SECRET_PATTERNS_ALWAYS = [
  { name: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
  { name: "entitlement-token-literal", re: /\b(entitlement|premium|workbook)[_-]?(token|secret|key)\s*[:=]\s*['"][^'"\s]+['"]/i },
  { name: "service-role-literal", re: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?[A-Za-z0-9._-]{20,}/i },
];
const SECRET_PATTERNS_PREMIUM_ONLY = [
  { name: "service_role", re: /\bservice_role\b/ },
  { name: "supabase-service-role-key", re: /\bSUPABASE_SERVICE_ROLE_KEY\b/ },
  { name: "private-bucket-path", re: /\b(?:s3|gs|r2):\/\/\S+/i },
];

const DENIAL =
  /\b(do not|don't|must not|never|forbidden|placeholder|example only|fallback|exact fallback|exact placeholder)\b/i;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function hasPremiumContext(lines, idx, radius = 6) {
  const lo = Math.max(0, idx - radius);
  const hi = Math.min(lines.length - 1, idx + radius);
  for (let i = lo; i <= hi; i++) {
    if (PREMIUM_CONTEXT_RE.test(lines[i])) return true;
  }
  return false;
}

export function scanText(text) {
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(ALLOW_MARKER)) continue;

    // Always-violations (literal credentials).
    for (const s of SECRET_PATTERNS_ALWAYS) {
      if (s.re.test(line) && !DENIAL.test(line)) {
        violations.push({
          line: i + 1,
          rule: `secret/${s.name}`,
          explanation: `Literal credential / secret must not appear in docs.`,
          text: line.trim(),
        });
      }
    }
    // Premium-context-only secrets: bare-word service_role mentions only
    // count when they sit inside premium-workbook context.
    for (const s of SECRET_PATTERNS_PREMIUM_ONLY) {
      if (s.re.test(line) && hasPremiumContext(lines, i) && !DENIAL.test(line)) {
        violations.push({
          line: i + 1,
          rule: `secret/${s.name}`,
          explanation: `Entitlement / access secret must not appear near premium-workbook copy.`,
          text: line.trim(),
        });
      }
    }

    // Real workbook URLs only count as violations when they sit inside a
    // premium-workbook context (so unrelated example links don't trip).
    for (const u of REAL_URL_PATTERNS) {
      if (u.re.test(line) && hasPremiumContext(lines, i) && !DENIAL.test(line)) {
        violations.push({
          line: i + 1,
          rule: `real-url/${u.name}`,
          explanation:
            "Real workbook URL appears in premium-workbook context; use {{PREMIUM_WORKBOOK_COPY_URL}} placeholder instead.",
          text: line.trim(),
        });
      }
    }
  }
  return violations;
}

function checkRequiredPresence() {
  const out = [];
  for (const req of REQUIRED_PRESENCE) {
    const abs = join(ROOT, req.file);
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      out.push(`${req.file}: required file missing`);
      continue;
    }
    for (const m of req.must) {
      if (!text.includes(m.needle)) {
        out.push(`${req.file}: ${m.reason} — missing fragment "${m.needle.slice(0, 60)}"`);
      }
    }
  }
  return out;
}

function format(file, v) {
  return `${file}:${v.line} [${v.rule}] "${v.text}" — ${v.explanation}`;
}

function main() {
  const files = walk(DOCS_DIR);
  let failed = 0;

  for (const file of files) {
    const rel = relative(ROOT, file);
    const violations = scanText(readFileSync(file, "utf8"));
    if (violations.length) {
      failed += violations.length;
      for (const v of violations) console.error(format(rel, v));
    }
  }

  const missing = checkRequiredPresence();
  if (missing.length) {
    failed += missing.length;
    for (const m of missing) console.error(m);
  }

  if (failed) {
    console.error(
      `\npremium-workbook-placeholder-safety: ${failed} violation(s) across ${files.length} doc file(s) scanned.`,
    );
    process.exit(1);
  }
  console.log(
    `premium-workbook-placeholder-safety: OK (${files.length} doc file(s) scanned, placeholder + fallback verified).`,
  );
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-premium-workbook-placeholder-safety.mjs");
if (invokedDirectly) main();
