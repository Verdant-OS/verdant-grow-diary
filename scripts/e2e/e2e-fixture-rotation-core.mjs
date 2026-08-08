/**
 * E2E fixture garden rotation — pure planner + executor.
 *
 * Scope (intentionally narrow — see docs/cleanup/e2e-test-data-management.md):
 *   - Classify grows/tents/plants/hunts as fixture | forbidden | other
 *   - BLOCK if any forbidden grow is present (account contaminated → full
 *     account rotate, not scripted wipe)
 *   - Plan delete of pheno_hunts whose names are E2E-prefixed (or match the
 *     buildE2eHuntName pattern)
 *   - Report missing garden pieces (tent/plant expected names)
 *   - NEVER bulk-delete diary entries
 *   - NEVER use service_role (caller injects user-scoped adapter)
 *
 * Defaults to dry-run. Destruction requires BOTH:
 *   --execute --confirm-fixture-rotation
 *
 * This module is pure: no process.env, no I/O, no Supabase import.
 */

/** Exact garden names (must match e2e/FIXTURE_SETUP.md). */
export const E2E_GARDEN_NAMES = Object.freeze({
  tent: "E2E Test Tent",
  plant: "E2E Test Plant",
  plant2: "E2E Test Plant 2",
  grow: "E2E Test Grow",
});

/**
 * Grow names that must never appear on a write-fixture account without
 * E2E/Test markers. Keep in sync with e2e/lib/fixtureSafety.ts denylist.
 */
export const REAL_GROW_NAME_DENYLIST = Object.freeze([
  /\bProject\s+McDonald\b/i,
  /\bStarter\s+Grow\b/i,
]);

export const E2E_FIXTURE_ROTATION_JSON_PREFIX = "E2E_FIXTURE_ROTATION_JSON=";

export function isE2eOrTestMarker(name) {
  return typeof name === "string" && /e2e|test/i.test(name);
}

export function isForbiddenRealGrowName(name) {
  const t = (name ?? "").trim();
  if (!t) return false;
  if (isE2eOrTestMarker(t)) return false;
  return REAL_GROW_NAME_DENYLIST.some((rx) => rx.test(t));
}

/** Hunt names safe to prune: start with "E2E " or exact garden-style marker. */
export function isFixtureHuntName(name) {
  const t = (name ?? "").trim();
  if (!t) return false;
  if (/^E2E\s+/i.test(t)) return true;
  // Historical e2e leftovers that still mark themselves as E2E.
  if (/\bE2E\b/i.test(t) && /pheno\s*hunt/i.test(t)) return true;
  return false;
}

export function buildE2eHuntName(purpose, now = new Date()) {
  const purposeClean =
    String(purpose ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 48) || "hunt";
  const day = now.toISOString().slice(0, 10);
  return `E2E ${purposeClean} ${day}`;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

export function parseRotationArgs(argv) {
  const known = new Set(["--dry-run", "--execute", "--confirm-fixture-rotation"]);
  const flags = new Set();
  for (const arg of argv) {
    if (!known.has(arg)) {
      return { mode: "blocked", reason: "unknown_flag" };
    }
    flags.add(arg);
  }
  const dryRun = flags.has("--dry-run");
  const execute = flags.has("--execute");
  const confirm = flags.has("--confirm-fixture-rotation");
  if (dryRun && (execute || confirm)) {
    return { mode: "blocked", reason: "conflicting_flags" };
  }
  if (execute && confirm) return { mode: "execute" };
  if (execute) return { mode: "blocked", reason: "missing_confirm_flag" };
  if (confirm) return { mode: "blocked", reason: "missing_execute_flag" };
  return { mode: "dry_run" };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * @param {{ id: string, name: string }[]} grows
 * @param {{ id: string, name: string, grow_id?: string|null }[]} tents
 * @param {{ id: string, name: string, grow_id?: string|null, tent_id?: string|null }[]} plants
 * @param {{ id: string, name: string, grow_id?: string|null }[]} hunts
 * @param {{ tent: string, plant: string, plant2?: string, grow?: string }} expected
 */
export function classifyGardenInventory(
  { grows = [], tents = [], plants = [], hunts = [] },
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
  const fixtureHunts = hunts.filter((h) => isFixtureHuntName(h.name));
  const otherHunts = hunts.filter((h) => !isFixtureHuntName(h.name));

  const missing = {
    tent: fixtureTents.length === 0,
    plant: !plants.some((p) => p.name === expected.plant),
    plant2: false, // optional
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
    missing,
    counts: {
      grows: grows.length,
      tents: tents.length,
      plants: plants.length,
      hunts: hunts.length,
      hunts_to_delete: fixtureHunts.length,
      forbidden_grows: forbiddenGrows.length,
      unmarked_grows: unmarkedGrows.length,
    },
  };
}

/**
 * Build a rotation plan from classified inventory.
 * @returns {{ status: 'ready'|'blocked', reason: string|null, actions: object[], classification: object }}
 */
export function planRotation(classification) {
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
            "Re-run with --execute --confirm-fixture-rotation to delete E2E hunts.",
            "Create missing tent/plant via UI or e2e:bootstrap-fixture if listed.",
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
    schema_version: "1",
    status,
    reason,
    mode,
    owner_verified: ownerVerified,
    target_project_verified: targetProjectVerified,
    counts: {
      hunts_deleted: counts.hunts_deleted ?? 0,
      hunts_planned: counts.hunts_planned ?? 0,
      seed_actions_planned: counts.seed_actions_planned ?? 0,
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
// Executor — delete only planned fixture hunts via injected adapter
// ---------------------------------------------------------------------------

/**
 * @param plan from planRotation
 * @param mode 'dry_run' | 'execute'
 * @param ops { deletePhenoHunt(huntId): Promise<void> }
 */
export async function executeRotationPlan(plan, mode, ops = {}) {
  const counts = zeroRotationCounts();
  counts.forbidden_grows = plan.classification?.counts?.forbidden_grows ?? 0;
  counts.unmarked_grows = plan.classification?.counts?.unmarked_grows ?? 0;
  counts.hunts_planned = plan.actions.filter((a) => a.op === "delete_pheno_hunt").length;
  counts.seed_actions_planned = plan.actions.filter((a) => a.op === "seed_missing").length;

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

  if (typeof ops.deletePhenoHunt !== "function") {
    return {
      status: "blocked",
      reason: "missing_delete_adapter",
      counts,
      next_steps: ["Provide an authenticated deletePhenoHunt adapter."],
    };
  }

  let deleted = 0;
  for (const action of plan.actions) {
    if (action.op !== "delete_pheno_hunt") continue;
    // Defense in depth: never delete unless name still classifies as fixture.
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

  counts.hunts_deleted = deleted;
  return {
    status: "completed",
    reason: null,
    counts,
    next_steps: [
      "Seed missing tent/plant if reported (UI or bootstrap).",
      "bun run e2e:verify-fixture",
    ],
  };
}

/**
 * End-to-end pure path: classify → plan → execute (or dry-run).
 */
export async function runRotation({ inventory, expected, mode, ops }) {
  const classification = classifyGardenInventory(inventory, expected ?? E2E_GARDEN_NAMES);
  const plan = planRotation(classification);
  return executeRotationPlan(plan, mode, ops);
}
