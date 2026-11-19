#!/usr/bin/env node
// verdant-auto-handoff context mark — a Claude Code PostToolUse hook.
//
// Reads the session's context size from the last main-thread assistant message in the
// transcript and, at most once per crossing, tells the agent to refresh its handoff entry
// (at the mark) or to re-read it (right after a compaction). It never blocks: every path
// exits 0, and it prints nothing unless a reminder fires.
//
// Pure helpers are exported so src/test/verdant-auto-handoff-hook.test.ts can assert on
// resolved values. The I/O wrapper runs only when this file is executed directly.

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Context size, in tokens, at which the handoff reminder fires. */
export const HANDOFF_MARK_TOKENS = 150_000;

/** A drop to less than this share of the previous size reads as a compaction. */
export const COMPACTION_DROP_RATIO = 0.5;

/** Bytes read from the end of the transcript; the last assistant line sits near the end. */
export const TRANSCRIPT_TAIL_BYTES = 512 * 1024;

/** Sum of the three input fields of one assistant message's usage block, or null. */
export function contextTokensFromUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const fields = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
  let total = 0;
  let seen = false;
  for (const field of fields) {
    const value = usage[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      total += value;
      seen = true;
    }
  }
  return seen ? total : null;
}

/**
 * Context size from the tail of a JSONL transcript: the usage of the last main-thread
 * (non-sidechain) assistant message. A partial first line from the tail cut is ignored.
 */
export function contextTokensFromTranscriptTail(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!row || row.type !== "assistant" || row.isSidechain === true) continue;
    const tokens = contextTokensFromUsage(row.message?.usage);
    if (tokens !== null) return tokens;
  }
  return null;
}

/**
 * Decide what, if anything, to tell the agent.
 * Returns "mark" when the context crosses the mark from below, "compacted" when it falls
 * from at or above the mark to under half of the previous size, otherwise null.
 */
export function decideReminder({ previousTokens, tokens, markTokens = HANDOFF_MARK_TOKENS }) {
  if (typeof tokens !== "number" || !Number.isFinite(tokens)) return null;
  const previous =
    typeof previousTokens === "number" && Number.isFinite(previousTokens) ? previousTokens : 0;
  if (previous >= markTokens && tokens < previous * COMPACTION_DROP_RATIO) return "compacted";
  if (previous < markTokens && tokens >= markTokens) return "mark";
  return null;
}

/** Rounds to thousands for the message ("about 152k"). */
function thousands(tokens) {
  return `${Math.round(tokens / 1000)}k`;
}

/** The text injected into the agent's context for a reminder. */
export function reminderText(kind, { previousTokens, tokens, markTokens = HANDOFF_MARK_TOKENS }) {
  if (kind === "mark") {
    return [
      `[verdant-auto-handoff] Context is about ${thousands(tokens)} tokens, past the ${thousands(markTokens)} handoff mark.`,
      "Load the verdant-auto-handoff skill. Finish the step in hand, then update your",
      "docs/agents/handoffs/<TASK-ID>.md entry with the cold-start facts, commit and push your own",
      "branch, and leave `resume here` with the full head SHA on your pull request.",
      "Push only a branch you hold. Never put a secret, token or customer record in the entry.",
    ].join(" ");
  }
  if (kind === "compacted") {
    return [
      `[verdant-auto-handoff] Context dropped from about ${thousands(previousTokens)} to ${thousands(tokens)} tokens, which reads as a compaction.`,
      "The summary is lossy. Load the verdant-auto-handoff skill and, before your next change,",
      "re-read your docs/agents/handoffs/<TASK-ID>.md entry and the newest `resume here` on your",
      "pull request, then confirm the branch head against GitHub.",
    ].join(" ");
  }
  return null;
}

/** Keeps a session id safe to use as a file name. */
export function stateFileName(sessionId) {
  const safe = String(sessionId ?? "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 128);
  return `${safe || "unknown-session"}.json`;
}

function readTail(path, bytes) {
  const size = statSync(path).size;
  const length = Math.min(size, bytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

function readState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Runs the hook against one parsed stdin payload. Returns the stdout text, or "". */
export function runHook(input, { projectDir, markTokens = HANDOFF_MARK_TOKENS } = {}) {
  const transcriptPath = input?.transcript_path;
  if (typeof transcriptPath !== "string" || transcriptPath.length === 0) return "";
  const tokens = contextTokensFromTranscriptTail(readTail(transcriptPath, TRANSCRIPT_TAIL_BYTES));
  if (tokens === null) return "";

  const stateDir = join(projectDir, ".claude", "data", "verdant-auto-handoff");
  const statePath = join(stateDir, stateFileName(input?.session_id));
  const previousTokens = readState(statePath).lastTokens;
  const kind = decideReminder({ previousTokens, tokens, markTokens });

  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ lastTokens: tokens })}\n`);

  const text = reminderText(kind, { previousTokens, tokens, markTokens });
  if (!text) return "";
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text },
  });
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  try {
    const raw = readFileSync(0, "utf8");
    const input = raw.trim() ? JSON.parse(raw) : {};
    const projectDir =
      process.env.CLAUDE_PROJECT_DIR ||
      resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const out = runHook(input, { projectDir });
    if (out) process.stdout.write(`${out}\n`);
  } catch {
    // A reminder is best-effort; a hook failure must never block the session.
  }
  process.exit(0);
}
