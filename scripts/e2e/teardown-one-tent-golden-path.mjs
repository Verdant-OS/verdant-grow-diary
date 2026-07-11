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
 *  - Idempotent: already-clean environment reports completed with
 *    zero counts.
 *
 * Output: human-readable lines + exactly one ONE_TENT_TEARDOWN_JSON=
 * receipt line (schema_version "1", deterministic, no IDs/tokens/
 * emails/paths/raw provider errors).
 *
 * Exit codes: 0 completed (incl. dry-run) · 2 blocked · 1 failed/error.
 */

import { createClient } from "@supabase/supabase-js";
import { evaluateManagedSession, readManagedSessionEnv } from "./one-tent-preflight-core.mjs";
import {
  ACTION_FOLLOWUP_EVENT_TYPE,
  FIXTURE_NAMES,
  buildTeardownReceipt,
  discoverFixture,
  executeTeardown,
  parseTeardownArgs,
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
function buildOps(supabase, userId) {
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
        .eq("name", FIXTURE_NAMES.tent);
      if (error) throw new Error("tent_lookup_error");
      return (data ?? []).map((r) => r.id);
    },
    async listPlantIds(growId) {
      const { data, error } = await supabase
        .from("plants")
        .select("id")
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .eq("name", FIXTURE_NAMES.plant);
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
    async countActionQueue(growId) {
      const res = await supabase
        .from("action_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "action_queue_count");
    },
    async countAlerts(growId) {
      const res = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "alerts_count");
    },
    async countQuickLogs(growId) {
      const res = await supabase
        .from("grow_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("grow_id", growId);
      return exactCount(res, "quick_logs_count");
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
    async deleteActionQueue(growId) {
      const res = await supabase
        .from("action_queue")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .select("id");
      return deletedCount(res, "action_queue_delete");
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
    async deleteQuickLogs(growId) {
      const res = await supabase
        .from("grow_events")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .select("id");
      return deletedCount(res, "quick_logs_delete");
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
        .eq("name", FIXTURE_NAMES.plant)
        .select("id");
      return deletedCount(res, "plants_delete");
    },
    async deleteTents(growId) {
      const res = await supabase
        .from("tents")
        .delete()
        .eq("user_id", userId)
        .eq("grow_id", growId)
        .eq("name", FIXTURE_NAMES.tent)
        .select("id");
      return deletedCount(res, "tents_delete");
    },
    async deleteGrow(growId) {
      const res = await supabase
        .from("grows")
        .delete()
        .eq("user_id", userId)
        .eq("id", growId)
        .eq("name", FIXTURE_NAMES.grow)
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
  const supabaseUrl = (env.supabaseUrl ?? "").trim();
  let targetVerified = false;
  if (targetRef && supabaseUrl) {
    try {
      targetVerified = new URL(supabaseUrl).host.startsWith(`${targetRef}.`);
    } catch {
      targetVerified = false;
    }
  }
  if (!targetVerified) blocked("target_project_unverified");

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) blocked("missing_supabase_config", true);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${preflight.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ops = buildOps(supabase, preflight.session.user.id);

  const discovery = await discoverFixture(ops);
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
  });

  const human = [];
  if (result.status === "completed" && dryRun) {
    human.push("One-Tent golden-path teardown: DRY-RUN COMPLETED");
    human.push("No rows were deleted. Counts below are the deletion plan.");
  } else if (result.status === "completed") {
    human.push("One-Tent golden-path teardown: COMPLETED");
  } else {
    human.push("One-Tent golden-path teardown: FAILED");
    human.push(`Reason: ${result.reason}`);
    human.push("Stopped before deleting parent records.");
  }
  human.push("Fixture owner verified: yes");
  human.push(
    `Fixture rows ${dryRun ? "planned for removal" : "removed"}: ${receipt.counts.total_deleted}`,
  );
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
