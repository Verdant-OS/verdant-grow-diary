import type { ProcessRunResult, Register } from "claude-code";

import {
  MIGRATION_PATH,
  PUBLISHED_MIGRATION_MSG,
  checkBash,
  checkFileEdit,
  checkInWarning,
  checkMcp,
  repoRelative,
} from "./rules";

type Git = (argv: readonly string[]) => Promise<ProcessRunResult | null>;

const BASE_REFS = ["origin/verdant-grow-diary", "origin/main"];

/** A migration is published when the base branch (or, with no base ref, HEAD) already holds it. */
async function isPublished(git: Git, rel: string): Promise<boolean> {
  for (const ref of BASE_REFS) {
    const r = await git(["git", "cat-file", "-e", `${ref}:${rel}`]);
    if (r && r.exitCode === 0) return true;
  }
  const base = await git(["git", "rev-parse", "--verify", "-q", "origin/verdant-grow-diary"]);
  if (base && base.exitCode === 0) return false;
  const r = await git(["git", "cat-file", "-e", `HEAD:${rel}`]);
  return r !== null && r.exitCode === 0;
}

/** The checkout root, so paths anchor exactly even when the checkout sits under ~/src or ~/docs. */
async function repoRoot(git: Git): Promise<string | null> {
  const r = await git(["git", "rev-parse", "--show-toplevel"]);
  return r && r.exitCode === 0 ? r.stdout.trim() || null : null;
}

/** The refusal reason for writing `filePath`, or null. */
async function fileReason(git: Git, filePath: unknown): Promise<string | null> {
  if (typeof filePath !== "string") return null;
  const root = await repoRoot(git);
  const reason = checkFileEdit(filePath, root);
  if (reason) return reason;
  const rel = repoRelative(filePath, root);
  if (MIGRATION_PATH.test(rel) && (await isPublished(git, rel)))
    return PUBLISHED_MIGRATION_MSG(rel);
  return null;
}

export const register: Register = (on) => {
  on("tool.call", { tool: "Bash" }, ($, e, next) => {
    const reason = checkBash(e.command);
    if (!reason) return next(e);
    $.ui.toast("verdant-guard blocked a command");
    return { deny: `verdant-guard: ${reason}` };
  });

  on("tool.call", { tool: "Edit" }, async ($, e, next) => {
    const reason = await fileReason((argv) => $.process.run(argv).catch(() => null), e.file_path);
    if (!reason) return next(e);
    $.ui.toast("verdant-guard blocked an edit");
    return { deny: `verdant-guard: ${reason}` };
  });

  on("tool.call", { tool: "Write" }, async ($, e, next) => {
    const reason = await fileReason((argv) => $.process.run(argv).catch(() => null), e.file_path);
    if (!reason) return next(e);
    $.ui.toast("verdant-guard blocked a write");
    return { deny: `verdant-guard: ${reason}` };
  });

  on("tool.call", { tool: "NotebookEdit" }, async ($, e, next) => {
    const reason = await fileReason(
      (argv) => $.process.run(argv).catch(() => null),
      e.notebook_path,
    );
    if (!reason) return next(e);
    $.ui.toast("verdant-guard blocked a notebook edit");
    return { deny: `verdant-guard: ${reason}` };
  });

  on("tool.call", async ($, e, next) => {
    if (!e.tool.startsWith("mcp__")) return next(e);
    const input = e as unknown as Record<string, unknown>;
    const reason = checkMcp(e.tool, input);
    if (reason) {
      $.ui.toast("verdant-guard blocked an MCP call");
      return { deny: `verdant-guard: ${reason}` };
    }
    const warning = checkInWarning(e.tool, input);
    if (!warning) return next(e);
    const ran = await next(e);
    if (ran.deny !== undefined) return ran;
    return { ...ran, context: [...(ran.context ?? []), warning] };
  });
};
