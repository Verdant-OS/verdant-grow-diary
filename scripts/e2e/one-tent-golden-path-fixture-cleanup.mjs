/**
 * Pure owner-scoped cleanup planner for the authenticated One-Tent proof.
 * Active, user-visible fixture rows are removed when owner RLS permits it.
 * Append-only or owner-undeletable history is retained and reported, and
 * parent hierarchy rows are retained when deleting them could erase it.
 */

export const GOLDEN_MARKER = "[GOLDEN-PATH-FIXTURE]";
const RUN_MARKER = /^\[GOLDEN-PATH-FIXTURE-RUN-[0-9]+-ATTEMPT-1\]$/;

export function parseOneTentFixtureMarker(raw) {
  const marker = raw === undefined ? GOLDEN_MARKER : typeof raw === "string" ? raw.trim() : "";
  if (marker === GOLDEN_MARKER || RUN_MARKER.test(marker)) return marker;
  throw new Error("fixture_marker_invalid");
}

export function buildFixtureNames(rawMarker) {
  const marker = parseOneTentFixtureMarker(rawMarker);
  return {
    grow: `One-Tent Golden Run ${marker}`,
    tent: `Flower Tent A ${marker}`,
    plant: `Golden Plant 1 ${marker}`,
  };
}

export const FIXTURE_NAMES = buildFixtureNames(GOLDEN_MARKER);
export const ACTION_FOLLOWUP_EVENT_TYPE = "action_followup";
export const ONE_TENT_TEARDOWN_JSON_PREFIX = "ONE_TENT_TEARDOWN_JSON=";

export const TEARDOWN_STAGES = [
  { key: "photo_objects", countKey: "photo_objects_deleted", table: "diary-photos" },
  { key: "diary_entries", countKey: "diary_entries_deleted", table: "diary_entries" },
  { key: "alerts", countKey: "alerts_deleted", table: "alerts" },
  { key: "quick_logs", countKey: "quick_logs_deleted", table: "grow_events" },
  { key: "sensor_rows", countKey: "sensor_rows_deleted", table: "sensor_readings" },
  { key: "grow_targets", countKey: "grow_targets_deleted", table: "grow_targets" },
  { key: "plants", countKey: "plants_deleted", table: "plants" },
  { key: "tents", countKey: "tents_deleted", table: "tents" },
  { key: "grows", countKey: "grows_deleted", table: "grows" },
];

const ZERO_COUNTS = Object.freeze({
  photo_objects_deleted: 0,
  diary_entries_deleted: 0,
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

const ZERO_RETAINED = Object.freeze({
  sensor_rows: 0,
  action_queue_rows: 0,
  action_queue_event_rows: 0,
  ai_doctor_session_rows: 0,
  ai_credit_accounting_rows: 0,
  plants: 0,
  tents: 0,
  grows: 0,
  total_retained: 0,
});

export function zeroCounts() {
  return { ...ZERO_COUNTS };
}

export function zeroRetainedHistory() {
  return { ...ZERO_RETAINED };
}

export function parseTeardownArgs(argv) {
  const known = new Set(["--dry-run", "--execute", "--confirm-fixture-teardown"]);
  const flags = new Set();
  for (const arg of argv) {
    if (!known.has(arg)) return { mode: "blocked", reason: "unknown_flag" };
    flags.add(arg);
  }
  const dryRun = flags.has("--dry-run");
  const execute = flags.has("--execute");
  const confirm = flags.has("--confirm-fixture-teardown");
  if (dryRun && (execute || confirm)) return { mode: "blocked", reason: "conflicting_flags" };
  if (execute && confirm) return { mode: "execute" };
  if (execute) return { mode: "blocked", reason: "missing_confirm_flag" };
  if (confirm) return { mode: "blocked", reason: "missing_execute_flag" };
  return { mode: "dry_run" };
}

function totalCounts(counts) {
  return Object.entries(counts)
    .filter(([key]) => key.endsWith("_deleted") && key !== "total_deleted")
    .reduce((sum, [, count]) => sum + Number(count ?? 0), 0);
}

function withTotals(counts, retainedHistory = zeroRetainedHistory()) {
  counts.total_deleted = totalCounts(counts);
  retainedHistory.total_retained = Object.entries(retainedHistory)
    .filter(([key]) => key !== "total_retained")
    .reduce((sum, [, count]) => sum + Number(count ?? 0), 0);
  return { counts, retainedHistory };
}

const SAFE_CODE = /^[a-z][a-z0-9_]{0,79}$/;
function safeCode(value, fallback) {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : fallback;
}

export function buildTeardownReceipt({
  status,
  reason = null,
  ownerVerified = false,
  targetProjectVerified = false,
  counts = zeroCounts(),
  retainedHistory = zeroRetainedHistory(),
}) {
  const normalized = withTotals(
    { ...zeroCounts(), ...counts },
    { ...zeroRetainedHistory(), ...retainedHistory },
  );
  return {
    schema_version: "2",
    status,
    reason: reason === null ? null : safeCode(reason, "cleanup_failed"),
    owner_verified: ownerVerified,
    target_project_verified: targetProjectVerified,
    counts: normalized.counts,
    retained_history: normalized.retainedHistory,
  };
}

export function renderTeardownReceipt(receipt) {
  return `${ONE_TENT_TEARDOWN_JSON_PREFIX}${JSON.stringify(receipt)}`;
}

async function optionalCount(ops, method, ...args) {
  return typeof ops[method] === "function" ? Number(await ops[method](...args)) : 0;
}

export async function discoverFixture(ops, names = FIXTURE_NAMES) {
  const grow = await ops.findGrowByExactName(names.grow);
  if (!grow) return { found: false, names };
  if (grow.name !== names.grow) return { found: false, ownershipViolation: true, names };
  const tentIds = await ops.listTentIds(grow.id);
  const plantIds = await ops.listPlantIds(grow.id);
  const photoPaths =
    typeof ops.listDiaryPhotoPaths === "function" ? await ops.listDiaryPhotoPaths(grow.id) : [];
  return {
    found: true,
    names,
    growId: grow.id,
    tentIds,
    plantIds,
    photoPaths,
    counts: {
      photo_objects: photoPaths.length,
      diary_entries: await optionalCount(ops, "countDiaryEntries", grow.id),
      follow_ups: await optionalCount(ops, "countFollowUps", grow.id),
      action_queue: await optionalCount(ops, "countActionQueue", grow.id),
      action_queue_events: await optionalCount(ops, "countActionQueueEvents", grow.id),
      ai_doctor_sessions: await optionalCount(ops, "countAiDoctorSessions", grow.id),
      ai_credit_accounting: await optionalCount(ops, "countAiCreditAccounting", grow.id),
      alerts: await optionalCount(ops, "countAlerts", grow.id),
      quick_logs: await optionalCount(ops, "countQuickLogs", grow.id),
      sensor_rows: tentIds.length ? await optionalCount(ops, "countSensorRows", tentIds) : 0,
      grow_targets: await optionalCount(ops, "countGrowTargets", grow.id),
      plants: plantIds.length,
      tents: tentIds.length,
      grows: 1,
    },
  };
}

function result(status, reason, counts, retainedHistory = zeroRetainedHistory()) {
  const normalized = withTotals(counts, retainedHistory);
  return { status, reason, ...normalized };
}

export async function executeTeardown(ops, discovery, { dryRun }) {
  if (discovery.ownershipViolation) {
    return result("failed", "fixture_marker_verification_failed", zeroCounts());
  }
  if (!discovery.found) {
    return result("fixture_not_found", "exact_fixture_not_found", zeroCounts());
  }

  const counts = zeroCounts();
  const retained = zeroRetainedHistory();
  const c = discovery.counts;
  retained.action_queue_rows = c.action_queue ?? 0;
  retained.action_queue_event_rows = c.action_queue_events ?? 0;
  retained.ai_doctor_session_rows = c.ai_doctor_sessions ?? 0;
  retained.ai_credit_accounting_rows = c.ai_credit_accounting ?? 0;

  if (dryRun) {
    counts.photo_objects_deleted = c.photo_objects ?? 0;
    if (c.diary_entries > 0) counts.diary_entries_deleted = c.diary_entries;
    else counts.follow_ups_deleted = c.follow_ups ?? 0;
    counts.alerts_deleted = c.alerts ?? 0;
    counts.quick_logs_deleted = c.quick_logs ?? 0;
    counts.sensor_rows_deleted = c.sensor_rows ?? 0;
    counts.grow_targets_deleted = c.grow_targets ?? 0;
    const retainedChildHistory =
      retained.action_queue_rows +
      retained.action_queue_event_rows +
      retained.ai_doctor_session_rows +
      retained.ai_credit_accounting_rows;
    if (retainedChildHistory === 0) {
      counts.plants_deleted = c.plants;
      counts.tents_deleted = c.tents;
      counts.grows_deleted = c.grows;
    } else {
      retained.plants = c.plants;
      retained.tents = c.tents;
      retained.grows = c.grows;
    }
    return result("dry_run", "dry_run_plan_only", counts, retained);
  }

  const { growId, tentIds, photoPaths } = discovery;
  const diaryStage =
    typeof ops.deleteDiaryEntries === "function"
      ? ["diary_entries", () => ops.deleteDiaryEntries(growId), () => ops.countDiaryEntries(growId)]
      : ["follow_ups", () => ops.deleteFollowUps(growId), () => ops.countFollowUps(growId)];
  const activeStages = [
    [
      "photo_objects",
      () =>
        photoPaths.length && typeof ops.deleteDiaryPhotos === "function"
          ? ops.deleteDiaryPhotos(photoPaths)
          : 0,
      async () => 0,
    ],
    diaryStage,
    ["alerts", () => ops.deleteAlerts(growId), () => ops.countAlerts(growId)],
    ["quick_logs", () => ops.deleteQuickLogs(growId), () => ops.countQuickLogs(growId)],
  ];

  for (const [key, remove, survivors] of activeStages) {
    try {
      const deleted = Number(await remove());
      counts[`${key}_deleted`] = Number.isFinite(deleted) ? deleted : 0;
    } catch {
      return result("failed", `${key}_delete_failed`, counts, retained);
    }
    try {
      if ((await survivors()) > 0) {
        return result("failed", `${key}_rows_survived_delete`, counts, retained);
      }
    } catch {
      return result("failed", `${key}_verify_failed`, counts, retained);
    }
  }

  if (tentIds.length && c.sensor_rows > 0) {
    try {
      counts.sensor_rows_deleted = Number(await ops.deleteSensorRows(tentIds)) || 0;
    } catch {
      counts.sensor_rows_deleted = 0;
    }
    try {
      retained.sensor_rows = Number(await ops.countSensorRows(tentIds)) || 0;
    } catch {
      return result("failed", "sensor_rows_verify_failed", counts, retained);
    }
  }

  try {
    counts.grow_targets_deleted = Number(await ops.deleteGrowTargets(growId)) || 0;
    if ((await ops.countGrowTargets(growId)) > 0) {
      return result("failed", "grow_targets_rows_survived_delete", counts, retained);
    }
  } catch {
    return result("failed", "grow_targets_delete_failed", counts, retained);
  }

  const retainedChildHistory = Object.entries(retained)
    .filter(([key]) => !["plants", "tents", "grows", "total_retained"].includes(key))
    .reduce((sum, [, count]) => sum + count, 0);
  if (retainedChildHistory > 0) {
    retained.plants = c.plants;
    retained.tents = c.tents;
    retained.grows = c.grows;
    return result(
      "completed_with_retained_history",
      "owner_cleanup_completed_with_retained_history",
      counts,
      retained,
    );
  }

  const parentStages = [
    ["plants", () => ops.deletePlants(growId), async () => (await ops.listPlantIds(growId)).length],
    ["tents", () => ops.deleteTents(growId), async () => (await ops.listTentIds(growId)).length],
    [
      "grows",
      () => ops.deleteGrow(growId),
      async () => ((await ops.findGrowByExactName(discovery.names.grow)) ? 1 : 0),
    ],
  ];
  for (const [key, remove, survivors] of parentStages) {
    try {
      counts[`${key}_deleted`] = Number(await remove()) || 0;
      if ((await survivors()) > 0) return result("failed", `${key}_rows_survived_delete`, counts);
    } catch {
      return result("failed", `${key}_delete_failed`, counts);
    }
  }
  return result("completed_active_rows_removed", "owner_cleanup_completed", counts);
}
