#!/usr/bin/env node
/**
 * Sentinel-Version parity and bump check.
 *
 * GEMINI.md mirrors the safety-critical core of AGENTS.md because Gemini cannot follow a
 * link to get context. Duplication invites drift. Two rules together close it:
 *
 *   PARITY  every governance file carries the same Sentinel-Version.
 *   BUMP    if a governance file's content changed against the base revision, its
 *           Sentinel-Version must have changed too.
 *
 * They compose. Editing a safety rule in AGENTS.md trips BUMP, which forces a new
 * version, which trips PARITY on the other eleven files until each is updated — so the
 * GEMINI.md mirror lands in the same commit and in front of a reviewer.
 *
 * PARITY alone is not enough, and an earlier version of this file claimed otherwise. If
 * you change AGENTS.md and touch no version, all twelve still agree and PARITY passes.
 * That check catches divergent versions, never unchanged versions beside changed content.
 * BUMP is the half that was missing.
 *
 * BUMP needs a base revision. When one cannot be resolved the result is NOT_MEASURED, and
 * in CI that is a failure — a guarantee that cannot be verified is not reported as met.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const VERSION_RE = /Sentinel-Version:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)/;

/** AGENTS.md is canonical; the rest must agree with it. */
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
const ALL = [CANONICAL, ...MIRRORS];

/** Markers proving GEMINI.md still carries an embedded core rather than a bare link. */
const CORE_BEGIN = "<!-- SENTINEL-CORE:BEGIN";
const CORE_END = "<!-- SENTINEL-CORE:END";

const problems = [];
const notes = [];

function versionIn(text) {
  const match = VERSION_RE.exec(text);
  return match ? match[1] : null;
}

/**
 * Content with the version line removed, so "did the rules change?" is asked
 * independently of "did the version change?". Without this the two questions answer each
 * other and the check is circular.
 */
function normalize(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !VERSION_RE.test(line))
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------- PARITY

const head = new Map();

for (const path of ALL) {
  if (!existsSync(path)) {
    problems.push(`${path}: missing — every governance file must exist`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  const version = versionIn(text);
  if (!version) {
    problems.push(`${path}: no "Sentinel-Version: YYYY-MM-DD.N" line found`);
    continue;
  }
  head.set(path, { text, version });
}

const canonicalVersion = head.get(CANONICAL)?.version ?? null;

if (canonicalVersion) {
  for (const path of MIRRORS) {
    const entry = head.get(path);
    if (entry && entry.version !== canonicalVersion) {
      problems.push(
        `${path}: Sentinel-Version ${entry.version} does not match ${CANONICAL} ${canonicalVersion}`,
      );
    }
  }
}

// GEMINI.md must still embed the core. Replacing it with "see AGENTS.md" would silently
// leave Gemini with no constitution, because it cannot follow the link.
const geminiText = head.get("GEMINI.md")?.text ?? "";
if (geminiText && !(geminiText.includes(CORE_BEGIN) && geminiText.includes(CORE_END))) {
  problems.push(
    "GEMINI.md: embedded SENTINEL-CORE block is missing. Gemini cannot follow a link " +
      "to AGENTS.md, so the core rules must stay inline between the markers.",
  );
}

// ------------------------------------------------------------------ BUMP

/** Explicit base wins; otherwise the merge-base with the integration branch. */
function resolveBase() {
  const explicit = process.env.SENTINEL_BASE_SHA || process.argv[2];
  const candidates = explicit
    ? [explicit]
    : ["origin/main", "origin/verdant-grow-diary", "main"];

  for (const ref of candidates) {
    try {
      const sha = execFileSync("git", ["merge-base", "HEAD", ref], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (sha) return { ref, sha };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** File content at a revision, or null when the file did not exist there. */
function contentAt(sha, path) {
  try {
    return execFileSync("git", ["show", `${sha}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

const base = resolveBase();

if (!base) {
  const message =
    "BUMP check NOT_MEASURED — no base revision could be resolved. " +
    "Pass one as SENTINEL_BASE_SHA or argv[2].";
  if (process.env.CI) {
    problems.push(
      `${message} In CI this is a failure: an unverifiable guarantee is not reported as met.`,
    );
  } else {
    notes.push(message);
  }
} else {
  let changedFiles = 0;
  for (const path of ALL) {
    const entry = head.get(path);
    if (!entry) continue; // already reported as missing or version-less

    const baseText = contentAt(base.sha, path);
    const baseNormalized = baseText === null ? null : normalize(baseText);
    const headNormalized = normalize(entry.text);

    if (baseNormalized === headNormalized) continue; // rules unchanged
    changedFiles += 1;

    const baseVersion = baseText === null ? null : versionIn(baseText);
    if (baseVersion === entry.version) {
      problems.push(
        `${path}: content changed against ${base.ref} but Sentinel-Version is still ` +
          `${entry.version}. Bump it — and every other governance file, which PARITY ` +
          `then requires, so the GEMINI.md mirror is updated in the same commit.`,
      );
    }
  }
  notes.push(
    `BUMP checked against ${base.ref} (${base.sha.slice(0, 9)}): ` +
      `${changedFiles} governance file(s) changed.`,
  );
}

// ---------------------------------------------------------------- REPORT

for (const note of notes) console.log(note);

if (problems.length > 0) {
  console.error("\nSentinel-Version check FAILED:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nBump the version in every governance file when the safety core, status " +
      "vocabulary, startup gate, or operating order changes.",
  );
  process.exit(1);
}

console.log(
  `Sentinel-Version OK — ${canonicalVersion} across ${ALL.length} governance files.`,
);
