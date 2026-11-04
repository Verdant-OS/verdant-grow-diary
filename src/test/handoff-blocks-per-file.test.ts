/**
 * Guard for the one-file-per-handoff-block layout.
 *
 * Every task block lives in docs/agents/handoffs/<TASK-ID>.md, and docs/agents/HANDOFF_LOG.md
 * holds only the template, the procedure and the index. When every pull request inserted its
 * block at the top of HANDOFF_LOG.md, each merge made every other open branch conflict on that
 * file and invalidated their reviews. These tests fail if a task block is added back to the log,
 * or if a block file's TASK id stops matching its file name.
 *
 * The markdown files read here are the artifact under test, not source standing in for it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const LOG = resolve(process.cwd(), "docs/agents/HANDOFF_LOG.md");
const DIR = resolve(process.cwd(), "docs/agents/handoffs");
const TASK_LINE = /^TASK (\S+)\s/gm;

/** Historical merge damage, moved byte for byte and documented in HANDOFF_LOG.md. Frozen. */
const LEGACY: Record<string, string[]> = {
  "CREATE-DIALOG-DISABLED-REASON": ["QUICK-LOG-TARGET-SAVE", "CREATE-DIALOG-DISABLED-REASON"],
  "TIMELINE-GROW-DAY-2005": ["TIMELINE-GROW-DAY-2005", "DASHBOARD-SINGLE-LOG-ENTRY"],
  "VER-288-SERVED-BUILD-BASELINE": ["VER-288"],
};

const taskIds = (text: string) => [...text.matchAll(TASK_LINE)].map((m) => m[1]);
const blockFiles = () => readdirSync(DIR).filter((n) => n.endsWith(".md"));

describe("handoff blocks live one per file", () => {
  it("HANDOFF_LOG.md holds only the template's TASK line", () => {
    expect(taskIds(readFileSync(LOG, "utf8"))).toEqual(["<id>"]);
  });

  it("every block file's TASK id matches its file name", () => {
    const mismatched = blockFiles().flatMap((name) => {
      const id = name.slice(0, -3);
      const ids = taskIds(readFileSync(join(DIR, name), "utf8"));
      const expected = LEGACY[id] ?? [id];
      return JSON.stringify(ids) === JSON.stringify(expected) ? [] : [`${name}: ${ids.join(", ")}`];
    });
    expect(mismatched).toEqual([]);
  });

  it("keeps every block moved out of the log", () => {
    expect(blockFiles().length).toBeGreaterThanOrEqual(106);
  });
});
