#!/usr/bin/env node
/**
 * Sentinel-Version parity and bump check.
 *
 * GEMINI.md mirrors the full universal constitution in AGENTS.md because Gemini cannot
 * follow a link to get context. Duplication invites drift. Three rules together close it:
 *
 *   PARITY  every governance file carries the same Sentinel-Version.
 *   MIRROR  GEMINI.md's embedded constitution matches AGENTS.md (except line endings).
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

const ROLE_FILES = [
  "docs/agents/roles/grok.md",
  "docs/agents/roles/claude.md",
  "docs/agents/roles/codex.md",
  "docs/agents/roles/security.md",
  "docs/agents/roles/gemini.md",
  "docs/agents/roles/council-chair.md",
];

const REQUIRED_STARTUP_GATE = `MANDATORY STARTUP GATE

Before analysis, research, commands, edits, writes, outreach, deployment,
or recommendations, return:

\`\`\`text
SENTINEL_ACK
agent:
assigned_role:
sentinel_version:
files_read:
current_task:
scope:
out_of_scope:
conflicts_found:
data_access_status:
write_permission:
\`\`\`

If a required file is missing or conflicting, return:

\`\`\`text
STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE
\`\`\`

Do not continue until the context issue is resolved.`;

/**
 * CURRENT_STATE.md is deliberately absent from this list. It was imported here until
 * 2026-08-21, when it measured 153,142 bytes / ~27,400 tokens — 19.1% of every context
 * window, re-sent on every turn of every session regardless of whether that session went
 * near operating state. CLAUDE.md now instructs an explicit read instead.
 *
 * That trade only holds while the instruction survives, so it is asserted below as
 * CLAUDE_STATE_READ_INSTRUCTION and CLAUDE_STATE_READ_STEP, pinned verbatim. Deleting an import is visible in a diff; deleting a sentence is not,
 * and an agent with no path to operating state reasons from stale production facts —
 * exactly what this file exists to prevent.
 */
const CLAUDE_IMPORTS = `@AGENTS.md
@docs/agents/roles/claude.md`;

/**
 * The two imperative sentences that replaced the CURRENT_STATE.md import, pinned verbatim.
 * A bare pathname match is not enough: CLAUDE.md mentions the path incidentally in several
 * other places, so an edit could delete every actual read instruction and still satisfy a
 * substring check — the same source-text-scan failure AGENTS.md records for
 * playwright-action-timeout-fence. Comparison is whitespace-normalized so a prose re-wrap
 * is not a violation; any wording or ordering change is.
 */
const CLAUDE_STATE_READ_INSTRUCTION =
  "**`docs/agents/CURRENT_STATE.md` is deliberately NOT imported — read it with a file " +
  "tool before you acknowledge.**";
const CLAUDE_STATE_READ_STEP =
  "1. Read `docs/agents/CURRENT_STATE.md`, then confirm all three context files were loaded.";

/** Collapse whitespace runs so line-wrapping differences cannot defeat an exact-copy pin. */
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

const LEGACY_ARCHIVE = "docs/archive/legacy/verdant-master-prompt-legacy.md";
const LEGACY_HEADER = `> LEGACY — NOT ACTIVE AGENT INSTRUCTIONS
>
> Preserved for historical reference only.
> Current instructions are defined by \`/AGENTS.md\`.`;

/** Markers proving GEMINI.md still carries the full embedded constitution rather than a link. */
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

/** Return the body between GEMINI's constitution markers, excluding the marker lines. */
function embeddedGeminiCore(text) {
  const begin = text.indexOf(CORE_BEGIN);
  const end = text.indexOf(CORE_END);
  if (begin === -1 || end === -1 || end <= begin) return null;

  const beginLineEnd = text.indexOf("\n", begin);
  if (beginLineEnd === -1 || beginLineEnd >= end) return null;

  return text.slice(beginLineEnd + 1, end).trim();
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

// GEMINI.md must embed the full constitution. Replacing it with "see AGENTS.md" would
// silently leave Gemini with no durable context, because it cannot follow the link.
const geminiText = head.get("GEMINI.md")?.text ?? "";
if (geminiText) {
  const embeddedCore = embeddedGeminiCore(geminiText);
  if (!embeddedCore) {
    problems.push(
      "GEMINI.md: embedded SENTINEL-CORE block is missing. Gemini cannot follow a link " +
        "to AGENTS.md, so the full constitution must stay inline between the markers.",
    );
  } else if (normalize(embeddedCore) !== normalize(head.get(CANONICAL)?.text ?? "")) {
    problems.push(
      "GEMINI.md: embedded SENTINEL-CORE differs from AGENTS.md. Keep the full " +
        "universal constitution byte-equivalent (except line endings).",
    );
  }
}

// The owner requires the full visible startup block in the canonical constitution and
// every detailed role file. A reference to the gate is not enough for disconnected
// agents that receive only their role prompt.
for (const path of [CANONICAL, ...ROLE_FILES]) {
  const text = head.get(path)?.text.replace(/\r\n/g, "\n") ?? "";
  if (text && !text.includes(REQUIRED_STARTUP_GATE)) {
    problems.push(`${path}: exact mandatory SENTINEL_ACK startup gate is missing`);
  }
}

const claudeText = head.get("CLAUDE.md")?.text.replace(/\r\n/g, "\n") ?? "";
if (claudeText && !claudeText.startsWith(CLAUDE_IMPORTS)) {
  problems.push(
    "CLAUDE.md: the first two lines must import AGENTS.md and the Claude role in that " + "order",
  );
}

/**
 * Markdown with fenced code blocks and inline code spans removed. Claude Code does not
 * evaluate imports inside code spans and blocks, so a backticked mention of the import
 * token — the natural way to write ABOUT the syntax — is legal and must not be flagged.
 */
function stripCodeSpans(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

/**
 * The import token in either spelling Claude Code would resolve from the repo root.
 * Claude Code resolves @-imports INLINE in prose as well as on standalone lines
 * ("See @README for project overview" is its documented example), so this must not be
 * anchored to line boundaries.
 */
const CURRENT_STATE_IMPORT_RE = /@(?:\.\/)?docs\/agents\/CURRENT_STATE\.md\b/;

// startsWith alone would accept the CURRENT_STATE import re-added as a third line, later
// in the file, or inline inside a sentence — the required prefix still holds in every
// case, while the ~27,400-token automatic import silently returns. Reject the import
// token anywhere outside code spans; the on-demand read (asserted below) replaced it.
if (claudeText && CURRENT_STATE_IMPORT_RE.test(stripCodeSpans(claudeText))) {
  problems.push(
    "CLAUDE.md: @docs/agents/CURRENT_STATE.md must not be imported automatically. The " +
      "import was replaced by an on-demand read (#1094); remove the @ token wherever it " +
      "appears — standalone, appended after the required two-line prefix, or inline in " +
      "prose. Only a code-span mention (backticks) is exempt, matching what Claude Code " +
      "itself does not evaluate",
  );
}

// CURRENT_STATE.md is read on demand rather than imported, so these written imperatives
// are the only thing keeping operating state in front of an agent. Nothing else in the
// governance set carries branch, production, migration, blocker or assignment facts.
// Each is required verbatim; an incidental mention of the pathname is not a substitute.
if (claudeText) {
  const claudeNormalized = normalizeWhitespace(claudeText);
  const statePins = [
    ["pre-ack read instruction", CLAUDE_STATE_READ_INSTRUCTION],
    ["startup step-1 read", CLAUDE_STATE_READ_STEP],
  ];
  for (const [label, pin] of statePins) {
    if (!claudeNormalized.includes(normalizeWhitespace(pin))) {
      problems.push(
        `CLAUDE.md: exact ${label} for docs/agents/CURRENT_STATE.md is missing. The file ` +
          "is not imported (too large), so this imperative is the only path to operating " +
          "state; an incidental mention of the pathname does not satisfy it",
      );
    }
  }
}

if (!existsSync("docs/agents/CURRENT_STATE.md")) {
  problems.push("docs/agents/CURRENT_STATE.md: missing changing shift report");
}

if (!existsSync(LEGACY_ARCHIVE)) {
  problems.push(`${LEGACY_ARCHIVE}: missing legacy prompt archive`);
} else {
  const archiveText = readFileSync(LEGACY_ARCHIVE, "utf8").replace(/\r\n/g, "\n");
  if (!archiveText.startsWith(LEGACY_HEADER)) {
    problems.push(`${LEGACY_ARCHIVE}: required inactive-instructions header is missing`);
  }
}

// ------------------------------------------------------------------ BUMP

/**
 * Explicit base first, then the merge-base with an integration branch.
 *
 * The explicit value falls through rather than being fatal: CI supplies it from event
 * payloads that are empty on some triggers and all-zeros for a new branch, and a bogus
 * base should degrade to the default rather than fail a PR for a reason unrelated to
 * governance.
 */
function resolveBase() {
  const explicit = process.env.SENTINEL_BASE_SHA || process.argv[2];
  const candidates = [
    ...(explicit ? [explicit] : []),
    "origin/main",
    "origin/verdant-grow-diary",
    "main",
  ];

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
    "\nBump the version in every governance file when the universal constitution, status " +
      "vocabulary, startup gate, or operating order changes.",
  );
  process.exit(1);
}

console.log(`Sentinel-Version OK — ${canonicalVersion} across ${ALL.length} governance files.`);
