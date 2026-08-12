#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness for Quick Log corrections & retractions (issue #786).
 *
 * Proves, against a real Supabase instance:
 *  - owner can correct and retract their own Quick Log entries via the RPCs
 *  - corrections append immutable quicklog_entry_revisions rows preserving
 *    the original payload; retraction tombstones the spine and marks the
 *    mirror row — nothing is ever hard-deleted by the feature
 *  - another authenticated user cannot correct/retract, see, or forge
 *    revisions for entries they do not own
 *  - clients cannot INSERT/UPDATE/DELETE quicklog_entry_revisions directly
 *  - duplicate retraction and post-retraction correction fail calmly
 *  - both live write paths (quicklog_save_manual, quicklog_save_event) yield
 *    retractable entries
 *
 * service_role is used ONLY for seeding, readback, and teardown. All
 * accept/reject assertions run through authenticated anon-key clients.
 *
 * Run:
 *   bun run scripts/run-quicklog-revisions-rls-harness.ts
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY!;

for (const [key, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
]) {
  if (!value) {
    console.error(`missing ${key}`);
    process.exit(2);
  }
}

const runId = crypto.randomUUID();
const emailA = `quicklog-revisions-a-${runId}@verdant.test`;
const emailB = `quicklog-revisions-b-${runId}@verdant.test`;
const password = crypto.randomUUID();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function createUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

async function insertAndReturnId(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error || !data?.id) throw new Error(`seed ${table} failed: ${error?.message}`);
  return data.id as string;
}

type RpcResult = { ok?: boolean; reason?: string; [k: string]: unknown };

async function rpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) return { ok: false, reason: `rpc_error:${error.code ?? error.message}` };
  return (data ?? { ok: false, reason: "empty" }) as RpcResult;
}

const userIds: string[] = [];
const growIds: string[] = [];

async function teardown() {
  for (const growId of growIds) {
    await admin.from("diary_entries").delete().eq("grow_id", growId);
    await admin.from("grow_events").delete().eq("grow_id", growId);
  }
  for (const uid of userIds) {
    await admin.from("quicklog_entry_revisions").delete().eq("user_id", uid);
    await admin.from("quicklog_audit_events").delete().eq("user_id", uid);
    await admin.from("quicklog_idempotency").delete().eq("user_id", uid);
    await admin.from("plants").delete().eq("user_id", uid);
    await admin.from("tents").delete().eq("user_id", uid);
    await admin.from("grows").delete().eq("user_id", uid);
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
}

async function main() {
  const userA = await createUser(emailA);
  const userB = await createUser(emailB);
  userIds.push(userA, userB);

  const growA = await insertAndReturnId("grows", {
    user_id: userA,
    name: `QLR grow A ${runId}`,
  });
  const growB = await insertAndReturnId("grows", {
    user_id: userB,
    name: `QLR grow B ${runId}`,
  });
  growIds.push(growA, growB);

  const tentA = await insertAndReturnId("tents", {
    user_id: userA,
    grow_id: growA,
    name: `QLR tent A ${runId}`,
  });
  const plantA1 = await insertAndReturnId("plants", {
    user_id: userA,
    grow_id: growA,
    tent_id: tentA,
    name: `QLR plant A1 ${runId}`,
  });
  const plantA2 = await insertAndReturnId("plants", {
    user_id: userA,
    grow_id: growA,
    tent_id: tentA,
    name: `QLR plant A2 ${runId}`,
  });
  const tentB = await insertAndReturnId("tents", {
    user_id: userB,
    grow_id: growB,
    name: `QLR tent B ${runId}`,
  });
  const plantB = await insertAndReturnId("plants", {
    user_id: userB,
    grow_id: growB,
    tent_id: tentB,
    name: `QLR plant B ${runId}`,
  });

  const clientA = await signedInClient(emailA);
  const clientB = await signedInClient(emailB);

  // --- Seed one entry through each live write path (as user A) ---

  const manualSave = await rpc(clientA, "quicklog_save_manual", {
    p_target_type: "plant",
    p_target_id: plantA1,
    p_action: "note",
    p_note: "Original note before correction.",
    p_temperature_c: 24.5,
    p_humidity_pct: 55,
    p_idempotency_key: `qlr-manual-${runId}`,
  });
  check("seed: quicklog_save_manual save succeeds", manualSave.ok === true, manualSave.reason);
  const manualEventId = manualSave.grow_event_id as string;
  const manualDiaryId = manualSave.diary_entry_id as string;
  const manualEnvId = (manualSave.environment_event_id as string) ?? null;

  const eventSave = await rpc(clientA, "quicklog_save_event", {
    p_idempotency_key: `qlr-event-${runId}`,
    p_grow_id: growA,
    p_event_type: "watering",
    p_tent_id: tentA,
    p_plant_id: plantA1,
    p_note: "Watering entry via quicklog_save_event.",
    p_water: { volume_ml: 500 },
  });
  check("seed: quicklog_save_event save succeeds", eventSave.ok === true, eventSave.reason);
  const eventEventId = eventSave.grow_event_id as string;

  // --- Corrections (owner) ---

  const corrected = await rpc(clientA, "quicklog_correct_entry", {
    p_reason_code: "typo",
    p_changes: { note: "Corrected note text." },
    p_grow_event_id: manualEventId,
    p_reason_note: "Fixed a typo.",
  });
  check("owner can correct own entry note", corrected.ok === true, corrected.reason);

  {
    const spine = await admin
      .from("grow_events")
      .select("note,is_deleted")
      .eq("id", manualEventId)
      .single();
    check(
      "correction applied to spine note",
      spine.data?.note === "Corrected note text.",
      String(spine.data?.note),
    );
    const mirror = await admin
      .from("diary_entries")
      .select("note,retracted_at")
      .eq("id", manualDiaryId)
      .single();
    check(
      "correction applied to diary mirror note",
      mirror.data?.note === "Corrected note text." && mirror.data?.retracted_at === null,
      String(mirror.data?.note),
    );
    const rev = await admin
      .from("quicklog_entry_revisions")
      .select("revision_no,kind,reason_code,previous_state,new_state")
      .eq("root_id", manualEventId)
      .order("revision_no", { ascending: true });
    const first = rev.data?.[0] as
      { revision_no: number; kind: string; previous_state: { note?: string } } | undefined;
    check(
      "correction appended ledger row preserving original note",
      rev.data?.length === 1 &&
        first?.kind === "correction" &&
        first?.revision_no === 1 &&
        first?.previous_state?.note === "Original note before correction.",
      JSON.stringify(rev.data),
    );
  }

  const retarget = await rpc(clientA, "quicklog_correct_entry", {
    p_reason_code: "wrong_plant",
    p_changes: { target_type: "plant", target_id: plantA2 },
    p_grow_event_id: manualEventId,
  });
  check(
    "owner can re-target own entry to another owned plant",
    retarget.ok === true,
    retarget.reason,
  );
  {
    const spine = await admin
      .from("grow_events")
      .select("plant_id,grow_id,tent_id")
      .eq("id", manualEventId)
      .single();
    check(
      "re-target moved spine to the new plant coherently",
      spine.data?.plant_id === plantA2 &&
        spine.data?.grow_id === growA &&
        spine.data?.tent_id === tentA,
      JSON.stringify(spine.data),
    );
  }

  const crossTarget = await rpc(clientA, "quicklog_correct_entry", {
    p_reason_code: "wrong_plant",
    p_changes: { target_type: "plant", target_id: plantB },
    p_grow_event_id: manualEventId,
  });
  check(
    "owner cannot re-target onto another user's plant",
    crossTarget.ok === false && crossTarget.reason === "target_not_owned",
    String(crossTarget.reason),
  );

  const badKey = await rpc(clientA, "quicklog_correct_entry", {
    p_reason_code: "other",
    p_changes: { volume_ml: 999 },
    p_grow_event_id: manualEventId,
  });
  check(
    "unsupported change key is rejected calmly",
    badKey.ok === false && badKey.reason === "unsupported_change",
    String(badKey.reason),
  );

  const badReason = await rpc(clientA, "quicklog_correct_entry", {
    p_reason_code: "because",
    p_changes: { note: "x" },
    p_grow_event_id: manualEventId,
  });
  check(
    "unknown reason code is rejected",
    badReason.ok === false && badReason.reason === "invalid_reason",
    String(badReason.reason),
  );

  // --- Cross-user attempts (user B on A's entry) ---

  const bCorrect = await rpc(clientB, "quicklog_correct_entry", {
    p_reason_code: "typo",
    p_changes: { note: "hijack" },
    p_grow_event_id: manualEventId,
  });
  check(
    "another user cannot correct the entry",
    bCorrect.ok === false && bCorrect.reason === "not_found_or_not_owned",
    String(bCorrect.reason),
  );

  const bRetract = await rpc(clientB, "quicklog_retract_entry", {
    p_reason_code: "other",
    p_grow_event_id: manualEventId,
  });
  check(
    "another user cannot retract the entry",
    bRetract.ok === false && bRetract.reason === "not_found_or_not_owned",
    String(bRetract.reason),
  );

  // --- Direct ledger writes must be impossible for clients ---

  {
    const forged = await clientA.from("quicklog_entry_revisions").insert({
      root_id: manualEventId,
      grow_event_id: manualEventId,
      user_id: userA,
      actor_id: userA,
      revision_no: 99,
      kind: "correction",
      reason_code: "other",
      previous_state: {},
    });
    check(
      "owner cannot INSERT ledger rows directly",
      !!forged.error,
      forged.error ? undefined : "direct insert unexpectedly succeeded",
    );
  }

  // --- Retraction (owner) ---

  const retracted = await rpc(clientA, "quicklog_retract_entry", {
    p_reason_code: "test_entry",
    p_grow_event_id: manualEventId,
    p_reason_note: "Harness retraction.",
  });
  check("owner can retract own entry", retracted.ok === true, retracted.reason);

  {
    const spine = await admin
      .from("grow_events")
      .select("is_deleted,deleted_at,note")
      .eq("id", manualEventId)
      .single();
    check(
      "retraction tombstoned the spine without deleting it",
      spine.data?.is_deleted === true && !!spine.data?.deleted_at,
      JSON.stringify(spine.data),
    );
    const mirror = await admin
      .from("diary_entries")
      .select("id,retracted_at,note")
      .eq("id", manualDiaryId)
      .single();
    check(
      "retraction marked the diary mirror and preserved the row",
      !!mirror.data?.retracted_at && mirror.data?.note === "Corrected note text.",
      JSON.stringify(mirror.data),
    );
    if (manualEnvId) {
      const env = await admin
        .from("grow_events")
        .select("is_deleted")
        .eq("id", manualEnvId)
        .single();
      check(
        "retraction tombstoned the same-save environment sibling",
        env.data?.is_deleted === true,
        JSON.stringify(env.data),
      );
    }
  }

  const dupRetract = await rpc(clientA, "quicklog_retract_entry", {
    p_reason_code: "other",
    p_grow_event_id: manualEventId,
  });
  check(
    "duplicate retraction fails calmly",
    dupRetract.ok === false && dupRetract.reason === "already_retracted",
    String(dupRetract.reason),
  );

  const postRetractCorrect = await rpc(clientA, "quicklog_correct_entry", {
    p_reason_code: "typo",
    p_changes: { note: "should not apply" },
    p_grow_event_id: manualEventId,
  });
  check(
    "correction after retraction fails calmly",
    postRetractCorrect.ok === false && postRetractCorrect.reason === "already_retracted",
    String(postRetractCorrect.reason),
  );

  // --- Ledger immutability: owner cannot UPDATE or DELETE ledger rows ---

  {
    const revs = await admin
      .from("quicklog_entry_revisions")
      .select("id")
      .eq("root_id", manualEventId);
    const revId = revs.data?.[0]?.id as string | undefined;
    check("ledger rows exist for the root", !!revId && (revs.data?.length ?? 0) >= 3);
    if (revId) {
      const upd = await clientA
        .from("quicklog_entry_revisions")
        .update({ reason_code: "other" })
        .eq("id", revId)
        .select("id");
      const del = await clientA
        .from("quicklog_entry_revisions")
        .delete()
        .eq("id", revId)
        .select("id");
      const still = await admin
        .from("quicklog_entry_revisions")
        .select("id")
        .eq("id", revId)
        .single();
      check(
        "owner cannot UPDATE or DELETE ledger rows",
        (upd.error !== null || (upd.data ?? []).length === 0) &&
          (del.error !== null || (del.data ?? []).length === 0) &&
          !!still.data?.id,
        "ledger mutation unexpectedly succeeded",
      );
    }
  }

  // --- Cross-user visibility ---

  {
    const bView = await clientB
      .from("quicklog_entry_revisions")
      .select("id")
      .eq("root_id", manualEventId);
    check(
      "another user cannot see the owner's ledger rows",
      !bView.error && (bView.data ?? []).length === 0,
      JSON.stringify(bView.data),
    );
  }

  // --- Second write path: retract a quicklog_save_event entry ---

  const retractEvent = await rpc(clientA, "quicklog_retract_entry", {
    p_reason_code: "accidental",
    p_grow_event_id: eventEventId,
  });
  check(
    "quicklog_save_event entries are retractable too",
    retractEvent.ok === true,
    retractEvent.reason,
  );
  {
    const mirrors = await admin
      .from("diary_entries")
      .select("id,retracted_at")
      .eq("grow_id", growA)
      .contains("details", { linked_grow_event_id: eventEventId });
    const allMarked = (mirrors.data ?? []).every((m) => !!m.retracted_at);
    check(
      "event-path mirror rows are marked, not deleted",
      (mirrors.data ?? []).length >= 1 && allMarked,
      JSON.stringify(mirrors.data),
    );
  }

  // --- Anonymous access ---

  {
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anonAttempt = await rpc(anonClient, "quicklog_retract_entry", {
      p_reason_code: "other",
      p_grow_event_id: manualEventId,
    });
    check("anonymous callers cannot retract", anonAttempt.ok !== true, JSON.stringify(anonAttempt));
  }

  console.log(`\nquicklog-revisions RLS harness: ${pass} passed, ${fail} failed`);
}

main()
  .catch((err) => {
    fail += 1;
    console.error("HARNESS ERROR", err);
  })
  .finally(async () => {
    await teardown();
    process.exit(fail > 0 ? 1 : 0);
  });
