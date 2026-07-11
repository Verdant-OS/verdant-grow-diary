/**
 * plant-photos-cleanup-report.mjs
 *
 * PURE helpers that turn the internal planner report (see
 * `plant-photos-cleanup-lib.mjs`) into a STABLE, versioned JSON
 * report shape and render an operator-friendly console summary.
 *
 * Behavior invariants preserved from the planner:
 *  - Dry-run reports never claim any deletion.
 *  - Incomplete scans (`scan_complete: false`) never claim any
 *    deletion.
 *  - `protected_by_final_recheck`, `unknown_age`, `invalid_path`,
 *    and `non_profile_photo` are ALWAYS reported as distinct
 *    categories — never merged.
 *
 * This module has NO Supabase / fs / network / console side
 * effects. It is safe to import from tests.
 */
import {
  parsePlantProfileObjectPath,
  extractStoragePathFromPhotoUrl,
} from "./plant-photos-cleanup-lib.mjs";

export const CLEANUP_REPORT_SCHEMA_VERSION = "1";
export const CLEANUP_REPORT_BUCKET = "diary-photos";
export const CLEANUP_REPORT_SCOPE = "plant-profile-photos";

// ---------------------------------------------------------------
// Reference classification (photo_url row shape)
// ---------------------------------------------------------------

/**
 * Classify a single `plants.photo_url` value.
 * @param {unknown} value
 * @returns {"valid_storage" | "legacy" | "malformed" | "null"}
 */
export function classifyPhotoUrlValue(value) {
  if (value == null) return "null";
  if (typeof value !== "string") return "malformed";
  const trimmed = value.trim();
  if (trimmed === "") return "null";
  if (trimmed.startsWith("storage://")) {
    return extractStoragePathFromPhotoUrl(trimmed) ? "valid_storage" : "malformed";
  }
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return "legacy";
  }
  return "malformed";
}

/**
 * @param {Array<{ photo_url: unknown }>} rows
 */
export function classifyPhotoUrlReferences(rows) {
  let plant_rows_scanned = 0;
  let valid_storage_references = 0;
  let legacy_references = 0;
  let malformed_references = 0;
  /** @type {string[]} */
  const malformed_values = [];
  for (const r of rows ?? []) {
    plant_rows_scanned += 1;
    const c = classifyPhotoUrlValue(r?.photo_url);
    if (c === "valid_storage") valid_storage_references += 1;
    else if (c === "legacy") legacy_references += 1;
    else if (c === "malformed") {
      malformed_references += 1;
      if (typeof r?.photo_url === "string" && r.photo_url.length <= 512) {
        malformed_values.push(r.photo_url);
      }
    }
  }
  return {
    plant_rows_scanned,
    valid_storage_references,
    legacy_references,
    malformed_references,
    malformed_values,
  };
}

// ---------------------------------------------------------------
// Raw storage-path bucket split (invalid_path vs non_profile_photo)
// ---------------------------------------------------------------

function isSafeNonProfilePath(p) {
  if (typeof p !== "string" || p.length === 0) return false;
  if (p.includes("\\") || p.includes("..")) return false;
  if (p.startsWith("/") || p.endsWith("/")) return false;
  const segs = p.split("/");
  if (segs.length < 2) return false;
  for (const s of segs) {
    if (!s) return false;
    if (s.startsWith(".")) return false;
  }
  return true;
}

/**
 * @param {string} p
 * @returns {"plant_profile" | "non_profile_photo" | "invalid_path"}
 */
export function classifyRawStoragePath(p) {
  if (parsePlantProfileObjectPath(p)) return "plant_profile";
  if (isSafeNonProfilePath(p)) return "non_profile_photo";
  return "invalid_path";
}

/**
 * @param {Array<{ path: string }>} objects
 */
export function splitPathBuckets(objects) {
  let non_profile_photo = 0;
  let invalid_path = 0;
  for (const o of objects ?? []) {
    const c = classifyRawStoragePath(o?.path ?? "");
    if (c === "non_profile_photo") non_profile_photo += 1;
    else if (c === "invalid_path") invalid_path += 1;
  }
  return { non_profile_photo, invalid_path };
}

// ---------------------------------------------------------------
// Canonical report
// ---------------------------------------------------------------

/**
 * Explicit code-point comparator used for every path/reference
 * array in the canonical report. Kept in one place so tests can
 * assert determinism against a single ordering rule.
 * @param {string} a
 * @param {string} b
 */
export function comparePathCodePoints(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

const uniqSort = (arr) =>
  Array.from(new Set(arr ?? [])).sort(comparePathCodePoints);


/**
 * @typedef {Object} CanonicalCleanupReport
 * @property {"1"} schema_version
 * @property {string} generated_at
 * @property {"dry_run" | "execute"} mode
 * @property {"diary-photos"} bucket
 * @property {"plant-profile-photos"} scope
 * @property {boolean} scan_complete
 * @property {number} min_age_days
 * @property {string|null} owner_filter
 * @property {Object} counts
 * @property {string[]} eligible_paths
 * @property {string[]} protected_by_final_recheck
 * @property {string[]} deleted_paths
 * @property {string[]} failed_paths
 * @property {string[]} malformed_references
 * @property {Array<{phase:string,message:string}>} failures
 */

/**
 * Build the stable canonical report. Never mutates inputs.
 *
 * @param {Object} args
 * @param {import("./plant-photos-cleanup-lib.mjs").CleanupReport} args.internal
 * @param {ReturnType<typeof classifyPhotoUrlReferences>} args.referenceStats
 * @param {{ non_profile_photo:number, invalid_path:number }} [args.pathBuckets]
 *        Optional; when omitted, `non_profile_photo` is inferred as 0
 *        and `invalid_path` falls back to the planner count.
 * @param {string[]} [args.failedPaths]
 * @returns {CanonicalCleanupReport}
 */
export function toCanonicalCleanupReport({
  internal,
  referenceStats,
  pathBuckets,
  failedPaths = [],
}) {
  const mode = internal.mode === "execute" ? "execute" : "dry_run";
  const scanComplete = internal.scan_complete === true;

  const invalid_path = pathBuckets
    ? pathBuckets.invalid_path
    : internal.invalid_path;
  const non_profile_photo = pathBuckets ? pathBuckets.non_profile_photo : 0;

  const dryRun = mode === "dry_run";
  const attempted =
    dryRun || !scanComplete
      ? 0
      : internal.deleted + (failedPaths?.length ?? 0);

  const failures = (internal.scan_errors ?? []).map((raw) => {
    const s = String(raw ?? "");
    const idx = s.indexOf(":");
    if (idx > 0) {
      return { phase: s.slice(0, idx).trim(), message: s.slice(idx + 1).trim() };
    }
    return { phase: "unknown", message: s };
  });

  const counts = {
    plant_rows_scanned: referenceStats.plant_rows_scanned,
    valid_storage_references: referenceStats.valid_storage_references,
    legacy_references: referenceStats.legacy_references,
    malformed_references: referenceStats.malformed_references,

    storage_objects_scanned: internal.total_objects_scanned,
    referenced: internal.referenced,
    eligible_orphans: internal.candidates,

    too_young: internal.too_young,
    unknown_age: internal.unknown_age,
    invalid_path,
    non_profile_photo,
    owner_mismatch: internal.owner_filter_skip,

    protected_by_final_recheck: internal.protected_by_final_recheck,

    deletion_attempted: attempted,
    deleted: dryRun || !scanComplete ? 0 : internal.deleted,
    failed: dryRun || !scanComplete ? 0 : failedPaths?.length ?? 0,
  };

  return {
    schema_version: CLEANUP_REPORT_SCHEMA_VERSION,
    generated_at: internal.generated_at,
    mode,
    bucket: CLEANUP_REPORT_BUCKET,
    scope: CLEANUP_REPORT_SCOPE,
    scan_complete: scanComplete,
    min_age_days: internal.min_age_days,
    owner_filter: internal.owner_filter ?? null,
    counts,
    eligible_paths: uniqSort(internal.candidate_paths),
    protected_by_final_recheck: uniqSort(
      internal.protected_by_final_recheck_paths,
    ),
    deleted_paths: dryRun || !scanComplete ? [] : uniqSort(internal.deleted_paths),
    failed_paths: dryRun || !scanComplete ? [] : uniqSort(failedPaths),
    malformed_references: uniqSort(referenceStats.malformed_values),
    failures,
  };
}

// ---------------------------------------------------------------
// Console summary
// ---------------------------------------------------------------

const MAX_PATHS_PREVIEW = 20;

/**
 * Pure renderer. Returns the full multi-line console string for a
 * canonical report. Never touches console/env/fs.
 * @param {CanonicalCleanupReport} report
 */
export function renderCleanupSummary(report) {
  const modeLabel = report.mode === "execute" ? "EXECUTE" : "DRY RUN";
  const c = report.counts;
  const lines = [
    "Plant Profile Photo Orphan Cleanup",
    "",
    `Mode: ${modeLabel}`,
    `Bucket: ${report.bucket}`,
    `Minimum age: ${report.min_age_days} days`,
    `Owner filter: ${report.owner_filter ?? "none"}`,
    `Scan complete: ${report.scan_complete ? "yes" : "no"}`,
    "",
    "Scan summary",
    `- Plant rows scanned: ${c.plant_rows_scanned}`,
    `- Valid storage references: ${c.valid_storage_references}`,
    `- Legacy references: ${c.legacy_references}`,
    `- Malformed references: ${c.malformed_references}`,
    `- Storage objects scanned: ${c.storage_objects_scanned}`,
    `- Referenced: ${c.referenced}`,
    `- Eligible orphans: ${c.eligible_orphans}`,
    "",
    "Protected objects",
    `- Too young: ${c.too_young}`,
    `- Unknown age: ${c.unknown_age}`,
    `- Invalid path: ${c.invalid_path}`,
    `- Non-profile photos: ${c.non_profile_photo}`,
    `- Owner mismatch: ${c.owner_mismatch}`,
    `- Protected by final recheck: ${c.protected_by_final_recheck}`,
    "",
    "Deletion",
    `- Attempted: ${c.deletion_attempted}`,
    `- Deleted: ${c.deleted}`,
    `- Failed: ${c.failed}`,
    "",
    `Mode: ${modeLabel}`,
  ];

  if (report.mode === "dry_run") {
    lines.push("No storage objects were deleted.");
  }

  if (report.eligible_paths.length > 0) {
    lines.push("");
    lines.push(
      `Eligible orphan preview (up to ${MAX_PATHS_PREVIEW}):`,
    );
    for (const p of report.eligible_paths.slice(0, MAX_PATHS_PREVIEW)) {
      lines.push(`  - ${p}`);
    }
    if (report.eligible_paths.length > MAX_PATHS_PREVIEW) {
      lines.push(
        `  … ${report.eligible_paths.length - MAX_PATHS_PREVIEW} more (see JSON report)`,
      );
    }
  }

  if (report.failures.length > 0) {
    lines.push("");
    lines.push("Failures:");
    for (const f of report.failures) {
      lines.push(`  - [${f.phase}] ${f.message}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------
// Machine-readable console summary
// ---------------------------------------------------------------

export const MACHINE_SUMMARY_PREFIX = "CLEANUP_REPORT_SUMMARY_JSON=";

/**
 * Compact single-line summary for scripts. Contains counts only —
 * NO path arrays, NO malformed reference values, NO failure
 * details. The prefix is stable and can be grepped from stdout.
 *
 * @param {CanonicalCleanupReport} report
 * @returns {string}
 */
export function renderCleanupMachineSummary(report) {
  const c = report.counts;
  const payload = {
    schema_version: report.schema_version,
    mode: report.mode,
    scan_complete: report.scan_complete,
    min_age_days: report.min_age_days,
    owner_filter: report.owner_filter ?? null,
    counts: {
      storage_objects_scanned: c.storage_objects_scanned,
      referenced: c.referenced,
      eligible_orphans: c.eligible_orphans,
      too_young: c.too_young,
      unknown_age: c.unknown_age,
      invalid_path: c.invalid_path,
      non_profile_photo: c.non_profile_photo,
      owner_mismatch: c.owner_mismatch,
      protected_by_final_recheck: c.protected_by_final_recheck,
      deletion_attempted: c.deletion_attempted,
      deleted: c.deleted,
      failed: c.failed,
    },
  };
  return `${MACHINE_SUMMARY_PREFIX}${JSON.stringify(payload)}`;
}

// ---------------------------------------------------------------
// Serialization (pure)
// ---------------------------------------------------------------

/**
 * Serialize a canonical report to the on-disk format: UTF-8, two-
 * space indent, trailing newline. Deterministic modulo `generated_at`.
 * @param {CanonicalCleanupReport} report
 * @returns {string}
 */
export function serializeCanonicalReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

