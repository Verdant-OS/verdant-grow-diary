#!/usr/bin/env -S bun run
/**
 * Runtime trust-boundary harness for public.quicklog_save_event.
 *
 * Proves that the atomic Quick Log RPC enforces ownership, idempotency, and
 * validation at the real database trust boundary using two real signed-in
 * Supabase clients (User A and User B) hitting PostgREST.
 *
 * service_role is used ONLY to:
 *   - create two auth.users (seed)
 *   - seed grows/tents/plants for each user (seed)
 *   - read-back rows after rejected calls to prove no orphans (verification)
 *   - clean up (teardown)
 *
 * Every authorization assertion is exercised through the anon-key + JWT
 * session client. No SET ROLE, no service_role inside test calls.
 *
 * Run:
 *   bun run scripts/run-quicklog-save-event-rls-harness.ts
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY)
 *
 * NOT part of the default Vitest suite — invoke separately. The static
 * companion at src/test/quicklog-save-event-rpc-trust-boundary.test.ts
 * guards the same properties at the migration-SQL layer.
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
const EMAIL_A = `quicklog-save-event-a-${STAMP}@verdant.test`;
const EMAIL_B = `quicklog-save-event-b-${STAMP}@verdant.test`;
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
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

type Seed = {
  uid: string;
  growId: string;
  tentId: string;
  plantId: string;
};

async function seedFor(uid: string, label: string): Promise<Seed> {
  const { data: grow, error: gErr } = await admin
    .from("grows")
    .insert({ user_id: uid, name: `harness-${label}-grow-${STAMP}` })
    .select("id")
    .single();
  if (gErr || !grow) throw new Error(`seed grow ${label}: ${gErr?.message}`);
  const { data: tent, error: tErr } = await admin
    .from("tents")
    .insert({
      user_id: uid,
      grow_id: grow.id,
      name: `harness-${label}-tent-${STAMP}`,
      stage: "veg",
    })
    .select("id")
    .single();
  if (tErr || !tent) throw new Error(`seed tent ${label}: ${tErr?.message}`);
  const { data: plant, error: pErr } = await admin
    .from("plants")
    .insert({
      user_id: uid,
      grow_id: grow.id,
      tent_id: tent.id,
      name: `harness-${label}-plant-${STAMP}`,
      stage: "veg",
      health: "healthy",
    })
    .select("id")
    .single();
  if (pErr || !plant) throw new Error(`seed plant ${label}: ${pErr?.message}`);
  return { uid, growId: grow.id, tentId: tent.id, plantId: plant.id };
}

async function teardown(uids: string[]) {
  for (const uid of uids) {
    await admin.from("grow_events").delete().eq("user_id", uid);
    await admin.from("diary_entries").delete().eq("user_id", uid);
    await admin.from("quicklog_idempotency").delete().eq("user_id", uid);
    await admin.from("quicklog_audit_events").delete().eq("user_id", uid);
    await admin.from("plants").delete().eq("user_id", uid);
    await admin.from("tents").delete().eq("user_id", uid);
    await admin.from("grows").delete().eq("user_id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
}

type RpcArgs = {
  p_idempotency_key: string;
  p_grow_id: string;
  p_event_type: string;
  p_tent_id?: string | null;
  p_plant_id?: string | null;
  p_note?: string | null;
  p_photo_url?: string | null;
  p_sensor_snapshot?: unknown;
  p_occurred_at?: string | null;
  p_details?: unknown;
};

async function call(c: SupabaseClient, args: RpcArgs) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (c as any).rpc("quicklog_save_event", args);
  return { data, error };
}

function key(tag: string) {
  return `harness-${tag}-${STAMP}-${crypto.randomUUID()}`;
}

async function countGrowEvents(uid: string): Promise<number> {
  const { count } = await admin
    .from("grow_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}
async function countDiary(uid: string): Promise<number> {
  const { count } = await admin
    .from("diary_entries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}

async function main() {
  console.log("→ seeding two auth.users + grow/tent/plant per user");
  const uidA = await recreateUser(EMAIL_A, PASS_A);
  const uidB = await recreateUser(EMAIL_B, PASS_B);
  let seedA: Seed | null = null;
  let seedB: Seed | null = null;
  try {
    seedA = await seedFor(uidA, "A");
    seedB = await seedFor(uidB, "B");
    const cA = await signedInClient(EMAIL_A, PASS_A);
    const cB = await signedInClient(EMAIL_B, PASS_B);

    // 1. Happy path — User A logs against own grow/tent/plant.
    {
      const k = key("happy");
      const { data, error } = await call(cA, {
        p_idempotency_key: k,
        p_grow_id: seedA.growId,
        p_event_type: "observation",
        p_tent_id: seedA.tentId,
        p_plant_id: seedA.plantId,
        p_note: "harness ok",
      });
      check(
        "A can save own grow/tent/plant",
        !error && (data as { ok?: boolean })?.ok === true,
        error?.message,
      );
    }

    // 2. A cannot use B's grow.
    {
      const { data, error } = await call(cA, {
        p_idempotency_key: key("crossgrow"),
        p_grow_id: seedB!.growId,
        p_event_type: "observation",
      });
      check(
        "A cannot save against B's grow → grow_not_owned",
        !error && (data as { reason?: string })?.reason === "grow_not_owned",
        JSON.stringify(data ?? error),
      );
    }

    // 3. A cannot attach B's tent (tent ownership check → tent_not_in_grow,
    //    because the SELECT is scoped to user_id = uid so it returns NOT FOUND).
    {
      const { data } = await call(cA, {
        p_idempotency_key: key("crosstent"),
        p_grow_id: seedA.growId,
        p_event_type: "observation",
        p_tent_id: seedB!.tentId,
      });
      check(
        "A cannot attach B's tent → tent_not_in_grow",
        (data as { reason?: string })?.reason === "tent_not_in_grow",
        JSON.stringify(data),
      );
    }

    // 4. A cannot attach B's plant.
    {
      const { data } = await call(cA, {
        p_idempotency_key: key("crossplant"),
        p_grow_id: seedA.growId,
        p_event_type: "observation",
        p_plant_id: seedB!.plantId,
      });
      check(
        "A cannot attach B's plant → plant_not_in_grow",
        (data as { reason?: string })?.reason === "plant_not_in_grow",
        JSON.stringify(data),
      );
    }

    // 5. Tent must belong to the selected grow (own tent, wrong grow id).
    //    Build a second grow for A and attach the original tent.
    {
      const { data: g2 } = await admin
        .from("grows")
        .insert({ user_id: uidA, name: `harness-A-grow2-${STAMP}` })
        .select("id")
        .single();
      const { data } = await call(cA, {
        p_idempotency_key: key("tentwronggrow"),
        p_grow_id: g2!.id,
        p_event_type: "observation",
        p_tent_id: seedA.tentId,
      });
      check(
        "tent must belong to selected grow → tent_not_in_grow",
        (data as { reason?: string })?.reason === "tent_not_in_grow",
        JSON.stringify(data),
      );
    }

    // 6. Plant must belong to the selected tent when a tent is provided.
    //    Create a second tent under A's grow, attach plant of original tent.
    {
      const { data: t2 } = await admin
        .from("tents")
        .insert({
          user_id: uidA,
          grow_id: seedA.growId,
          name: `harness-A-tent2-${STAMP}`,
          stage: "veg",
        })
        .select("id")
        .single();
      const { data } = await call(cA, {
        p_idempotency_key: key("planttentmismatch"),
        p_grow_id: seedA.growId,
        p_event_type: "observation",
        p_tent_id: t2!.id,
        p_plant_id: seedA.plantId,
      });
      check(
        "plant must belong to selected tent → plant_not_in_tent",
        (data as { reason?: string })?.reason === "plant_not_in_tent",
        JSON.stringify(data),
      );
    }

    // 7. Idempotent replay for the same user returns the original grow_event_id.
    {
      const k = key("idemp");
      const r1 = await call(cA, {
        p_idempotency_key: k,
        p_grow_id: seedA.growId,
        p_event_type: "observation",
      });
      const before = await countGrowEvents(uidA);
      const r2 = await call(cA, {
        p_idempotency_key: k,
        p_grow_id: seedA.growId,
        p_event_type: "observation",
      });
      const after = await countGrowEvents(uidA);
      const id1 = (r1.data as { grow_event_id?: string })?.grow_event_id;
      const id2 = (r2.data as { grow_event_id?: string })?.grow_event_id;
      const reused = (r2.data as { reused?: boolean })?.reused === true;
      check(
        "duplicate idempotency key replays original (no second insert)",
        Boolean(id1) && id1 === id2 && reused && before === after,
        `id1=${id1} id2=${id2} reused=${reused} before=${before} after=${after}`,
      );
    }

    // 8. Same key from a different user is independent.
    {
      const k = key("crossuserkey");
      const rA = await call(cA, {
        p_idempotency_key: k,
        p_grow_id: seedA.growId,
        p_event_type: "observation",
      });
      const rB = await call(cB, {
        p_idempotency_key: k,
        p_grow_id: seedB!.growId,
        p_event_type: "observation",
      });
      const idA = (rA.data as { grow_event_id?: string })?.grow_event_id;
      const idB = (rB.data as { grow_event_id?: string })?.grow_event_id;
      const reusedB = (rB.data as { reused?: boolean })?.reused === true;
      check(
        "idempotency is scoped per user (B's call does not replay A's)",
        Boolean(idA) && Boolean(idB) && idA !== idB && !reusedB,
        `idA=${idA} idB=${idB} reusedB=${reusedB}`,
      );
    }

    // 9. Invalid event type rejected before insert.
    {
      const before = await countGrowEvents(uidA);
      const { data } = await call(cA, {
        p_idempotency_key: key("badtype"),
        p_grow_id: seedA.growId,
        p_event_type: "note", // disallowed: client must map to observation
      });
      const after = await countGrowEvents(uidA);
      check(
        "invalid event_type rejected → invalid_event_type, no insert",
        (data as { reason?: string })?.reason === "invalid_event_type" &&
          before === after,
        `${JSON.stringify(data)} delta=${after - before}`,
      );
    }

    // 10. Invalid sensor snapshot (non-numeric metric) rejected before insert.
    {
      const before = await countGrowEvents(uidA);
      const beforeD = await countDiary(uidA);
      const { data } = await call(cA, {
        p_idempotency_key: key("badsensor"),
        p_grow_id: seedA.growId,
        p_event_type: "observation",
        p_sensor_snapshot: {
          source: "manual",
          captured_at: new Date().toISOString(),
          metrics: { temperature: "not-a-number" },
        },
      });
      const after = await countGrowEvents(uidA);
      const afterD = await countDiary(uidA);
      check(
        "invalid sensor metric rejected → invalid_sensor_metric, no orphan grow_events",
        (data as { reason?: string })?.reason === "invalid_sensor_metric" &&
          before === after,
        `${JSON.stringify(data)} ge_delta=${after - before}`,
      );
      check(
        "invalid sensor metric leaves no orphan diary_entries",
        beforeD === afterD,
        `de_delta=${afterD - beforeD}`,
      );
    }

    // 11. Invalid idempotency key rejected.
    {
      const { data } = await call(cA, {
        p_idempotency_key: "x",
        p_grow_id: seedA.growId,
        p_event_type: "observation",
      });
      check(
        "short idempotency key rejected → invalid_idempotency_key",
        (data as { reason?: string })?.reason === "invalid_idempotency_key",
        JSON.stringify(data),
      );
    }

    // 12. Audit trail emissions are explicit and safe.
    {
      const k = key("audit");
      await call(cA, {
        p_idempotency_key: k,
        p_grow_id: seedA.growId,
        p_event_type: "observation",
      });
      await call(cA, {
        p_idempotency_key: k,
        p_grow_id: seedA.growId,
        p_event_type: "observation",
      });
      await call(cA, {
        p_idempotency_key: key("audit-bad"),
        p_grow_id: seedA.growId,
        p_event_type: "note",
      });
      const { data: events } = await admin
        .from("quicklog_audit_events")
        .select("status,reason,idempotency_key")
        .eq("user_id", uidA)
        .order("created_at", { ascending: true });
      const statuses = new Set((events ?? []).map((e) => e.status));
      check(
        "audit emits save_started/save_succeeded/duplicate_reused/validation_failed",
        ["save_started", "save_succeeded", "duplicate_reused", "validation_failed"].every(
          (s) => statuses.has(s),
        ),
        Array.from(statuses).join(","),
      );
      const reasons = (events ?? [])
        .map((e) => e.reason)
        .filter((r): r is string => typeof r === "string" && r.length > 0);
      const safe = reasons.every(
        (r) =>
          /^[a-z][a-z0-9_]{2,40}$/.test(r) &&
          !/select|insert|update|delete|from|where|jwt|bearer|token|secret/i.test(
            r,
          ) &&
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
            r,
          ),
      );
      check(
        "audit reason codes are short safe tokens (no SQL/JWT/UUID leakage)",
        safe,
        reasons.join(","),
      );
    }
  } finally {
    await teardown([uidA, uidB]);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exit(1);
});
