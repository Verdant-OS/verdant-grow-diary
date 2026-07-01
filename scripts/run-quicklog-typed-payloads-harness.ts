#!/usr/bin/env -S bun run
/**
 * Runtime regression harness for the Quick Log Typed Payloads v1 migration.
 *
 * Proves the recreated public.quicklog_save_event(...) function:
 *   - Is the only overload (no PostgREST PGRST203 ambiguity).
 *   - Still accepts every legacy event_type (observation, harvest, cure_check, …).
 *   - Writes atomic (spine + subtype + diary mirror) rows when p_water / p_feed
 *     structured payloads are supplied.
 *   - Rejects payload / event_type mismatches with reason=invalid_typed_payload
 *     and writes zero rows.
 *   - Preserves idempotency behavior (replay reuses the original grow_event_id
 *     without creating a second subtype row).
 *   - Rolls the whole save back if the subtype trigger validation fails (no
 *     orphan grow_events, subtype rows, diary rows, or idempotency rows).
 *
 * service_role is used ONLY for seed / verification-read / teardown. Every RPC
 * assertion runs through anon-key + JWT session clients.
 *
 * Skip cleanly if env is not present so this can run in CI without secrets.
 *
 * Run:
 *   bun run scripts/run-quicklog-typed-payloads-harness.ts
 *
 * Required env when running:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.log(
    "[quicklog-typed-payloads] SKIP — missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY",
  );
  process.exit(0);
}

const STAMP = Date.now();
const EMAIL = `quicklog-typed-${STAMP}@verdant.test`;
const PASS = crypto.randomUUID();

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
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const prior = list?.users?.find((u) => u.email === email);
  if (prior) await admin.auth.admin.deleteUser(prior.id);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return c;
}

type Seed = { uid: string; growId: string; tentId: string; plantId: string };

async function seedFor(uid: string): Promise<Seed> {
  const { data: grow } = await admin
    .from("grows")
    .insert({ user_id: uid, name: `harness-typed-grow-${STAMP}` })
    .select("id")
    .single();
  const { data: tent } = await admin
    .from("tents")
    .insert({
      user_id: uid,
      grow_id: grow!.id,
      name: `harness-typed-tent-${STAMP}`,
      stage: "veg",
    })
    .select("id")
    .single();
  const { data: plant } = await admin
    .from("plants")
    .insert({
      user_id: uid,
      grow_id: grow!.id,
      tent_id: tent!.id,
      name: `harness-typed-plant-${STAMP}`,
      stage: "veg",
      health: "healthy",
    })
    .select("id")
    .single();
  return { uid, growId: grow!.id, tentId: tent!.id, plantId: plant!.id };
}

async function teardown(uid: string) {
  // Subtype rows are ON DELETE CASCADE from grow_events; deleting grow_events
  // cleans watering_events / feeding_events too.
  await admin.from("grow_events").delete().eq("user_id", uid);
  await admin.from("diary_entries").delete().eq("user_id", uid);
  await admin.from("quicklog_idempotency").delete().eq("user_id", uid);
  await admin.from("quicklog_audit_events").delete().eq("user_id", uid);
  await admin.from("plants").delete().eq("user_id", uid);
  await admin.from("tents").delete().eq("user_id", uid);
  await admin.from("grows").delete().eq("user_id", uid);
  await admin.auth.admin.deleteUser(uid);
}

const key = (tag: string) => `harness-typed-${tag}-${STAMP}-${crypto.randomUUID()}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(c: SupabaseClient, args: Record<string, unknown>): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (c as any).rpc("quicklog_save_event", args);
}

async function countBy(
  table: string,
  filters: Record<string, string | null>,
): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) {
    if (v === null) q = q.is(k, null);
    else q = q.eq(k, v);
  }
  const { count } = await q;
  return count ?? 0;
}

async function main() {
  console.log("→ signature uniqueness (no PostgREST overload ambiguity)");
  {
    // pg_proc lookup via a public read function is unavailable to anon; use
    // service_role admin client which is fine for this metadata check.
    const { data, error } = await admin.rpc(
      // Use raw SQL via the "sql" method equivalent — fall back to
      // information_schema query through PostgREST if RPC helper missing.
      "quicklog_save_event",
      {
        p_idempotency_key: "signature-probe-not-executed-______",
        p_grow_id: "00000000-0000-0000-0000-000000000000",
        p_event_type: "observation",
      },
    );
    // We don't care about the result; we only care that PostgREST could
    // resolve the function without PGRST203. A PGRST203 error surfaces as
    // error.code === "PGRST203".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (error as any)?.code;
    check("PostgREST resolves quicklog_save_event without PGRST203", code !== "PGRST203",
      `code=${code ?? "none"} data=${JSON.stringify(data)}`);
  }

  console.log("→ seeding auth.user + grow/tent/plant");
  const uid = await recreateUser(EMAIL, PASS);
  try {
    const seed = await seedFor(uid);
    const c = await signedInClient(EMAIL, PASS);

    // 1. Legacy observation still works
    {
      const { data, error } = await call(c, {
        p_idempotency_key: key("legacy-obs"),
        p_grow_id: seed.growId,
        p_event_type: "observation",
        p_note: "legacy",
      });
      check("legacy observation caller succeeds",
        !error && data?.ok === true, error?.message ?? JSON.stringify(data));
    }

    // 2. Legacy Harvest still works
    {
      const { data, error } = await call(c, {
        p_idempotency_key: key("legacy-harvest"),
        p_grow_id: seed.growId,
        p_event_type: "harvest",
        p_note: "wet 120g",
      });
      check("legacy harvest caller succeeds",
        !error && data?.ok === true, error?.message ?? JSON.stringify(data));
    }

    // 3. Legacy cure_check still works
    {
      const { data, error } = await call(c, {
        p_idempotency_key: key("legacy-cure"),
        p_grow_id: seed.growId,
        p_event_type: "cure_check",
      });
      check("legacy cure_check caller succeeds",
        !error && data?.ok === true, error?.message ?? JSON.stringify(data));
    }

    // 4. Typed watering
    let wateringEventId: string | undefined;
    {
      const k = key("typed-water");
      const { data, error } = await call(c, {
        p_idempotency_key: k,
        p_grow_id: seed.growId,
        p_event_type: "watering",
        p_water: { volume_ml: 500, ph: 6.2 },
      });
      wateringEventId = data?.grow_event_id;
      check("typed watering ok", !error && data?.ok === true,
        error?.message ?? JSON.stringify(data));
      const subCount = wateringEventId
        ? await countBy("watering_events", { event_id: wateringEventId })
        : 0;
      check("watering_events row linked to spine (1)", subCount === 1, `${subCount}`);
      // Diary mirror must include structured fields.
      const { data: diary } = await admin
        .from("diary_entries")
        .select("details")
        .eq("user_id", uid)
        .order("entry_at", { ascending: false })
        .limit(5);
      const mirror = diary?.find(
        (d) =>
          d.details &&
          (d.details as { linked_grow_event_id?: string }).linked_grow_event_id ===
            wateringEventId,
      );
      const water = (mirror?.details as { watering?: { volume_ml?: number } } | undefined)
        ?.watering;
      check("diary mirror includes details.watering.volume_ml = 500",
        Number(water?.volume_ml) === 500, JSON.stringify(water));
    }

    // 5. Typed feeding
    {
      const k = key("typed-feed");
      const { data, error } = await call(c, {
        p_idempotency_key: k,
        p_grow_id: seed.growId,
        p_event_type: "feeding",
        p_feed: {
          volume_ml: 1000,
          ec_in: 1.8,
          runoff_ec: 2.4,
          products: ["base"],
        },
      });
      const geId = data?.grow_event_id;
      check("typed feeding ok", !error && data?.ok === true,
        error?.message ?? JSON.stringify(data));
      const subCount = geId
        ? await countBy("feeding_events", { event_id: geId })
        : 0;
      check("feeding_events row linked to spine (1)", subCount === 1, `${subCount}`);
      const { data: diary } = await admin
        .from("diary_entries")
        .select("details")
        .eq("user_id", uid)
        .order("entry_at", { ascending: false })
        .limit(5);
      const mirror = diary?.find(
        (d) =>
          d.details &&
          (d.details as { linked_grow_event_id?: string }).linked_grow_event_id === geId,
      );
      const feed = (mirror?.details as { feeding?: Record<string, unknown> } | undefined)
        ?.feeding;
      check("diary mirror includes details.feeding.ec_in = 1.8",
        Number((feed as { ec_in?: number } | undefined)?.ec_in) === 1.8,
        JSON.stringify(feed));
      const products = (feed as { products?: unknown } | undefined)?.products;
      check("feeding products persisted as JSON array",
        Array.isArray(products), JSON.stringify(products));
    }

    // 6. Payload mismatch — p_water on observation
    {
      const geBefore = await countBy("grow_events", { user_id: uid });
      const deBefore = await countBy("diary_entries", { user_id: uid });
      const idBefore = await countBy("quicklog_idempotency", { user_id: uid });
      const { data } = await call(c, {
        p_idempotency_key: key("mismatch"),
        p_grow_id: seed.growId,
        p_event_type: "observation",
        p_water: { volume_ml: 100 },
      });
      check("mismatch → reason=invalid_typed_payload",
        data?.ok === false && data?.reason === "invalid_typed_payload",
        JSON.stringify(data));
      const geAfter = await countBy("grow_events", { user_id: uid });
      const deAfter = await countBy("diary_entries", { user_id: uid });
      const idAfter = await countBy("quicklog_idempotency", { user_id: uid });
      check("mismatch wrote zero grow_events", geAfter === geBefore, `${geBefore}→${geAfter}`);
      check("mismatch wrote zero diary_entries", deAfter === deBefore, `${deBefore}→${deAfter}`);
      check("mismatch wrote zero idempotency rows", idAfter === idBefore, `${idBefore}→${idAfter}`);
    }

    // 7. Idempotency replay for typed watering
    {
      const k = key("idemp-water");
      const r1 = await call(c, {
        p_idempotency_key: k,
        p_grow_id: seed.growId,
        p_event_type: "watering",
        p_water: { volume_ml: 250 },
      });
      const beforeCount = await countBy("watering_events", { user_id: uid });
      const r2 = await call(c, {
        p_idempotency_key: k,
        p_grow_id: seed.growId,
        p_event_type: "watering",
        p_water: { volume_ml: 250 },
      });
      const afterCount = await countBy("watering_events", { user_id: uid });
      check("replay returns original grow_event_id",
        r1.data?.grow_event_id === r2.data?.grow_event_id,
        `${r1.data?.grow_event_id} vs ${r2.data?.grow_event_id}`);
      check("replay does not create a second watering_events row",
        beforeCount === afterCount, `${beforeCount}→${afterCount}`);
    }

    // 8. Atomicity — force trigger failure (ph out of range).
    {
      const geBefore = await countBy("grow_events", { user_id: uid });
      const weBefore = await countBy("watering_events", { user_id: uid });
      const deBefore = await countBy("diary_entries", { user_id: uid });
      const idBefore = await countBy("quicklog_idempotency", { user_id: uid });
      const { data, error } = await call(c, {
        p_idempotency_key: key("atomicity"),
        p_grow_id: seed.growId,
        p_event_type: "watering",
        p_water: { ph: 15 },
      });
      check("subtype trigger failure surfaces as error (no ok:true)",
        error !== null || data?.ok !== true, JSON.stringify(data ?? error));
      const geAfter = await countBy("grow_events", { user_id: uid });
      const weAfter = await countBy("watering_events", { user_id: uid });
      const deAfter = await countBy("diary_entries", { user_id: uid });
      const idAfter = await countBy("quicklog_idempotency", { user_id: uid });
      check("no orphan grow_events after subtype failure", geAfter === geBefore, `${geBefore}→${geAfter}`);
      check("no orphan watering_events after failure", weAfter === weBefore, `${weBefore}→${weAfter}`);
      check("no orphan diary_entries after failure", deAfter === deBefore, `${deBefore}→${deAfter}`);
      check("no orphan idempotency row after failure", idAfter === idBefore, `${idBefore}→${idAfter}`);
    }

    // 9. Invalid event type still fails safely.
    {
      const { data } = await call(c, {
        p_idempotency_key: key("invalid-type"),
        p_grow_id: seed.growId,
        p_event_type: "not_a_real_event",
      });
      check("invalid event type → reason=invalid_event_type",
        data?.ok === false && data?.reason === "invalid_event_type",
        JSON.stringify(data));
    }
  } finally {
    await teardown(uid);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exit(1);
});
