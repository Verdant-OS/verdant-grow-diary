#!/usr/bin/env node
/**
 * plant-photos-cleanup.mjs
 *
 * Admin-only CLI that identifies and (opt-in) removes orphaned plant
 * profile photo objects from the private `diary-photos` bucket.
 *
 * DRY-RUN BY DEFAULT. Destructive execution requires BOTH:
 *   --execute --confirm-delete-orphans
 *
 * This script is server-side operator tooling — it is never imported
 * by the client bundle, exposes no HTTP surface, and installs no
 * scheduler / cron / trigger. Invocation is manual.
 *
 * Requires (execute mode) the SUPABASE_SERVICE_ROLE_KEY and
 * SUPABASE_URL env vars. The service-role key is NEVER logged.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  parseCleanupArgs,
  planCleanup,
  executeCleanup,
  isDestructiveMode,
  PLANT_PROFILE_PHOTO_BUCKET,
  PLANT_PROFILE_PHOTO_SUBFOLDER,
  DEFAULT_MIN_AGE_DAYS,
  ABSOLUTE_MIN_AGE_DAYS,
} from "./plant-photos-cleanup-lib.mjs";

const HELP = `
Plant Profile Photo orphan cleanup (admin, manual, dry-run by default)

Usage:
  bun run plant-photos:cleanup
  bun run plant-photos:cleanup -- --dry-run --min-age-days ${DEFAULT_MIN_AGE_DAYS}
  bun run plant-photos:cleanup -- --execute --confirm-delete-orphans --min-age-days ${DEFAULT_MIN_AGE_DAYS}

Flags:
  --dry-run                    Scan and report only (default behavior).
  --execute                    Enable destructive mode (requires the confirmation flag too).
  --confirm-delete-orphans     Required together with --execute.
  --min-age-days <int>         Object age threshold in days. Default ${DEFAULT_MIN_AGE_DAYS}.
                               Values below ${ABSOLUTE_MIN_AGE_DAYS} are rejected. There is no override.
  --owner <uuid>               Optional: only consider objects whose owner segment matches.
  -h, --help                   Show this help.

Safety:
  * Only objects matching <owner>/<grow|unassigned>/${PLANT_PROFILE_PHOTO_SUBFOLDER}/<plant>/<file>
    in the '${PLANT_PROFILE_PHOTO_BUCKET}' bucket are considered.
  * Objects without a trusted created_at are protected (unknown_age).
  * Any incomplete scan aborts deletion with a nonzero exit.
  * plants.photo_url is re-queried immediately before deletion; newly
    referenced objects are stripped and reported.
`;

async function listAllPlantReferences(supabase) {
  const PAGE = 1000;
  const rows = [];
  let from = 0;
  // Paginate deterministically by id so we can detect gaps.
  // If ANY page errors we return { complete: false } so the planner
  // fails closed.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("plants")
      .select("photo_url")
      .range(from, from + PAGE - 1);
    if (error) return { rows, complete: false, error: error.message };
    if (!data) return { rows, complete: false, error: "null-data" };
    for (const r of data) rows.push({ photo_url: r.photo_url });
    if (data.length < PAGE) return { rows, complete: true };
    from += PAGE;
  }
}

async function listAllPlantProfileObjects(supabase, ownerFilter) {
  // Traverses only <owner>/<grow>/plant-profiles/<plant>/ directories.
  // If any listing errors we return { complete: false }.
  const PAGE = 1000;
  const collected = [];

  async function list(path) {
    const out = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage
        .from(PLANT_PROFILE_PHOTO_BUCKET)
        .list(path, {
          limit: PAGE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("null listing");
      for (const item of data) out.push(item);
      if (data.length < PAGE) return out;
      offset += PAGE;
    }
  }

  try {
    const owners = ownerFilter
      ? [{ name: ownerFilter, id: null }]
      : (await list("")).filter((n) => n.id === null); // folders only
    for (const owner of owners) {
      const grows = (await list(owner.name)).filter((n) => n.id === null);
      for (const grow of grows) {
        const sub = `${owner.name}/${grow.name}`;
        const subEntries = (await list(sub)).filter((n) => n.id === null);
        for (const s of subEntries) {
          if (s.name !== PLANT_PROFILE_PHOTO_SUBFOLDER) continue;
          const plantsPath = `${sub}/${PLANT_PROFILE_PHOTO_SUBFOLDER}`;
          const plants = (await list(plantsPath)).filter((n) => n.id === null);
          for (const plant of plants) {
            const dir = `${plantsPath}/${plant.name}`;
            const files = (await list(dir)).filter((n) => n.id !== null);
            for (const f of files) {
              collected.push({
                path: `${dir}/${f.name}`,
                created_at: f.created_at ?? null,
              });
            }
          }
        }
      }
    }
    return { objects: collected, complete: true };
  } catch (err) {
    return { objects: collected, complete: false, error: err?.message };
  }
}

async function deleteBatch(supabase, paths) {
  const CHUNK = 100;
  const deleted = [];
  const errors = [];
  for (let i = 0; i < paths.length; i += CHUNK) {
    const chunk = paths.slice(i, i + CHUNK);
    const { data, error } = await supabase.storage
      .from(PLANT_PROFILE_PHOTO_BUCKET)
      .remove(chunk);
    if (error) {
      errors.push(error.message);
      continue;
    }
    for (const d of data ?? []) deleted.push(d.name);
  }
  return { deleted, errors };
}

function writeReport(report) {
  const outPath = resolve(
    process.cwd(),
    `artifacts/admin/plant-photos-cleanup-${new Date(report.generated_at)
      .toISOString()
      .replace(/[:.]/g, "-")}.json`,
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  return outPath;
}

function printSummary(report, mode) {
  const lines = [
    `Plant Profile Photo cleanup — mode: ${mode}`,
    `  min_age_days:               ${report.min_age_days} (absolute floor ${ABSOLUTE_MIN_AGE_DAYS})`,
    `  owner_filter:               ${report.owner_filter ?? "(none)"}`,
    `  scan_complete:              ${report.scan_complete}`,
    `  total_objects_scanned:      ${report.total_objects_scanned}`,
    `  referenced (protected):     ${report.referenced}`,
    `  unknown_age (protected):    ${report.unknown_age}`,
    `  too_young (protected):      ${report.too_young}`,
    `  invalid_path (skipped):     ${report.invalid_path}`,
    `  owner_filter_skip:          ${report.owner_filter_skip}`,
    `  candidates:                 ${report.candidates}`,
    `  protected_by_final_recheck: ${report.protected_by_final_recheck}`,
    `  deleted:                    ${report.deleted}`,
  ];
  for (const l of lines) console.log(l);
  if (report.scan_errors.length) {
    console.log("  scan_errors:");
    for (const e of report.scan_errors) console.log(`    - ${e}`);
  }
}

async function main() {
  const parsed = parseCleanupArgs(process.argv.slice(2));
  if (!parsed.ok) {
    if (parsed.error === "help") {
      console.log(HELP);
      process.exit(0);
    }
    console.error(`plant-photos-cleanup: ${parsed.error}`);
    console.error(HELP);
    process.exit(2);
  }
  const options = parsed.options;
  const destructive = isDestructiveMode(options);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "plant-photos-cleanup: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (server-side only).",
    );
    process.exit(2);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const nowMs = Date.now();
  const { report, candidateBatch } = await planCleanup({
    listReferences: () => listAllPlantReferences(supabase),
    listObjects: () => listAllPlantProfileObjects(supabase, options.ownerFilter),
    options,
    nowMs,
  });

  if (destructive) {
    await executeCleanup({
      report,
      candidateBatch,
      listReferencesForRecheck: () => listAllPlantReferences(supabase),
      deleteObjects: (paths) => deleteBatch(supabase, paths),
      options,
    });
  }

  const outPath = writeReport(report);
  printSummary(report, destructive ? "execute" : "dry-run");
  console.log(`Report written: ${outPath}`);

  // Fail closed on incomplete scan under execute mode.
  if (destructive && !report.scan_complete) {
    console.error(
      "plant-photos-cleanup: execute aborted — scan was not complete.",
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  // Never leak service-role key material.
  console.error(`plant-photos-cleanup: fatal — ${err?.message ?? "error"}`);
  process.exit(1);
});
