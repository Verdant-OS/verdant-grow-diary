#!/usr/bin/env node
/**
 * One-Tent Loop Golden Path — owner-scoped fixture teardown CLI.
 *
 * SAFETY CONTRACT (mirrors the seed, stricter):
 *  - Requires a READY managed-session preflight (valid session JSON,
 *    access token, managed user id). Cookie-only capability is NOT
 *    sufficient — it cannot safely resolve the managed identity.
 *  - Requires LOVABLE_E2E_TARGET_PROJECT_REF to be DECLARED and to
 *    match VITE_SUPABASE_URL. A destructive tool never runs against an
 *    unverified project. (The seed treats the ref as optional; the
 *    teardown does not.)
 *  - Uses the managed user's OWN authenticated Supabase client (anon
 *    key + Bearer access token). NEVER service_role — RLS remains part
 *    of the safety boundary.
 *  - Deletes ONLY rows resolved from the exact fixture identity
 *    (user + exact "[GOLDEN-PATH-FIXTURE]" names + fixture
 *    relationships). See one-tent-golden-path-fixture-cleanup.mjs.
 *  - DEFAULTS TO DRY-RUN. Destructive mode requires BOTH:
 *      --execute --confirm-fixture-teardown
 *    Conflicting or unknown flags block. No force/override flag exists.
 *  - Already-clean state reports fixture_not_found; it never claims a
 *    zero-count or full cleanup.
 *
 * Output: human-readable lines + exactly one ONE_TENT_TEARDOWN_JSON=
 * receipt line (schema_version "3", deterministic, no IDs/tokens/
 * emails/paths/raw provider errors).
 *
 * Exit codes: 0 completed (incl. dry-run) · 2 blocked · 1 failed/error.
 */

import { createClient } from "@supabase/supabase-js";
import { resolveExactSupabaseProjectOrigin } from "./managed-session-materialize-core.mjs";
import { evaluateManagedSession, readManagedSessionEnv } from "./one-tent-preflight-core.mjs";
import {
  ACTION_FOLLOWUP_EVENT_TYPE,
  GOLDEN_MARKER,
  buildFixtureNames,
  buildTeardownReceipt,
  discoverFixture,
  executeTeardown,
  parseTeardownArgs,
  parseOneTentFixtureMarker,
  renderTeardownReceipt,
  zeroCounts,
} from "./one-tent-golden-path-fixture-cleanup.mjs";

function emit(receipt, humanLines, exitCode) {
  for (const line of humanLines) console.log(line);
  console.log(renderTeardownReceipt(receipt));
  process.exit(exitCode);
}

function blocked(reason, targetProjectVerified = false) {
  emit(
    buildTeardownReceipt({
      status: "blocked",
      reason,
      ownerVerified: false,
      targetProjectVerified,
      counts: zeroCounts(),
    }),
    ["One-Tent golden-path teardown: BLOCKED", `Reason: ${reason}`, "No deletes performed."],
    2,
  );
}

/** Thin authenticated adapter. Every query is user-scoped AND RLS-scoped. */
function buildOps(supabase, userId, fixtureNames) {
  const deletedCount = (res, label) => {
    if (res.error) throw new Error(`${label}_error`);
    return Array.isArray(res.data) ? res.data.length : 0;
  };
  const exactCount = (res, label) => {
    if (res.error) throw new Error(`${label}_error`);
    // Fail CLOSED on a missing count: these counts gate parent deletion
    // (survivors check) — an unknown must never read as "zero survivors".
    if (typeof res.count !== "number") throw new Error(`${label}_unavailable`);
    return res.count;
  };
  return {
    async findGrowByExactName(name) {
      const { data, error } = await supabase
        .from("grows")
        .select("id,name")
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle();
      if (error) throw new Error("grow_lookup_error");
      return data ?? null;
    },
    // Tents/plants require the EXACT fixture marker name, not just grow
    // linkage: tents.grow_id / plants.grow_id are user-updatable soft refs,
    // so a real (non-fixture) tent or plant could legitimately point at the
    // fixture grow. Such rows must never enter the deletion scope — the
    // final grow delete safely orphans them via ON DELETE SET NULL.
    async listTentIds(growId) {
      const { data, error } = await supabase
        .from("tents")
        .select("id")
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .eq("name", fixtureNames.tent);
      if (error) throw new Error("tent_lookup_error");
      return (data ?? []).map((r) => r.id);
    },
    async listPlantIds(growId) {
      const { data, error } = await supabase
        .from("plants")
        .select("id")
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .eq("name", fixtureNames.plant);
      if (error) throw new Error("plant_lookup_error");
      return (data ?? []).map((r) => r.id);
    },
    async countFollowUps(growId) {
      const res = await supabase
        .from("diary_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .contains("details", { event_type: ACTION_FOLLOWUP_EVENT_TYPE });
      return exactCount(res, "follow_ups_count");
    },
    async listDiaryPhotoPaths(growId) {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("photo_url")
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .not("photo_url", "is", null);
      if (error) throw new Error("diary_photo_lookup_error");
      const ownerPrefix = `${userId}/${growId}/`;
      return [
        ...new Set(
          (data ?? [])
            .map((row) => row.photo_url)
            .filter((path) => typeof path === "string" && path.startsWith(ownerPrefix)),
        ),
      ];
    },
    async countDiaryEntries(growId) {
      const res = await supabase
        .from("diary_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "diary_entries_count");
    },
    async listDiaryEntryIds(growId) {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("grow_id", growId);
      if (error || !Array.isArray(data)) throw new Error("diary_entry_ids_lookup_error");
      return data.map((row) => row.id);
    },
    async countDiaryEntryAudits(diaryEntryIds) {
      if (!Array.isArray(diaryEntryIds) || diaryEntryIds.length === 0) return 0;
      const res = await supabase
        .from("diary_entry_audit_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("diary_entry_id", diaryEntryIds);
      return exactCount(res, "diary_entry_audit_count");
    },
    async countActionQueue(growId) {
      const res = await supabase
        .from("action_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "action_queue_count");
    },
    async countActionQueueEvents(growId) {
      const res = await supabase
        .from("action_queue_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "action_queue_events_count");
    },
    async countAiDoctorSessions(growId) {
      const res = await supabase
        .from("ai_doctor_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "ai_doctor_sessions_count");
    },
    async countAiCreditAccounting(growId) {
      const res = await supabase
        .from("ai_credit_spends")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "ai_credit_accounting_count");
    },
    async countAlerts(growId) {
      const res = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "alerts_count");
    },
    async listAlertIds(growId) {
      const { data, error } = await supabase
        .from("alerts")
        .select("id")
        .eq("user_id", userId)
        .eq("grow_id", growId);
      if (error || !Array.isArray(data)) throw new Error("alert_ids_lookup_error");
      return data.map((row) => row.id);
    },
    async countAlertEvents(alertIds) {
      if (!Array.isArray(alertIds) || alertIds.length === 0) return 0;
      const res = await supabase
        .from("alert_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("alert_id", alertIds);
      return exactCount(res, "alert_events_count");
    },
    async listQuickLogIds(growId) {
      const { data, error } = await supabase
        .from("grow_events")
        .select("id")
        .eq("user_id", userId)
        .eq("grow_id", growId);
      if (error || !Array.isArray(data)) throw new Error("quick_log_ids_lookup_error");
      return data.map((row) => row.id);
    },
    async countEnvironmentEvents(quickLogIds) {
      if (!Array.isArray(quickLogIds) || quickLogIds.length === 0) return 0;
      const res = await supabase
        .from("environment_events")
        .select("event_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("event_id", quickLogIds);
      return exactCount(res, "environment_events_count");
    },
    async listQuickLogIdempotencyKeys(quickLogIds) {
      if (!Array.isArray(quickLogIds) || quickLogIds.length === 0) return [];
      const { data, error } = await supabase
        .from("quicklog_idempotency")
        .select("idempotency_key")
        .eq("user_id", userId)
        .in("grow_event_id", quickLogIds);
      if (error || !Array.isArray(data)) throw new Error("quicklog_idempotency_lookup_error");
      return data.map((row) => row.idempotency_key);
    },
    async listQuickLogAuditIdsByEvent(quickLogIds) {
      if (!Array.isArray(quickLogIds) || quickLogIds.length === 0) return [];
      const { data, error } = await supabase
        .from("quicklog_audit_events")
        .select("id")
        .eq("user_id", userId)
        .in("grow_event_id", quickLogIds);
      if (error || !Array.isArray(data)) throw new Error("quicklog_audit_event_lookup_error");
      return data.map((row) => row.id);
    },
    async listQuickLogAuditIdsByKey(idempotencyKeys) {
      if (!Array.isArray(idempotencyKeys) || idempotencyKeys.length === 0) return [];
      const { data, error } = await supabase
        .from("quicklog_audit_events")
        .select("id")
        .eq("user_id", userId)
        .in("idempotency_key", idempotencyKeys);
      if (error || !Array.isArray(data)) throw new Error("quicklog_audit_key_lookup_error");
      return data.map((row) => row.id);
    },
    async countSensorRows(tentIds) {
      const res = await supabase
        .from("sensor_readings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("tent_id", tentIds);
      return exactCount(res, "sensor_rows_count");
    },
    async countGrowTargets(growId) {
      const res = await supabase
        .from("grow_targets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "grow_targets_count");
    },
    async deleteFollowUps(growId) {
      const res = await supabase
        .from("diary_entries")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .contains("details", { event_type: ACTION_FOLLOWUP_EVENT_TYPE })
        .select("id");
      return deletedCount(res, "follow_ups_delete");
    },
    async deleteDiaryPhotos(paths) {
      const { data, error } = await supabase.storage.from("diary-photos").remove(paths);
      if (error) throw new Error("diary_photos_delete_error");
      if (!Array.isArray(data) || data.length !== paths.length) {
        throw new Error("diary_photos_delete_incomplete");
      }
      return data.length;
    },
    async deleteDiaryEntries(growId) {
      const res = await supabase
        .from("diary_entries")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .select("id");
      return deletedCount(res, "diary_entries_delete");
    },
    async deleteAlerts(growId) {
      const res = await supabase
        .from("alerts")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .select("id");
      return deletedCount(res, "alerts_delete");
    },
    async deleteSensorRows(tentIds) {
      const res = await supabase
        .from("sensor_readings")
        .delete()
        .eq("user_id", userId)
        .in("tent_id", tentIds)
        .select("id");
      return deletedCount(res, "sensor_rows_delete");
    },
    async deleteGrowTargets(growId) {
      const res = await supabase
        .from("grow_targets")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .select("id");
      return deletedCount(res, "grow_targets_delete");
    },
    async deletePlants(growId) {
      const res = await supabase
        .from("plants")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .eq("name", fixtureNames.plant)
        .select("id");
      return deletedCount(res, "plants_delete");
    },
    async deleteTents(growId) {
      const res = await supabase
        .from("tents")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .eq("name", fixtureNames.tent)
        .select("id");
      return deletedCount(res, "tents_delete");
    },
    async deleteGrow(growId) {
      const res = await supabase
        .from("grows")
        .delete()
        .eq("user_id", userId)
        .eq("id", growId)
        .eq("name", fixtureNames.grow)
        .select("id");
      return deletedCount(res, "grow_delete");
    },
  };
}

async function main() {
  const args = parseTeardownArgs(process.argv.slice(2));
  if (args.mode === "blocked") blocked(args.reason);

  const env = readManagedSessionEnv(process.env);
  const preflight = evaluateManagedSession(env);
  if (preflight.status !== "ready") {
    // cookie_only_seed_unavailable lands here too: cookie-only mode
    // cannot resolve the managed identity, so teardown stays blocked.
    blocked(preflight.reason);
  }

  // Destructive tool: the target project MUST be declared and matching.
  const targetRef = (env.targetProjectRef ?? "").trim();
  const configuredSupabaseUrl = (env.supabaseUrl ?? "").trim();
  const supabaseUrl = resolveExactSupabaseProjectOrigin({
    supabaseUrl: configuredSupabaseUrl,
    targetProjectRef: targetRef,
  });
  if (!supabaseUrl) blocked("target_project_unverified");

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) blocked("missing_supabase_config", true);

  let fixtureNames;
  try {
    const fixtureMarker = parseOneTentFixtureMarker(process.env.E2E_ONE_TENT_FIXTURE_MARKER);
    if (!process.env.E2E_ONE_TENT_FIXTURE_MARKER && fixtureMarker !== GOLDEN_MARKER) {
      throw new Error("fixture_marker_invalid");
    }
    fixtureNames = buildFixtureNames(fixtureMarker);
  } catch {
    blocked("fixture_marker_invalid", true);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${preflight.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ops = buildOps(supabase, preflight.session.user.id, fixtureNames);

  const discovery = await discoverFixture(ops, fixtureNames);
  if (discovery.ownershipViolation) {
    emit(
      buildTeardownReceipt({
        status: "failed",
        reason: "fixture_marker_verification_failed",
        ownerVerified: false,
        targetProjectVerified: true,
        counts: zeroCounts(),
      }),
      [
        "One-Tent golden-path teardown: FAILED",
        "Reason: fixture_marker_verification_failed",
        "No deletes performed.",
      ],
      1,
    );
  }

  const dryRun = args.mode === "dry_run";
  const result = await executeTeardown(ops, discovery, { dryRun });
  const receipt = buildTeardownReceipt({
    status: result.status,
    reason: result.reason,
    ownerVerified: true,
    targetProjectVerified: true,
    counts: result.counts,
    retainedHistory: result.retainedHistory,
  });

  const human = [];
  if (result.status === "dry_run") {
    human.push("One-Tent golden-path teardown: DRY-RUN COMPLETED");
    human.push("No rows were deleted. Counts below are the deletion plan.");
  } else if (result.status === "completed_with_retained_history") {
    human.push("One-Tent golden-path teardown: COMPLETED WITH RETAINED HISTORY");
  } else if (result.status === "completed_active_rows_removed") {
    human.push("One-Tent golden-path teardown: ACTIVE ROWS REMOVED");
  } else if (result.status === "fixture_not_found") {
    human.push("One-Tent golden-path teardown: EXACT FIXTURE NOT FOUND");
  } else {
    human.push("One-Tent golden-path teardown: FAILED");
    human.push(`Reason: ${result.reason}`);
    human.push("Stopped before deleting parent records.");
  }
  human.push("Fixture owner verified: yes");
  human.push(
    `Fixture rows ${dryRun ? "planned for removal" : "removed"}: ${receipt.counts.total_deleted}`,
  );
  human.push(`Source alert rows retained: ${receipt.retained_history.alert_rows}`);
  human.push(`Source alert event rows retained: ${receipt.retained_history.alert_event_rows}`);
  human.push(`Protected Quick Log rows retained: ${receipt.retained_history.quick_log_rows}`);
  human.push(
    `Quick Log support rows retained: ${
      receipt.retained_history.environment_event_rows +
      receipt.retained_history.quicklog_idempotency_rows +
      receipt.retained_history.quicklog_audit_event_rows
    }`,
  );
  human.push(`Diary audit rows retained: ${receipt.retained_history.diary_entry_audit_rows}`);
  human.push(`History rows retained: ${receipt.retained_history.total_retained}`);
  emit(receipt, human, result.status === "failed" ? 1 : 0);
}

main().catch(() => {
  // Sanitized: raw errors may echo env-derived strings.
  console.error("One-Tent golden-path teardown: UNEXPECTED_ERROR");
  console.log(
    renderTeardownReceipt(
      buildTeardownReceipt({
        status: "failed",
        reason: "unexpected_error",
        ownerVerified: false,
        targetProjectVerified: false,
        counts: zeroCounts(),
      }),
    ),
  );
  process.exit(1);
});
