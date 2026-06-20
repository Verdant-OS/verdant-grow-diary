#!/usr/bin/env -S bun run
/**
 * Runtime trust-boundary harness for public.create_feeding_event.
 *
 * Mirrors run-quicklog-save-manual-rls-harness.ts. service_role is used
 * ONLY for seed, read-back, and teardown; every authorization assertion
 * goes through anon-key + signed-in JWT.
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
const EMAIL_B = `feeding-rls-b-${STAMP}@verdant.test`;
const PASS_A = crypto.randomUUID();
const PASS_B = crypto.randomUUID();

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

async function recreateUser(email: string, password: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const prior = list?.users?.find((u) => u.email === email);
  if (prior) await admin.auth.admin.deleteUser(prior.id);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser ${email}: ${error?.message}`);
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
  return { growId: grow!.id as string, tentId: tent!.id as string, plantId: plant!.id as string };
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
  console.log("create_feeding_event RLS harness");
  const userA = await recreateUser(EMAIL_A, PASS_A);
  const userB = await recreateUser(EMAIL_B, PASS_B);
  const seedA = await seedGrowTentPlant(userA);
  const seedB = await seedGrowTentPlant(userB);
  const cA = await signedInClient(EMAIL_A, PASS_A);
  const cB = await signedInClient(EMAIL_B, PASS_B);
  const cAnon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Happy path — owner can call.
    const ok = await rpcCreateFeeding(cA, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [{ sku: "veg-A", ml: 5 }],
      _tent_id: seedA.tentId,
      _plant_id: seedA.plantId,
      _ph: 6.1,
      _ec_in: 1.4,
    });
    check("owner can call create_feeding_event", !ok.error && typeof ok.data === "string", ok.error?.message);
    const newEventId = ok.data as string;

    // 2 + 3. grow_events + feeding_events rows exist.
    const { data: ge } = await admin
      .from("grow_events")
      .select("id, event_type, source, user_id")
      .eq("id", newEventId)
      .single();
    check("grow_events row created (feeding, manual, owner)",
      !!ge && ge.event_type === "feeding" && ge.source === "manual" && ge.user_id === userA);
    const { data: fe } = await admin
      .from("feeding_events")
      .select("event_id, user_id, line_id, products")
      .eq("event_id", newEventId)
      .single();
    check("feeding_events detail row created with same event_id and owner",
      !!fe && fe.user_id === userA && fe.line_id === "default" && Array.isArray(fe.products));

    // 4. Cascade delete.
    await admin.from("grow_events").delete().eq("id", newEventId);
    const { data: feAfter } = await admin
      .from("feeding_events")
      .select("event_id")
      .eq("event_id", newEventId);
    check("cascade delete removes feeding_events row",
      Array.isArray(feAfter) && feAfter.length === 0);

    // 5. Anon cannot call.
    const anonRes = await rpcCreateFeeding(cAnon, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [],
    });
    check("anon cannot call create_feeding_event", !!anonRes.error,
      anonRes.error ? undefined : "expected error");

    // 6. Cross-user grow rejected.
    const crossGrow = await rpcCreateFeeding(cA, {
      _grow_id: seedB.growId,
      _line_id: "default",
      _products: [],
    });
    check("user A cannot feed user B's grow",
      !!crossGrow.error && /grow not found/.test(crossGrow.error.message),
      crossGrow.error?.message);

    // 7. Cross-user tent rejected.
    const crossTent = await rpcCreateFeeding(cA, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [],
      _tent_id: seedB.tentId,
    });
    check("user A cannot reference user B's tent",
      !!crossTent.error && /tent not found/.test(crossTent.error.message),
      crossTent.error?.message);

    // 8. Cross-user plant rejected.
    const crossPlant = await rpcCreateFeeding(cA, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [],
      _plant_id: seedB.plantId,
    });
    check("user A cannot reference user B's plant",
      !!crossPlant.error && /plant not found/.test(crossPlant.error.message),
      crossPlant.error?.message);

    // 9. plant/tent mismatch rejected (B's plant pretended to be in A's tent).
    // Use A's plant with a tent owned by A but not its assignment.
    const { data: extraTent } = await admin
      .from("tents")
      .insert({ user_id: userA, grow_id: seedA.growId, name: `t2-${STAMP}` })
      .select("id")
      .single();
    const mismatch = await rpcCreateFeeding(cA, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: [],
      _tent_id: extraTent!.id,
      _plant_id: seedA.plantId,
    });
    check("plant/tent mismatch is rejected",
      !!mismatch.error && /not assigned to the provided tent/.test(mismatch.error.message),
      mismatch.error?.message);

    // 10. Non-array products rejected.
    const badProducts = await rpcCreateFeeding(cA, {
      _grow_id: seedA.growId,
      _line_id: "default",
      _products: { not: "array" } as unknown,
    });
    check("non-array products rejected",
      !!badProducts.error && /products must be a jsonb array/.test(badProducts.error.message),
      badProducts.error?.message);

    // 11. Direct client INSERT into feeding_events for another user is rejected.
    const directInsertOther = await cA
      .from("feeding_events")
      .insert({
        event_id: crypto.randomUUID(),
        user_id: userB,
        line_id: "x",
        products: [],
      });
    check("direct insert spoofing other user is rejected",
      !!directInsertOther.error,
      directInsertOther.error?.message);

    // 12. Direct update of another user's row is rejected (no row visible).
    // Create one as user B then have A try to update.
    const okB = await rpcCreateFeeding(cB, {
      _grow_id: seedB.growId,
      _line_id: "default",
      _products: [],
    });
    if (!okB.error && typeof okB.data === "string") {
      const upd = await cA
        .from("feeding_events")
        .update({ line_id: "hax" })
        .eq("event_id", okB.data);
      check("user A cannot update user B's feeding_events row",
        !upd.error ? false : true);
      const del = await cA
        .from("feeding_events")
        .delete()
        .eq("event_id", okB.data);
      check("user A cannot delete user B's feeding_events row",
        !del.error ? false : true);
    }
  } finally {
    await cleanupUser(userA);
    await cleanupUser(userB);
  }

  console.log(`\nresult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
