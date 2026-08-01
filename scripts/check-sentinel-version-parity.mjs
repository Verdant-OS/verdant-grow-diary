#!/usr/bin/env node
/**
 * Sentinel-Version parity check.
 *
 * GEMINI.md mirrors the safety-critical core of AGENTS.md because Gemini cannot follow a
 * link to get context. Duplication invites drift, so this check fails the build when the
 * two versions disagree.
 *
 * It deliberately does NOT diff the prose. Comparing two hand-maintained prose blocks
 * byte-for-byte would either be trivially defeated by whitespace or produce constant
 * false failures. What it enforces is the *touch*: changing the core rules requires
 * bumping the version in both files in the same commit, which puts the mirror in front of
 * a reviewer. That is the property worth having.
 *
 * Every governance file must also carry a version, so a role file cannot silently drift
 * to an older constitution.
 */
import { readFileSync, existsSync } from "node:fs";

const VERSION_RE = /Sentinel-Version:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)/;

/** Files that must all agree on the version. AGENTS.md is canonical. */
const CANONICAL = "AGENTS.md";
const MIRRORS = [
  "GEMINI.md",
  "CLAUDE.md",
  ".grok/rules/verdant-grok-role.md",
  "docs/agents/README.md",
  "docs/agents/HANDOFF_PROTOCOL.md",
  "docs/agents/roles/grok.md",
  "docs/agents/roles/claude.md",
  "docs/agents/roles/codex.md",
  "docs/agents/roles/security.md",
  "docs/agents/roles/gemini.md",
  "docs/agents/roles/council-chair.md",
];

/** Markers proving GEMINI.md still carries an embedded core rather than a bare link. */
const CORE_BEGIN = "<!-- SENTINEL-CORE:BEGIN";
const CORE_END = "<!-- SENTINEL-CORE:END";

const problems = [];

function versionOf(path) {
  if (!existsSync(path)) {
    problems.push(`${path}: missing — every governance file must exist`);
    return null;
  }
  const text = readFileSync(path, "utf8");
  const match = VERSION_RE.exec(text);
  if (!match) {
    problems.push(`${path}: no "Sentinel-Version: YYYY-MM-DD.N" line found`);
    return null;
  }
  return { version: match[1], text };
}

const canonical = versionOf(CANONICAL);

for (const path of MIRRORS) {
  const found = versionOf(path);
  if (!found || !canonical) continue;
  if (found.version !== canonical.version) {
    problems.push(
      `${path}: Sentinel-Version ${found.version} does not match ${CANONICAL} ${canonical.version}`,
    );
  }
}

// GEMINI.md must still embed the core. A future edit that replaces the embedded rules
// with "see AGENTS.md" would silently leave Gemini with no constitution, because it
// cannot follow the link. That is the exact failure this mirror exists to prevent.
const gemini = existsSync("GEMINI.md") ? readFileSync("GEMINI.md", "utf8") : "";
if (gemini && !(gemini.includes(CORE_BEGIN) && gemini.includes(CORE_END))) {
  problems.push(
    "GEMINI.md: embedded SENTINEL-CORE block is missing. Gemini cannot follow a link " +
      "to AGENTS.md, so the core rules must stay inline between the markers.",
  );
}

if (problems.length > 0) {
  console.error("Sentinel-Version parity FAILED:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nBump the version in every governance file when the safety core, status ` +
      `vocabulary, startup gate, or operating order changes.`,
  );
  process.exit(1);
}

console.log(
  `Sentinel-Version parity OK — ${canonical.version} across ${MIRRORS.length + 1} governance files.`,
);
