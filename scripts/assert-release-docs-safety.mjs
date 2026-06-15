#!/usr/bin/env node
/**
 * Verdant Release Docs Safety Scanner
 * -----------------------------------
 * Lightweight, dependency-free static check that scans
 * `docs/releases/**\/*.md` for unsafe release-note claims.
 *
 * Release notes must not imply that a docs-only or test-only slice
 * introduced live telemetry, import writes, AI diagnosis behavior changes,
 * Action Queue auto-writes, device control, schema/RLS/Edge changes, or
 * exposed raw payloads / secrets / tokens.
 *
 * Each violation prints:
 *   <file>:<line> [<rule-name>] "<matched line>" — <explanation>
 *
 * Lines that are explicit safe negations (e.g. "not live telemetry",
 * "no device control", "does not expose secrets", "must not render",
 * "guards against ...") are skipped. A line may also be explicitly allowed
 * with the marker:
 *   RELEASE-DOCS-SAFETY: ALLOW
 *
 * Usage:
 *   node scripts/assert-release-docs-safety.mjs
 *
 * Exit codes:
 *   0 — no violations
 *   1 — one or more violations
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const RELEASES_DIR = join(ROOT, "docs", "releases");
const ALLOW_MARKER = "RELEASE-DOCS-SAFETY: ALLOW";

/**
 * Rules: each rule has a stable name, a regex, and an explanation shown in
 * the violation output. Keep regexes specific enough to avoid blocking safe
 * phrases like "not live telemetry" or "vendor secrets must not render".
 */
export const RULES = [
  {
    name: "no-live-import-claim",
    pattern: /\b(live import|live csv|csv is live|imported (data|history|telemetry|readings?) (is|are) live|added live import|enabled live import)\b/i,
    explanation: "Release docs must not claim CSV/imported data is live telemetry.",
  },
  {
    name: "no-import-write-claim",
    pattern: /\b(enabled|added|shipped) import writes?\b|\bimport writes? (are|is|were|have been) (enabled|shipped|added|turned on)\b|\bwrites? imported (readings?|history|data)\b/i,
    explanation: "Release docs must not claim import write paths were enabled.",
  },
  {
    name: "no-action-queue-auto-write",
    pattern: /\b(auto[- ]?created|automatically (created|written|inserted)) action[- ]queue\b|\bauto[- ]?(create|insert|write)s? .{0,40}action[- ]queue\b/i,
    explanation: "Action Queue rows must remain approval-required; auto-creation is not allowed.",
  },
  {
    name: "no-device-control",
    pattern: /\b(device control (was|is|has been) (added|enabled|shipped)|device automation added|controls equipment|executes? device commands?|executes? equipment|dispatchActuator|engageAutopilot)\b/i,
    explanation: "Device control / equipment execution must not be claimed in release docs.",
  },
  {
    name: "no-automation-shipped",
    pattern: /\bautomation (was|is|has been) (added|enabled|shipped|turned on)\b|\bshipped automation\b/i,
    explanation: "Blind automation must not be claimed in release docs.",
  },
  {
    name: "no-ai-behavior-change",
    pattern: /\bai (diagnosis|doctor) behavior (was|is|has been) (changed|updated|modified)\b|\bai now diagnoses\b|\bai automatically diagnoses\b/i,
    explanation: "AI diagnosis behavior must not be claimed as changed in docs-only slices.",
  },
  {
    name: "no-schema-change-claim",
    pattern: /\b(schema|rls|edge function|edge-function) (change|update|migration)s? (was|were|are|have been) (added|shipped|applied)\b/i,
    explanation: "Schema/RLS/Edge changes must not be claimed in docs-only or test-only slices.",
  },
  {
    name: "no-raw-payload-render",
    pattern: /\braw[_ ]payloads? (are|is|now) rendered\b|\bexposes? raw[_ ]payloads?\b|\brenders? raw[_ ]payloads?\b/i,
    explanation: "Raw payload internals must not be rendered or exposed.",
  },
  {
    name: "no-service-role-leak",
    pattern: /\b(service_role|SUPABASE_SERVICE_ROLE_KEY)\b/,
    explanation: "service_role must not appear in release docs (use safe descriptions).",
  },
  {
    name: "no-secret-value",
    pattern: /\b(secret|api[_ ]?key|bridge[_ ]?token|access[_ ]?token)\s*[:=]\s*\S+/i,
    explanation: "Secret/token literal values must not appear in release docs.",
  },
];

/**
 * Negation / context patterns that exempt a line from all rules. Covers
 * "do not", "must not", "never", "no <noun>", "without", "remains test-only",
 * "guards against", "prevents", "prohibits", and similar safe phrasings,
 * tolerating markdown emphasis like **not**.
 */
export const DENIAL = /\b(do(es)? not|don't|must not|cannot|never|no |without |refus(e|ed|es)|prohibit(s|ed)?|forbid(s|den)?|prevent(s|ed)?|guard(s|ed)? against|not (added|enabled|shipped|changed|written|created|claim|live|render(ed)?|exposed?)|remains? (test|context|docs|approval)-only|approval[- ]required|context[- ]only|test[- ]only|docs[- ]only|not live telemetry)\b/i;

const stripEmphasis = (s) => s.replace(/[*_`]/g, "");

export function scanText(text) {
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripEmphasis(raw);
    if (line.includes(ALLOW_MARKER)) continue;
    if (DENIAL.test(line)) continue;
    // Skip headings that describe what is NOT in the slice.
    if (/^#{1,6}\s.*\b(not|never|no|safety|guard|forbidden)\b/i.test(line)) continue;
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          line: i + 1,
          rule: rule.name,
          explanation: rule.explanation,
          text: raw.trim(),
        });
      }
    }
  }
  return violations;
}

export function formatViolation(file, v) {
  return `${file}:${v.line} [${v.rule}] "${v.text}" — ${v.explanation}`;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function main() {
  const files = walk(RELEASES_DIR);
  let failed = 0;
  for (const file of files) {
    const rel = relative(ROOT, file);
    const violations = scanText(readFileSync(file, "utf8"));
    if (violations.length) {
      failed += violations.length;
      for (const v of violations) console.error(formatViolation(rel, v));
    }
  }
  if (failed) {
    console.error(
      `\nRelease docs safety: ${failed} violation(s) across ${files.length} file(s) scanned.`,
    );
    process.exit(1);
  }
  console.log(`Release docs safety: OK (${files.length} file(s) scanned).`);
}

// Only run when invoked directly (allow import from tests).
const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-release-docs-safety.mjs");
if (invokedDirectly) main();
