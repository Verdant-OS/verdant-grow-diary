/**
 * One-Tent golden-path fixture cleanup — pure planner + executor.
 *
 * Removes ONLY rows that belong to the golden-path fixture of the
 * currently managed user. Identity of the fixture is:
 *
 *     authenticated user_id
 *     AND exact deterministic fixture name INCLUDING the exact marker
 *     AND exact fixture relationships (grow → tent/plant → children)
 *
 * Never broad partial-name matching. Never another user's rows. Never
 * rows without the exact marker. Never service_role — the executor is
 * handed an authenticated-user adapter, so RLS remains part of the
 * safety boundary.
 *
 * DELETE ORDER (child before parent — audited against actual FKs in
 * supabase/migrations; grow_events / sensor_readings / plants.tent_id
 * are soft references that do NOT cascade, hence explicit stages):
 *
 *   1. diary_entries follow-up markers (details.event_type=action_followup)
 *   2. action_queue rows            (cascades action_queue_events)
 *   3. alerts                       (cascades alert_events)
 *   4. grow_events quick logs
 *   5. sensor_readings              (see KNOWN LIMIT below)
 *   6. grow_targets
 *   7. plants
 *   8. tents
 *   9. the fixture grow itself
 *
 * KNOWN LIMIT (documented, honest): sensor_readings currently has NO
 * owner-scoped DELETE policy and no cascading FK, so an authenticated
 * teardown cannot remove the seeded manual snapshot. When fixture
 * sensor rows survive the delete attempt the run stops BEFORE deleting
 * parents (grow_targets/plants/tents/grow) and reports status=failed
 * with reason sensor_rows_delete_blocked_by_rls. Adding that DELETE
 * policy is a future migration — out of scope for test tooling, which
 * must not change RLS.
 *
 * Failure rule: any stage that errors, or that leaves surviving rows,
 * stops the run before any parent stage. No retry. No broadened scope.
 *
 * Idempotency: no fixture grow found ⇒ status=completed with all-zero
 * counts. Repeated runs are safe.
 *
 * This module is pure: no process.env, no I/O, no Supabase import. The
 * CLI (teardown-one-tent-golden-path.mjs) injects a thin adapter.
 */

/**
 * Deterministic fixture identity — must stay in lockstep with
 * scripts/e2e/seed-one-tent-golden-path.mjs and
 * src/test/fixtures/oneTentGoldenPathFixture.ts. Locked by
 * src/test/one-tent-golden-path-teardown.test.ts.
 */
export const GOLDEN_MARKER = "[GOLDEN-PATH-FIXTURE]";
export const FIXTURE_NAMES = {
  grow: `One-Tent Golden Run ${GOLDEN_MARKER}`,
  tent: `Flower Tent A ${GOLDEN_MARKER}`,
  plant: `Golden Plant 1 ${GOLDEN_MARKER}`,
};
export const ACTION_FOLLOWUP_EVENT_TYPE = "action_followup";

export const ONE_TENT_TEARDOWN_JSON_PREFIX = "ONE_TENT_TEARDOWN_JSON=";

/** Ordered stage descriptors. Order IS the contract (child → parent). */
export const TEARDOWN_STAGES = [
  { key: "follow_ups", countKey: "follow_ups_deleted", table: "diary_entries" },
  { key: "action_queue", countKey: "action_queue_deleted", table: "action_queue" },
  { key: "alerts", countKey: "alerts_deleted", table: "alerts" },
  { key: "quick_logs", countKey: "quick_logs_deleted", table: "grow_events" },
  { key: "sensor_rows", countKey: "sensor_rows_deleted", table: "sensor_readings" },
  { key: "grow_targets", countKey: "grow_targets_deleted", table: "grow_targets" },
  { key: "plants", countKey: "plants_deleted", table: "plants" },
  { key: "tents", countKey: "tents_deleted", table: "tents" },
  { key: "grows", countKey: "grows_deleted", table: "grows" },
];

const ZERO_COUNTS = Object.freeze({
  follow_ups_deleted: 0,
  action_queue_deleted: 0,
  alerts_deleted: 0,
  quick_logs_deleted: 0,
  sensor_rows_deleted: 0,
  grow_targets_deleted: 0,
  plants_deleted: 0,
  tents_deleted: 0,
  grows_deleted: 0,
  total_deleted: 0,
});

export function zeroCounts() {
  return { ...ZERO_COUNTS };
}

// ---------------------------------------------------------------------------
// CLI argument contract — dry-run by default; destruction needs BOTH flags.
// ---------------------------------------------------------------------------

export function parseTeardownArgs(argv) {
  const known = new Set(["--dry-run", "--execute", "--confirm-fixture-teardown"]);
  const flags = new Set();
  for (const arg of argv) {
    if (!known.has(arg)) {
      return { mode: "blocked", reason: "unknown_flag" };
    }
    flags.add(arg);
  }
  const dryRun = flags.has("--dry-run");
  const execute = flags.has("--execute");
  const confirm = flags.has("--confirm-fixture-teardown");
  if (dryRun && (execute || confirm)) {
    return { mode: "blocked", reason: "conflicting_flags" };
  }
  if (execute && confirm) return { mode: "execute" };
  if (execute) return { mode: "blocked", reason: "missing_confirm_flag" };
  if (confirm) return { mode: "blocked", reason: "missing_execute_flag" };
  // Default (no flags) and explicit --dry-run are the same safe mode.
  return { mode: "dry_run" };
}

// ---------------------------------------------------------------------------
// Receipt — versioned, deterministic, secret-free.
// ---------------------------------------------------------------------------

export function buildTeardownReceipt({
  status,
  reason = null,
  ownerVerified = false,
  targetProjectVerified = false,
  counts = zeroCounts(),
}) {
  const total =
    counts.follow_ups_deleted +
    counts.action_queue_deleted +
    counts.alerts_deleted +
    counts.quick_logs_deleted +
    counts.sensor_rows_deleted +
    counts.grow_targets_deleted +
    counts.plants_deleted +
    counts.tents_deleted +
    counts.grows_deleted;
  return {
    schema_version: "1",
    status,
    reason,
    owner_verified: ownerVerified,
    target_project_verified: targetProjectVerified,
    counts: {
      follow_ups_deleted: counts.follow_ups_deleted,
      action_queue_deleted: counts.action_queue_deleted,
      alerts_deleted: counts.alerts_deleted,
      quick_logs_deleted: counts.quick_logs_deleted,
      sensor_rows_deleted: counts.sensor_rows_deleted,
      grow_targets_deleted: counts.grow_targets_deleted,
      plants_deleted: counts.plants_deleted,
      tents_deleted: counts.tents_deleted,
      grows_deleted: counts.grows_deleted,
      total_deleted: total,
    },
  };
}

export function renderTeardownReceipt(receipt) {
  return `${ONE_TENT_TEARDOWN_JSON_PREFIX}${JSON.stringify(receipt)}`;
}

// ---------------------------------------------------------------------------
// Discovery — resolve the EXACT fixture rows before any delete.
// ---------------------------------------------------------------------------

/**
 * @param ops injected adapter — every method MUST already scope by the
 *   authenticated user (and RLS enforces it again server-side):
 *     findGrowByExactName(name) -> { id, name } | null
 *     listTentIds(growId) -> string[]
 *     listPlantIds(growId) -> string[]
 *     countFollowUps(growId) -> number
 *     countActionQueue(growId) -> number
 *     countAlerts(growId) -> number
 *     countQuickLogs(growId) -> number
 *     countSensorRows(tentIds) -> number
 *     countGrowTargets(growId) -> number
 *     deleteFollowUps(growId) -> number      (rows actually deleted)
 *     deleteActionQueue(growId) -> number
 *     deleteAlerts(growId) -> number
 *     deleteQuickLogs(growId) -> number
 *     deleteSensorRows(tentIds) -> number
 *     deleteGrowTargets(growId) -> number
 *     deletePlants(growId) -> number
 *     deleteTents(growId) -> number
 *     deleteGrow(growId) -> number
 */
export async function discoverFixture(ops) {
  const grow = await ops.findGrowByExactName(FIXTURE_NAMES.grow);
  if (!grow) {
    return { found: false };
  }
  // Marker verification is exact-equality by construction, but assert it
  // anyway — a future adapter regression must not widen the blast radius.
  if (grow.name !== FIXTURE_NAMES.grow || !grow.name.includes(GOLDEN_MARKER)) {
    return { found: false, ownershipViolation: true };
  }
  const tentIds = await ops.listTentIds(grow.id);
  const plantIds = await ops.listPlantIds(grow.id);
  const plan = {
    found: true,
    growId: grow.id,
    tentIds,
    plantIds,
    counts: {
      follow_ups: await ops.countFollowUps(grow.id),
      action_queue: await ops.countActionQueue(grow.id),
      alerts: await ops.countAlerts(grow.id),
      quick_logs: await ops.countQuickLogs(grow.id),
      sensor_rows: tentIds.length ? await ops.countSensorRows(tentIds) : 0,
      grow_targets: await ops.countGrowTargets(grow.id),
      plants: plantIds.length,
      tents: tentIds.length,
      grows: 1,
    },
  };
  return plan;
}

// ---------------------------------------------------------------------------
// Execution — child before parent; stop at the first failed stage.
// ---------------------------------------------------------------------------

function withTotal(counts) {
  counts.total_deleted =
    counts.follow_ups_deleted +
    counts.action_queue_deleted +
    counts.alerts_deleted +
    counts.quick_logs_deleted +
    counts.sensor_rows_deleted +
    counts.grow_targets_deleted +
    counts.plants_deleted +
    counts.tents_deleted +
    counts.grows_deleted;
  return counts;
}

export async function executeTeardown(ops, discovery, { dryRun }) {
  if (discovery.ownershipViolation) {
    // A grow came back that failed exact-marker verification. The pure
    // executor must fail closed itself — not rely on the CLI's check.
    return {
      status: "failed",
      reason: "fixture_marker_verification_failed",
      counts: zeroCounts(),
    };
  }
  if (!discovery.found) {
    // Idempotent: already clean is success, not failure.
    return {
      status: "completed",
      reason: dryRun ? "dry_run" : null,
      counts: zeroCounts(),
    };
  }

  const counts = zeroCounts();
  const setCount = (key, n) => {
    counts[`${key}_deleted`] = n;
  };

  if (dryRun) {
    counts.follow_ups_deleted = discovery.counts.follow_ups;
    counts.action_queue_deleted = discovery.counts.action_queue;
    counts.alerts_deleted = discovery.counts.alerts;
    counts.quick_logs_deleted = discovery.counts.quick_logs;
    counts.sensor_rows_deleted = discovery.counts.sensor_rows;
    counts.grow_targets_deleted = discovery.counts.grow_targets;
    counts.plants_deleted = discovery.counts.plants;
    counts.tents_deleted = discovery.counts.tents;
    counts.grows_deleted = discovery.counts.grows;
    // NO ops.delete* call is EVER made on this path.
    return { status: "completed", reason: "dry_run", counts: withTotal(counts) };
  }

  const { growId, tentIds } = discovery;

  const stages = [
    ["follow_ups", () => ops.deleteFollowUps(growId), () => ops.countFollowUps(growId)],
    ["action_queue", () => ops.deleteActionQueue(growId), () => ops.countActionQueue(growId)],
    ["alerts", () => ops.deleteAlerts(growId), () => ops.countAlerts(growId)],
    ["quick_logs", () => ops.deleteQuickLogs(growId), () => ops.countQuickLogs(growId)],
    [
      "sensor_rows",
      () => (tentIds.length ? ops.deleteSensorRows(tentIds) : 0),
      () => (tentIds.length ? ops.countSensorRows(tentIds) : 0),
    ],
    ["grow_targets", () => ops.deleteGrowTargets(growId), () => ops.countGrowTargets(growId)],
    ["plants", () => ops.deletePlants(growId), async () => (await ops.listPlantIds(growId)).length],
    ["tents", () => ops.deleteTents(growId), async () => (await ops.listTentIds(growId)).length],
    [
      "grows",
      () => ops.deleteGrow(growId),
      async () => ((await ops.findGrowByExactName(FIXTURE_NAMES.grow)) ? 1 : 0),
    ],
  ];

  for (const [key, del, survivors] of stages) {
    let deleted;
    try {
      deleted = await del();
    } catch {
      // Sanitized code only — the raw provider error may echo values.
      return {
        status: "failed",
        reason: `${key}_delete_failed`,
        counts: withTotal(counts),
      };
    }
    setCount(key, typeof deleted === "number" ? deleted : 0);
    let remaining;
    try {
      remaining = await survivors();
    } catch {
      return { status: "failed", reason: `${key}_verify_failed`, counts: withTotal(counts) };
    }
    if (remaining > 0) {
      // Surviving children (e.g. sensor_readings without an owner DELETE
      // policy) — STOP before parent stages so nothing gets obscured.
      const reason =
        key === "sensor_rows" ? "sensor_rows_delete_blocked_by_rls" : `${key}_rows_survived_delete`;
      return { status: "failed", reason, counts: withTotal(counts) };
    }
  }

  return { status: "completed", reason: null, counts: withTotal(counts) };
}
