#!/usr/bin/env -S bun run
/**
 * Runtime trust-boundary harness for public.create_feeding_event.
 *
 * Post-2026-07-22 irrigation evidence trust-boundary revoke, the legacy
 * create_feeding_event RPC is SERVER-ONLY: EXECUTE is revoked from anon and
 * authenticated. This harness now proves the RPC is denied to signed-in and
 * anon callers, and that direct DML into feeding_events / grow_events from
 * an authenticated client is also denied. service_role is used ONLY for seed
 * and teardown; every authorization assertion goes through anon-key JWT.
 *
 * Required env (exits 2 if any is missing):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY)
 *
 * Run on dev/staging only — never against production.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY!;
for (const [k, v] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
]) {
  if (!v) {
    console.error(`missing env: ${k}`);
    process.exit(2);
  }
}

const STAMP = Date.now();
const EMAIL_A = `feeding-rls-a-${STAMP}@verdant.test`;
const PASS_A = crypto.randomUUID();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function isDenied(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  const c = err.code ?? "";
  return (
    c === "42501" || // insufficient_privilege
    c === "PGRST202" || // function not exposed
    c === "PGRST301" ||
    m.includes("permission denied") ||
    m.includes("not allowed") ||
    m.includes("insufficient") ||
    m.includes("does not exist") ||
    m.includes("no function matches") ||
    m.includes("could not find the function")
  );
}

async function recreateUser(email: string, password: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const prior = list?.users?.find((u) => u.email === email);
  if (prior) await admin.auth.admin.deleteUser(prior.id);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(email: string, password: string) {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function seedGrowTentPlant(userId: string) {
  const { data: grow } = await admin
    .from("grows")
    .insert({ user_id: userId, name: `g-${STAMP}` })
    .select("id")
    .single();
  const { data: tent } = await admin
    .from("tents")
    .insert({ user_id: userId, grow_id: grow!.id, name: `t-${STAMP}` })
    .select("id")
    .single();
  const { data: plant } = await admin
    .from("plants")
    .insert({
      user_id: userId,
      grow_id: grow!.id,
      tent_id: tent!.id,
      name: `p-${STAMP}`,
    })
    .select("id")
    .single();
  return {
    growId: grow!.id as string,
    tentId: tent!.id as string,
    plantId: plant!.id as string,
  };
}

async function cleanupUser(userId: string) {
  await admin.from("grow_events").delete().eq("user_id", userId);
  await admin.from("plants").delete().eq("user_id", userId);
  await admin.from("tents").delete().eq("user_id", userId);
  await admin.from("grows").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function rpcCreateFeeding(client: SupabaseClient, args: Record<string, unknown>) {
  return await client.rpc("create_feeding_event" as never, args as never);
}

async function main() {
  console.log("create_feeding_event RLS harness (denial-expected)");
  const userA = await recreateUser(EMAIL_A, PASS_A);
  const seedA = await seedGrowTentPlant(userA);
  const cA = await signedInClient(EMAIL_A, PASS_A);
  const cAnon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Authenticated RPC call is DENIED (EXECUTE revoked 2026-07-22).
    const authedRpc = await rpcCreateFeeding(cA, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [{ sku: "veg-A", ml: 5 }],
      _tent_id: seedA.tentId,
      _plant_id: seedA.plantId,
      _ph: 6.1,
      _ec_in: 1.4,
    });
    check(
      "authenticated cannot call legacy create_feeding_event (EXECUTE revoked)",
      isDenied(authedRpc.error),
      authedRpc.error?.message ?? "expected denial, got success",
    );

    // 2. Anon RPC call is DENIED.
    const anonRpc = await rpcCreateFeeding(cAnon, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [],
    });
    check(
      "anon cannot call legacy create_feeding_event",
      isDenied(anonRpc.error),
      anonRpc.error?.message ?? "expected denial, got success",
    );

    // 3. Authenticated direct INSERT into feeding_events is DENIED
    //    (INSERT revoked from authenticated on the three event tables).
    const directFeeding = await cA.from("feeding_events").insert({
      event_id: crypto.randomUUID(),
      user_id: userA,
      line_id: "x",
      products: [],
    });
    check(
      "authenticated cannot direct-insert into feeding_events",
      isDenied(directFeeding.error),
      directFeeding.error?.message ?? "expected denial, got success",
    );

    // 4. Authenticated direct INSERT into grow_events is DENIED.
    const directGrow = await cA.from("grow_events").insert({
      user_id: userA,
      grow_id: seedA.growId,
      tent_id: seedA.tentId,
      event_type: "feeding",
      source: "manual",
    });
    check(
      "authenticated cannot direct-insert into grow_events",
      isDenied(directGrow.error),
      directGrow.error?.message ?? "expected denial, got success",
    );

    // 5. Authenticated direct INSERT into watering_events is DENIED.
    const directWatering = await cA.from("watering_events").insert({
      event_id: crypto.randomUUID(),
      user_id: userA,
      volume_ml: 100,
    });
    check(
      "authenticated cannot direct-insert into watering_events",
      isDenied(directWatering.error),
      directWatering.error?.message ?? "expected denial, got success",
    );

    // 6. SELECT on own feeding_events remains available (preserved by the
    //    trust-boundary revoke).
    const readOwn = await cA.from("feeding_events").select("event_id").limit(1);
    check(
      "authenticated retains SELECT on feeding_events",
      readOwn.error === null,
      readOwn.error?.message,
    );

    // 7. service_role can still call create_feeding_event (server writers).
    const svcRpc = await rpcCreateFeeding(admin, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [{ sku: "veg-A", ml: 1 }],
      _tent_id: seedA.tentId,
      _plant_id: seedA.plantId,
    });
    check(
      "service_role can still call create_feeding_event",
      !svcRpc.error && typeof svcRpc.data === "string",
      svcRpc.error?.message,
    );
  } finally {
    await cleanupUser(userA);
  }

  console.log(`\nresult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

