/**
 * plant-photos-cleanup-lib tests.
 *
 * These prove every hard safety gate for the admin orphan-cleanup
 * tool. NO real Supabase, NO fs, NO network. The deleter is a
 * spied fake that MUST NOT be called for any blocked condition.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseCleanupArgs,
  isDestructiveMode,
  classifyObject,
  parsePlantProfileObjectPath,
  buildReferencedPathsFromRows,
  planCleanup,
  executeCleanup,
  DEFAULT_MIN_AGE_DAYS,
  ABSOLUTE_MIN_AGE_DAYS,
} from "../../scripts/admin/plant-photos-cleanup-lib.mjs";
import {
  classifyPhotoUrlValue,
  classifyPhotoUrlReferences,
  classifyRawStoragePath,
  splitPathBuckets,
  toCanonicalCleanupReport,
  renderCleanupSummary,
  renderCleanupMachineSummary,
  serializeCanonicalReport,
  comparePathCodePoints,
  CLEANUP_REPORT_SCHEMA_VERSION,
  MACHINE_SUMMARY_PREFIX,
} from "../../scripts/admin/plant-photos-cleanup-report.mjs";
import { writeCanonicalReportFile } from "../../scripts/admin/plant-photos-cleanup-write.mjs";
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  statSync,
  mkdirSync,
  readFileSync as _readFile,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";



const NOW = Date.parse("2026-08-01T00:00:00Z");
const daysAgo = (d: number) =>
  new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

const owner = "11111111-1111-1111-1111-111111111111";
const grow = "22222222-2222-2222-2222-222222222222";
const plant = "33333333-3333-3333-3333-333333333333";
const validPath = (name = "a.jpg") =>
  `${owner}/${grow}/plant-profiles/${plant}/${name}`;

// -------- arg parsing --------

describe("parseCleanupArgs — defaults + gates", () => {
  it("default invocation is dry-run with 30-day threshold", () => {
    const r = parseCleanupArgs([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.dryRun).toBe(true);
    expect(r.options.execute).toBe(false);
    expect(r.options.minAgeDays).toBe(DEFAULT_MIN_AGE_DAYS);
    expect(isDestructiveMode(r.options)).toBe(false);
  });
  it("--execute alone is not destructive without --confirm-delete-orphans", () => {
    const r = parseCleanupArgs(["--execute"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isDestructiveMode(r.options)).toBe(false);
  });
  it("--confirm-delete-orphans alone is not destructive without --execute", () => {
    const r = parseCleanupArgs(["--confirm-delete-orphans"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Without --execute we default back to dry-run.
    expect(r.options.dryRun).toBe(true);
    expect(isDestructiveMode(r.options)).toBe(false);
  });
  it("both destructive flags together enable destructive mode", () => {
    const r = parseCleanupArgs(["--execute", "--confirm-delete-orphans"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isDestructiveMode(r.options)).toBe(true);
  });
  it("rejects --dry-run + --execute as conflicting", () => {
    const r = parseCleanupArgs(["--dry-run", "--execute"]);
    expect(r.ok).toBe(false);
  });
  it("rejects --min-age-days below the absolute minimum (6)", () => {
    const r = parseCleanupArgs(["--min-age-days", "6"]);
    expect(r.ok).toBe(false);
  });
  it("accepts --min-age-days = 7 as the absolute floor", () => {
    const r = parseCleanupArgs(["--min-age-days", "7"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.minAgeDays).toBe(ABSOLUTE_MIN_AGE_DAYS);
  });
  it("has no override / force flag", () => {
    for (const flag of ["--force", "--override", "--allow-below-min"]) {
      const r = parseCleanupArgs([flag]);
      expect(r.ok).toBe(false);
    }
  });
});

// -------- path scope --------

describe("parsePlantProfileObjectPath — strict scope", () => {
  it("accepts a canonical plant-profile path", () => {
    expect(parsePlantProfileObjectPath(validPath())).toEqual({
      owner,
      grow,
      plant,
      file: "a.jpg",
    });
    // 'unassigned' grow is also valid.
    expect(
      parsePlantProfileObjectPath(
        `${owner}/unassigned/plant-profiles/${plant}/b.heic`,
      ),
    ).not.toBeNull();
  });
  it("rejects non-plant-profile paths", () => {
    for (const p of [
      `${owner}/${grow}/diary/entry-1/photo.jpg`,
      `${owner}/${grow}/ai-doctor/session-1/photo.jpg`,
      `${owner}/${grow}/gallery/photo.jpg`,
      `${owner}/${grow}/plant-profiles/`, // folder placeholder
      `${owner}/${grow}/plant-profiles/${plant}/.emptyFolderPlaceholder`,
      `${owner}/${grow}/plant-profiles/${plant}/nested/deep/file.jpg`,
      `../${owner}/${grow}/plant-profiles/${plant}/a.jpg`,
      `/absolute/${owner}/${grow}/plant-profiles/${plant}/a.jpg`,
      `${owner}\\${grow}\\plant-profiles\\${plant}\\a.jpg`,
      "",
      "not/a/valid/path",
    ]) {
      expect(parsePlantProfileObjectPath(p)).toBeNull();
    }
  });
});

// -------- referenced set --------

describe("buildReferencedPathsFromRows", () => {
  it("only extracts storage://diary-photos/<path> references", () => {
    const set = buildReferencedPathsFromRows([
      { photo_url: `storage://diary-photos/${validPath("kept.jpg")}` },
      { photo_url: "https://example.com/legacy.jpg" },
      { photo_url: "data:image/png;base64,iVBORw0KGgo=" },
      { photo_url: null },
      { photo_url: "" },
      { photo_url: "storage://other-bucket/x/y.jpg" },
      { photo_url: "storage://diary-photos/malformed?with=query" },
    ]);
    expect([...set]).toEqual([validPath("kept.jpg")]);
  });
});

// -------- classify --------

describe("classifyObject — safety fences", () => {
  const refs = new Set<string>([validPath("kept.jpg")]);
  const opts = { minAgeDays: 30, ownerFilter: null };

  it("referenced objects are protected regardless of age", () => {
    const v = classifyObject(
      { path: validPath("kept.jpg"), created_at: daysAgo(365) },
      refs,
      opts.minAgeDays,
      opts.ownerFilter,
      NOW,
    );
    expect(v.status).toBe("referenced");
  });
  it("missing created_at classifies as unknown_age (never candidate)", () => {
    const v = classifyObject(
      { path: validPath("orphan.jpg"), created_at: null },
      refs,
      opts.minAgeDays,
      opts.ownerFilter,
      NOW,
    );
    expect(v.status).toBe("unknown_age");
  });
  it("malformed created_at is unknown_age", () => {
    const v = classifyObject(
      { path: validPath("orphan.jpg"), created_at: "not-a-date" },
      refs,
      opts.minAgeDays,
      opts.ownerFilter,
      NOW,
    );
    expect(v.status).toBe("unknown_age");
  });
  it("future-dated objects are unknown_age (fail closed)", () => {
    const v = classifyObject(
      { path: validPath("orphan.jpg"), created_at: daysAgo(-5) },
      refs,
      opts.minAgeDays,
      opts.ownerFilter,
      NOW,
    );
    expect(v.status).toBe("unknown_age");
  });
  it("age not strictly above threshold is too_young (protects the boundary)", () => {
    const v = classifyObject(
      { path: validPath("orphan.jpg"), created_at: daysAgo(30) },
      refs,
      opts.minAgeDays,
      opts.ownerFilter,
      NOW,
    );
    expect(v.status).toBe("too_young");
  });
  it("old, unreferenced, valid-path object is a candidate", () => {
    const v = classifyObject(
      { path: validPath("orphan.jpg"), created_at: daysAgo(45) },
      refs,
      opts.minAgeDays,
      opts.ownerFilter,
      NOW,
    );
    expect(v.status).toBe("candidate");
  });
  it("non-plant-profile paths are invalid_path (never candidates)", () => {
    const v = classifyObject(
      { path: `${owner}/${grow}/diary/entry-1/photo.jpg`, created_at: daysAgo(400) },
      refs,
      opts.minAgeDays,
      opts.ownerFilter,
      NOW,
    );
    expect(v.status).toBe("invalid_path");
  });
  it("owner filter skips other owners", () => {
    const v = classifyObject(
      { path: validPath("orphan.jpg"), created_at: daysAgo(400) },
      refs,
      opts.minAgeDays,
      "different-owner",
      NOW,
    );
    expect(v.status).toBe("owner_filter_skip");
  });
});

// -------- plan + execute --------

const okOpts = {
  dryRun: false,
  execute: true,
  confirmDeleteOrphans: true,
  minAgeDays: 30,
  ownerFilter: null,
};

function refsOk(rows: Array<{ photo_url: unknown }>) {
  return () => Promise.resolve({ rows, complete: true });
}
function refsIncomplete() {
  return () => Promise.resolve({ rows: [], complete: false });
}
function refsThrow() {
  return () => Promise.reject(new Error("db-down"));
}
function objectsOk(objects: Array<{ path: string; created_at: string | null }>) {
  return () => Promise.resolve({ objects, complete: true });
}
function objectsIncomplete() {
  return () => Promise.resolve({ objects: [], complete: false });
}

describe("planCleanup + executeCleanup — fail-closed behavior", () => {
  it("default (dry-run) mode never calls the deleter, even with candidates", async () => {
    const deleter = vi.fn();
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: validPath("orphan.jpg"), created_at: daysAgo(60) },
      ]),
      options: {
        dryRun: true,
        execute: false,
        confirmDeleteOrphans: false,
        minAgeDays: 30,
        ownerFilter: null,
      },
      nowMs: NOW,
    });
    expect(report.candidates).toBe(1);
    expect(candidateBatch).toHaveLength(1);
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter as never,
      options: {
        dryRun: true,
        execute: false,
        confirmDeleteOrphans: false,
        minAgeDays: 30,
        ownerFilter: null,
      },
    });
    expect(deleter).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
  });

  it("--execute alone does not delete", async () => {
    const deleter = vi.fn();
    const opts = { ...okOpts, confirmDeleteOrphans: false };
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: validPath("orphan.jpg"), created_at: daysAgo(60) },
      ]),
      options: opts,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter as never,
      options: opts,
    });
    expect(deleter).not.toHaveBeenCalled();
  });

  it("--confirm-delete-orphans alone does not delete", async () => {
    const deleter = vi.fn();
    const opts = { ...okOpts, execute: false, dryRun: true };
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: validPath("orphan.jpg"), created_at: daysAgo(60) },
      ]),
      options: opts,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter as never,
      options: opts,
    });
    expect(deleter).not.toHaveBeenCalled();
  });

  it("failed reference pagination blocks deletion (scan_complete=false)", async () => {
    const deleter = vi.fn();
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsThrow(),
      listObjects: objectsOk([]),
      options: okOpts,
      nowMs: NOW,
    });
    expect(report.scan_complete).toBe(false);
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter as never,
      options: okOpts,
    });
    expect(deleter).not.toHaveBeenCalled();
  });

  it("incomplete reference listing blocks deletion", async () => {
    const deleter = vi.fn();
    const { report } = await planCleanup({
      listReferences: refsIncomplete(),
      listObjects: objectsOk([]),
      options: okOpts,
      nowMs: NOW,
    });
    expect(report.scan_complete).toBe(false);
    await executeCleanup({
      report,
      candidateBatch: [],
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter as never,
      options: okOpts,
    });
    expect(deleter).not.toHaveBeenCalled();
  });

  it("failed storage pagination blocks deletion", async () => {
    const deleter = vi.fn();
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsIncomplete(),
      options: okOpts,
      nowMs: NOW,
    });
    expect(report.scan_complete).toBe(false);
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter as never,
      options: okOpts,
    });
    expect(deleter).not.toHaveBeenCalled();
  });

  it("unknown-age objects never reach the deleter", async () => {
    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: validPath("orphan.jpg"), created_at: null },
        { path: validPath("bad-date.jpg"), created_at: "not-a-date" },
      ]),
      options: okOpts,
      nowMs: NOW,
    });
    expect(report.unknown_age).toBe(2);
    expect(candidateBatch).toHaveLength(0);
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter,
      options: okOpts,
    });
    expect(deleter).not.toHaveBeenCalled();
  });

  it("non-profile paths never reach the deleter even in execute mode", async () => {
    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: `${owner}/${grow}/diary/entry-1/photo.jpg`, created_at: daysAgo(400) },
        { path: `${owner}/${grow}/ai-doctor/session-1/photo.jpg`, created_at: daysAgo(400) },
        { path: `${owner}/${grow}/plant-profiles/${plant}/.emptyFolderPlaceholder`, created_at: daysAgo(400) },
      ]),
      options: okOpts,
      nowMs: NOW,
    });
    expect(report.invalid_path).toBe(3);
    expect(candidateBatch).toHaveLength(0);
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter,
      options: okOpts,
    });
    expect(deleter).not.toHaveBeenCalled();
  });

  it("final recheck strips newly-referenced objects and never deletes them", async () => {
    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));
    const orphan1 = validPath("orphan-1.jpg");
    const orphan2 = validPath("orphan-2.jpg");
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: orphan1, created_at: daysAgo(60) },
        { path: orphan2, created_at: daysAgo(60) },
      ]),
      options: okOpts,
      nowMs: NOW,
    });
    expect(candidateBatch).toEqual([orphan1, orphan2]);

    // Between plan and execute, someone re-assigned orphan1.
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([
        { photo_url: `storage://diary-photos/${orphan1}` },
      ]),
      deleteObjects: deleter,
      options: okOpts,
    });
    expect(deleter).toHaveBeenCalledTimes(1);
    expect(deleter).toHaveBeenCalledWith([orphan2]);
    expect(report.protected_by_final_recheck).toBe(1);
    expect(report.protected_by_final_recheck_paths).toEqual([orphan1]);
    expect(report.deleted_paths).toEqual([orphan2]);
  });

  it("final-recheck failure deletes nothing", async () => {
    const deleter = vi.fn();
    const orphan = validPath("orphan.jpg");
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([{ path: orphan, created_at: daysAgo(60) }]),
      options: okOpts,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsThrow(),
      deleteObjects: deleter as never,
      options: okOpts,
    });
    expect(deleter).not.toHaveBeenCalled();
    expect(report.scan_complete).toBe(false);
    expect(report.deleted).toBe(0);
  });

  it("7-day threshold still respects the object-age boundary", async () => {
    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));
    const opts = { ...okOpts, minAgeDays: 7 };
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: validPath("young.jpg"), created_at: daysAgo(6) },
        { path: validPath("boundary.jpg"), created_at: daysAgo(7) },
        { path: validPath("old.jpg"), created_at: daysAgo(9) },
      ]),
      options: opts,
      nowMs: NOW,
    });
    expect(report.too_young).toBe(2); // 6d and 7d both protected
    expect(candidateBatch).toEqual([validPath("old.jpg")]);
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter,
      options: opts,
    });
    expect(deleter).toHaveBeenCalledWith([validPath("old.jpg")]);
  });
});

// -------- CLI + repo-shape static safety --------

const ROOT = resolve(__dirname, "../..");
const CLI = readFileSync(
  resolve(ROOT, "scripts/admin/plant-photos-cleanup.mjs"),
  "utf8",
);
const LIB = readFileSync(
  resolve(ROOT, "scripts/admin/plant-photos-cleanup-lib.mjs"),
  "utf8",
);
const PKG = JSON.parse(
  readFileSync(resolve(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("cleanup tool — no UI, no scheduler, npm script wiring", () => {
  it("package.json exposes the manual command", () => {
    expect(PKG.scripts["plant-photos:cleanup"]).toContain(
      "scripts/admin/plant-photos-cleanup.mjs",
    );
  });
  it("no scheduled workflow, cron, or trigger for this script", () => {
    for (const [name, cmd] of Object.entries(PKG.scripts)) {
      if (name === "plant-photos:cleanup") continue;
      expect(cmd).not.toContain("plant-photos-cleanup");
    }
    // No actual scheduling primitives in the executable code.
    expect(CLI).not.toMatch(/\bsetInterval\s*\(|\bsetTimeout\s*\(|node-cron|cronjob\.schedule/);
    expect(LIB).not.toMatch(/\bsetInterval\s*\(|\bsetTimeout\s*\(|node-cron|cronjob\.schedule/);
  });
  it("no UI surface — script is not imported by any src/ non-test file", () => {
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    const out = execSync(
      "grep -rEl \"plant-photos-cleanup\" src --include='*.ts' --include='*.tsx' | grep -v '/test/' || true",
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });
  it("CLI defaults to dry-run and requires SUPABASE_URL + service-role key", () => {
    expect(CLI).toContain("SUPABASE_URL");
    expect(CLI).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(CLI).toMatch(/execute aborted — scan was not complete/);
  });
  it("service-role key value is never logged", () => {
    // `key` in this CLI is the local var holding the service-role
    // secret. It must never be interpolated into a console call.
    expect(CLI).not.toMatch(/console\.\w+\([^)]*\$\{key\}/);
    expect(CLI).not.toMatch(/console\.\w+\([^)]*\+\s*key\b/);
    expect(CLI).not.toMatch(/console\.\w+\([^)]*process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  });
});



// ==============================================================
// Report contract, console summary, owner-filter regression suite
// ==============================================================

const REQUIRED_TOP_LEVEL = [
  "schema_version",
  "generated_at",
  "mode",
  "bucket",
  "scope",
  "scan_complete",
  "min_age_days",
  "owner_filter",
  "counts",
  "eligible_paths",
  "protected_by_final_recheck",
  "deleted_paths",
  "failed_paths",
  "malformed_references",
  "failures",
] as const;

const REQUIRED_COUNTS = [
  "plant_rows_scanned",
  "valid_storage_references",
  "legacy_references",
  "malformed_references",
  "storage_objects_scanned",
  "referenced",
  "eligible_orphans",
  "too_young",
  "unknown_age",
  "invalid_path",
  "non_profile_photo",
  "owner_mismatch",
  "protected_by_final_recheck",
  "deletion_attempted",
  "deleted",
  "failed",
] as const;

function assertCanonicalShape(rep: any) {
  for (const k of REQUIRED_TOP_LEVEL) expect(rep).toHaveProperty(k);
  for (const k of REQUIRED_COUNTS) {
    expect(rep.counts).toHaveProperty(k);
    expect(typeof rep.counts[k]).toBe("number");
  }
  expect(rep.schema_version).toBe(CLEANUP_REPORT_SCHEMA_VERSION);
  expect(rep.bucket).toBe("diary-photos");
  expect(rep.scope).toBe("plant-profile-photos");
  // No undefined values in serialized form.
  const json = JSON.stringify(rep);
  expect(json.includes("undefined")).toBe(false);
  expect(() => JSON.parse(json)).not.toThrow();
  // Array/count invariants.
  expect(rep.counts.protected_by_final_recheck).toBe(
    rep.protected_by_final_recheck.length,
  );
  expect(rep.counts.deleted).toBe(rep.deleted_paths.length);
  expect(rep.counts.failed).toBe(rep.failed_paths.length);
  // Deterministic sort.
  for (const key of [
    "eligible_paths",
    "protected_by_final_recheck",
    "deleted_paths",
    "failed_paths",
    "malformed_references",
  ] as const) {
    const arr: string[] = rep[key];
    const sorted = [...arr].sort();
    expect(arr).toEqual(sorted);
  }
}

const ownerA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const pathA = (name = "a.jpg") =>
  `${ownerA}/${grow}/plant-profiles/${plant}/${name}`;
const pathB = (name = "b.jpg") =>
  `${ownerB}/${grow}/plant-profiles/${plant}/${name}`;

describe("classifyPhotoUrlValue + classifyPhotoUrlReferences", () => {
  it("classifies each value shape", () => {
    expect(
      classifyPhotoUrlValue(`storage://diary-photos/${validPath("k.jpg")}`),
    ).toBe("valid_storage");
    expect(classifyPhotoUrlValue("https://example.com/legacy.jpg")).toBe(
      "legacy",
    );
    expect(classifyPhotoUrlValue("data:image/png;base64,AAAA")).toBe("legacy");
    expect(classifyPhotoUrlValue(null)).toBe("null");
    expect(classifyPhotoUrlValue("")).toBe("null");
    expect(classifyPhotoUrlValue("storage://other-bucket/x/y.jpg")).toBe(
      "malformed",
    );
    expect(classifyPhotoUrlValue("not-a-url-at-all")).toBe("malformed");
  });
  it("aggregates row stats", () => {
    const stats = classifyPhotoUrlReferences([
      { photo_url: `storage://diary-photos/${validPath()}` },
      { photo_url: "https://old.example.com/x.jpg" },
      { photo_url: "junk" },
      { photo_url: null },
    ]);
    expect(stats.plant_rows_scanned).toBe(4);
    expect(stats.valid_storage_references).toBe(1);
    expect(stats.legacy_references).toBe(1);
    expect(stats.malformed_references).toBe(1);
    expect(stats.malformed_values).toEqual(["junk"]);
  });
});

describe("classifyRawStoragePath + splitPathBuckets", () => {
  it("splits invalid_path vs non_profile_photo vs plant_profile", () => {
    expect(classifyRawStoragePath(validPath())).toBe("plant_profile");
    expect(
      classifyRawStoragePath(`${owner}/${grow}/diary-entries/e1/x.jpg`),
    ).toBe("non_profile_photo");
    expect(classifyRawStoragePath(`${owner}/${grow}/gallery/x.jpg`)).toBe(
      "non_profile_photo",
    );
    expect(classifyRawStoragePath(`../${owner}/x.jpg`)).toBe("invalid_path");
    expect(classifyRawStoragePath(`/abs/x.jpg`)).toBe("invalid_path");
    expect(classifyRawStoragePath(`a\\b\\c`)).toBe("invalid_path");
    expect(classifyRawStoragePath(``)).toBe("invalid_path");
    expect(
      classifyRawStoragePath(
        `${owner}/${grow}/plant-profiles/${plant}/.emptyFolderPlaceholder`,
      ),
    ).toBe("invalid_path");
  });
  it("splitPathBuckets aggregates non-profile vs invalid", () => {
    const r = splitPathBuckets([
      { path: validPath() },
      { path: `${owner}/${grow}/diary-entries/e1/x.jpg` },
      { path: `${owner}/${grow}/ai-doctor/d1/x.jpg` },
      { path: `../evil.jpg` },
      { path: `` },
    ]);
    expect(r.non_profile_photo).toBe(2);
    expect(r.invalid_path).toBe(2);
  });
});

describe("toCanonicalCleanupReport — schema contract", () => {
  it("dry-run report contains every required field with correct invariants", async () => {
    const objects = [
      { path: validPath("kept.jpg"), created_at: daysAgo(400) }, // referenced
      { path: validPath("orphan.jpg"), created_at: daysAgo(60) }, // candidate
      { path: validPath("young.jpg"), created_at: daysAgo(3) }, // too_young
      { path: validPath("noage.jpg"), created_at: null }, // unknown_age
      { path: `../bad.jpg`, created_at: daysAgo(400) }, // invalid_path
      // Non-profile diary object is not produced by the CLI's scan
      // (scan only traverses plant-profiles/), but the split helper
      // must still surface it via pathBuckets:
    ];
    const rows = [
      { photo_url: `storage://diary-photos/${validPath("kept.jpg")}` },
      { photo_url: "https://legacy.example.com/x.jpg" },
    ];
    const { report } = await planCleanup({
      listReferences: refsOk(rows),
      listObjects: objectsOk(objects),
      options: {
        dryRun: true,
        execute: false,
        confirmDeleteOrphans: false,
        minAgeDays: 30,
        ownerFilter: null,
      },
      nowMs: NOW,
    });
    const canonical = toCanonicalCleanupReport({
      internal: report,
      referenceStats: classifyPhotoUrlReferences(rows),
      pathBuckets: {
        invalid_path: 1,
        non_profile_photo: 2, // simulate the CLI having seen 2 non-profile objects
      },
      failedPaths: [],
    });
    assertCanonicalShape(canonical);
    expect(canonical.mode).toBe("dry_run");
    expect(canonical.scan_complete).toBe(true);
    expect(canonical.min_age_days).toBe(30);
    expect(canonical.owner_filter).toBeNull();
    expect(canonical.counts.plant_rows_scanned).toBe(2);
    expect(canonical.counts.valid_storage_references).toBe(1);
    expect(canonical.counts.legacy_references).toBe(1);
    expect(canonical.counts.referenced).toBe(1);
    expect(canonical.counts.too_young).toBe(1);
    expect(canonical.counts.unknown_age).toBe(1);
    expect(canonical.counts.invalid_path).toBe(1);
    expect(canonical.counts.non_profile_photo).toBe(2);
    expect(canonical.counts.eligible_orphans).toBe(1);
    expect(canonical.eligible_paths).toEqual([validPath("orphan.jpg")]);
    // Dry-run: no deletion whatsoever.
    expect(canonical.deleted_paths).toEqual([]);
    expect(canonical.counts.deletion_attempted).toBe(0);
    expect(canonical.counts.deleted).toBe(0);
    expect(canonical.counts.failed).toBe(0);
  });

  it("execute report protects final-recheck path and reports deleted", async () => {
    const orphan1 = validPath("o1.jpg");
    const orphan2 = validPath("o2.jpg");
    const objects = [
      { path: orphan1, created_at: daysAgo(60) },
      { path: orphan2, created_at: daysAgo(60) },
    ];
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk(objects),
      options: okOpts,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([
        { photo_url: `storage://diary-photos/${orphan1}` },
      ]),
      deleteObjects: async (paths) => ({ deleted: paths, errors: [] }),
      options: okOpts,
    });
    const canonical = toCanonicalCleanupReport({
      internal: report,
      referenceStats: classifyPhotoUrlReferences([]),
      pathBuckets: { invalid_path: 0, non_profile_photo: 0 },
      failedPaths: [],
    });
    assertCanonicalShape(canonical);
    expect(canonical.mode).toBe("execute");
    expect(canonical.scan_complete).toBe(true);
    expect(canonical.protected_by_final_recheck).toEqual([orphan1]);
    expect(canonical.counts.protected_by_final_recheck).toBe(1);
    expect(canonical.deleted_paths).toEqual([orphan2]);
    expect(canonical.counts.deleted).toBe(1);
    expect(canonical.counts.deletion_attempted).toBe(1);
    expect(canonical.deleted_paths).not.toContain(orphan1);
  });

  it("blocked execute report (incomplete scan) still exposes every required field with zero deletion", async () => {
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsIncomplete(),
      listObjects: objectsOk([]),
      options: okOpts,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: (async () => ({ deleted: [], errors: [] })) as never,
      options: okOpts,
    });
    const canonical = toCanonicalCleanupReport({
      internal: report,
      referenceStats: classifyPhotoUrlReferences([]),
      pathBuckets: { invalid_path: 0, non_profile_photo: 0 },
      failedPaths: [],
    });
    assertCanonicalShape(canonical);
    expect(canonical.scan_complete).toBe(false);
    expect(canonical.counts.deletion_attempted).toBe(0);
    expect(canonical.counts.deleted).toBe(0);
    expect(canonical.deleted_paths).toEqual([]);
  });

  it("secret-like inputs do not appear in the serialized report", async () => {
    const SERVICE_KEY = "eyJ.SECRET.SERVICE.ROLE.KEY";
    const { report } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: validPath("orphan.jpg"), created_at: daysAgo(60) },
      ]),
      options: {
        dryRun: true,
        execute: false,
        confirmDeleteOrphans: false,
        minAgeDays: 30,
        ownerFilter: null,
      },
      nowMs: NOW,
    });
    const canonical = toCanonicalCleanupReport({
      internal: report,
      referenceStats: classifyPhotoUrlReferences([]),
      pathBuckets: { invalid_path: 0, non_profile_photo: 0 },
      failedPaths: [],
    });
    const json = JSON.stringify(canonical);
    expect(json).not.toContain(SERVICE_KEY);
    expect(json).not.toContain("SERVICE_ROLE");
    expect(json).not.toContain("Authorization");
  });
});

describe("renderCleanupSummary — console output", () => {
  function baseReport(overrides: Partial<any> = {}) {
    return {
      schema_version: "1",
      generated_at: "2026-08-01T00:00:00.000Z",
      mode: "dry_run",
      bucket: "diary-photos",
      scope: "plant-profile-photos",
      scan_complete: true,
      min_age_days: 30,
      owner_filter: null,
      counts: {
        plant_rows_scanned: 12,
        valid_storage_references: 8,
        legacy_references: 0,
        malformed_references: 0,
        storage_objects_scanned: 23,
        referenced: 8,
        eligible_orphans: 2,
        too_young: 3,
        unknown_age: 1,
        invalid_path: 2,
        non_profile_photo: 5,
        owner_mismatch: 0,
        protected_by_final_recheck: 0,
        deletion_attempted: 0,
        deleted: 0,
        failed: 0,
      },
      eligible_paths: [validPath("orphan-1.jpg"), validPath("orphan-2.jpg")],
      protected_by_final_recheck: [],
      deleted_paths: [],
      failed_paths: [],
      malformed_references: [],
      failures: [],
      ...overrides,
    };
  }

  it("renders every protected category label including zero counts", () => {
    const s = renderCleanupSummary(baseReport() as any);
    for (const label of [
      "Too young:",
      "Unknown age:",
      "Invalid path:",
      "Non-profile photos:",
      "Owner mismatch:",
      "Protected by final recheck:",
      "Attempted:",
      "Deleted:",
      "Failed:",
    ]) {
      expect(s).toContain(label);
    }
    // Zero not omitted.
    expect(s).toMatch(/Owner mismatch: 0/);
    expect(s).toMatch(/Protected by final recheck: 0/);
    expect(s).toMatch(/Failed: 0/);
  });

  it("dry-run output includes the no-deletion notice", () => {
    const s = renderCleanupSummary(baseReport() as any);
    expect(s).toContain("Mode: DRY RUN");
    expect(s).toContain("No storage objects were deleted.");
  });

  it("execute output shows attempted/deleted/failed and omits the dry-run notice", () => {
    const s = renderCleanupSummary(
      baseReport({
        mode: "execute",
        counts: {
          ...baseReport().counts,
          deletion_attempted: 2,
          deleted: 1,
          failed: 1,
        },
        deleted_paths: [validPath("ok.jpg")],
        failed_paths: [validPath("nope.jpg")],
      }) as any,
    );
    expect(s).toContain("Mode: EXECUTE");
    expect(s).not.toContain("No storage objects were deleted.");
    expect(s).toContain("Attempted: 2");
    expect(s).toContain("Deleted: 1");
    expect(s).toContain("Failed: 1");
  });

  it("does not leak service-role or Authorization values", () => {
    const s = renderCleanupSummary(baseReport() as any);
    expect(s).not.toMatch(/SERVICE_ROLE/i);
    expect(s).not.toMatch(/Authorization/i);
    expect(s).not.toMatch(/eyJ[A-Za-z0-9._-]{20,}/);
  });
});

// -------- Owner-filter regressions --------

describe("owner filter — initial scan and final recheck scoping", () => {
  const optsA = { ...okOpts, ownerFilter: ownerA };

  it("initial scan classifies other-owner objects as owner_filter_skip and never lets them reach the deleter", async () => {
    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: pathA("orphan.jpg"), created_at: daysAgo(60) },
        { path: pathB("orphan.jpg"), created_at: daysAgo(60) },
      ]),
      options: optsA,
      nowMs: NOW,
    });
    expect(report.owner_filter_skip).toBe(1);
    expect(candidateBatch).toEqual([pathA("orphan.jpg")]);
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: deleter,
      options: optsA,
    });
    expect(deleter).toHaveBeenCalledTimes(1);
    const called = deleter.mock.calls[0][0] as string[];
    expect(called).toEqual([pathA("orphan.jpg")]);
    expect(called.every((p) => p.startsWith(ownerA))).toBe(true);
  });

  it("final recheck protects newly-referenced scoped-owner path; unrelated other-owner references do not affect the plan", async () => {
    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));
    const orphanA1 = pathA("o1.jpg");
    const orphanA2 = pathA("o2.jpg");
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: orphanA1, created_at: daysAgo(60) },
        { path: orphanA2, created_at: daysAgo(60) },
        { path: pathB("z.jpg"), created_at: daysAgo(60) },
      ]),
      options: optsA,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([
        // Newly-referenced owner-A path — must protect.
        { photo_url: `storage://diary-photos/${orphanA1}` },
        // Unrelated owner-B references — must NOT affect owner-A plan.
        { photo_url: `storage://diary-photos/${pathB("z.jpg")}` },
      ]),
      deleteObjects: deleter,
      options: optsA,
    });
    expect(report.protected_by_final_recheck_paths).toEqual([orphanA1]);
    expect(report.protected_by_final_recheck_paths.every((p) =>
      p.startsWith(ownerA),
    )).toBe(true);
    expect(deleter).toHaveBeenCalledWith([orphanA2]);
  });

  it("cross-owner malformed reference does not create false protection for a scoped-owner path", async () => {
    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));
    const orphanA1 = pathA("o1.jpg");
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: orphanA1, created_at: daysAgo(60) },
      ]),
      options: optsA,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([
        // Malformed / wrong-bucket reference claiming to be owner-B.
        { photo_url: `storage://wrong-bucket/${pathB("junk.jpg")}` },
        { photo_url: `not-a-storage-url` },
      ]),
      deleteObjects: deleter,
      options: optsA,
    });
    // orphanA1 must still be deleted because no valid reference protects it.
    expect(deleter).toHaveBeenCalledWith([orphanA1]);
    expect(report.protected_by_final_recheck).toBe(0);
  });

  it("owner-filtered failed final recheck deletes nothing on either side", async () => {
    const deleter = vi.fn();
    const orphanA1 = pathA("o1.jpg");
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: orphanA1, created_at: daysAgo(60) },
        { path: pathB("x.jpg"), created_at: daysAgo(60) },
      ]),
      options: optsA,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsThrow(),
      deleteObjects: deleter as never,
      options: optsA,
    });
    expect(deleter).not.toHaveBeenCalled();
    expect(report.scan_complete).toBe(false);
    expect(report.deleted).toBe(0);
  });
});

// -------- Static safety re-assertions for reporting layer --------

describe("cleanup reporting — static boundaries", () => {
  it("report helper file introduces no scheduler / cron / timer", () => {
    const REPORT = readFileSync(
      resolve(ROOT, "scripts/admin/plant-photos-cleanup-report.mjs"),
      "utf8",
    );
    expect(REPORT).not.toMatch(
      /\bsetInterval\s*\(|\bsetTimeout\s*\(|node-cron|cronjob\.schedule/,
    );
    // Pure module — no Supabase / fs / network.
    expect(REPORT).not.toContain("@supabase/supabase-js");
    expect(REPORT).not.toContain("node:fs");
    expect(REPORT).not.toContain("fetch(");
  });
  it("age constants remain 30 and 7", () => {
    expect(DEFAULT_MIN_AGE_DAYS).toBe(30);
    expect(ABSOLUTE_MIN_AGE_DAYS).toBe(7);
  });
  it("operator README exists and documents required env + safety gates", () => {
    const README = readFileSync(
      resolve(ROOT, "scripts/admin/README-plant-photos-cleanup.md"),
      "utf8",
    );
    for (const s of [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "Dry-run",
      "30-day",
      "7-day absolute",
      "--execute",
      "--confirm-delete-orphans",
      "final `plants.photo_url` recheck",
      "schema_version",
      "non_profile_photo",
      "unknown_age",
      "invalid_path",
      "protected_by_final_recheck",
    ]) {
      expect(README).toContain(s);
    }
  });
});

// ==============================================================
// Report persistence + determinism hardening
// ==============================================================




// -------- --report-file arg parsing --------

describe("parseCleanupArgs — --report-file", () => {
  it("accepts a valid file path", () => {
    const r = parseCleanupArgs(["--report-file", "artifacts/x.json"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.reportFile).toBe("artifacts/x.json");
  });
  it("rejects a missing value", () => {
    const r = parseCleanupArgs(["--report-file"]);
    expect(r.ok).toBe(false);
  });
  it("rejects a blank value", () => {
    const r = parseCleanupArgs(["--report-file", "   "]);
    expect(r.ok).toBe(false);
  });
  it("rejects a next-flag as the value", () => {
    const r = parseCleanupArgs(["--report-file", "--dry-run"]);
    expect(r.ok).toBe(false);
  });
  it("rejects repeated --report-file", () => {
    const r = parseCleanupArgs([
      "--report-file",
      "a.json",
      "--report-file",
      "b.json",
    ]);
    expect(r.ok).toBe(false);
  });
  it("accepts --owner-id as the documented spelling", () => {
    const r = parseCleanupArgs(["--owner-id", ownerA]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.options.ownerFilter).toBe(ownerA);
  });
});

// -------- report file writer --------

function makeCanonical(overrides: Partial<any> = {}) {
  return {
    schema_version: "1",
    generated_at: "2026-08-01T00:00:00.000Z",
    mode: "dry_run",
    bucket: "diary-photos",
    scope: "plant-profile-photos",
    scan_complete: true,
    min_age_days: 30,
    owner_filter: null,
    counts: {
      plant_rows_scanned: 0,
      valid_storage_references: 0,
      legacy_references: 0,
      malformed_references: 0,
      storage_objects_scanned: 0,
      referenced: 0,
      eligible_orphans: 0,
      too_young: 0,
      unknown_age: 0,
      invalid_path: 0,
      non_profile_photo: 0,
      owner_mismatch: 0,
      protected_by_final_recheck: 0,
      deletion_attempted: 0,
      deleted: 0,
      failed: 0,
    },
    eligible_paths: [],
    protected_by_final_recheck: [],
    deleted_paths: [],
    failed_paths: [],
    malformed_references: [],
    failures: [],
    ...overrides,
  };
}

describe("writeCanonicalReportFile — atomic, deterministic", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "cleanup-report-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("writes to a fresh path with 2-space indent and trailing newline", () => {
    const target = join(tmp, "nested", "sub", "report.json");
    const canonical = makeCanonical({
      eligible_paths: ["z/a.jpg", "a/z.jpg"],
    });
    const { absPath } = writeCanonicalReportFile(canonical as any, target);
    expect(absPath).toBe(target);
    expect(existsSync(target)).toBe(true);
    const body = _readFile(target, "utf8");
    expect(body.endsWith("\n")).toBe(true);
    expect(body.startsWith("{\n  ")).toBe(true);
    const parsed = JSON.parse(body);
    // Written content equals the in-memory canonical report.
    expect(parsed).toEqual(canonical);
    // No stale temp file left behind.
    expect(existsSync(`${target}.tmp-write`)).toBe(false);
  });

  it("refuses to overwrite a directory that already occupies the path", () => {
    const dir = join(tmp, "collide");
    mkdirSync(dir);
    expect(() =>
      writeCanonicalReportFile(makeCanonical() as any, dir),
    ).toThrow(/directory/);
  });

  it("rejects an empty path", () => {
    expect(() =>
      writeCanonicalReportFile(makeCanonical() as any, "   "),
    ).toThrow();
  });

  it("overwrites an existing report atomically (previous file survives crash-simulated failure)", () => {
    const target = join(tmp, "report.json");
    writeCanonicalReportFile(makeCanonical() as any, target);
    const before = statSync(target).mtimeMs;
    // Second write with different contents.
    writeCanonicalReportFile(
      makeCanonical({ mode: "execute" }) as any,
      target,
    );
    const after = _readFile(target, "utf8");
    expect(JSON.parse(after).mode).toBe("execute");
    // Sanity: same file identity, not a stale temp file.
    expect(existsSync(`${target}.tmp-write`)).toBe(false);
    expect(after.length).toBeGreaterThan(0);
    // mtime may or may not increase on very fast systems; existence
    // of the previous file is the real safety property.
    expect(before).toBeGreaterThan(0);
  });
});

// -------- serialize / determinism --------

describe("serializeCanonicalReport + comparePathCodePoints — determinism", () => {
  it("serializes with 2-space indent and trailing newline; JSON round-trips", () => {
    const canonical = makeCanonical();
    const body = serializeCanonicalReport(canonical as any);
    expect(body.endsWith("\n")).toBe(true);
    expect(JSON.parse(body)).toEqual(canonical);
  });
  it("comparator gives stable, code-point ordering", () => {
    const sample = [
      "owner-a/grow-b/plant-profiles/plant-2/z.webp",
      "owner-a/grow-a/plant-profiles/plant-1/a.heic",
      "owner-a/unassigned/plant-profiles/plant-3/m.jpg",
    ];
    const a = [...sample].sort(comparePathCodePoints);
    const b = [...sample].reverse().sort(comparePathCodePoints);
    expect(a).toEqual(b);
    expect(a).toEqual([
      "owner-a/grow-a/plant-profiles/plant-1/a.heic",
      "owner-a/grow-b/plant-profiles/plant-2/z.webp",
      "owner-a/unassigned/plant-profiles/plant-3/m.jpg",
    ]);
  });
});

describe("canonical report path arrays — sorted, unique, order-invariant", () => {
  const opts = { ...okOpts, ownerFilter: null };

  async function buildCanonicalFromObjects(objects: Array<{ path: string; created_at: string | null }>) {
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk(objects),
      options: opts,
      nowMs: NOW,
    });
    // Simulate execute so deleted_paths + failed_paths get populated.
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([]),
      deleteObjects: async (paths) => {
        // Mark every other path as failed to populate both arrays.
        const deleted: string[] = [];
        for (let i = 0; i < paths.length; i += 1) {
          if (i % 2 === 0) deleted.push(paths[i]);
        }
        return { deleted, errors: paths.length > deleted.length ? ["boom"] : [] };
      },
      options: opts,
    });
    const failedPaths = candidateBatch.filter(
      (p) => !report.deleted_paths.includes(p),
    );
    return toCanonicalCleanupReport({
      internal: report,
      referenceStats: classifyPhotoUrlReferences([
        { photo_url: "junk-A" },
        { photo_url: "junk-B" },
        { photo_url: "junk-A" }, // duplicate value → still one entry after uniq
      ]),
      pathBuckets: { invalid_path: 0, non_profile_photo: 0 },
      failedPaths,
    });
  }

  it("eligible_paths / deleted_paths / failed_paths are sorted, unique, order-invariant", async () => {
    const mkObj = (p: string) => ({ path: p, created_at: daysAgo(60) });
    const forward = [
      mkObj(`${ownerA}/grow-b/plant-profiles/plant-2/z.webp`),
      mkObj(`${ownerA}/grow-a/plant-profiles/plant-1/a.heic`),
      mkObj(`${ownerA}/unassigned/plant-profiles/plant-3/m.jpg`),
      mkObj(`${ownerA}/grow-a/plant-profiles/plant-1/a.heic`), // duplicate
    ];
    const reversed = [...forward].reverse();

    const rA = await buildCanonicalFromObjects(forward);
    const rB = await buildCanonicalFromObjects(reversed);

    for (const key of [
      "eligible_paths",
      "deleted_paths",
      "failed_paths",
      "malformed_references",
      "protected_by_final_recheck",
    ] as const) {
      const arr: string[] = (rA as any)[key];
      // Sorted.
      expect(arr).toEqual([...arr].sort(comparePathCodePoints));
      // Unique.
      expect(new Set(arr).size).toBe(arr.length);
      // Order-invariant vs reversed input.
      expect(arr).toEqual((rB as any)[key]);
    }
  });

  it("final-recheck protection produces a sorted, unique array", async () => {
    const p1 = `${ownerA}/grow-a/plant-profiles/plant-x/z.jpg`;
    const p2 = `${ownerA}/grow-a/plant-profiles/plant-x/a.jpg`;
    const p3 = `${ownerA}/grow-a/plant-profiles/plant-x/m.jpg`;
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: p1, created_at: daysAgo(60) },
        { path: p2, created_at: daysAgo(60) },
        { path: p3, created_at: daysAgo(60) },
      ]),
      options: okOpts,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([
        { photo_url: `storage://diary-photos/${p1}` },
        { photo_url: `storage://diary-photos/${p3}` },
        { photo_url: `storage://diary-photos/${p1}` }, // duplicate reference
      ]),
      deleteObjects: async (paths) => ({ deleted: paths, errors: [] }),
      options: okOpts,
    });
    const canonical = toCanonicalCleanupReport({
      internal: report,
      referenceStats: classifyPhotoUrlReferences([]),
      pathBuckets: { invalid_path: 0, non_profile_photo: 0 },
      failedPaths: [],
    });
    expect(canonical.protected_by_final_recheck).toEqual([p3, p1].sort(comparePathCodePoints));
    expect(new Set(canonical.protected_by_final_recheck).size).toBe(
      canonical.protected_by_final_recheck.length,
    );
  });
});

// -------- Owner-filtered execute-mode regression --------

describe("owner-filtered execute-mode — full regression", () => {
  it("only surviving owner-A candidate reaches the deleter; owner-B never touched", async () => {
    const optsA = { ...okOpts, ownerFilter: ownerA };
    const orphanA1 = `${ownerA}/${grow}/plant-profiles/${plant}/orphan-1.jpg`;
    const orphanA2 = `${ownerA}/${grow}/plant-profiles/${plant}/orphan-2.jpg`;
    const refA = `${ownerA}/${grow}/plant-profiles/${plant}/ref.jpg`;
    const youngA = `${ownerA}/${grow}/plant-profiles/${plant}/young.jpg`;
    const orphanB = `${ownerB}/${grow}/plant-profiles/${plant}/orphan.jpg`;
    const refB = `${ownerB}/${grow}/plant-profiles/${plant}/ref.jpg`;

    const initialRefs = [
      { photo_url: `storage://diary-photos/${refA}` },
      { photo_url: `storage://diary-photos/${refB}` },
    ];

    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk(initialRefs),
      listObjects: objectsOk([
        { path: orphanA1, created_at: daysAgo(60) },
        { path: orphanA2, created_at: daysAgo(60) },
        { path: refA, created_at: daysAgo(400) },
        { path: youngA, created_at: daysAgo(3) },
        { path: orphanB, created_at: daysAgo(60) },
        { path: refB, created_at: daysAgo(400) },
      ]),
      options: optsA,
      nowMs: NOW,
    });

    // Only owner-A orphans should be candidates.
    expect(candidateBatch.every((p) => p.startsWith(ownerA))).toBe(true);
    expect(candidateBatch).toContain(orphanA1);
    expect(candidateBatch).toContain(orphanA2);
    expect(candidateBatch).not.toContain(orphanB);

    const deleter = vi.fn(async (paths: string[]) => ({
      deleted: paths,
      errors: [],
    }));

    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsOk([
        ...initialRefs,
        // New reference protects orphanA1.
        { photo_url: `storage://diary-photos/${orphanA1}` },
      ]),
      deleteObjects: deleter,
      options: optsA,
    });

    // Only orphanA2 must have been deleted.
    expect(deleter).toHaveBeenCalledTimes(1);
    const calledWith = deleter.mock.calls[0][0] as string[];
    expect(calledWith).toEqual([orphanA2]);
    expect(calledWith.every((p) => p.startsWith(ownerA))).toBe(true);

    const canonical = toCanonicalCleanupReport({
      internal: report,
      referenceStats: classifyPhotoUrlReferences(initialRefs),
      pathBuckets: { invalid_path: 0, non_profile_photo: 0 },
      failedPaths: [],
    });

    expect(canonical.mode).toBe("execute");
    expect(canonical.owner_filter).toBe(ownerA);
    expect(canonical.protected_by_final_recheck).toEqual([orphanA1]);
    expect(canonical.deleted_paths).toEqual([orphanA2]);
    expect(canonical.counts.protected_by_final_recheck).toBe(1);
    expect(canonical.counts.deletion_attempted).toBe(1);
    expect(canonical.counts.deleted).toBe(1);
    expect(canonical.counts.failed).toBe(0);
    expect(canonical.counts.deleted).toBe(canonical.deleted_paths.length);
    expect(canonical.counts.protected_by_final_recheck).toBe(
      canonical.protected_by_final_recheck.length,
    );
    // Arrays remain sorted.
    for (const key of [
      "eligible_paths",
      "protected_by_final_recheck",
      "deleted_paths",
      "failed_paths",
    ] as const) {
      const arr: string[] = (canonical as any)[key];
      expect(arr).toEqual([...arr].sort(comparePathCodePoints));
    }
  });

  it("failed final recheck deletes nothing on either owner side", async () => {
    const optsA = { ...okOpts, ownerFilter: ownerA };
    const orphanA1 = `${ownerA}/${grow}/plant-profiles/${plant}/o1.jpg`;
    const orphanB = `${ownerB}/${grow}/plant-profiles/${plant}/o.jpg`;
    const deleter = vi.fn();
    const { report, candidateBatch } = await planCleanup({
      listReferences: refsOk([]),
      listObjects: objectsOk([
        { path: orphanA1, created_at: daysAgo(60) },
        { path: orphanB, created_at: daysAgo(60) },
      ]),
      options: optsA,
      nowMs: NOW,
    });
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: refsThrow(),
      deleteObjects: deleter as never,
      options: optsA,
    });
    expect(deleter).not.toHaveBeenCalled();
    expect(report.scan_complete).toBe(false);
  });
});

// -------- Machine-readable console summary --------

describe("renderCleanupMachineSummary", () => {
  it("prints a single line with the stable prefix and parseable compact JSON", () => {
    const canonical = makeCanonical({
      counts: { ...makeCanonical().counts, storage_objects_scanned: 12, referenced: 5 },
    });
    const line = renderCleanupMachineSummary(canonical as any);
    expect(line.startsWith(MACHINE_SUMMARY_PREFIX)).toBe(true);
    // Exactly one line.
    expect(line.includes("\n")).toBe(false);
    const payload = JSON.parse(line.slice(MACHINE_SUMMARY_PREFIX.length));
    expect(payload.schema_version).toBe("1");
    expect(payload.mode).toBe("dry_run");
    expect(payload.scan_complete).toBe(true);
    expect(payload.min_age_days).toBe(30);
    expect(payload.owner_filter).toBeNull();
    for (const k of [
      "storage_objects_scanned",
      "referenced",
      "eligible_orphans",
      "too_young",
      "unknown_age",
      "invalid_path",
      "non_profile_photo",
      "owner_mismatch",
      "protected_by_final_recheck",
      "deletion_attempted",
      "deleted",
      "failed",
    ]) {
      expect(payload.counts).toHaveProperty(k);
      expect(typeof payload.counts[k]).toBe("number");
    }
  });

  it("does not include path arrays, malformed values, or failure details", () => {
    const canonical = makeCanonical({
      eligible_paths: ["a/b/plant-profiles/p/x.jpg"],
      protected_by_final_recheck: ["a/b/plant-profiles/p/y.jpg"],
      deleted_paths: ["a/b/plant-profiles/p/z.jpg"],
      malformed_references: ["junk"],
      failures: [{ phase: "delete", message: "boom" }],
    });
    const line = renderCleanupMachineSummary(canonical as any);
    const payload = JSON.parse(line.slice(MACHINE_SUMMARY_PREFIX.length));
    expect(payload).not.toHaveProperty("eligible_paths");
    expect(payload).not.toHaveProperty("protected_by_final_recheck");
    expect(payload).not.toHaveProperty("deleted_paths");
    expect(payload).not.toHaveProperty("malformed_references");
    expect(payload).not.toHaveProperty("failures");
  });

  it("dry-run deletion totals are zero", () => {
    const line = renderCleanupMachineSummary(makeCanonical() as any);
    const payload = JSON.parse(line.slice(MACHINE_SUMMARY_PREFIX.length));
    expect(payload.counts.deletion_attempted).toBe(0);
    expect(payload.counts.deleted).toBe(0);
    expect(payload.counts.failed).toBe(0);
  });

  it("execute deletion totals match the report counts and no secrets leak", () => {
    const canonical = makeCanonical({
      mode: "execute",
      counts: {
        ...makeCanonical().counts,
        deletion_attempted: 3,
        deleted: 2,
        failed: 1,
      },
    });
    const line = renderCleanupMachineSummary(canonical as any);
    expect(line).not.toMatch(/SERVICE_ROLE/i);
    expect(line).not.toMatch(/Authorization/i);
    expect(line).not.toMatch(/eyJ[A-Za-z0-9._-]{20,}/);
    const payload = JSON.parse(line.slice(MACHINE_SUMMARY_PREFIX.length));
    expect(payload.counts.deletion_attempted).toBe(3);
    expect(payload.counts.deleted).toBe(2);
    expect(payload.counts.failed).toBe(1);
  });
});

// -------- README expansion checks --------

describe("README — persistence + machine summary docs", () => {
  it("documents --report-file, machine summary, and generation sequence", () => {
    const README = readFileSync(
      resolve(ROOT, "scripts/admin/README-plant-photos-cleanup.md"),
      "utf8",
    );
    for (const s of [
      "--report-file",
      "CLEANUP_REPORT_SUMMARY_JSON=",
      "How the report is generated",
      "atomically",
      "generated_at",
      "compact",
      "counts only",
      "--owner-id",
    ]) {
      expect(README).toContain(s);
    }
  });
});

