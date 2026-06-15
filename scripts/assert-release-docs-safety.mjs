#!/usr/bin/env node
/**
 * Verdant Release Docs Safety Scanner
 * -----------------------------------
 * Lightweight, dependency-free static check that scans `docs/releases/**\/*.md`
 * for unsafe claims. Release notes must not imply that a docs/test-only slice
 * introduced live telemetry, import writes, AI diagnosis behavior changes,
 * Action Queue auto-writes, device control, schema/RLS/Edge changes, or
 * exposed raw payloads/secrets.
 *
 * A line that triggers a forbidden phrase may be exempted by:
 *   - Being part of a "must not"/"do not"/"never"/"no " denial,
 *   - Being a markdown heading describing what is NOT in the slice,
 *   - Or by including the literal allow marker:
 *       RELEASE-DOCS-SAFETY: ALLOW
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

/** Forbidden phrases (case-insensitive). Each entry: [pattern, label]. */
const FORBIDDEN = [
  [/\blive telemetry (was|is now|has been) (added|enabled|shipped)\b/i, "claims live telemetry was added"],
  [/\bcsv\b.{0,40}\b(is|are|now) live\b/i, "claims CSV data is live"],
  [/\bimported (data|history) (is|are|now) live\b/i, "claims imported data is live"],
  [/\bimport writes? (are|is|were|have been) (enabled|shipped|added)\b/i, "claims import writes enabled"],
  [/\bai (diagnosis|doctor) behavior (was|is|has been) (changed|updated|modified)\b/i, "claims AI diagnosis behavior changed"],
  [/\baction[- ]queue rows? (are|is) automatically (created|written|inserted)\b/i, "claims Action Queue auto-writes"],
  [/\bauto[- ]?(create|insert|write)s? .{0,40}action[- ]queue\b/i, "claims Action Queue auto-writes"],
  [/\bdevice control (was|is|has been) (added|enabled|shipped)\b/i, "claims device control added"],
  [/\bautomation (was|is|has been) (added|enabled|shipped)\b/i, "claims automation added"],
  [/\b(schema|rls|edge function|edge-function) (change|update|migration)s? (was|were|are|have been) (added|shipped|applied)\b/i, "claims schema/RLS/Edge change"],
  [/\bservice[_ ]role[_ ]key\b/i, "exposes service_role key"],
  [/\bSUPABASE_SERVICE_ROLE_KEY\b/, "exposes SUPABASE_SERVICE_ROLE_KEY"],
  [/\bbridge[_ ]token\s*[:=]\s*\S+/i, "exposes bridge token value"],
  [/\braw[_ ]payload\s*[:=]\s*\{/i, "exposes raw_payload contents"],
];

/** Skip lines that are clearly denials/negations. */
// Tolerate markdown emphasis like "Do **not**" by stripping `*` and `_` before checking.
const DENIAL = /\b(do not|don't|must not|cannot|never|no |without |refus(e|ed|es)|prohibit|forbid|not (added|enabled|shipped|changed|written|created|claim)|remains? (test|context|docs)-only|claim(s|ed)? .{0,20}(was|were|is|are|has|have))\b/i;
const stripEmphasis = (s) => s.replace(/[*_`]/g, "");
const ALLOW_MARKER = "RELEASE-DOCS-SAFETY: ALLOW";

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function scanFile(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripEmphasis(raw);
    if (line.includes(ALLOW_MARKER)) continue;
    if (DENIAL.test(line)) continue;
    // Skip negation-style headings like "## What did NOT change"
    if (/^#{1,6}\s.*\b(not|never|no)\b/i.test(line)) continue;
    for (const [re, label] of FORBIDDEN) {
      if (re.test(line)) {
        violations.push({ line: i + 1, label, text: line.trim() });
      }
    }
  }
  return violations;
}

function main() {
  const files = walk(RELEASES_DIR);
  let failed = 0;
  for (const file of files) {
    const v = scanFile(file);
    if (v.length) {
      failed += v.length;
      console.error(`\n✗ ${relative(ROOT, file)}`);
      for (const { line, label, text } of v) {
        console.error(`  L${line}: ${label}`);
        console.error(`    > ${text}`);
      }
    }
  }
  if (failed) {
    console.error(`\nRelease docs safety: ${failed} violation(s) across ${files.length} file(s).`);
    process.exit(1);
  }
  console.log(`Release docs safety: OK (${files.length} file(s) scanned).`);
}

main();
