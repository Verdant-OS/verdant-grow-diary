/**
 * plant-photos-cleanup-lib.mjs
 *
 * PURE, DETERMINISTIC planner for the Plant Profile Photo orphan
 * cleanup admin tool. NO Supabase, NO fetch, NO fs, NO process.exit,
 * NO console side effects. The CLI (`plant-photos-cleanup.mjs`)
 * wires this to real clients; tests wire it to in-memory fakes.
 *
 * SAFETY INVARIANTS enforced here:
 *  - Default mode is dry-run. Deletion requires BOTH
 *    `--execute` AND `--confirm-delete-orphans`.
 *  - `--dry-run` + `--execute` is rejected as conflicting.
 *  - Default minimum age is 30 days. Any `--min-age-days` < 7 is
 *    rejected. There is NO override / force flag.
 *  - Any incomplete plant-reference query or storage listing sets
 *    `scan_complete: false`. Execute mode must NOT delete anything
 *    in that state (caller enforces exit code).
 *  - Objects without a trusted `created_at` classify as
 *    `unknown_age` and are NEVER deletion candidates. Age is NEVER
 *    inferred from filename / UUID / listing order.
 *  - Only objects matching
 *    `<owner>/<grow|unassigned>/plant-profiles/<plant>/<file>`
 *    (in the `diary-photos` bucket) are ever considered.
 *  - Before deletion, `plants.photo_url` is re-queried and any newly
 *    referenced object is stripped and reported as
 *    `protected_by_final_recheck`. Final-recheck failure aborts
 *    the deletion batch.
 */

export const PLANT_PROFILE_PHOTO_BUCKET = "diary-photos";
export const PLANT_PROFILE_PHOTO_SUBFOLDER = "plant-profiles";
export const PLANT_PROFILE_PHOTO_UNASSIGNED_GROW = "unassigned";
export const PLANT_PROFILE_PHOTO_SCHEME = "storage://";
export const DEFAULT_MIN_AGE_DAYS = 30;
export const ABSOLUTE_MIN_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------

/**
 * @typedef {Object} CleanupOptions
 * @property {boolean} dryRun
 * @property {boolean} execute
 * @property {boolean} confirmDeleteOrphans
 * @property {number}  minAgeDays
 * @property {string|null} ownerFilter
 */

/**
 * @param {string[]} argv
 * @returns {{ ok:true, options:CleanupOptions } | { ok:false, error:string }}
 */
export function parseCleanupArgs(argv) {
  const opts = {
    dryRun: false,
    execute: false,
    confirmDeleteOrphans: false,
    minAgeDays: DEFAULT_MIN_AGE_DAYS,
    ownerFilter: null,
    _minAgeExplicit: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--execute") opts.execute = true;
    else if (a === "--confirm-delete-orphans") opts.confirmDeleteOrphans = true;
    else if (a === "--min-age-days") {
      const v = Number(argv[i + 1]);
      i += 1;
      if (!Number.isFinite(v) || !Number.isInteger(v)) {
        return { ok: false, error: "--min-age-days requires an integer" };
      }
      opts.minAgeDays = v;
      opts._minAgeExplicit = true;
    } else if (a === "--owner") {
      const v = argv[i + 1];
      i += 1;
      if (!v || typeof v !== "string") {
        return { ok: false, error: "--owner requires a value" };
      }
      opts.ownerFilter = v;
    } else if (a === "--help" || a === "-h") {
      return { ok: false, error: "help" };
    } else {
      return { ok: false, error: `unknown argument: ${a}` };
    }
  }

  if (opts.dryRun && opts.execute) {
    return { ok: false, error: "--dry-run and --execute are mutually exclusive" };
  }
  if (opts.minAgeDays < ABSOLUTE_MIN_AGE_DAYS) {
    return {
      ok: false,
      error: `--min-age-days must be >= ${ABSOLUTE_MIN_AGE_DAYS} (got ${opts.minAgeDays}); there is no override flag`,
    };
  }
  // Default to dry-run if neither dry-run nor a full destructive pair is set.
  if (!opts.execute) opts.dryRun = true;
  return {
    ok: true,
    options: {
      dryRun: opts.dryRun,
      execute: opts.execute,
      confirmDeleteOrphans: opts.confirmDeleteOrphans,
      minAgeDays: opts.minAgeDays,
      ownerFilter: opts.ownerFilter,
    },
  };
}

/**
 * True iff both destructive flags are present AND dry-run is not set.
 * @param {CleanupOptions} options
 */
export function isDestructiveMode(options) {
  return !!(
    options.execute &&
    options.confirmDeleteOrphans &&
    !options.dryRun
  );
}

// ---------------------------------------------------------------
// Path parsing
// ---------------------------------------------------------------

const PATH_RE = new RegExp(
  `^(?<owner>[^/]+)/(?<grow>[^/]+)/${PLANT_PROFILE_PHOTO_SUBFOLDER}/(?<plant>[^/]+)/(?<file>[^/]+)$`,
);

/**
 * @param {string} path
 * @returns {null | { owner:string, grow:string, plant:string, file:string }}
 */
export function parsePlantProfileObjectPath(path) {
  if (typeof path !== "string" || path.length === 0) return null;
  if (path.includes("\\") || path.includes("..")) return null;
  if (path.startsWith("/") || path.endsWith("/")) return null;
  const m = PATH_RE.exec(path);
  if (!m || !m.groups) return null;
  const g = m.groups;
  if (!g.owner || !g.grow || !g.plant || !g.file) return null;
  // Folder placeholders / hidden markers are not real photos.
  if (g.file.startsWith(".")) return null;
  return { owner: g.owner, grow: g.grow, plant: g.plant, file: g.file };
}

/**
 * Extract the storage path from a persisted `plants.photo_url` value
 * IF it is a storage://diary-photos/<path> reference. Any other
 * value (external URL, data URL, blob, null, malformed) returns null.
 * @param {unknown} value
 */
export function extractStoragePathFromPhotoUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith(PLANT_PROFILE_PHOTO_SCHEME)) return null;
  const rest = trimmed.slice(PLANT_PROFILE_PHOTO_SCHEME.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (bucket !== PLANT_PROFILE_PHOTO_BUCKET) return null;
  if (!path || path.includes("?") || path.includes("#")) return null;
  return path;
}

/**
 * Build a Set<string> of storage paths currently referenced by any
 * plant. Non-storage values are ignored — they cannot collide with
 * orphaned storage objects.
 * @param {Array<{ photo_url: unknown }>} rows
 * @returns {Set<string>}
 */
export function buildReferencedPathsFromRows(rows) {
  const set = new Set();
  for (const row of rows ?? []) {
    const p = extractStoragePathFromPhotoUrl(row?.photo_url);
    if (p) set.add(p);
  }
  return set;
}

// ---------------------------------------------------------------
// Object classification
// ---------------------------------------------------------------

/**
 * @typedef {Object} StorageObject
 * @property {string} path            Path within the bucket
 * @property {string|null|undefined} created_at  ISO-8601 timestamp or null
 */

/** Classification verdict for one storage object. */
/**
 * @typedef {(
 *   | { status: "invalid_path" }
 *   | { status: "referenced" }
 *   | { status: "unknown_age" }
 *   | { status: "too_young"; ageDays: number }
 *   | { status: "owner_filter_skip" }
 *   | { status: "candidate"; ageDays: number; owner:string; grow:string; plant:string; file:string }
 * )} ObjectVerdict
 */

/**
 * Pure classifier. Never infers age from filename / order.
 * @param {StorageObject} obj
 * @param {Set<string>} referencedPaths
 * @param {number} minAgeDays
 * @param {string|null} ownerFilter
 * @param {number} nowMs
 * @returns {ObjectVerdict}
 */
export function classifyObject(obj, referencedPaths, minAgeDays, ownerFilter, nowMs) {
  const parsed = parsePlantProfileObjectPath(obj?.path ?? "");
  if (!parsed) return { status: "invalid_path" };
  if (referencedPaths.has(obj.path)) return { status: "referenced" };
  if (ownerFilter && parsed.owner !== ownerFilter) {
    return { status: "owner_filter_skip" };
  }
  const rawTs = obj?.created_at;
  if (rawTs == null || typeof rawTs !== "string") {
    return { status: "unknown_age" };
  }
  const ts = Date.parse(rawTs);
  if (!Number.isFinite(ts)) return { status: "unknown_age" };
  const ageDays = (nowMs - ts) / MS_PER_DAY;
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    // Future-dated → treat as unknown_age (fail closed).
    return { status: "unknown_age" };
  }
  if (ageDays <= minAgeDays) {
    return { status: "too_young", ageDays };
  }
  return {
    status: "candidate",
    ageDays,
    owner: parsed.owner,
    grow: parsed.grow,
    plant: parsed.plant,
    file: parsed.file,
  };
}

// ---------------------------------------------------------------
// Plan (dry-run) + execute
// ---------------------------------------------------------------

/**
 * @typedef {Object} ReferenceListing
 * @property {Array<{ photo_url: unknown }>} rows
 * @property {boolean} complete   false => any query error / paging gap
 */

/**
 * @typedef {Object} ObjectListing
 * @property {StorageObject[]} objects
 * @property {boolean} complete
 */

/**
 * @typedef {Object} CleanupReport
 * @property {string}  mode
 * @property {number}  min_age_days
 * @property {string|null} owner_filter
 * @property {string}  generated_at
 * @property {boolean} scan_complete
 * @property {number}  total_objects_scanned
 * @property {number}  referenced
 * @property {number}  invalid_path
 * @property {number}  unknown_age
 * @property {number}  too_young
 * @property {number}  owner_filter_skip
 * @property {number}  candidates
 * @property {string[]} candidate_paths
 * @property {number}  protected_by_final_recheck
 * @property {string[]} protected_by_final_recheck_paths
 * @property {number}  deleted
 * @property {string[]} deleted_paths
 * @property {string[]} scan_errors
 * @property {boolean} destructive_flags_present
 */

/**
 * Build the plan (classification + candidate list). This is safe to
 * run in either mode — it NEVER deletes and NEVER calls the deleter.
 *
 * @param {Object} args
 * @param {() => Promise<ReferenceListing>} args.listReferences
 * @param {() => Promise<ObjectListing>}    args.listObjects
 * @param {CleanupOptions}                  args.options
 * @param {number}                          args.nowMs
 * @returns {Promise<{ report:CleanupReport, candidateBatch:string[] }>}
 */
export async function planCleanup({ listReferences, listObjects, options, nowMs }) {
  /** @type {CleanupReport} */
  const report = {
    mode: isDestructiveMode(options) ? "execute" : "dry-run",
    min_age_days: options.minAgeDays,
    owner_filter: options.ownerFilter,
    generated_at: new Date(nowMs).toISOString(),
    scan_complete: true,
    total_objects_scanned: 0,
    referenced: 0,
    invalid_path: 0,
    unknown_age: 0,
    too_young: 0,
    owner_filter_skip: 0,
    candidates: 0,
    candidate_paths: [],
    protected_by_final_recheck: 0,
    protected_by_final_recheck_paths: [],
    deleted: 0,
    deleted_paths: [],
    scan_errors: [],
    destructive_flags_present:
      !!(options.execute && options.confirmDeleteOrphans),
  };

  let refs;
  try {
    refs = await listReferences();
  } catch (err) {
    report.scan_complete = false;
    report.scan_errors.push(`reference-listing: ${err?.message ?? "error"}`);
    return { report, candidateBatch: [] };
  }
  if (!refs || refs.complete !== true) {
    report.scan_complete = false;
    report.scan_errors.push("reference-listing: incomplete");
    return { report, candidateBatch: [] };
  }
  const referenced = buildReferencedPathsFromRows(refs.rows);

  let listing;
  try {
    listing = await listObjects();
  } catch (err) {
    report.scan_complete = false;
    report.scan_errors.push(`object-listing: ${err?.message ?? "error"}`);
    return { report, candidateBatch: [] };
  }
  if (!listing || listing.complete !== true) {
    report.scan_complete = false;
    report.scan_errors.push("object-listing: incomplete");
    return { report, candidateBatch: [] };
  }

  /** @type {string[]} */
  const candidateBatch = [];
  for (const obj of listing.objects ?? []) {
    report.total_objects_scanned += 1;
    const v = classifyObject(
      obj,
      referenced,
      options.minAgeDays,
      options.ownerFilter,
      nowMs,
    );
    switch (v.status) {
      case "referenced":
        report.referenced += 1;
        break;
      case "invalid_path":
        report.invalid_path += 1;
        break;
      case "unknown_age":
        report.unknown_age += 1;
        break;
      case "too_young":
        report.too_young += 1;
        break;
      case "owner_filter_skip":
        report.owner_filter_skip += 1;
        break;
      case "candidate":
        report.candidates += 1;
        report.candidate_paths.push(obj.path);
        candidateBatch.push(obj.path);
        break;
    }
  }
  return { report, candidateBatch };
}

/**
 * Execute deletion. Enforces every safety gate; the deleter is only
 * called when ALL predicates hold. Returns the (mutated) report.
 *
 * @param {Object} args
 * @param {CleanupReport} args.report
 * @param {string[]}      args.candidateBatch
 * @param {() => Promise<ReferenceListing>} args.listReferencesForRecheck
 * @param {(paths:string[]) => Promise<{ deleted:string[], errors:string[] }>} args.deleteObjects
 * @param {CleanupOptions} args.options
 */
export async function executeCleanup({
  report,
  candidateBatch,
  listReferencesForRecheck,
  deleteObjects,
  options,
}) {
  // 1. Hard mode gate.
  if (!isDestructiveMode(options)) {
    return report;
  }
  // 2. Scan must be complete.
  if (!report.scan_complete) {
    report.scan_errors.push("execute-aborted: incomplete-scan");
    return report;
  }
  if (candidateBatch.length === 0) return report;

  // 3. Final plants.photo_url recheck. On failure: delete NOTHING.
  let recheck;
  try {
    recheck = await listReferencesForRecheck();
  } catch (err) {
    report.scan_errors.push(`final-recheck: ${err?.message ?? "error"}`);
    report.scan_complete = false;
    return report;
  }
  if (!recheck || recheck.complete !== true) {
    report.scan_errors.push("final-recheck: incomplete");
    report.scan_complete = false;
    return report;
  }
  const currentlyReferenced = buildReferencedPathsFromRows(recheck.rows);
  const finalBatch = [];
  for (const p of candidateBatch) {
    if (currentlyReferenced.has(p)) {
      report.protected_by_final_recheck += 1;
      report.protected_by_final_recheck_paths.push(p);
    } else {
      finalBatch.push(p);
    }
  }
  if (finalBatch.length === 0) return report;

  // 4. Delete. Any per-path failure is reported but does not throw.
  const { deleted, errors } = await deleteObjects(finalBatch);
  report.deleted = deleted.length;
  report.deleted_paths = deleted;
  for (const e of errors ?? []) report.scan_errors.push(`delete: ${e}`);
  return report;
}
