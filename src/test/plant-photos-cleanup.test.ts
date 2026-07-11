/**
 * plant-photos-cleanup-lib tests.
 *
 * These prove every hard safety gate for the admin orphan-cleanup
 * tool. NO real Supabase, NO fs, NO network. The deleter is a
 * spied fake that MUST NOT be called for any blocked condition.
 */
import { describe, it, expect, vi } from "vitest";
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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
