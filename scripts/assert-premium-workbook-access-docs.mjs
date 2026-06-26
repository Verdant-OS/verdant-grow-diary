#!/usr/bin/env node
/**
 * assert-premium-workbook-access-docs
 * -----------------------------------
 * Static docs validator for premium workbook access language.
 *
 * Scans all `docs/**\/*.md` files that reference `PREMIUM_WORKBOOK_COPY_URL`
 * and enforces:
 *   - the literal `{{PREMIUM_WORKBOOK_COPY_URL}}` placeholder is present
 *     in the Commercial Release Review spec.
 *   - the exact fallback text is present.
 *   - server-side / entitlement-gate safety copy is present.
 *   - public-vs-authenticated do/don't language is present.
 *   - no real premium workbook URLs leak (Google Sheets/Drive, Dropbox,
 *     Notion, Sheets/Storage APIs, supabase storage), no signed-URL
 *     markers, no internal bucket / entitlement secret hints.
 *
 * Pure read-only. No network. Exits 1 on STOP-SHIP findings.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "docs");
const PLACEHOLDER = "{{PREMIUM_WORKBOOK_COPY_URL}}";
const COMMERCIAL_SPEC = join(
  DOCS_DIR,
  "commercial-release-review-traceability-workbook-spec.md",
);

export const REQUIRED_FALLBACK_TEXT =
  "Workbook copy link not configured. Premium subscribers should contact support or check back after the workbook link is configured.";

export const REQUIRED_SERVER_SIDE_COPY =
  "Premium access controls must be enforced server-side or through an approved entitlement gate before any real workbook copy link is shown.";

// Substrings that, when all present in the spec, prove the public-vs-
// authenticated do/don't contract is documented.
export const REQUIRED_DO_DONT_FRAGMENTS = [
  /public docs.*must not.*(real|expose).*workbook|publish a real .* url in\s+public docs/i,
  /unauthenticated ui|render the workbook link in unauthenticated/i,
  /premium entitlement\s+verification|verify entitlement before/i,
];

// Comment marker lets docs intentionally show an example forbidden URL
// (e.g. in a "Do not" block) without tripping the scanner.
const ALLOW_MARKER = "<!-- premium-workbook-access-docs:allow -->";

// Forbidden real-URL / token patterns (always violations, anywhere).
export const FORBIDDEN_URL_PATTERNS = [
  { name: "docs.google.com", re: /docs\.google\.com\/\S+/i },
  { name: "drive.google.com", re: /drive\.google\.com\/\S+/i },
  { name: "sheets.googleapis.com", re: /sheets\.googleapis\.com\/\S+/i },
  { name: "storage.googleapis.com", re: /storage\.googleapis\.com\/\S+/i },
  { name: "dropbox.com", re: /\bdropbox\.com\/\S+/i },
  { name: "notion.site", re: /\bnotion\.site\/\S+/i },
  { name: "notion.so", re: /\bnotion\.so\/\S+/i },
  { name: "supabase.co/storage", re: /supabase\.co\/storage\/\S+/i },
];

export const FORBIDDEN_TOKEN_PATTERNS = [
  { name: "X-Amz-Signature", re: /X-Amz-Signature[=:]/i },
  { name: "access_token=", re: /access_token\s*=/i },
  { name: "token=", re: /[?&]token\s*=/i },
  { name: "signature=", re: /[?&]signature\s*=/i },
  { name: "expires=", re: /[?&]expires\s*=/i },
];

// Internal bucket / entitlement secret hints. These only fire when a
// real value appears (literal assignment or a path-like usage), so the
// many docs that legitimately discuss `service_role` as guidance stay
// clean.
export const FORBIDDEN_SECRET_PATTERNS = [
  {
    name: "private-bucket-path",
    re: /(?:^|[\s"'`(])(?:private|premium)\/[A-Za-z0-9._\-/]+/i,
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY-literal",
    re: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?[A-Za-z0-9._\-]{20,}/i,
  },
  {
    name: "entitlement-secret-literal",
    re: /\b(entitlement|premium|workbook)[_-]?(token|secret|key)\s*[:=]\s*['"][^'"\s]+['"]/i,
  },
  { name: "bearer-token-literal", re: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
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

export function scanText(text) {
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(ALLOW_MARKER)) continue;
    // The literal placeholder must be passed through untouched.
    const scrubbed = line.split(PLACEHOLDER).join("");

    for (const u of FORBIDDEN_URL_PATTERNS) {
      if (u.re.test(scrubbed)) {
        violations.push({
          line: i + 1,
          rule: `forbidden-url/${u.name}`,
          text: line.trim(),
        });
      }
    }
    for (const t of FORBIDDEN_TOKEN_PATTERNS) {
      if (t.re.test(scrubbed)) {
        violations.push({
          line: i + 1,
          rule: `forbidden-token/${t.name}`,
          text: line.trim(),
        });
      }
    }
    for (const s of FORBIDDEN_SECRET_PATTERNS) {
      if (s.re.test(scrubbed)) {
        violations.push({
          line: i + 1,
          rule: `forbidden-secret/${s.name}`,
          text: line.trim(),
        });
      }
    }
  }
  return violations;
}

export function checkSpecRequiredCopy(text) {
  const missing = [];
  if (!text.includes(PLACEHOLDER)) missing.push("placeholder");
  if (!text.includes(REQUIRED_FALLBACK_TEXT)) missing.push("fallback-text");
  if (!text.includes(REQUIRED_SERVER_SIDE_COPY)) missing.push("server-side-safety-copy");
  for (const re of REQUIRED_DO_DONT_FRAGMENTS) {
    if (!re.test(text)) missing.push(`do-dont-fragment:${re}`);
  }
  return missing;
}

function main() {
  const files = walk(DOCS_DIR);
  const inScope = [];
  let placeholderCount = 0;
  let totalViolations = 0;
  let stopShip = false;

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const isCommercial = file === COMMERCIAL_SPEC;
    const hasPlaceholderRef =
      text.includes(PLACEHOLDER) || /PREMIUM_WORKBOOK_COPY_URL/.test(text);
    if (!hasPlaceholderRef && !isCommercial) continue;
    inScope.push(file);
    placeholderCount += (text.match(/\{\{PREMIUM_WORKBOOK_COPY_URL\}\}/g) || []).length;

    const violations = scanText(text);
    for (const v of violations) {
      stopShip = true;
      totalViolations++;
      console.error(
        `${relative(ROOT, file)}:${v.line} [${v.rule}] ${v.text}`,
      );
    }
  }

  // Required copy lives in the Commercial Release spec.
  let commercialMissing = [];
  try {
    const commercialText = readFileSync(COMMERCIAL_SPEC, "utf8");
    commercialMissing = checkSpecRequiredCopy(commercialText);
  } catch {
    commercialMissing = ["spec-not-found"];
  }
  if (commercialMissing.length) {
    stopShip = true;
    for (const m of commercialMissing) {
      console.error(
        `${relative(ROOT, COMMERCIAL_SPEC)}: missing required copy — ${m}`,
      );
    }
  }

  if (stopShip) {
    console.error(
      `\npremium-workbook-access-docs: STOP-SHIP (${totalViolations} forbidden hit(s), ${commercialMissing.length} missing required copy fragment(s) across ${inScope.length} in-scope doc(s)).`,
    );
    process.exit(1);
  }
  console.log(
    `premium-workbook-access-docs: PASS (${inScope.length} doc(s) scanned, ${placeholderCount} placeholder occurrence(s), 0 forbidden hits, all required copy present).`,
  );
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-premium-workbook-access-docs.mjs");
if (invokedDirectly) main();
