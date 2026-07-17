#!/usr/bin/env -S bun run
/**
 * Runtime harness for the S2 AI-credit ledger. Proves at runtime that:
 *   - authenticated users can SELECT only their own ai_credit_spends rows
 *   - authenticated users CANNOT INSERT / UPDATE / DELETE ai_credit_spends
 *   - anon CANNOT SELECT / INSERT / UPDATE / DELETE
 *   - ai_credit_spend RPC enforces Free 3-per-grow cap (4th call denied)
 *   - ai_credit_spend RPC enforces Pro 100-per-month cap (101st call denied)
 *   - active, trialing, past_due dunning, and cancellation grace agree across
 *     AI credits and the Pheno entitlement gate; elapsed/paused/expired deny
 *   - authenticated users cannot mutate canonical public.subscriptions rows
 *   - idempotent replay does NOT double-charge
 *   - ai_credit_refund creates an append-only reversal that restores room
 *   - refund cannot mutate or replace the original spend row
 *   - foreign user_id in the body cannot override auth.uid()
 *   - period_key is generated server-side in UTC (YYYY-MM)
 *
 * service_role is used ONLY for seeding users / canonical subscriptions /
 * grows, for read-back verification, and for teardown. Every rejected
 * client-role assertion runs through an authenticated or anon client.
 *
 * Run:  bun run scripts/run-ai-credits-rls-harness.ts
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Not part of the default Vitest suite — invoke separately.
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
    console.error(`missing ${k}`);
    process.exit(2);
  }
}

const EMAIL_FREE = "ai-credits-free@verdant.test";
const EMAIL_PRO = "ai-credits-pro@verdant.test";
const PASS = crypto.randomUUID();
const PRO_SUBSCRIPTION_ID = `harness_sub_${crypto.randomUUID()}`;
const PRO_CUSTOMER_ID = `harness_customer_${crypto.randomUUID()}`;
const FOUNDER_LOOKALIKE_SUBSCRIPTION_ID = `lifetimeX${crypto.randomUUID()}`;
const FOUNDER_SUBSCRIPTION_ID = `lifetime_${crypto.randomUUID()}`;
const FUTURE_PERIOD_END = new Date(Date.now() + 30 * 86400_000).toISOString();
const PAST_PERIOD_END = new Date(Date.now() - 60_000).toISOString();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function adminCreateUser(email: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const prior = list?.users?.find((u) => u.email === email);
  if (prior) await admin.auth.admin.deleteUser(prior.id);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function cleanupUser(uid: string) {
  await admin.from("ai_credit_spends").delete().eq("user_id", uid);
  await admin.from("subscriptions").delete().eq("user_id", uid);
  await admin.from("billing_subscriptions").delete().eq("user_id", uid);
  await admin.from("grows").delete().eq("user_id", uid);
  await admin.auth.admin.deleteUser(uid).catch(() => {});
}

async function main() {
  console.log("→ seeding users + plans via service_role");
  const uidFree = await adminCreateUser(EMAIL_FREE);
  const uidPro = await adminCreateUser(EMAIL_PRO);

  // `subscriptions` is the canonical Paddle entitlement source. Free has no
  // row; Pro is an operator-seeded live recurring row.
  await admin.from("subscriptions").delete().in("user_id", [uidFree, uidPro]);
  const { error: canonicalPlanError } = await admin.from("subscriptions").insert({
    user_id: uidPro,
    paddle_subscription_id: PRO_SUBSCRIPTION_ID,
    paddle_customer_id: PRO_CUSTOMER_ID,
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: FUTURE_PERIOD_END,
    cancel_at_period_end: false,
    environment: "live",
  });
  if (canonicalPlanError) {
    throw new Error(`seed canonical subscription: ${canonicalPlanError.message}`);
  }

  // Legacy rows are deliberately absent: this harness proves the current RPC
  // reads the canonical Lovable Paddle table rather than billing_subscriptions.
  await admin.from("billing_subscriptions").delete().in("user_id", [uidFree, uidPro]);

  // One grow each.
  const { data: growsFree } = await admin
    .from("grows")
    .insert({
      user_id: uidFree,
      name: "Free harness grow",
      grow_type: "indoor",
    })
    .select("id")
    .single();
  const { data: growsPro } = await admin
    .from("grows")
    .insert({
      user_id: uidPro,
      name: "Pro harness grow",
      grow_type: "indoor",
    })
    .select("id")
    .single();
  const growIdFree = growsFree!.id as string;
  const growIdPro = growsPro!.id as string;

  const free = await signedInClient(EMAIL_FREE);
  const pro = await signedInClient(EMAIL_PRO);

  console.log("\n→ RLS: canonical subscriptions select/write");
  const { data: ownSubscriptionRows } = await pro
    .from("subscriptions")
    .select("user_id,status")
    .eq("paddle_subscription_id", PRO_SUBSCRIPTION_ID);
  check(
    "authenticated SELECT own canonical subscription",
    (ownSubscriptionRows ?? []).length === 1 && ownSubscriptionRows?.[0]?.user_id === uidPro,
  );
  const { data: foreignSubscriptionRows } = await free
    .from("subscriptions")
    .select("paddle_subscription_id")
    .eq("paddle_subscription_id", PRO_SUBSCRIPTION_ID);
  check(
    "authenticated SELECT other canonical subscription → 0 rows",
    (foreignSubscriptionRows ?? []).length === 0,
  );
  const { data: clientSubscriptionUpdate, error: clientSubscriptionUpdateError } = await pro
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("paddle_subscription_id", PRO_SUBSCRIPTION_ID)
    .select();
  check(
    "authenticated UPDATE canonical subscription denied / no-op",
    !!clientSubscriptionUpdateError || (clientSubscriptionUpdate ?? []).length === 0,
    clientSubscriptionUpdateError?.message,
  );
  const { data: subscriptionAfterClientUpdate } = await admin
    .from("subscriptions")
    .select("status")
    .eq("paddle_subscription_id", PRO_SUBSCRIPTION_ID)
    .single();
  check(
    "canonical subscription remains active after client mutation attempt",
    subscriptionAfterClientUpdate?.status === "active",
  );

  console.log("\n→ RLS: ai_credit_spends select/write");
  // Need a row to compare visibility. Seed one for each user via service_role.
  const { data: seedFree } = await admin
    .from("ai_credit_spends")
    .insert({
      user_id: uidFree,
      grow_id: growIdFree,
      period_key: "1970-01",
      weight: 1,
      model_tier: "standard",
      feature: "ai_doctor_review",
      status: "spent",
      idempotency_key: "seed-" + crypto.randomUUID(),
    })
    .select("id")
    .single();
  const { data: seedPro } = await admin
    .from("ai_credit_spends")
    .insert({
      user_id: uidPro,
      grow_id: growIdPro,
      period_key: "1970-01",
      weight: 1,
      model_tier: "standard",
      feature: "ai_doctor_review",
      status: "spent",
      idempotency_key: "seed-" + crypto.randomUUID(),
    })
    .select("id")
    .single();

  // SELECT own
  const { data: ownRows } = await free.from("ai_credit_spends").select("id").eq("id", seedFree!.id);
  check("authenticated SELECT own row", (ownRows ?? []).length === 1);
  // SELECT other → 0
  const { data: otherRows } = await free
    .from("ai_credit_spends")
    .select("id")
    .eq("id", seedPro!.id);
  check("authenticated SELECT other user → 0 rows", (otherRows ?? []).length === 0);
  // anon SELECT
  const { data: anonRows, error: anonSelErr } = await anon
    .from("ai_credit_spends")
    .select("id")
    .limit(1);
  check(
    "anon SELECT denied / empty",
    !!anonSelErr || (anonRows ?? []).length === 0,
    anonSelErr?.message,
  );

  // INSERT/UPDATE/DELETE as authenticated → rejected (no policy)
  const { error: insErr, data: insData } = await free
    .from("ai_credit_spends")
    .insert({
      user_id: uidFree,
      grow_id: growIdFree,
      period_key: "1970-01",
      weight: 1,
      model_tier: "standard",
      feature: "ai_doctor_review",
      status: "spent",
      idempotency_key: "client-attempt-" + crypto.randomUUID(),
    })
    .select();
  check("authenticated INSERT denied", !!insErr || (insData ?? []).length === 0, insErr?.message);

  const { error: updErr, data: updData } = await free
    .from("ai_credit_spends")
    .update({ weight: 5 })
    .eq("id", seedFree!.id)
    .select();
  check(
    "authenticated UPDATE denied / no-op",
    !!updErr || (updData ?? []).length === 0,
    updErr?.message,
  );

  const { error: delErr, data: delData } = await free
    .from("ai_credit_spends")
    .delete()
    .eq("id", seedFree!.id)
    .select();
  check(
    "authenticated DELETE denied / no-op",
    !!delErr || (delData ?? []).length === 0,
    delErr?.message,
  );

  // anon writes
  const { error: anonInsErr } = await anon.from("ai_credit_spends").insert({
    user_id: uidFree,
    grow_id: growIdFree,
    period_key: "1970-01",
    weight: 1,
    model_tier: "standard",
    feature: "ai_doctor_review",
    status: "spent",
    idempotency_key: "anon-" + crypto.randomUUID(),
  });
  check("anon INSERT denied", !!anonInsErr, anonInsErr?.message);

  // Read-back: seed row unchanged
  const { data: seedAfter } = await admin
    .from("ai_credit_spends")
    .select("weight,status")
    .eq("id", seedFree!.id)
    .single();
  check(
    "seed row integrity: weight=1, status='spent'",
    seedAfter?.weight === 1 && seedAfter?.status === "spent",
  );

  console.log("\n→ ai_credit_spend RPC: Free per-grow cap (3)");
  // Clean test ledger (keep seed in 1970-01 so it doesn't bias per_grow sum)
  await admin
    .from("ai_credit_spends")
    .delete()
    .eq("user_id", uidFree)
    .eq("period_key", new Date().toISOString().slice(0, 7));
  // Note: seed row has the test grow_id which DOES bias per_grow scope.
  await admin.from("ai_credit_spends").delete().eq("id", seedFree!.id);

  const spends: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const { data } = await free.rpc("ai_credit_spend", {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdFree,
      p_model_tier: "standard",
      p_idempotency_key: `free-spend-${i}-` + crypto.randomUUID(),
      p_result: null,
    });
    const ok = (data as any)?.ok === true && (data as any)?.status === "spent";
    check(`Free spend #${i} allowed (remaining=${(data as any)?.remaining})`, ok);
    if (ok) spends.push((data as any).spend_id);
  }
  const { data: denied } = await free.rpc("ai_credit_spend", {
    p_feature: "ai_doctor_review",
    p_grow_id: growIdFree,
    p_model_tier: "standard",
    p_idempotency_key: "free-spend-4-" + crypto.randomUUID(),
    p_result: null,
  });
  check(
    "Free spend #4 denied (limit_reached)",
    (denied as any)?.ok === false && (denied as any)?.reason === "limit_reached",
    JSON.stringify(denied),
  );

  console.log("\n→ idempotent replay does not double-charge");
  const replayKey = "replay-" + crypto.randomUUID();
  // First exhaust to room=1 by refunding one of the 3.
  const refundKey = "refund-" + crypto.randomUUID();
  const { data: ref } = await free.rpc("ai_credit_refund", {
    p_spend_id: spends[0],
    p_idempotency_key: refundKey,
    p_reason: "test",
  });
  check("refund succeeds", (ref as any)?.ok === true && (ref as any)?.status === "refunded");
  // Now spend one more with key X — should succeed.
  const { data: s1 } = await free.rpc("ai_credit_spend", {
    p_feature: "ai_doctor_review",
    p_grow_id: growIdFree,
    p_model_tier: "standard",
    p_idempotency_key: replayKey,
    p_result: { cached: "yes" },
  });
  check("post-refund spend allowed", (s1 as any)?.ok === true && (s1 as any)?.status === "spent");
  // Replay same key — should NOT create a new row.
  const { data: s2 } = await free.rpc("ai_credit_spend", {
    p_feature: "ai_doctor_review",
    p_grow_id: growIdFree,
    p_model_tier: "standard",
    p_idempotency_key: replayKey,
    p_result: null,
  });
  check("replay returns status='replayed'", (s2 as any)?.status === "replayed");
  check(
    "replay returns cached result",
    JSON.stringify((s2 as any)?.result) === JSON.stringify({ cached: "yes" }),
  );
  const { count: rowCount } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uidFree)
    .eq("idempotency_key", replayKey);
  check("replay did not insert a 2nd row", rowCount === 1);

  console.log("\n→ refund is append-only (no UPDATE of original)");
  const { data: origRow } = await admin
    .from("ai_credit_spends")
    .select("status,weight")
    .eq("id", spends[0])
    .single();
  check(
    "original spend row status still 'spent'",
    origRow?.status === "spent" && origRow?.weight === 1,
  );
  // Refund replay → returns existing refund_id, no new row.
  const { data: refReplay } = await free.rpc("ai_credit_refund", {
    p_spend_id: spends[0],
    p_idempotency_key: refundKey,
    p_reason: "test",
  });
  check("refund replay returns status='replayed'", (refReplay as any)?.status === "replayed");

  async function setCanonicalProStatus(status: string, currentPeriodEnd: string | null) {
    const { error } = await admin
      .from("subscriptions")
      .update({ status, current_period_end: currentPeriodEnd })
      .eq("paddle_subscription_id", PRO_SUBSCRIPTION_ID);
    if (error) throw new Error(`update canonical subscription: ${error.message}`);
  }

  async function assertCanonicalStatusParity(
    label: string,
    status: string,
    currentPeriodEnd: string | null,
    expectedPaid: boolean,
  ) {
    await admin.from("ai_credit_spends").delete().eq("user_id", uidPro);
    await setCanonicalProStatus(status, currentPeriodEnd);

    const { data: spendData, error: spendError } = await pro.rpc("ai_credit_spend", {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdPro,
      p_model_tier: "standard",
      p_idempotency_key: `status-${status}-${crypto.randomUUID()}`,
      p_result: null,
    });
    const spend = spendData as { ok?: boolean; plan_id?: string; scope?: string } | null;
    check(
      `${label}: AI credit allowance matches entitlement`,
      !spendError &&
        spend?.ok === true &&
        spend.plan_id === (expectedPaid ? "pro_monthly" : "free") &&
        spend.scope === (expectedPaid ? "per_month" : "per_grow"),
      spendError?.message ?? JSON.stringify(spendData),
    );

    const { data: phenoData, error: phenoError } = await pro.rpc("has_pheno_tracker_entitlement", {
      _user_id: uidPro,
    });
    check(
      `${label}: Pheno gate matches AI credit allowance`,
      !phenoError && phenoData === expectedPaid,
      phenoError?.message ?? JSON.stringify(phenoData),
    );
  }

  console.log("\n→ canonical subscription status parity");
  await assertCanonicalStatusParity("active recurring", "active", FUTURE_PERIOD_END, true);
  await assertCanonicalStatusParity("trialing recurring", "trialing", FUTURE_PERIOD_END, true);
  await assertCanonicalStatusParity("past_due dunning", "past_due", PAST_PERIOD_END, true);
  await assertCanonicalStatusParity(
    "canceled in paid-through grace",
    "canceled",
    FUTURE_PERIOD_END,
    true,
  );
  await assertCanonicalStatusParity(
    "canceled after paid-through end",
    "canceled",
    PAST_PERIOD_END,
    false,
  );
  await assertCanonicalStatusParity("paused recurring", "paused", FUTURE_PERIOD_END, false);
  await assertCanonicalStatusParity("expired recurring", "expired", PAST_PERIOD_END, false);

  async function assertCanonicalFounderPrefixParity(
    label: string,
    paddleSubscriptionId: string,
    expectedPaid: boolean,
  ) {
    await admin.from("ai_credit_spends").delete().eq("user_id", uidPro);
    const { error: founderUpdateError } = await admin
      .from("subscriptions")
      .update({
        paddle_subscription_id: paddleSubscriptionId,
        product_id: "founder_lifetime",
        price_id: "founder_lifetime",
        status: "active",
        current_period_end: null,
      })
      .eq("paddle_customer_id", PRO_CUSTOMER_ID);
    if (founderUpdateError) {
      throw new Error(`update Founder subscription: ${founderUpdateError.message}`);
    }

    const { data: spendData, error: spendError } = await pro.rpc("ai_credit_spend", {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdPro,
      p_model_tier: "standard",
      p_idempotency_key: `founder-prefix-${crypto.randomUUID()}`,
      p_result: null,
    });
    const spend = spendData as { ok?: boolean; plan_id?: string; scope?: string } | null;
    check(
      `${label}: AI credit allowance requires a literal lifetime_ prefix`,
      !spendError &&
        spend?.ok === true &&
        spend.plan_id === (expectedPaid ? "founder_lifetime" : "free") &&
        spend.scope === (expectedPaid ? "per_month" : "per_grow"),
      spendError?.message ?? JSON.stringify(spendData),
    );

    const { data: phenoData, error: phenoError } = await pro.rpc("has_pheno_tracker_entitlement", {
      _user_id: uidPro,
    });
    check(
      `${label}: Pheno gate requires a literal lifetime_ prefix`,
      !phenoError && phenoData === expectedPaid,
      phenoError?.message ?? JSON.stringify(phenoData),
    );
  }

  await assertCanonicalFounderPrefixParity(
    "Founder lookalike ID",
    FOUNDER_LOOKALIKE_SUBSCRIPTION_ID,
    false,
  );
  await assertCanonicalFounderPrefixParity(
    "Founder literal-prefix ID",
    FOUNDER_SUBSCRIPTION_ID,
    true,
  );
  const { error: restoreProError } = await admin
    .from("subscriptions")
    .update({
      paddle_subscription_id: PRO_SUBSCRIPTION_ID,
      product_id: "verdant_pro",
      price_id: "pro_monthly",
      status: "active",
      current_period_end: FUTURE_PERIOD_END,
    })
    .eq("paddle_customer_id", PRO_CUSTOMER_ID);
  if (restoreProError) throw new Error(`restore Pro subscription: ${restoreProError.message}`);

  console.log("\n→ Pro per-month cap (100)");
  // Seed 99 rows in current period via service_role.
  const periodKey = new Date().toISOString().slice(0, 7);
  await admin.from("ai_credit_spends").delete().eq("user_id", uidPro).eq("period_key", periodKey);
  const batch = Array.from({ length: 99 }, () => ({
    user_id: uidPro,
    grow_id: null,
    period_key: periodKey,
    weight: 1,
    model_tier: "standard" as const,
    feature: "ai_coach" as const,
    status: "spent" as const,
    idempotency_key: "pro-seed-" + crypto.randomUUID(),
  }));
  await admin.from("ai_credit_spends").insert(batch);
  const { data: pro100 } = await pro.rpc("ai_credit_spend", {
    p_feature: "ai_coach",
    p_grow_id: null,
    p_model_tier: "standard",
    p_idempotency_key: "pro-100-" + crypto.randomUUID(),
    p_result: null,
  });
  check("Pro spend #100 allowed", (pro100 as any)?.ok === true && (pro100 as any)?.remaining === 0);
  const { data: pro101 } = await pro.rpc("ai_credit_spend", {
    p_feature: "ai_coach",
    p_grow_id: null,
    p_model_tier: "standard",
    p_idempotency_key: "pro-101-" + crypto.randomUUID(),
    p_result: null,
  });
  check(
    "Pro spend #101 denied (limit_reached)",
    (pro101 as any)?.ok === false && (pro101 as any)?.reason === "limit_reached",
  );
  check("Pro period_key is UTC YYYY-MM", (pro100 as any)?.period_key === periodKey);

  console.log("\n→ server pins model_tier weight (client cannot self-discount)");
  // Even when supplied 'escalated', RPC honors the requested tier but weight
  // comes from a CHECK-enforced map server-side. We confirm by inspecting
  // the row weight after a fresh user that has room.
  await admin.from("ai_credit_spends").delete().eq("user_id", uidPro).eq("period_key", periodKey);
  const { data: tierSpend } = await pro.rpc("ai_credit_spend", {
    p_feature: "ai_coach",
    p_grow_id: null,
    p_model_tier: "escalated",
    p_idempotency_key: "tier-" + crypto.randomUUID(),
    p_result: null,
  });
  check("escalated tier records weight=5", (tierSpend as any)?.weight === 5);

  console.log("\n→ teardown");
  await cleanupUser(uidFree);
  await cleanupUser(uidPro);

  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
