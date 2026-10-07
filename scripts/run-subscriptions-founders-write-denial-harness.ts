#!/usr/bin/env -S bun run
/**
 * Runtime write-denial harness for public.subscriptions and public.founders.
 *
 * Grant-path audit (2026-10-03): these two tables decide paid access and
 * Founder status, but no runtime harness proved that a browser client cannot
 * write them. Static reading says RLS allows SELECT on the caller's own row
 * only (subscriptions: 20260709083556; founders: 20260719044601 plus the
 * fail-closed update hardening 20260914190600). This harness checks that end
 * to end through PostgREST with real signed-in and anonymous clients.
 *
 * Proves, for each table:
 *   - a user reads only their own row; another owner's row is invisible
 *   - INSERT for oneself or for another user is rejected (self-grant)
 *   - UPDATE and UPSERT of one's own or another user's row change nothing
 *   - DELETE of one's own row changes nothing
 *   - anon can read nothing and write nothing
 *   - every seeded row is byte-for-byte unchanged afterwards (service_role
 *     read-back), so "0 rows affected" is never mistaken for success
 *
 * service_role is used ONLY to create/delete auth.users, seed one row per
 * user per table, read rows back for verification, and tear down. Every
 * rejected-mutation assertion runs through an anon-key client, with or
 * without a signed-in session, exactly like the browser.
 *
 * Disposable local lane only. It refuses to run without
 * --confirm-local-security-lane and refuses any non-loopback SUPABASE_URL.
 *
 * Run (inside .github/workflows/security-db-local.yml, after db reset):
 *   bun run scripts/run-subscriptions-founders-write-denial-harness.ts --confirm-local-security-lane
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 *   (SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY are accepted aliases)
 */
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const LOCAL_LANE_FLAG = "--confirm-local-security-lane";

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

export type HarnessTarget =
  | { ok: true; supabaseUrl: string; serviceKey: string; anonKey: string }
  | { ok: false; exitCode: 0 | 2; message: string };

/** Decide whether the harness may run. Pure: reads only its arguments. */
export function resolveHarnessTarget(
  argv: readonly string[],
  env: Record<string, string | undefined>,
): HarnessTarget {
  if (!argv.includes(LOCAL_LANE_FLAG)) {
    return {
      ok: false,
      exitCode: 0,
      message: `SKIP — pass ${LOCAL_LANE_FLAG} to run the disposable local write-denial harness.`,
    };
  }
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  for (const [name, value] of [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
    ["SUPABASE_ANON_KEY", anonKey],
  ] as const) {
    if (!value) return { ok: false, exitCode: 2, message: `missing ${name}` };
  }
  let hostname: string;
  try {
    hostname = new URL(supabaseUrl!).hostname;
  } catch {
    return { ok: false, exitCode: 2, message: "database API URL is invalid" };
  }
  if (!isLoopbackHost(hostname)) {
    return {
      ok: false,
      exitCode: 2,
      message: "local security lane requires a loopback database",
    };
  }
  return { ok: true, supabaseUrl: supabaseUrl!, serviceKey: serviceKey!, anonKey: anonKey! };
}

type Row = Record<string, unknown>;

const SUBSCRIPTION_COLUMNS =
  "user_id,paddle_subscription_id,paddle_customer_id,product_id,price_id,status,current_period_end,cancel_at_period_end,environment";
const FOUNDER_COLUMNS =
  "user_id,founder_number,status,display_name,show_on_wall,display_style,optional_link,milestone_status";

async function main(target: Extract<HarnessTarget, { ok: true }>) {
  const { supabaseUrl, serviceKey, anonKey } = target;
  const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };
  const admin = createClient(supabaseUrl, serviceKey, clientOptions);
  const tag = crypto.randomUUID().slice(0, 8);
  const emailA = `write-denial-a-${tag}@verdant.test`;
  const emailB = `write-denial-b-${tag}@verdant.test`;
  const passA = crypto.randomUUID();
  const passB = crypto.randomUUID();

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

  async function createUser(email: string, password: string): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    return data.user.id;
  }

  async function signedIn(email: string, password: string): Promise<SupabaseClient> {
    const client = createClient(supabaseUrl, anonKey, clientOptions);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signIn ${email}: ${error.message}`);
    return client;
  }

  async function readBack(table: string, columns: string, userIds: string[]): Promise<Row[]> {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .in("user_id", userIds)
      .order("user_id");
    if (error) throw new Error(`read-back ${table}: ${error.message}`);
    return (data ?? []) as unknown as Row[];
  }

  /** A write is denied when it errors or returns no affected rows. */
  function denied(result: { data: unknown; error: { code?: string; message: string } | null }) {
    return !!result.error || (Array.isArray(result.data) && result.data.length === 0);
  }
  function describe(result: { data: unknown; error: { code?: string; message: string } | null }) {
    return result.error
      ? `code=${result.error.code} msg=${result.error.message}`
      : `data=${JSON.stringify(result.data)}`;
  }

  console.log("→ seeding two auth.users via admin API (service_role)");
  const uidA = await createUser(emailA, passA);
  const uidB = await createUser(emailB, passB);
  const users = [uidA, uidB];

  // Three free founder numbers (A, B and a spare that must stay unclaimed), chosen from
  // the top so a populated replay never collides.
  const { data: taken, error: takenError } = await admin.from("founders").select("founder_number");
  if (takenError) throw new Error(`founder numbers: ${takenError.message}`);
  const used = new Set((taken ?? []).map((r: { founder_number: number }) => r.founder_number));
  const free = Array.from({ length: 100 }, (_, i) => 100 - i).filter((n) => !used.has(n));
  if (free.length < 3) throw new Error("fewer than 3 founder numbers free; cannot seed safely");
  const [numberA, numberB, numberSpare] = free;

  try {
    // Canceled, non-entitling seed rows: the attack is turning them into paid access.
    const { error: subSeedError } = await admin.from("subscriptions").insert([
      {
        user_id: uidA,
        paddle_subscription_id: `sub_write_denial_a_${tag}`,
        paddle_customer_id: `ctm_write_denial_a_${tag}`,
        product_id: "pro_monthly",
        price_id: "pro_monthly",
        status: "canceled",
        current_period_end: "2026-01-01T00:00:00Z",
        environment: "live",
      },
      {
        user_id: uidB,
        paddle_subscription_id: `sub_write_denial_b_${tag}`,
        paddle_customer_id: `ctm_write_denial_b_${tag}`,
        product_id: "pro_monthly",
        price_id: "pro_monthly",
        status: "canceled",
        current_period_end: "2026-01-01T00:00:00Z",
        environment: "live",
      },
    ]);
    if (subSeedError) throw new Error(`seed subscriptions: ${subSeedError.message}`);
    const { error: founderSeedError } = await admin.from("founders").insert([
      { user_id: uidA, founder_number: numberA, status: "refunded", display_name: "seed-a" },
      { user_id: uidB, founder_number: numberB, status: "refunded", display_name: "seed-b" },
    ]);
    if (founderSeedError) throw new Error(`seed founders: ${founderSeedError.message}`);

    const subsBefore = await readBack("subscriptions", SUBSCRIPTION_COLUMNS, users);
    const foundersBefore = await readBack("founders", FOUNDER_COLUMNS, users);

    console.log("→ signing in user A and user B; building an anonymous client");
    const a = await signedIn(emailA, passA);
    const anon = createClient(supabaseUrl, anonKey, clientOptions);

    console.log("→ public.subscriptions");
    {
      const own = await a.from("subscriptions").select("user_id");
      check(
        "S1. A SELECT → only A's row",
        !own.error && own.data?.length === 1 && own.data[0].user_id === uidA,
        describe(own),
      );
      const other = await a.from("subscriptions").select("user_id").eq("user_id", uidB);
      check(
        "S2. A SELECT B's row → 0 rows",
        !other.error && other.data?.length === 0,
        describe(other),
      );
      for (const [label, userId] of [
        ["own", uidA],
        ["B's", uidB],
      ] as const) {
        const insert = await a
          .from("subscriptions")
          .insert({
            user_id: userId,
            paddle_subscription_id: `lifetime_self_grant_${label}_${tag}`,
            paddle_customer_id: `ctm_self_grant_${tag}`,
            product_id: "founder_lifetime",
            price_id: "founder_lifetime",
            status: "active",
            environment: "live",
          })
          .select();
        check(
          `S3. A INSERT active founder_lifetime for ${label} user_id → rejected`,
          denied(insert),
          describe(insert),
        );
      }
      const update = await a
        .from("subscriptions")
        .update({
          status: "active",
          current_period_end: "2099-01-01T00:00:00Z",
          price_id: "pro_annual",
        })
        .eq("user_id", uidA)
        .select();
      check(
        "S4. A UPDATE own row to active → rejected or 0 rows",
        denied(update),
        describe(update),
      );
      const updateOther = await a
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("user_id", uidB)
        .select();
      check(
        "S5. A UPDATE B's row → rejected or 0 rows",
        denied(updateOther),
        describe(updateOther),
      );
      const upsert = await a
        .from("subscriptions")
        .upsert(
          {
            user_id: uidA,
            paddle_subscription_id: `sub_write_denial_a_${tag}`,
            paddle_customer_id: `ctm_write_denial_a_${tag}`,
            product_id: "pro_monthly",
            price_id: "pro_monthly",
            status: "active",
            current_period_end: "2099-01-01T00:00:00Z",
            environment: "live",
          },
          { onConflict: "paddle_subscription_id" },
        )
        .select();
      check("S6. A UPSERT own row to active → rejected", denied(upsert), describe(upsert));
      const del = await a.from("subscriptions").delete().eq("user_id", uidA).select();
      check("S7. A DELETE own row → rejected or 0 rows", denied(del), describe(del));
      const anonRead = await anon.from("subscriptions").select("user_id");
      check(
        "S8. anon SELECT → denied or 0 rows",
        !!anonRead.error || anonRead.data?.length === 0,
        describe(anonRead),
      );
      const anonInsert = await anon
        .from("subscriptions")
        .insert({
          user_id: uidA,
          paddle_subscription_id: `sub_anon_${tag}`,
          paddle_customer_id: `ctm_anon_${tag}`,
          product_id: "pro_monthly",
          price_id: "pro_monthly",
          status: "active",
          environment: "live",
        })
        .select();
      check("S9. anon INSERT → rejected", denied(anonInsert), describe(anonInsert));
      const anonUpdate = await anon
        .from("subscriptions")
        .update({ status: "active" })
        .eq("user_id", uidA)
        .select();
      check("S10. anon UPDATE → rejected or 0 rows", denied(anonUpdate), describe(anonUpdate));
      const anonDelete = await anon.from("subscriptions").delete().eq("user_id", uidA).select();
      check("S11. anon DELETE → rejected or 0 rows", denied(anonDelete), describe(anonDelete));
      const after = await readBack("subscriptions", SUBSCRIPTION_COLUMNS, users);
      check(
        "S12. both seeded rows unchanged (service_role read-back)",
        JSON.stringify(after) === JSON.stringify(subsBefore),
        `before=${JSON.stringify(subsBefore)} after=${JSON.stringify(after)}`,
      );
      const { count } = await admin
        .from("subscriptions")
        .select("*", { count: "exact", head: true })
        .in("user_id", users);
      check("S13. no extra subscription rows were created", count === 2, `count=${count}`);
    }

    console.log("→ public.founders");
    {
      const own = await a.from("founders").select("user_id");
      check(
        "F1. A SELECT → only A's row",
        !own.error && own.data?.length === 1 && own.data[0].user_id === uidA,
        describe(own),
      );
      const other = await a.from("founders").select("user_id").eq("user_id", uidB);
      check(
        "F2. A SELECT B's row → 0 rows",
        !other.error && other.data?.length === 0,
        describe(other),
      );
      for (const [label, userId] of [
        ["own", uidA],
        ["B's", uidB],
      ] as const) {
        const insert = await a
          .from("founders")
          .insert({ user_id: userId, founder_number: numberSpare, status: "confirmed" })
          .select();
        check(
          `F3. A INSERT confirmed founder for ${label} user_id → rejected`,
          denied(insert),
          describe(insert),
        );
      }
      const reinstate = await a
        .from("founders")
        .update({ status: "confirmed" })
        .eq("user_id", uidA)
        .select();
      check(
        "F4. A UPDATE own status refunded → confirmed → rejected or 0 rows",
        denied(reinstate),
        describe(reinstate),
      );
      const prefs = await a
        .from("founders")
        .update({ display_name: "self-edited", show_on_wall: true, display_style: "custom_name" })
        .eq("user_id", uidA)
        .select();
      check(
        "F5. A UPDATE own wall preferences directly → rejected or 0 rows",
        denied(prefs),
        describe(prefs),
      );
      const renumber = await a
        .from("founders")
        .update({ founder_number: 1 })
        .eq("user_id", uidA)
        .select();
      check(
        "F6. A UPDATE own founder_number → rejected or 0 rows",
        denied(renumber),
        describe(renumber),
      );
      const updateOther = await a
        .from("founders")
        .update({ status: "revoked" })
        .eq("user_id", uidB)
        .select();
      check(
        "F7. A UPDATE B's row → rejected or 0 rows",
        denied(updateOther),
        describe(updateOther),
      );
      const upsert = await a
        .from("founders")
        .upsert(
          { user_id: uidA, founder_number: numberA, status: "confirmed" },
          { onConflict: "user_id" },
        )
        .select();
      check("F8. A UPSERT own row to confirmed → rejected", denied(upsert), describe(upsert));
      const del = await a.from("founders").delete().eq("user_id", uidA).select();
      check("F9. A DELETE own row → rejected or 0 rows", denied(del), describe(del));
      const anonRead = await anon.from("founders").select("user_id");
      check(
        "F10. anon SELECT → denied or 0 rows",
        !!anonRead.error || anonRead.data?.length === 0,
        describe(anonRead),
      );
      const anonInsert = await anon
        .from("founders")
        .insert({ user_id: uidA, founder_number: numberSpare, status: "confirmed" })
        .select();
      check("F11. anon INSERT → rejected", denied(anonInsert), describe(anonInsert));
      const anonUpdate = await anon
        .from("founders")
        .update({ status: "confirmed" })
        .eq("user_id", uidA)
        .select();
      check("F12. anon UPDATE → rejected or 0 rows", denied(anonUpdate), describe(anonUpdate));
      const anonDelete = await anon.from("founders").delete().eq("user_id", uidA).select();
      check("F13. anon DELETE → rejected or 0 rows", denied(anonDelete), describe(anonDelete));
      const after = await readBack("founders", FOUNDER_COLUMNS, users);
      check(
        "F14. both seeded rows unchanged (service_role read-back)",
        JSON.stringify(after) === JSON.stringify(foundersBefore),
        `before=${JSON.stringify(foundersBefore)} after=${JSON.stringify(after)}`,
      );
      const { count } = await admin
        .from("founders")
        .select("*", { count: "exact", head: true })
        .eq("founder_number", numberSpare);
      check("F15. the spare founder number was never claimed", count === 0, `count=${count}`);
    }
  } finally {
    console.log("→ teardown: deleting seeded rows and auth.users");
    await admin.from("founders").delete().in("user_id", users);
    await admin.from("subscriptions").delete().in("user_id", users);
    await admin.auth.admin.deleteUser(uidA).catch(() => {});
    await admin.auth.admin.deleteUser(uidB).catch(() => {});
  }

  console.log(`\nresult: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = resolveHarnessTarget(process.argv.slice(2), process.env);
  if (!target.ok) {
    (target.exitCode === 0 ? console.log : console.error)(`[write-denial] ${target.message}`);
    process.exit(target.exitCode);
  }
  main(target)
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
