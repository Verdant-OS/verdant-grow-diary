/**
 * E2E fixture garden rotation — pure planner + executor.
 *
 * Features (see docs/cleanup/e2e-test-data-management.md §8):
 *   1. Auto-seed missing E2E Test Tent / Plant (execute mode, exact names only)
 *   2. Project pin required at CLI (this core stays pure)
 *   3. Fixture hunt detection includes E2E prefix, legacy markers, concat residue
 *   4. Optional diary prune for notes matching E2E prefixes on fixture plants
 *   5. Dry-run default; dual confirm for mutate; third flag for diary
 *
 * NEVER service_role. NEVER bulk-delete unmarked diary. NEVER touch
 * forbidden/unmarked grows (account contaminated → block).
 *
 * Denylist helpers live in ./real-grow-denylist.mjs (shared with fixtureSafety).
 */

import {
  REAL_GROW_NAME_DENYLIST,
  isE2eOrTestMarker,
  isForbiddenRealGrowName,
  buildE2eHuntName,
} from "./real-grow-denylist.mjs";

// Re-export shared denylist helpers (single source: real-grow-denylist.mjs).
export { REAL_GROW_NAME_DENYLIST, isE2eOrTestMarker, isForbiddenRealGrowName, buildE2eHuntName };

/** Exact garden names (must match e2e/FIXTURE_SETUP.md). */
export const E2E_GARDEN_NAMES = Object.freeze({
  tent: "E2E Test Tent",
  plant: "E2E Test Plant",
  plant2: "E2E Test Plant 2",
  grow: "E2E Test Grow",
});

/** Note/text prefixes allowed for optional diary prune (fixture plants only). */
export const E2E_DIARY_NOTE_PATTERNS = Object.freeze([
  /^E2E\b/i,
  /\bE2E\s+(paid-journey|pheno|smoke|workspace|fixture)\b/i,
  /^E2E\s+pheno\s+sweep/i,
]);

export const E2E_FIXTURE_ROTATION_JSON_PREFIX = "E2E_FIXTURE_ROTATION_JSON=";

/**
 * Hunt names safe to prune.
 * - Leading `E2E `
 * - Contains E2E + "pheno hunt"
 * - Known agent residue (Claude / Codex / DEMO) with pheno hunt
 * - Concatenated defaults: "Pheno Hunt" appears twice (e.g. #569)
 * - Starter Grow prefill concat even without E2E token
 */
export function isFixtureHuntName(name) {
  const t = (name ?? "").trim();
  if (!t) return false;
  if (/^E2E\s+/i.test(t)) return true;
  if (/\bE2E\b/i.test(t) && /pheno\s*hunt/i.test(t)) return true;
  if (/pheno\s*hunt/i.test(t) && /\b(claude|codex|demo)\b/i.test(t)) return true;
  if (/^DEMO\s*[—\-]/u.test(t)) return true;
  if ((t.match(/pheno\s*hunt/gi) || []).length >= 2) return true;
  // Prefill residue: defaultHuntName("Starter Grow") + typed suffix without clear
  if (/starter\s+grow\s+pheno\s*hunt/i.test(t)) return true;
  return false;
}

export function isE2eDiaryNote(note) {
  const t = (note ?? "").trim();
  if (!t) return false;
  return E2E_DIARY_NOTE_PATTERNS.some((rx) => rx.test(t));
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

/**
 * @returns {{ mode: 'dry_run'|'execute'|'blocked', reason?: string, pruneDiary: boolean }}
 */
export function parseRotationArgs(argv) {
  const known = new Set([
    "--dry-run",
    "--execute",
    "--confirm-fixture-rotation",
    "--prune-e2e-diary",
  ]);
  const flags = new Set();
  for (const arg of argv) {
    if (!known.has(arg)) {
      return { mode: "blocked", reason: "unknown_flag", pruneDiary: false };
    }
    flags.add(arg);
  }
  const dryRun = flags.has("--dry-run");
  const execute = flags.has("--execute");
  const confirm = flags.has("--confirm-fixture-rotation");
  const pruneDiary = flags.has("--prune-e2e-diary");

  if (dryRun && (execute || confirm || pruneDiary)) {
    return { mode: "blocked", reason: "conflicting_flags", pruneDiary: false };
  }
  if (pruneDiary && !(execute && confirm)) {
    // Diary prune is destructive; never alone or with dry-run.
    return { mode: "blocked", reason: "prune_diary_requires_execute_confirm", pruneDiary: false };
  }
  if (execute && confirm) return { mode: "execute", pruneDiary };
  if (execute) return { mode: "blocked", reason: "missing_confirm_flag", pruneDiary: false };
  if (confirm) return { mode: "blocked", reason: "missing_execute_flag", pruneDiary: false };
  return { mode: "dry_run", pruneDiary: false };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * @param inventory grows/tents/plants/hunts + optional diary_entries
 *   diary: { id, note, plant_id }[]
 */
export function classifyGardenInventory(
  { grows = [], tents = [], plants = [], hunts = [], diary = [] },
  expected = E2E_GARDEN_NAMES,
) {
  const forbiddenGrows = grows.filter((g) => isForbiddenRealGrowName(g.name));
  const unmarkedGrows = grows.filter(
    (g) => !isForbiddenRealGrowName(g.name) && !isE2eOrTestMarker(g.name),
  );

  const fixtureTents = tents.filter((t) => t.name === expected.tent);
  const fixturePlants = plants.filter(
    (p) => p.name === expected.plant || p.name === (expected.plant2 ?? E2E_GARDEN_NAMES.plant2),
  );
  const fixturePlantIds = new Set(fixturePlants.map((p) => p.id));
  const fixtureHunts = hunts.filter((h) => isFixtureHuntName(h.name));
  const otherHunts = hunts.filter((h) => !isFixtureHuntName(h.name));

  const diaryToDelete = diary.filter(
    (d) => d.plant_id && fixturePlantIds.has(d.plant_id) && isE2eDiaryNote(d.note),
  );

  const missing = {
    tent: fixtureTents.length === 0,
    plant: !plants.some((p) => p.name === expected.plant),
    plant2: false,
  };

  const contaminated = forbiddenGrows.length > 0 || unmarkedGrows.length > 0;

  return {
    contaminated,
    forbidden_grows: forbiddenGrows.map((g) => ({ id: g.id, name: g.name })),
    unmarked_grows: unmarkedGrows.map((g) => ({ id: g.id, name: g.name })),
    fixture_tents: fixtureTents.map((t) => ({ id: t.id, name: t.name })),
    fixture_plants: fixturePlants.map((p) => ({ id: p.id, name: p.name })),
    hunts_to_delete: fixtureHunts.map((h) => ({ id: h.id, name: h.name })),
    hunts_kept: otherHunts.map((h) => ({ id: h.id, name: h.name })),
    diary_to_delete: diaryToDelete.map((d) => ({
      id: d.id,
      plant_id: d.plant_id,
      note: String(d.note ?? "").slice(0, 80),
    })),
    missing,
    counts: {
      grows: grows.length,
      tents: tents.length,
      plants: plants.length,
      hunts: hunts.length,
      hunts_to_delete: fixtureHunts.length,
      diary_to_delete: diaryToDelete.length,
      forbidden_grows: forbiddenGrows.length,
      unmarked_grows: unmarkedGrows.length,
    },
  };
}

/**
 * @param classification
 * @param {{ pruneDiary?: boolean }} options
 */
export function planRotation(classification, options = {}) {
  const pruneDiary = options.pruneDiary === true;

  if (classification.contaminated) {
    return {
      status: "blocked",
      reason: "account_contaminated",
      actions: [],
      classification,
      next_steps: [
        "Create a NEW dedicated E2E account (no real grows).",
        "Create only E2E Test Tent / E2E Test Plant.",
        "Update E2E_TEST_EMAIL, E2E_TEST_PASSWORD, E2E_GROW_1_PLANT_URL.",
        "Run bun run e2e:verify-fixture before any write smoke.",
        "Do NOT script-delete rows on a mixed real+fixture account.",
      ],
    };
  }

  const actions = [];
  for (const h of classification.hunts_to_delete) {
    actions.push({ op: "delete_pheno_hunt", hunt_id: h.id, name: h.name });
  }
  if (classification.missing.tent) {
    actions.push({ op: "seed_missing", kind: "tent", name: E2E_GARDEN_NAMES.tent });
  }
  if (classification.missing.plant) {
    actions.push({ op: "seed_missing", kind: "plant", name: E2E_GARDEN_NAMES.plant });
  }
  if (pruneDiary) {
    for (const d of classification.diary_to_delete) {
      actions.push({
        op: "delete_e2e_diary",
        entry_id: d.id,
        plant_id: d.plant_id,
        note_preview: d.note,
      });
    }
  }

  return {
    status: "ready",
    reason: null,
    actions,
    classification,
    next_steps:
      actions.length === 0
        ? ["Garden already clean — run bun run e2e:verify-fixture."]
        : [
            "Review dry-run plan.",
            "Re-run with --execute --confirm-fixture-rotation to apply hunt prune + auto-seed.",
            "Add --prune-e2e-diary only when you also want E2E-prefixed diary notes on fixture plants removed.",
            "bun run e2e:verify-fixture before write smokes.",
          ],
  };
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export function zeroRotationCounts() {
  return {
    hunts_deleted: 0,
    hunts_planned: 0,
    seed_actions_planned: 0,
    seed_actions_completed: 0,
    diary_deleted: 0,
    diary_planned: 0,
    forbidden_grows: 0,
    unmarked_grows: 0,
  };
}

export function buildRotationReceipt({
  status,
  reason = null,
  mode = "dry_run",
  ownerVerified = false,
  targetProjectVerified = false,
  counts = zeroRotationCounts(),
  next_steps = [],
}) {
  return {
    schema_version: "2",
    status,
    reason,
    mode,
    owner_verified: ownerVerified,
    target_project_verified: targetProjectVerified,
    counts: {
      hunts_deleted: counts.hunts_deleted ?? 0,
      hunts_planned: counts.hunts_planned ?? 0,
      seed_actions_planned: counts.seed_actions_planned ?? 0,
      seed_actions_completed: counts.seed_actions_completed ?? 0,
      diary_deleted: counts.diary_deleted ?? 0,
      diary_planned: counts.diary_planned ?? 0,
      forbidden_grows: counts.forbidden_grows ?? 0,
      unmarked_grows: counts.unmarked_grows ?? 0,
    },
    next_steps,
  };
}

export function renderRotationReceipt(receipt) {
  return `${E2E_FIXTURE_ROTATION_JSON_PREFIX}${JSON.stringify(receipt)}`;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * @param plan from planRotation
 * @param mode 'dry_run' | 'execute'
 * @param ops {
 *   deletePhenoHunt?(huntId): Promise<void>,
 *   seedGarden?(kinds: ('tent'|'plant')[]): Promise<{ seeded: string[] }>,
 *   deleteDiaryEntry?(entryId): Promise<void>,
 * }
 */
export async function executeRotationPlan(plan, mode, ops = {}) {
  const counts = zeroRotationCounts();
  counts.forbidden_grows = plan.classification?.counts?.forbidden_grows ?? 0;
  counts.unmarked_grows = plan.classification?.counts?.unmarked_grows ?? 0;
  counts.hunts_planned = plan.actions.filter((a) => a.op === "delete_pheno_hunt").length;
  counts.seed_actions_planned = plan.actions.filter((a) => a.op === "seed_missing").length;
  counts.diary_planned = plan.actions.filter((a) => a.op === "delete_e2e_diary").length;

  if (plan.status === "blocked") {
    return {
      status: "blocked",
      reason: plan.reason,
      counts,
      next_steps: plan.next_steps ?? [],
    };
  }

  if (mode !== "execute") {
    return {
      status: "completed",
      reason: "dry_run",
      counts,
      next_steps: plan.next_steps ?? [],
    };
  }

  // --- Hunts ---
  let deleted = 0;
  const huntActions = plan.actions.filter((a) => a.op === "delete_pheno_hunt");
  if (huntActions.length > 0) {
    if (typeof ops.deletePhenoHunt !== "function") {
      return {
        status: "blocked",
        reason: "missing_delete_adapter",
        counts,
        next_steps: ["Provide an authenticated deletePhenoHunt adapter."],
      };
    }
    for (const action of huntActions) {
      if (!isFixtureHuntName(action.name)) {
        return {
          status: "failed",
          reason: "hunt_name_not_fixture",
          counts: { ...counts, hunts_deleted: deleted },
          next_steps: ["Aborted: a planned hunt failed the fixture name check."],
        };
      }
      await ops.deletePhenoHunt(action.hunt_id);
      deleted += 1;
    }
  }
  counts.hunts_deleted = deleted;

  // --- Auto-seed tent/plant ---
  const seedKinds = plan.actions
    .filter((a) => a.op === "seed_missing")
    .map((a) => a.kind)
    .filter((k) => k === "tent" || k === "plant");
  if (seedKinds.length > 0) {
    if (typeof ops.seedGarden !== "function") {
      return {
        status: "failed",
        reason: "missing_seed_adapter",
        counts,
        next_steps: [
          "Hunts may have been deleted; seed adapter missing — create tent/plant via UI.",
        ],
      };
    }
    const result = await ops.seedGarden(seedKinds);
    counts.seed_actions_completed = Array.isArray(result?.seeded) ? result.seeded.length : 0;
  }

  // --- Optional diary prune ---
  const diaryActions = plan.actions.filter((a) => a.op === "delete_e2e_diary");
  let diaryDeleted = 0;
  if (diaryActions.length > 0) {
    if (typeof ops.deleteDiaryEntry !== "function") {
      return {
        status: "failed",
        reason: "missing_diary_adapter",
        counts: { ...counts, diary_deleted: 0 },
        next_steps: ["Diary prune requested but adapter missing."],
      };
    }
    for (const action of diaryActions) {
      // Defense: only IDs from the plan; adapter must still scope by user RLS.
      await ops.deleteDiaryEntry(action.entry_id);
      diaryDeleted += 1;
    }
  }
  counts.diary_deleted = diaryDeleted;

  return {
    status: "completed",
    reason: null,
    counts,
    next_steps: [
      "bun run e2e:verify-fixture",
      "Update E2E_GROW_1_PLANT_URL if plant was recreated.",
    ],
  };
}

export async function runRotation({ inventory, expected, mode, ops, pruneDiary = false }) {
  const classification = classifyGardenInventory(inventory, expected ?? E2E_GARDEN_NAMES);
  const plan = planRotation(classification, { pruneDiary });
  return executeRotationPlan(plan, mode, ops);
}
