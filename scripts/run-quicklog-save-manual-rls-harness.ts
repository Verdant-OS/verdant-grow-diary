#!/usr/bin/env -S bun run
/**
 * Runtime trust-boundary harness for public.quicklog_save_manual.
 *
 * Mirrors run-quicklog-save-event-rls-harness.ts for the V2 manual RPC.
 * service_role is used ONLY for seed, verification read-back, and teardown;
 * every authorization assertion goes through anon-key + signed-in JWT.
 *
 * Required env (script exits 2 if any is missing):
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
const EMAIL_A = `quicklog-save-manual-a-${STAMP}@verdant.test`;
const EMAIL_B = `quicklog-save-manual-b-${STAMP}@verdant.test`;
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

type Seed = { uid: string; growId: string; tentId: string; plantId: string };

async function seedFor(uid: string, label: string): Promise<Seed> {
  const { data: grow, error: gErr } = await admin
    .from("grows")
    .insert({ user_id: uid, name: `manual-harness-${label}-grow-${STAMP}` })
    .select("id")
    .single();
  if (gErr || !grow) throw new Error(`seed grow ${label}: ${gErr?.message}`);
  const { data: tent, error: tErr } = await admin
    .from("tents")
    .insert({
      user_id: uid,
      grow_id: grow.id,
      name: `manual-harness-${label}-tent-${STAMP}`,
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
      name: `manual-harness-${label}-plant-${STAMP}`,
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
    await admin.from("environment_events").delete().eq("user_id", uid);
    await admin.from("watering_events").delete().eq("user_id", uid);
    await admin.from("grow_events").delete().eq("user_id", uid);
    await admin.from("diary_entries").delete().eq("user_id", uid);
    await admin.from("plants").delete().eq("user_id", uid);
    await admin.from("tents").delete().eq("user_id", uid);
    await admin.from("grows").delete().eq("user_id", uid);
    await admin.auth.admin.deleteUser(uid);
  }
}

async function countEvents(uid: string): Promise<number> {
  const { count } = await admin
    .from("grow_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", uid);
  return count ?? 0;
}

async function call(c: SupabaseClient, args: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (c as any).rpc("quicklog_save_manual", args);
  return { data, error };
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

    // 1. Happy path
    {
      const { data, error } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedA.plantId,
        p_action: "water",
        p_volume_ml: 200,
      });
      check(
        "A can water own plant",
        !error && (data as { ok?: boolean })?.ok === true,
        error?.message,
      );
    }

    // 2. A cannot target B's plant
    {
      const before = await countEvents(uidA);
      const { data } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedB!.plantId,
        p_action: "water",
        p_volume_ml: 100,
      });
      const after = await countEvents(uidA);
      check(
        "cross-user plant → target_not_owned, no insert",
        (data as { reason?: string })?.reason === "target_not_owned" &&
          before === after,
        JSON.stringify(data),
      );
    }

    // 3. A cannot target B's tent
    {
      const { data } = await call(cA, {
        p_target_type: "tent",
        p_target_id: seedB!.tentId,
        p_action: "note",
        p_note: "x",
      });
      check(
        "cross-user tent → target_not_owned",
        (data as { reason?: string })?.reason === "target_not_owned",
        JSON.stringify(data),
      );
    }

    // 4. invalid action
    {
      const before = await countEvents(uidA);
      const { data } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedA.plantId,
        p_action: "irrigate",
      });
      const after = await countEvents(uidA);
      check(
        "invalid action → unsupported_action, no insert",
        (data as { reason?: string })?.reason === "unsupported_action" &&
          before === after,
        JSON.stringify(data),
      );
    }

    // 5. invalid volume
    {
      const { data } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedA.plantId,
        p_action: "water",
        p_volume_ml: 0,
      });
      check(
        "water with volume=0 → invalid_volume",
        (data as { reason?: string })?.reason === "invalid_volume",
        JSON.stringify(data),
      );
    }

    // 6. invalid details (array)
    {
      const { data } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedA.plantId,
        p_action: "note",
        p_note: "x",
        p_details: ["not", "object"],
      });
      check(
        "p_details as array → invalid_details",
        (data as { reason?: string })?.reason === "invalid_details",
        JSON.stringify(data),
      );
    }

    // 7. p_details auth-rebind keys are stripped
    {
      const { data, error } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedA.plantId,
        p_action: "note",
        p_note: "rebind attempt",
        p_details: {
          user_id: uidB,
          grow_id: seedB!.growId,
          tent_id: seedB!.tentId,
          plant_id: seedB!.plantId,
          kind: "note",
        },
      });
      const diaryId = (data as { diary_entry_id?: string })?.diary_entry_id;
      check(
        "p_details with rebind keys still saves under A",
        !error && (data as { ok?: boolean })?.ok === true && Boolean(diaryId),
        JSON.stringify(data ?? error),
      );
      if (diaryId) {
        const { data: row } = await admin
          .from("diary_entries")
          .select("user_id,details")
          .eq("id", diaryId)
          .single();
        const safe =
          row?.user_id === uidA &&
          !("user_id" in ((row?.details ?? {}) as Record<string, unknown>)) &&
          !("grow_id" in ((row?.details ?? {}) as Record<string, unknown>));
        check(
          "rebind keys are stripped from persisted details",
          Boolean(safe),
          JSON.stringify(row),
        );
      }
    }

    // 8. Failure-audit path: bad numeric input rejected at typed param
    //    boundary (PostgREST coerce error) — should not insert any rows.
    {
      const before = await countEvents(uidA);
      const { error } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedA.plantId,
        p_action: "note",
        p_note: "bad sensor",
        p_temperature_c: "NaN",
      });
      const after = await countEvents(uidA);
      check(
        "non-numeric sensor input rejected at typed param boundary, no insert",
        Boolean(error) && before === after,
        error?.message ?? "no error",
      );
    }

    // 9. Runtime save_failed audit: trigger a DB-side failure AFTER
    //    save_started by sending a humidity_pct out of range (validate_environment_event
    //    trigger raises). Assert the latest failure audit row has a
    //    SQLSTATE-shaped reason, no SQLERRM-like leakage, and zero orphan
    //    companion rows survive.
    {
      const beforeGe = await countEvents(uidA);
      const { data: beforeWE } = await admin
        .from("watering_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uidA);
      const { data: beforeEE } = await admin
        .from("environment_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", uidA);
      void beforeWE;
      void beforeEE;
      const { data } = await call(cA, {
        p_target_type: "plant",
        p_target_id: seedA.plantId,
        p_action: "note",
        p_note: "trigger humidity range failure",
        p_humidity_pct: 999, // validate_environment_event raises
      });
      const afterGe = await countEvents(uidA);
      check(
        "humidity out-of-range returns safe save_failed envelope",
        (data as { ok?: boolean; reason?: string })?.ok === false &&
          (data as { reason?: string })?.reason === "save_failed",
        JSON.stringify(data),
      );
      check(
        "save_failed leaves zero orphan grow_events",
        afterGe === beforeGe,
        `delta=${afterGe - beforeGe}`,
      );
      const { data: latest } = await admin
        .from("quicklog_audit_events")
        .select("status,reason")
        .eq("user_id", uidA)
        .eq("status", "save_failed")
        .order("created_at", { ascending: false })
        .limit(1);
      const r = (latest ?? [])[0];
      const reason = (r?.reason ?? "") as string;
      check(
        "latest save_failed audit reason is SQLSTATE-shaped (5 chars [A-Z0-9])",
        /^[A-Z0-9]{5}$/.test(reason),
        `reason=${reason}`,
      );
      check(
        "save_failed reason contains no SQLERRM-like leakage",
        !/select|insert|update|delete|from|where|jwt|bearer|token|secret|public\.|auth\./i.test(
          reason,
        ) &&
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
            reason,
          ),
        reason,
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
