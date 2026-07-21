#!/usr/bin/env node
// Summarize diff-money-migration-prefixes.mjs JSON output into a concise
// Markdown block suitable for a PR comment. Reads JSON from --in=PATH (or
// stdin) and writes Markdown to --out=PATH (or stdout).
//
// Handles both shapes emitted by the diff CLI:
//   1. Verify mode:   { target_env, expected_count, applied_count, missing_count, rows, missing }
//   2. Expected-only: { target_env, expected, malformed }
//
// Exits 0 always (summarization is best-effort — never fail the workflow here).

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const getArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const inPath = getArg("in");
const outPath = getArg("out");
const header = getArg("header") ?? "Money-migration prefix drift";

let raw = "";
try {
  raw = inPath ? readFileSync(inPath, "utf8") : readFileSync(0, "utf8");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  emit(`### ${header}\n\n_Could not read diff JSON (${msg}). See workflow artifacts._\n`);
  process.exit(0);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  emit(`### ${header}\n\n_Diff JSON was not parseable (${msg}). See workflow artifacts._\n`);
  process.exit(0);
}

const target = data.target_env ?? "unknown";
const lines = [];
lines.push(`### ${header} — \`${target}\``);

// Expected-only shape.
if (Array.isArray(data.expected) || Array.isArray(data.malformed)) {
  const expectedCount = Array.isArray(data.expected) ? data.expected.length : 0;
  const malformed = Array.isArray(data.malformed) ? data.malformed : [];
  if (malformed.length === 0) {
    lines.push("", `✅ ${expectedCount} required prefix(es) extracted cleanly. No manifest drift.`);
  } else {
    lines.push(
      "",
      `❌ **Manifest drift:** ${malformed.length} required file(s) have no 14-digit prefix.`,
      "",
      "| File | Reason |",
      "| --- | --- |",
      ...malformed.slice(0, 10).map((m) => `| \`${m.file}\` | ${escapeCell(m.reason)} |`),
    );
    if (malformed.length > 10) lines.push("", `_…and ${malformed.length - 10} more (see artifacts)._`);
  }
  emit(lines.join("\n") + "\n");
  process.exit(0);
}

// Verify shape.
const expected = Number(data.expected_count ?? 0);
const applied = Number(data.applied_count ?? 0);
const missing = Array.isArray(data.missing) ? data.missing : [];
const missingCount = Number(data.missing_count ?? missing.length);

if (missingCount === 0) {
  lines.push(
    "",
    `✅ All ${expected} required money migrations are applied in \`${target}\`.`,
    "",
    `_Applied: ${applied} / ${expected}_`,
  );
  emit(lines.join("\n") + "\n");
  process.exit(0);
}

lines.push(
  "",
  `❌ **${missingCount} required money migration(s) NOT applied in \`${target}\`.** Do NOT deploy.`,
  "",
  `_Applied: ${applied} / ${expected} · Missing: ${missingCount}_`,
  "",
  "**Missing prefixes and files:**",
  "",
  "| Prefix | File |",
  "| --- | --- |",
  ...missing.slice(0, 15).map((m) => `| \`${m.version ?? "??"}\` | \`${m.file ?? "??"}\` |`),
);
if (missing.length > 15) lines.push("", `_…and ${missing.length - 15} more (see artifacts)._`);

lines.push(
  "",
  "**Likely causes:**",
  "- Required migration file added in this PR but not yet applied to the target DB.",
  "- Migration filename edited after apply (14-digit prefix changed).",
  "- Wrong `SUPABASE_DB_URL_*` secret pointed at a stale environment.",
  "",
  "Re-run once the missing migrations are applied. Full audit in the `money-migration-audit-*` artifact bundle.",
);

emit(lines.join("\n") + "\n");

function emit(text) {
  if (outPath) writeFileSync(outPath, text);
  else process.stdout.write(text);
}

function escapeCell(v) {
  return String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
