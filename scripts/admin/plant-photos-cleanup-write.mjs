/**
 * plant-photos-cleanup-write.mjs
 *
 * Safe report-file writer for the plant profile photo cleanup CLI.
 * Intentionally isolated from the pure report helper so the report
 * module can remain fs-free / test-static-boundary clean.
 *
 * Behavior:
 *  - Refuses to overwrite something that already exists AS a
 *    directory at the requested path.
 *  - Creates missing parent directories recursively.
 *  - Writes the serialized JSON to a temp file in the same
 *    directory, then atomically renames it into place. This
 *    prevents partially-written report files if the process is
 *    killed mid-write.
 *  - Returns the resolved absolute path on success.
 *  - Never logs the report contents, secrets, or full filesystem
 *    error internals — callers should sanitize the thrown message
 *    when printing.
 */
import {
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { serializeCanonicalReport } from "./plant-photos-cleanup-report.mjs";

/**
 * @param {import("./plant-photos-cleanup-report.mjs").CanonicalCleanupReport} report
 * @param {string} requestedPath   Path from --report-file (relative or absolute)
 * @param {string} [cwd]           Base for resolving relative paths
 * @returns {{ absPath: string }}
 */
export function writeCanonicalReportFile(report, requestedPath, cwd = process.cwd()) {
  if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
    throw new Error("report path is empty");
  }
  const absPath = resolve(cwd, requestedPath);

  if (existsSync(absPath)) {
    const st = statSync(absPath);
    if (st.isDirectory()) {
      throw new Error(
        `report path resolves to a directory, not a file: ${requestedPath}`,
      );
    }
  }

  const parent = dirname(absPath);
  mkdirSync(parent, { recursive: true });

  const body = serializeCanonicalReport(report);
  // Deterministic temp name: same directory, no PID or random —
  // callers should never run two concurrent writes at the same path.
  const tmpPath = `${absPath}.tmp-write`;
  try {
    writeFileSync(tmpPath, body, { encoding: "utf8" });
    renameSync(tmpPath, absPath);
  } catch (err) {
    // Best-effort cleanup of the temp file. Ignore secondary errors.
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      /* noop */
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
  return { absPath };
}
