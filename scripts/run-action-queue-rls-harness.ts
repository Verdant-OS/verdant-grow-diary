#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness for public.action_queue lineage checks.
 *
 * service_role is used ONLY for seeding, readback, and teardown.
 * All accepted/rejected INSERT, RPC, UPDATE, and DELETE assertions run through a real
 * authenticated client using the anon key plus a signed-in JWT session.
 *
 * Run:
 *   bun run scripts/run-action-queue-rls-harness.ts
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
const email = `action-queue-rls-${runId}@verdant.test`;
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

async function signedInClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

async function createUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function insertAndReturnId(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error || !data?.id) throw new Error(`seed ${table} failed: ${error?.message}`);
  return data.id as string;
}

function actionRow(ids: { growId: string; tentId: string | null; plantId: string | null }) {
  return {
    grow_id: ids.growId,
    tent_id: ids.tentId,
    plant_id: ids.plantId,
    source: "ai_coach",
    action_type: "environment_adjustment",
    target_metric: "vpd_kpa",
    suggested_change: "Review the environment before taking action.",
    reason: "RLS harness seed row.",
    risk_level: "low",
  };
}

async function expectInsertAllowed(
  client: SupabaseClient,
  name: string,
  row: Record<string, unknown>,
) {
  const { data, error } = await client.from("action_queue").insert(row).select("id").single();
  check(name, !error && !!data?.id, error?.message);
  return data?.id as string | undefined;
}

async function expectInsertRejected(
  client: SupabaseClient,
  name: string,
  row: Record<string, unknown>,
) {
  const { error } = await client.from("action_queue").insert(row).select("id").single();
  check(name, !!error, "insert unexpectedly succeeded");
}

async function expectUpdateRejected(
  client: SupabaseClient,
  name: string,
  actionId: string,
  patch: Record<string, unknown>,
  expected: Record<string, string | null>,
) {
  const { error } = await client
    .from("action_queue")
    .update(patch)
    .eq("id", actionId)
    .select("id")
    .single();
  const { data: readback, error: readbackError } = await admin
    .from("action_queue")
    .select("grow_id,tent_id,plant_id")
    .eq("id", actionId)
    .single();

  const unchanged =
    !readbackError &&
    readback?.grow_id === expected.grow_id &&
    readback?.tent_id === expected.tent_id &&
    readback?.plant_id === expected.plant_id;

  check(name, !!error && unchanged, error ? undefined : "update unexpectedly succeeded");
}

async function expectDirectDecisionUpdateRejected(client: SupabaseClient, actionId: string) {
  const { error } = await client
    .from("action_queue")
    .update({ status: "simulated" })
    .eq("id", actionId)
    .select("id,status")
    .single();
  const readback = await admin.from("action_queue").select("status").eq("id", actionId).single();
  check(
    "authenticated owner cannot bypass lifecycle RPC with direct status update",
    !!error && !readback.error && readback.data?.status === "pending_approval",
    error ? undefined : "direct lifecycle update unexpectedly succeeded",
  );
}

async function expectImmutableAuditGuards(
  client: SupabaseClient,
  actionId: string,
  growId: string,
  wrongGrowId: string,
) {
  const created = await client
    .from("action_queue_events")
    .insert({
      action_queue_id: actionId,
      grow_id: growId,
      event_type: "created",
      previous_status: null,
      new_status: "pending_approval",
      note: "Runtime harness creation event.",
    })
    .select("id")
    .single();
  check(
    "authenticated owner can append a correctly shaped creation event",
    !created.error && !!created.data?.id,
    created.error?.message,
  );
  if (!created.data?.id) return;

  const validNote = await client
    .from("action_queue_events")
    .insert({
      action_queue_id: actionId,
      grow_id: growId,
      event_type: "note",
      previous_status: "pending_approval",
      new_status: "pending_approval",
      note: "Grower-authored audit note.",
    })
    .select("id")
    .single();
  check(
    "authenticated owner can append a non-empty note at the current status",
    !validNote.error && !!validNote.data?.id,
    validNote.error?.message,
  );

  const emptyNote = await client
    .from("action_queue_events")
    .insert({
      action_queue_id: actionId,
      grow_id: growId,
      event_type: "note",
      previous_status: "pending_approval",
      new_status: "pending_approval",
      note: "   ",
    })
    .select("id")
    .single();
  check(
    "authenticated owner cannot append an empty audit note",
    !!emptyNote.error,
    emptyNote.error ? undefined : "empty note unexpectedly succeeded",
  );

  const wrongGrowCreated = await client
    .from("action_queue_events")
    .insert({
      action_queue_id: actionId,
      grow_id: wrongGrowId,
      event_type: "created",
      previous_status: null,
      new_status: "pending_approval",
      note: null,
    })
    .select("id")
    .single();
  check(
    "authenticated owner cannot append an event with mismatched grow lineage",
    !!wrongGrowCreated.error,
    wrongGrowCreated.error ? undefined : "wrong-grow event unexpectedly succeeded",
  );

  const wrongCreatedStatus = await client
    .from("action_queue_events")
    .insert({
      action_queue_id: actionId,
      grow_id: growId,
      event_type: "created",
      previous_status: null,
      new_status: "approved",
      note: null,
    })
    .select("id")
    .single();
  check(
    "authenticated owner cannot forge a created event outside pending approval",
    !!wrongCreatedStatus.error,
    wrongCreatedStatus.error ? undefined : "wrong-status created event unexpectedly succeeded",
  );

  const forged = await client
    .from("action_queue_events")
    .insert({
      action_queue_id: actionId,
      grow_id: growId,
      event_type: "approved",
      previous_status: "pending_approval",
      new_status: "approved",
      note: "forged",
    })
    .select("id")
    .single();
  check(
    "authenticated owner cannot forge lifecycle audit events",
    !!forged.error,
    forged.error ? undefined : "forged lifecycle event unexpectedly succeeded",
  );

  const eventDelete = await client.from("action_queue_events").delete().eq("id", created.data.id);
  const eventReadback = await admin
    .from("action_queue_events")
    .select("id")
    .eq("id", created.data.id)
    .maybeSingle();
  check(
    "authenticated owner cannot delete immutable audit events",
    !!eventDelete.error && !eventReadback.error && eventReadback.data?.id === created.data.id,
    eventDelete.error ? undefined : "audit event delete unexpectedly succeeded",
  );

  const actionDelete = await client.from("action_queue").delete().eq("id", actionId);
  const [actionReadback, historyReadback] = await Promise.all([
    admin.from("action_queue").select("id").eq("id", actionId).maybeSingle(),
    admin.from("action_queue_events").select("id").eq("id", created.data.id).maybeSingle(),
  ]);
  check(
    "authenticated owner cannot delete an action and cascade its audit history",
    !!actionDelete.error &&
      !actionReadback.error &&
      actionReadback.data?.id === actionId &&
      !historyReadback.error &&
      historyReadback.data?.id === created.data.id,
    actionDelete.error ? undefined : "action delete unexpectedly succeeded",
  );
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function expectAtomicTransitionRpc(client: SupabaseClient, actionId: string) {
  const args = {
    p_action_queue_id: actionId,
    p_transition: "approve",
    p_expected_status: "pending_approval",
    p_note: "Runtime harness grower approval.",
  };
  const first = await client.rpc("action_queue_transition", args);
  const firstResult = asJsonObject(first.data);

  const [rowRead, eventRead] = await Promise.all([
    admin.from("action_queue").select("status,approved_at").eq("id", actionId).single(),
    admin
      .from("action_queue_events")
      .select("id,event_type,previous_status,new_status,note")
      .eq("action_queue_id", actionId)
      .order("created_at", { ascending: true }),
  ]);
  const event = eventRead.data?.[0];

  check(
    "owner RPC atomically records approved status and matching audit event",
    !first.error &&
      firstResult?.ok === true &&
      firstResult.reused === false &&
      rowRead.data?.status === "approved" &&
      typeof rowRead.data?.approved_at === "string" &&
      !eventRead.error &&
      eventRead.data?.length === 1 &&
      event?.event_type === "approved" &&
      event?.previous_status === "pending_approval" &&
      event?.new_status === "approved" &&
      event?.note === "Runtime harness grower approval.",
    first.error?.message ?? rowRead.error?.message ?? eventRead.error?.message,
  );

  const retry = await client.rpc("action_queue_transition", args);
  const retryResult = asJsonObject(retry.data);
  const retryEvents = await admin
    .from("action_queue_events")
    .select("id", { count: "exact" })
    .eq("action_queue_id", actionId);
  check(
    "identical owner RPC retry reuses the matching event without duplication",
    !retry.error &&
      retryResult?.ok === true &&
      retryResult.reused === true &&
      retryResult.event_id === event?.id &&
      retryEvents.count === 1,
    retry.error?.message ?? retryEvents.error?.message,
  );

  const changedNote = await client.rpc("action_queue_transition", {
    ...args,
    p_note: "A different retry note must not reuse the first event.",
  });
  const changedNoteResult = asJsonObject(changedNote.data);
  const changedNoteEvents = await admin
    .from("action_queue_events")
    .select("id", { count: "exact" })
    .eq("action_queue_id", actionId);
  check(
    "changed-note owner RPC retry is rejected without event reuse",
    !changedNote.error &&
      changedNoteResult?.ok === false &&
      changedNoteResult.reason === "status_conflict" &&
      changedNoteEvents.count === 1,
    changedNote.error?.message ?? changedNoteEvents.error?.message,
  );

  const stale = await client.rpc("action_queue_transition", {
    p_action_queue_id: actionId,
    p_transition: "simulate",
    p_expected_status: "pending_approval",
    p_note: null,
  });
  const staleResult = asJsonObject(stale.data);
  check(
    "stale expected-status RPC is rejected without a second event",
    !stale.error && staleResult?.ok === false && staleResult.reason === "status_conflict",
    stale.error?.message,
  );
}

async function expectIllegalTransitionRpc(client: SupabaseClient, actionId: string) {
  const result = await client.rpc("action_queue_transition", {
    p_action_queue_id: actionId,
    p_transition: "complete",
    p_expected_status: "pending_approval",
    p_note: null,
  });
  const payload = asJsonObject(result.data);
  const [rowRead, eventRead] = await Promise.all([
    admin.from("action_queue").select("status").eq("id", actionId).single(),
    admin
      .from("action_queue_events")
      .select("id", { count: "exact" })
      .eq("action_queue_id", actionId),
  ]);

  check(
    "illegal pending-to-completed RPC writes neither status nor event",
    !result.error &&
      payload?.ok === false &&
      payload.reason === "illegal_transition" &&
      rowRead.data?.status === "pending_approval" &&
      eventRead.count === 0,
    result.error?.message ?? rowRead.error?.message ?? eventRead.error?.message,
  );
}

async function expectAnonymousRpcRejected(actionId: string) {
  const anonymous = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await anonymous.rpc("action_queue_transition", {
    p_action_queue_id: actionId,
    p_transition: "approve",
    p_expected_status: "pending_approval",
    p_note: null,
  });
  check(
    "anonymous caller cannot execute action_queue_transition",
    !!error,
    error ? undefined : "anonymous RPC unexpectedly succeeded",
  );
}

async function cleanup(userId: string | null, ids: Record<string, string[]>) {
  if (ids.actions.length) await admin.from("action_queue").delete().in("id", ids.actions);
  if (ids.plants.length) await admin.from("plants").delete().in("id", ids.plants);
  if (ids.tents.length) await admin.from("tents").delete().in("id", ids.tents);
  if (ids.grows.length) await admin.from("grows").delete().in("id", ids.grows);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

async function main() {
  const ids = {
    grows: [] as string[],
    tents: [] as string[],
    plants: [] as string[],
    actions: [] as string[],
  };
  let userId: string | null = null;

  try {
    userId = await createUser();
    const client = await signedInClient();

    const growA = await insertAndReturnId("grows", {
      user_id: userId,
      name: `RLS grow A ${runId}`,
    });
    const growB = await insertAndReturnId("grows", {
      user_id: userId,
      name: `RLS grow B ${runId}`,
    });
    ids.grows.push(growA, growB);

    const tentA = await insertAndReturnId("tents", {
      user_id: userId,
      grow_id: growA,
      name: `RLS tent A ${runId}`,
    });
    const tentB = await insertAndReturnId("tents", {
      user_id: userId,
      grow_id: growB,
      name: `RLS tent B ${runId}`,
    });
    const tentA2 = await insertAndReturnId("tents", {
      user_id: userId,
      grow_id: growA,
      name: `RLS tent A2 ${runId}`,
    });
    ids.tents.push(tentA, tentB, tentA2);

    const plantA = await insertAndReturnId("plants", {
      user_id: userId,
      grow_id: growA,
      tent_id: tentA,
      name: `RLS plant A ${runId}`,
    });
    const plantB = await insertAndReturnId("plants", {
      user_id: userId,
      grow_id: growB,
      tent_id: tentB,
      name: `RLS plant B ${runId}`,
    });
    const plantA2 = await insertAndReturnId("plants", {
      user_id: userId,
      grow_id: growA,
      tent_id: tentA2,
      name: `RLS plant A2 ${runId}`,
    });
    ids.plants.push(plantA, plantB, plantA2);

    const validRow = actionRow({ growId: growA, tentId: tentA, plantId: plantA });
    const validActionId = await expectInsertAllowed(
      client,
      "authenticated user can insert matching grow/tent/plant action_queue row",
      validRow,
    );
    if (!validActionId) throw new Error("valid insert did not return an id");
    ids.actions.push(validActionId);

    await expectInsertRejected(
      client,
      "authenticated user cannot insert cross-grow tent reference",
      actionRow({ growId: growA, tentId: tentB, plantId: null }),
    );
    await expectInsertRejected(
      client,
      "authenticated user cannot insert cross-grow plant reference",
      actionRow({ growId: growA, tentId: tentA, plantId: plantB }),
    );
    await expectInsertRejected(
      client,
      "authenticated user cannot insert same-grow plant from a different tent",
      actionRow({ growId: growA, tentId: tentA, plantId: plantA2 }),
    );
    await expectInsertRejected(
      client,
      "authenticated user cannot create an action outside pending approval",
      {
        ...validRow,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
    );

    const expected = { grow_id: growA, tent_id: tentA, plant_id: plantA };
    await expectUpdateRejected(
      client,
      "authenticated user cannot update to cross-grow tent",
      validActionId,
      { tent_id: tentB },
      expected,
    );
    await expectUpdateRejected(
      client,
      "authenticated user cannot update to cross-grow plant",
      validActionId,
      { plant_id: plantB },
      expected,
    );
    await expectUpdateRejected(
      client,
      "authenticated user cannot update to mismatched plant/tent",
      validActionId,
      { plant_id: plantA2 },
      expected,
    );
    await expectDirectDecisionUpdateRejected(client, validActionId);
    await expectImmutableAuditGuards(client, validActionId, growA, growB);

    const atomicActionId = await expectInsertAllowed(
      client,
      "authenticated user can create a second action for transactional RPC coverage",
      validRow,
    );
    if (!atomicActionId) throw new Error("atomic transition fixture insert did not return an id");
    ids.actions.push(atomicActionId);
    await expectAtomicTransitionRpc(client, atomicActionId);

    const illegalActionId = await expectInsertAllowed(
      client,
      "authenticated user can create an action for illegal-transition coverage",
      validRow,
    );
    if (!illegalActionId) throw new Error("illegal transition fixture insert did not return an id");
    ids.actions.push(illegalActionId);
    await expectIllegalTransitionRpc(client, illegalActionId);
    await expectAnonymousRpcRejected(illegalActionId);
  } finally {
    await cleanup(userId, ids);
  }

  console.log(`action_queue RLS harness: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
