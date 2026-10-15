// One authoritative local journal per repository/task. Retain it across host restarts.
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { transition } from "./sentinelHandoffRules.mjs";
import { readBoundedJson } from "./sentinelHandoffJson.mjs";

export function journalPaths(journalDir, policy) {
  const key = createHash("sha256").update(`${policy.repository}\n${policy.taskId}`).digest("hex");
  const statePath = join(resolve(journalDir), `${key}.json`);
  return { statePath, lockPath: `${statePath}.lock`, pendingPath: `${statePath}.pending` };
}
function atomicCommit(statePath, pendingPath, state) {
  const encoded = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(encoded, "utf8") > 1024 * 1024) throw new Error("JOURNAL_LIMIT");
  let fd;
  try {
    fd = openSync(pendingPath, "wx", 0o600);
    writeFileSync(fd, encoded);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  // If writing/renaming fails, preserve .pending and emit no action. Never auto-clean
  // an uncertain checkpoint or a lock belonging to an interrupted writer.
  renameSync(pendingPath, statePath);
}

export function runCommand({ journalDir, policy, command }, { commit = atomicCommit } = {}) {
  const paths = journalPaths(journalDir, policy);
  mkdirSync(resolve(journalDir), { recursive: true });
  let lock;
  try {
    lock = openSync(paths.lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error("WRITER_LOCKED: reconcile the existing holder; never auto-remove its lock");
    throw error;
  }
  try {
    if (existsSync(paths.pendingPath))
      throw new Error("JOURNAL_PENDING: reconcile interrupted persistence before dispatch");
    let previous;
    try {
      previous = readBoundedJson(paths.statePath, { allowMissing: true });
    } catch {
      throw new Error("JOURNAL_CORRUPT");
    }
    if (previous === undefined) previous = null;
    else {
      if (
        previous?.version !== 1 ||
        !Array.isArray(previous.history) ||
        !Array.isArray(previous.receipts)
      )
        throw new Error("JOURNAL_CORRUPT");
    }
    const result = transition(previous, command, policy);
    if (JSON.stringify(result.state) !== JSON.stringify(previous))
      commit(paths.statePath, paths.pendingPath, result.state);
    // The caller only receives a DISPATCH after the reservation was fsync'd and
    // atomically renamed. A crash before output is uncertain delivery, never a resend.
    return { ...result, journal: paths.statePath };
  } finally {
    closeSync(lock);
    unlinkSync(paths.lockPath);
  }
}
