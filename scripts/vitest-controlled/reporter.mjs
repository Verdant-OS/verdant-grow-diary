// Vitest 3.2.4-compatible reporter that emits append-only, structured
// JSONL events. Each completed test module is flushed as an independent
// line so an interrupted batch never claims uncompleted work as green.
//
// Env inputs (set by the orchestrator):
//   VERDANT_CTRL_PROGRESS_FILE           absolute path to progress.jsonl
//   VERDANT_CTRL_RUN_ID                  run identifier (opaque)
//   VERDANT_CTRL_SHARD_INDEX             "1" (1-based)
//   VERDANT_CTRL_SHARD_TOTAL             "16"
//   VERDANT_CTRL_BATCH_INDEX             "0" (0-based)
//   VERDANT_CTRL_REPO_ROOT               absolute repo root (for path normalization)
//   VERDANT_CTRL_REPORTER_DEBUG          "1"/"true" enables structured JSONL debug
//   VERDANT_CTRL_REPORTER_DEBUG_FILE     override debug output path
import fs from "node:fs";
import path from "node:path";

export const REPORTER_SCHEMA_VERSION = 1;
export const REPORTER_DEBUG_SCHEMA_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function normalize(repoRoot, absOrRel) {
  if (!absOrRel) return absOrRel;
  const abs = path.isAbsolute(absOrRel) ? absOrRel : path.resolve(repoRoot, absOrRel);
  return path.relative(repoRoot, abs).split(path.sep).join("/");
}

/** True when the string looks like an integer/opaque Vitest module ID. */
export function looksLikeOpaqueId(value) {
  if (typeof value !== "string") return false;
  return /^-?\d+$/.test(value.trim());
}

/** True when the string looks like a test/spec source file path. */
export function looksLikeTestPath(value) {
  if (typeof value !== "string") return false;
  return /\.(test|spec)\.[a-z0-9]+($|[?#])/i.test(value);
}

/**
 * Resolve a canonical test-file path from a Vitest task-like object.
 *
 * Fields are considered in this priority order:
 *   filepath, file.filepath, moduleId, id
 *
 * A candidate is only accepted when it is a non-empty string, is NOT an
 * integer-like opaque Vitest ID, and looks like a `.test.*` / `.spec.*`
 * path. The selected field is always reported for diagnostics, even when
 * no candidate qualifies.
 */
export function resolveCanonicalFile(task) {
  const candidates = [
    ["filepath", task?.filepath],
    ["file.filepath", task?.file?.filepath],
    ["moduleId", task?.moduleId],
    ["id", task?.id],
  ];
  let selectedField = null;
  let canonical = null;
  for (const [field, raw] of candidates) {
    if (typeof raw !== "string" || raw.length === 0) continue;
    if (selectedField === null) selectedField = field;
    if (looksLikeOpaqueId(raw)) continue;
    if (!looksLikeTestPath(raw)) continue;
    selectedField = field;
    canonical = raw;
    break;
  }
  return { selectedField, canonical };
}

function describeTypes(task) {
  const t = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
  return {
    filepath: t(task?.filepath),
    id: t(task?.id),
    moduleId: t(task?.moduleId),
    "file.filepath": t(task?.file?.filepath),
    tasks: t(task?.tasks),
    children: t(task?.children),
    result: t(task?.result),
  };
}

function sortedKeys(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.keys(obj).sort();
}

/** Extract a plain array of task children regardless of vitest version shape.
 *  Note: for onTestModuleEnd payloads whose `children` is a non-array
 *  collection wrapper (Vitest 3.2.4), we intentionally return [] — the
 *  resolver defers the emission until onFinished so counts stay authoritative.
 */
function taskChildren(t) {
  if (!t) return [];
  if (Array.isArray(t.tasks)) return t.tasks;
  if (Array.isArray(t.children)) return t.children;
  return [];
}

/** Recursively collect leaf tests (mode="test") with their state. */
function collectTests(task, acc = []) {
  const type = task?.type;
  if (type === "test" || type === "custom") {
    acc.push({
      name: (task.suite?.name ? `${task.suite.name} > ` : "") + (task.name || "<unnamed>"),
      state: task.result?.state ?? task.mode ?? "unknown",
      duration: task.result?.duration ?? null,
      error: task.result?.errors?.[0]?.message ?? null,
    });
  }
  for (const c of taskChildren(task)) collectTests(c, acc);
  return acc;
}

function fileStateFromTests(tests, fileResultState) {
  if (fileResultState === "fail" || tests.some((t) => t.state === "fail")) return "failed";
  if (tests.length === 0) return fileResultState === "pass" ? "passed" : "skipped";
  if (tests.every((t) => t.state === "skip" || t.state === "todo")) return "skipped";
  return "passed";
}

function truthyEnv(v) {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

export default class VerdantControlledReporter {
  constructor(options = {}) {
    this.options = options;
    // Explicit constructor options take precedence over environment
    // variables. When both are provided (e.g. a focused unit test passes
    // repoRoot="/repo" but CI has already exported VERDANT_CTRL_REPO_ROOT
    // for the child vitest run), the caller's intent must win — otherwise
    // path normalization silently produces "../.." repo-relative strings
    // that break every downstream shard summary lookup.
    this.progressFile = options.progressFile ?? process.env.VERDANT_CTRL_PROGRESS_FILE;
    this.runId = options.runId ?? process.env.VERDANT_CTRL_RUN_ID ?? "unknown";
    this.shardIndex = Number(options.shardIndex ?? process.env.VERDANT_CTRL_SHARD_INDEX ?? 1);
    this.shardTotal = Number(options.shardTotal ?? process.env.VERDANT_CTRL_SHARD_TOTAL ?? 1);
    this.batchIndex = Number(options.batchIndex ?? process.env.VERDANT_CTRL_BATCH_INDEX ?? 0);
    this.repoRoot = options.repoRoot ?? process.env.VERDANT_CTRL_REPO_ROOT ?? process.cwd();
    this._flushed = new Set();
    this.debugEnabled =
      options.debug ?? truthyEnv(process.env.VERDANT_CTRL_REPORTER_DEBUG ?? "");
    this.debugFile =
      options.debugFile ??
      process.env.VERDANT_CTRL_REPORTER_DEBUG_FILE ??
      (this.progressFile
        ? path.join(path.dirname(this.progressFile), "reporter-debug.jsonl")
        : null);
    if (!this.progressFile) {
      throw new Error("VerdantControlledReporter: progress file path required");
    }
    fs.mkdirSync(path.dirname(this.progressFile), { recursive: true });
    if (this.debugEnabled && this.debugFile) {
      fs.mkdirSync(path.dirname(this.debugFile), { recursive: true });
    }
  }

  _append(event) {
    const line = JSON.stringify(event) + "\n";
    // Open/close per-write forces flush to disk — critical for crash safety.
    const fd = fs.openSync(this.progressFile, "a");
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  _appendDebug(record) {
    if (!this.debugEnabled || !this.debugFile) return;
    try {
      const line = JSON.stringify(record) + "\n";
      const fd = fs.openSync(this.debugFile, "a");
      try {
        fs.writeSync(fd, line);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // Debug logging is never allowed to fail the run.
    }
  }

  _emitDebug(callback, task, selectedField, canonicalFile, decision) {
    this._appendDebug({
      debugSchema: REPORTER_DEBUG_SCHEMA_VERSION,
      runId: this.runId,
      shardIndex: this.shardIndex,
      shardTotal: this.shardTotal,
      batchIndex: this.batchIndex,
      callback,
      callbackKeys: sortedKeys(task),
      fieldTypes: describeTypes(task),
      selectedField,
      canonicalFile,
      decision,
      at: nowIso(),
    });
  }

  _flushFile(fileTask, callback) {
    const { selectedField, canonical } = resolveCanonicalFile(fileTask);
    if (!canonical) {
      // Never write a file event from an opaque/numeric-only payload.
      this._emitDebug(callback, fileTask, selectedField, null, "deferred");
      return;
    }
    const rel = normalize(this.repoRoot, canonical);
    if (this._flushed.has(rel)) {
      this._emitDebug(callback, fileTask, selectedField, rel, "deduped");
      return;
    }
    this._flushed.add(rel);
    const tests = collectTests(fileTask);
    const passed = tests.filter((t) => t.state === "pass").length;
    const failed = tests.filter((t) => t.state === "fail").length;
    const skipped = tests.filter((t) => t.state === "skip").length;
    const todo = tests.filter((t) => t.state === "todo").length;
    const status = fileStateFromTests(tests, fileTask.result?.state);
    const failedNames = tests.filter((t) => t.state === "fail").map((t) => t.name);
    this._append({
      event: "file",
      schema: REPORTER_SCHEMA_VERSION,
      runId: this.runId,
      shardIndex: this.shardIndex,
      shardTotal: this.shardTotal,
      batchIndex: this.batchIndex,
      file: rel,
      status,
      counts: { passed, failed, skipped, todo },
      duration: fileTask.result?.duration ?? null,
      failedTests: failedNames,
      firstError: failedNames.length
        ? (tests.find((t) => t.state === "fail")?.error ?? null)
        : null,
      completedAt: nowIso(),
    });
    this._emitDebug(callback, fileTask, selectedField, rel, "flushed");
  }

  // Vitest 3.2.4 emits onTestModuleEnd with an opaque `moduleId` and a
  // non-array `children` collection; the canonical `filepath` only arrives
  // on onFinished. We DEFER emission for module-end unless a real path is
  // already available so opaque IDs never become file events.
  onTestModuleEnd(module) {
    try {
      const { selectedField, canonical } = resolveCanonicalFile(module);
      if (canonical) {
        this._flushFile(module, "onTestModuleEnd");
      } else {
        // Diagnostics-only: record the deferred selection.
        this._emitDebug("onTestModuleEnd", module, selectedField, null, "deferred");
      }
    } catch (err) {
      // Never crash the run because of a reporter I/O error; leave the
      // file unflushed so resume treats it as incomplete.
      console.error("[verdant-controlled-reporter] flush error:", err?.message ?? err);
    }
  }

  onFinished(files, errors) {
    for (const f of files || []) {
      try {
        this._flushFile(f, "onFinished");
      } catch (err) {
        console.error("[verdant-controlled-reporter] finish flush error:", err?.message ?? err);
      }
    }
    try {
      this._append({
        event: "batch-end",
        schema: REPORTER_SCHEMA_VERSION,
        runId: this.runId,
        shardIndex: this.shardIndex,
        shardTotal: this.shardTotal,
        batchIndex: this.batchIndex,
        errorCount: (errors || []).length,
        completedAt: nowIso(),
      });
    } catch (err) {
      console.error("[verdant-controlled-reporter] batch-end error:", err?.message ?? err);
    }
  }
}
