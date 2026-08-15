#!/usr/bin/env node
/**
 * Sentinel mirror sync — the fixer half of check-sentinel-version-parity.mjs.
 *
 * The parity gate can tell you GEMINI.md's embedded SENTINEL-CORE has drifted
 * from AGENTS.md, and that the 12 governance files disagree on
 * Sentinel-Version, but it cannot repair either. Both are mechanical, and
 * doing them by hand is how a governance edit ends up failing CI twice: once
 * for the un-bumped version, once for the un-synced mirror. (Same fixer +
 * checker split as sync-edge-shared.mjs / verify-edge-shared-in-sync.mjs.)
 *
 * Usage:
 *   node scripts/sync-sentinel-mirror.mjs
 *       Re-embed AGENTS.md into GEMINI.md between the SENTINEL-CORE markers.
 *
 *   node scripts/sync-sentinel-mirror.mjs --set-version=2026-08-09.2
 *       Also stamp that Sentinel-Version across all 12 governance files first.
 *
 *   node scripts/sync-sentinel-mirror.mjs --check
 *       Report drift without writing (exit 1 if a write would be needed).
 *
 * Line endings are preserved as written; the parity gate normalizes CRLF
 * before comparing, so a CRLF checkout stays green.
 */
import { readFileSync, writeFileSync } from "node:fs";

const CANONICAL = "AGENTS.md";

/** Must match check-sentinel-version-parity.mjs exactly. */
const GOVERNANCE_FILES = [
  "AGENTS.md",
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

const VERSION_RE = /(Sentinel-Version:\s*)([0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)/g;
const VERSION_FORMAT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$/;
const CORE_BEGIN = /<!-- SENTINEL-CORE:BEGIN[^>]*-->/;
const CORE_END = /<!-- SENTINEL-CORE:END[^>]*-->/;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const setVersion = args.find((a) => a.startsWith("--set-version="))?.split("=")[1];

if (setVersion && !VERSION_FORMAT.test(setVersion)) {
  console.error(`Invalid --set-version "${setVersion}". Expected YYYY-MM-DD.N`);
  process.exit(2);
}

const changed = [];

if (setVersion) {
  for (const file of GOVERNANCE_FILES) {
    const text = readFileSync(file, "utf8");
    const next = text.replace(VERSION_RE, `$1${setVersion}`);
    if (next === text) continue;
    if (!checkOnly) writeFileSync(file, next);
    changed.push(`${file}: Sentinel-Version → ${setVersion}`);
  }
}

// Re-embed AGENTS.md into GEMINI.md. Read AFTER the version stamp so the
// mirror carries the new version rather than the old one.
const agents = readFileSync(CANONICAL, "utf8");
const gemini = readFileSync("GEMINI.md", "utf8");
const begin = CORE_BEGIN.exec(gemini);
const end = CORE_END.exec(gemini);

if (!begin || !end) {
  console.error(
    "GEMINI.md: SENTINEL-CORE markers not found. Gemini cannot follow a link to " +
      "AGENTS.md, so the constitution must stay inline between those markers.",
  );
  process.exit(1);
}

const embedded = gemini.slice(begin.index + begin[0].length, end.index);
const normalize = (s) => s.replace(/\r\n/g, "\n").trim();

if (normalize(embedded) !== normalize(agents)) {
  const rebuilt =
    gemini.slice(0, begin.index + begin[0].length) +
    "\n" +
    agents.replace(/\r\n/g, "\n").replace(/\n+$/, "") +
    "\n" +
    gemini.slice(end.index);
  if (!checkOnly) writeFileSync("GEMINI.md", rebuilt);
  changed.push("GEMINI.md: embedded SENTINEL-CORE re-synced from AGENTS.md");
}

if (changed.length === 0) {
  console.log("[sync-sentinel-mirror] already in sync — nothing to do.");
  process.exit(0);
}

for (const line of changed) console.log(`[sync-sentinel-mirror] ${line}`);

if (checkOnly) {
  console.error(
    `\n${changed.length} change(s) needed. Run: node scripts/sync-sentinel-mirror.mjs` +
      (setVersion ? ` --set-version=${setVersion}` : ""),
  );
  process.exit(1);
}

console.log(
  `[sync-sentinel-mirror] wrote ${changed.length} change(s). ` +
    "Verify with: node scripts/check-sentinel-version-parity.mjs",
);
