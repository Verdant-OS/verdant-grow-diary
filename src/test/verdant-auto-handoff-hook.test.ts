import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HANDOFF_MARK_TOKENS,
  contextTokensFromTranscriptTail,
  contextTokensFromUsage,
  decideReminder,
  reminderText,
  runHook,
  stateFileName,
} from "../../.claude/skills/verdant-auto-handoff/context-mark.mjs";

const repoRoot = resolve(__dirname, "..", "..");

function assistantLine(usage: Record<string, number>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ type: "assistant", isSidechain: false, message: { usage }, ...extra });
}

describe("verdant-auto-handoff context mark", () => {
  it("sums the three input fields of a usage block", () => {
    expect(
      contextTokensFromUsage({
        input_tokens: 2,
        cache_read_input_tokens: 149_000,
        cache_creation_input_tokens: 1_200,
        output_tokens: 400,
      }),
    ).toBe(150_202);
    expect(contextTokensFromUsage(undefined)).toBeNull();
    expect(contextTokensFromUsage({ output_tokens: 5 })).toBeNull();
  });

  it("reads the last main-thread assistant usage from a transcript tail", () => {
    const tail = [
      '{"type":"assistant","message":{"usage":{"input_tok', // cut first line
      assistantLine({ input_tokens: 10, cache_read_input_tokens: 90_000 }),
      JSON.stringify({ type: "user", message: { content: "hi" } }),
      assistantLine({ input_tokens: 1, cache_read_input_tokens: 5 }, { isSidechain: true }),
      "",
    ].join("\n");
    expect(contextTokensFromTranscriptTail(tail)).toBe(90_010);
    expect(contextTokensFromTranscriptTail("")).toBeNull();
    expect(contextTokensFromTranscriptTail("not json\n")).toBeNull();
  });

  it("fires the mark once, on the crossing from below", () => {
    expect(HANDOFF_MARK_TOKENS).toBe(150_000);
    expect(decideReminder({ previousTokens: 149_999, tokens: 150_000 })).toBe("mark");
    expect(decideReminder({ previousTokens: undefined, tokens: 160_000 })).toBe("mark");
    expect(decideReminder({ previousTokens: 150_000, tokens: 170_000 })).toBeNull();
    expect(decideReminder({ previousTokens: 100_000, tokens: 149_999 })).toBeNull();
    expect(decideReminder({ previousTokens: 100_000, tokens: Number.NaN })).toBeNull();
  });

  it("reads a drop from past the mark to under half as a compaction, and re-arms the mark", () => {
    expect(decideReminder({ previousTokens: 180_000, tokens: 40_000 })).toBe("compacted");
    expect(decideReminder({ previousTokens: 180_000, tokens: 120_000 })).toBeNull();
    expect(decideReminder({ previousTokens: 120_000, tokens: 40_000 })).toBeNull();
    expect(decideReminder({ previousTokens: 40_000, tokens: 151_000 })).toBe("mark");
  });

  it("names the handoff entry, the push and resume here in the mark text", () => {
    const mark = reminderText("mark", { previousTokens: 149_000, tokens: 152_400 });
    expect(mark).toContain("about 152k tokens");
    expect(mark).toContain("docs/agents/handoffs/<TASK-ID>.md");
    expect(mark).toContain("resume here");
    expect(mark).toContain("Push only a branch you hold");
    const compacted = reminderText("compacted", { previousTokens: 180_000, tokens: 40_000 });
    expect(compacted).toContain("re-read your docs/agents/handoffs/<TASK-ID>.md entry");
    expect(reminderText(null, { previousTokens: 0, tokens: 0 })).toBeNull();
  });

  it("keeps a session id safe as a file name", () => {
    expect(stateFileName("7aa9d41a-af7d")).toBe("7aa9d41a-af7d.json");
    expect(stateFileName("../../etc/passwd")).toBe("etcpasswd.json");
    expect(stateFileName(undefined)).toBe("unknown-session.json");
  });

  describe("runHook", () => {
    let dir: string;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it("stays silent below the mark, fires once at it, then once after a compaction", () => {
      dir = mkdtempSync(join(tmpdir(), "verdant-auto-handoff-"));
      const transcript = join(dir, "t.jsonl");
      const run = (tokens: number) => {
        writeFileSync(transcript, `${assistantLine({ cache_read_input_tokens: tokens })}\n`);
        return runHook({ transcript_path: transcript, session_id: "s1" }, { projectDir: dir });
      };

      expect(run(100_000)).toBe("");
      const fired = JSON.parse(run(151_000));
      expect(fired.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(fired.hookSpecificOutput.additionalContext).toContain("handoff mark");
      expect(run(160_000)).toBe("");
      const compacted = JSON.parse(run(30_000));
      expect(compacted.hookSpecificOutput.additionalContext).toContain("compaction");
      expect(run(31_000)).toBe("");

      const state = JSON.parse(
        readFileSync(join(dir, ".claude", "data", "verdant-auto-handoff", "s1.json"), "utf8"),
      );
      expect(state).toEqual({ lastTokens: 31_000 });
    });

    it("prints nothing without a transcript path", () => {
      dir = mkdtempSync(join(tmpdir(), "verdant-auto-handoff-"));
      expect(runHook({}, { projectDir: dir })).toBe("");
    });
  });

  it("is wired as one PostToolUse hook and leaves the scorer-lock PreToolUse hook as it was", () => {
    const settings = JSON.parse(readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8"));
    expect(Object.keys(settings.hooks).sort()).toEqual(["PostToolUse", "PreToolUse"]);

    const post = settings.hooks.PostToolUse;
    expect(post).toHaveLength(1);
    expect(post[0].hooks).toHaveLength(1);
    const hook = post[0].hooks[0];
    expect(hook.type).toBe("command");
    expect(hook.command).toContain("CLAUDE_PROJECT_DIR");
    expect(hook.command).toContain("node .claude/skills/verdant-auto-handoff/context-mark.mjs");
    expect(hook.timeout).toBeLessThanOrEqual(10);

    expect(settings.hooks.PreToolUse).toEqual([
      {
        matcher: "Edit|Write|MultiEdit|NotebookEdit",
        hooks: [
          {
            type: "command",
            command: 'cd "${CLAUDE_PROJECT_DIR:-.}" && node scripts/scorer-lock.mjs --hook',
            timeout: 15,
            statusMessage: "scorer-lock: checking whether this edits a locked check",
          },
        ],
      },
    ]);
  });

  it("keeps its per-session state out of git", () => {
    const gitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
    expect(gitignore.split("\n").map((line) => line.trim())).toContain(".claude/data/");
  });
});
