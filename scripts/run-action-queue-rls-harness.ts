#!/usr/bin/env -S bun run
/**
 * Runtime RLS harness for public.action_queue lineage checks.
 *
 * service_role is used ONLY for seeding, readback, and teardown.
 * All accepted/rejected INSERT and UPDATE assertions run through a real
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

function actionRow(ids: {
  growId: string;
  tentId: string | null;
  plantId: string | null;
}) {
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

async function expectInsertAllowed(client: SupabaseClient, name: string, row: Record<string, unknown>) {
  const { data, error } = await client.from("action_queue").insert(row).select("id").single();
  check(name, !error && !!data?.id, error?.message);
  return data?.id as string | undefined;
}

async function expectInsertRejected(client: SupabaseClient, name: string, row: Record<string, unknown>) {
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
  const { error } = await client.from("action_queue").update(patch).eq("id", actionId).select("id").single();
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

async function cleanup(userId: string | null, ids: Record<string, string[]>) {
  if (ids.actions.length) await admin.from("action_queue").delete().in("id", ids.actions);
  if (ids.plants.length) await admin.from("plants").delete().in("id", ids.plants);
  if (ids.tents.length) await admin.from("tents").delete().in("id", ids.tents);
  if (ids.grows.length) await admin.from("grows").delete().in("id", ids.grows);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

async function main() {
  const ids = { grows: [] as string[], tents: [] as string[], plants: [] as string[], actions: [] as string[] };
  let userId: string | null = null;

  try {
    userId = await createUser();
    const client = await signedInClient();

    const growA = await insertAndReturnId("grows", { user_id: userId, name: `RLS grow A ${runId}` });
    const growB = await insertAndReturnId("grows", { user_id: userId, name: `RLS grow B ${runId}` });
    ids.grows.push(growA, growB);

    const tentA = await insertAndReturnId("tents", { user_id: userId, grow_id: growA, name: `RLS tent A ${runId}` });
    const tentB = await insertAndReturnId("tents", { user_id: userId, grow_id: growB, name: `RLS tent B ${runId}` });
    const tentA2 = await insertAndReturnId("tents", { user_id: userId, grow_id: growA, name: `RLS tent A2 ${runId}` });
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

    const expected = { grow_id: growA, tent_id: tentA, plant_id: plantA };
    await expectUpdateRejected(client, "authenticated user cannot update to cross-grow tent", validActionId, { tent_id: tentB }, expected);
    await expectUpdateRejected(client, "authenticated user cannot update to cross-grow plant", validActionId, { plant_id: plantB }, expected);
    await expectUpdateRejected(client, "authenticated user cannot update to mismatched plant/tent", validActionId, { plant_id: plantA2 }, expected);
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
