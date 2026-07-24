#!/usr/bin/env -S bun run
/**
 * Runtime harness for the S2 AI-credit ledger. Proves at runtime that:
 *   - authenticated users can SELECT only their own ai_credit_spends rows
 *   - authenticated users CANNOT INSERT / UPDATE / DELETE ai_credit_spends
 *   - anon CANNOT SELECT / INSERT / UPDATE / DELETE
 *   - authenticated clients cannot invoke server-only spend/refund RPCs
 *   - contract phase proves the retired legacy overloads are also denied
 *   - service-authoritative ai_credit_spend enforces Free 3-per-grow and Pro
 *     100-per-month caps
 *   - a live server ignores sandbox-only rows; a sandbox server honors them;
 *     a valid live row outranks a sandbox row
 *   - active, trialing, past_due dunning, and cancellation grace agree across
 *     AI credits and the Pheno entitlement gate; elapsed/paused/expired deny
 *   - authenticated users cannot mutate canonical public.subscriptions rows
 *   - valid same-context idempotent replays do NOT double-charge, while
 *     cross-feature/grow/model/environment key reuse fails closed
 *   - validated results are attached once through a service-only RPC, remain
 *     private/immutable, and are returned on same-key replay
 *   - refunds suppress cached results so a reversed spend cannot replay output
 *   - server-authoritative ai_credit_refund creates an append-only reversal
 *     that restores room
 *   - refund cannot mutate or replace the original spend row
 *   - an authenticated client cannot spoof user_id or billing environment
 *   - period_key is generated server-side in UTC (YYYY-MM)
 *
 * service_role is used for setup/teardown/read-back and to exercise the
 * service-only spend/refund overloads. Every rejected client-role assertion
 * runs through an authenticated or anon client.
 *
 * Run expand verification:
 *   AI_CREDIT_ROLLOUT_PHASE=expand bun run scripts/run-ai-credits-rls-harness.ts
 * Run final contract verification (default):
 *   bun run scripts/run-ai-credits-rls-harness.ts
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
const rolloutPhase = process.env.AI_CREDIT_ROLLOUT_PHASE ?? "contract";
if (rolloutPhase !== "expand" && rolloutPhase !== "contract") {
  console.error("AI_CREDIT_ROLLOUT_PHASE must be 'expand' or 'contract'");
  process.exit(2);
}
const isContractPhase = rolloutPhase === "contract";
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
const EMAIL_RESULT_CASCADE = "ai-credit-result-cascade@verdant.test";
const PASS = crypto.randomUUID();
const PRO_SUBSCRIPTION_ID = `harness_sub_${crypto.randomUUID()}`;
const LIVE_PRECEDENCE_SUBSCRIPTION_ID = `harness_live_${crypto.randomUUID()}`;
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

type ServerSpendArgs = {
  p_feature: "ai_doctor_review" | "ai_coach";
  p_grow_id: string | null;
  p_model_tier: "standard" | "escalated";
  p_idempotency_key: string;
  p_result: unknown;
};

function serverSpend(
  userId: string,
  billingEnvironment: "live" | "sandbox",
  args: ServerSpendArgs,
) {
  return admin.rpc("ai_credit_spend", {
    p_user_id: userId,
    p_billing_environment: billingEnvironment,
    ...args,
  });
}

function serverRefund(
  expectedUserId: string,
  spendId: string,
  idempotencyKey: string,
  reason: string,
) {
  return admin.rpc("ai_credit_refund", {
    p_expected_user_id: expectedUserId,
    p_spend_id: spendId,
    p_idempotency_key: idempotencyKey,
    p_reason: reason,
  });
}

function serverAttachResult(
  expectedUserId: string,
  spendId: string,
  expectedFeature: "ai_doctor_review" | "ai_coach" | null,
  result: unknown,
) {
  return admin.rpc("ai_credit_attach_result", {
    p_expected_user_id: expectedUserId,
    p_spend_id: spendId,
    p_expected_feature: expectedFeature,
    p_result: result,
  });
}

async function main() {
  console.log(`AI credit rollout phase: ${rolloutPhase}`);
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

  // Primary grows plus a second owned Free grow for replay-binding proof.
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
  const { data: growsFreeOther } = await admin
    .from("grows")
    .insert({
      user_id: uidFree,
      name: "Free replay conflict grow",
      grow_type: "indoor",
    })
    .select("id")
    .single();
  const growIdFree = growsFree!.id as string;
  const growIdFreeOther = growsFreeOther!.id as string;
  const growIdPro = growsPro!.id as string;

  const free = await signedInClient(EMAIL_FREE);
  const pro = await signedInClient(EMAIL_PRO);

  console.log("\n→ server-only AI credit boundary");
  const { data: spoofedSpend, error: spoofedSpendError } = await free.rpc("ai_credit_spend", {
    p_user_id: uidPro,
    p_billing_environment: "sandbox",
    p_feature: "ai_doctor_review",
    p_grow_id: growIdPro,
    p_model_tier: "standard",
    p_idempotency_key: `client-spoof-${crypto.randomUUID()}`,
    p_result: null,
  });
  check(
    "authenticated client cannot spoof user or billing environment",
    !!spoofedSpendError || (spoofedSpend as any)?.reason === "not_authorized",
    spoofedSpendError?.message ?? JSON.stringify(spoofedSpend),
  );
  const deniedAttachArgs = {
    p_expected_user_id: uidFree,
    p_spend_id: crypto.randomUUID(),
    p_expected_feature: "ai_doctor_review",
    p_result: { summary: "must stay server-only" },
  };
  const { data: ownerAttach, error: ownerAttachError } = await free.rpc(
    "ai_credit_attach_result",
    deniedAttachArgs,
  );
  check(
    "authenticated client cannot invoke result recorder",
    !!ownerAttachError || (ownerAttach as any)?.reason === "not_authorized",
    ownerAttachError?.message ?? JSON.stringify(ownerAttach),
  );
  const { data: anonAttach, error: anonAttachError } = await anon.rpc(
    "ai_credit_attach_result",
    deniedAttachArgs,
  );
  check(
    "anon cannot invoke result recorder",
    !!anonAttachError || (anonAttach as any)?.reason === "not_authorized",
    anonAttachError?.message ?? JSON.stringify(anonAttach),
  );
  if (isContractPhase) {
    const { data: legacySpend, error: legacySpendError } = await free.rpc("ai_credit_spend", {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdFree,
      p_model_tier: "standard",
      p_idempotency_key: `legacy-client-spend-${crypto.randomUUID()}`,
      p_result: null,
    });
    check(
      "contract: authenticated client cannot invoke legacy five-argument spend",
      !!legacySpendError || (legacySpend as any)?.reason === "not_authorized",
      legacySpendError?.message ?? JSON.stringify(legacySpend),
    );
  } else {
    const legacyKey = `expand-legacy-spend-${crypto.randomUUID()}`;
    const { data: legacySpend, error: legacySpendError } = await pro.rpc("ai_credit_spend", {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdPro,
      p_model_tier: "standard",
      p_idempotency_key: legacyKey,
      p_result: null,
    });
    const legacySpendResult = legacySpend as { status?: string; spend_id?: string } | null;
    check(
      "expand: legacy authenticated spend remains available for rollback safety",
      !legacySpendError &&
        legacySpendResult?.status === "spent" &&
        typeof legacySpendResult.spend_id === "string",
      legacySpendError?.message ?? JSON.stringify(legacySpend),
    );
    const { data: legacyRefund, error: legacyRefundError } = await pro.rpc("ai_credit_refund", {
      p_spend_id: legacySpendResult?.spend_id ?? crypto.randomUUID(),
      p_idempotency_key: `expand-legacy-refund-${crypto.randomUUID()}`,
      p_reason: "expand_compatibility_probe",
    });
    check(
      "expand: legacy authenticated refund remains available for rollback safety",
      !legacyRefundError && (legacyRefund as { status?: string } | null)?.status === "refunded",
      legacyRefundError?.message ?? JSON.stringify(legacyRefund),
    );
  }

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

  console.log("\n→ server billing-environment resolution");
  const { error: sandboxMoveError } = await admin
    .from("subscriptions")
    .update({ environment: "sandbox" })
    .eq("paddle_subscription_id", PRO_SUBSCRIPTION_ID);
  if (sandboxMoveError) throw new Error(`move Pro row to sandbox: ${sandboxMoveError.message}`);

  await admin.from("ai_credit_spends").delete().eq("user_id", uidPro);
  const { data: liveServerAgainstSandbox, error: liveServerAgainstSandboxError } =
    await serverSpend(uidPro, "live", {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdPro,
      p_model_tier: "standard",
      p_idempotency_key: `live-ignores-sandbox-${crypto.randomUUID()}`,
      p_result: null,
    });
  check(
    "live server ignores sandbox-only paid row",
    !liveServerAgainstSandboxError &&
      (liveServerAgainstSandbox as any)?.plan_id === "free" &&
      (liveServerAgainstSandbox as any)?.scope === "per_grow",
    liveServerAgainstSandboxError?.message ?? JSON.stringify(liveServerAgainstSandbox),
  );

  await admin.from("ai_credit_spends").delete().eq("user_id", uidPro);
  const { data: sandboxServerPaid, error: sandboxServerPaidError } = await serverSpend(
    uidPro,
    "sandbox",
    {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdPro,
      p_model_tier: "standard",
      p_idempotency_key: `sandbox-honors-sandbox-${crypto.randomUUID()}`,
      p_result: null,
    },
  );
  check(
    "sandbox server honors valid sandbox Pro row",
    !sandboxServerPaidError &&
      (sandboxServerPaid as any)?.plan_id === "pro_monthly" &&
      (sandboxServerPaid as any)?.scope === "per_month",
    sandboxServerPaidError?.message ?? JSON.stringify(sandboxServerPaid),
  );

  await admin.from("ai_credit_spends").delete().eq("user_id", uidPro);
  const { error: livePrecedenceInsertError } = await admin.from("subscriptions").insert({
    user_id: uidPro,
    paddle_subscription_id: LIVE_PRECEDENCE_SUBSCRIPTION_ID,
    paddle_customer_id: `${PRO_CUSTOMER_ID}_live`,
    product_id: "verdant_pro",
    price_id: "pro_annual",
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: FUTURE_PERIOD_END,
    cancel_at_period_end: false,
    environment: "live",
  });
  if (livePrecedenceInsertError) {
    throw new Error(`seed live precedence row: ${livePrecedenceInsertError.message}`);
  }
  const { data: precedenceSpend, error: precedenceSpendError } = await serverSpend(
    uidPro,
    "sandbox",
    {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdPro,
      p_model_tier: "standard",
      p_idempotency_key: `live-precedence-${crypto.randomUUID()}`,
      p_result: null,
    },
  );
  const { data: precedenceLedger } = await admin
    .from("ai_credit_spends")
    .select("meta")
    .eq("id", (precedenceSpend as any)?.spend_id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  check(
    "valid live paid row outranks sandbox row on a sandbox server",
    !precedenceSpendError &&
      (precedenceSpend as any)?.plan_id === "pro_annual" &&
      (precedenceLedger?.meta as any)?.entitlement_environment === "live",
    precedenceSpendError?.message ?? JSON.stringify({ precedenceSpend, precedenceLedger }),
  );

  await admin
    .from("subscriptions")
    .delete()
    .eq("paddle_subscription_id", LIVE_PRECEDENCE_SUBSCRIPTION_ID);
  const { error: liveRestoreError } = await admin
    .from("subscriptions")
    .update({ environment: "live" })
    .eq("paddle_subscription_id", PRO_SUBSCRIPTION_ID);
  if (liveRestoreError) throw new Error(`restore Pro row to live: ${liveRestoreError.message}`);
  await admin.from("ai_credit_spends").delete().eq("user_id", uidPro);

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

  console.log("\n→ RLS: ai_credit_spend_results stays private and insert-once");
  const { data: ownerResultInsert, error: ownerResultInsertError } = await free
    .from("ai_credit_spend_results")
    .insert({
      spend_id: seedFree!.id,
      feature: "ai_doctor_review",
      result: { summary: "client must not persist this" },
    })
    .select();
  check(
    "authenticated result-cache INSERT denied",
    !!ownerResultInsertError || (ownerResultInsert ?? []).length === 0,
    ownerResultInsertError?.message,
  );
  const { data: serviceResultInsert, error: serviceResultInsertError } = await admin
    .from("ai_credit_spend_results")
    .insert({
      spend_id: seedPro!.id,
      feature: "ai_doctor_review",
      result: { summary: "direct service insert must be denied" },
    })
    .select();
  check(
    "service role cannot INSERT a result directly",
    !!serviceResultInsertError || (serviceResultInsert ?? []).length === 0,
    serviceResultInsertError?.message,
  );
  const inlineResultRpcKey = `inline-rpc-${crypto.randomUUID()}`;
  const { data: inlineResultRpc, error: inlineResultRpcError } = await serverSpend(
    uidFree,
    "live",
    {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdFree,
      p_model_tier: "standard",
      p_idempotency_key: inlineResultRpcKey,
      p_result: { summary: "inline cache must be rejected" },
    },
  );
  const inlineResultRpcObj = inlineResultRpc as { ok?: boolean; reason?: string } | null;
  check(
    "spend RPC rejects inline cached result",
    !inlineResultRpcError &&
      inlineResultRpcObj?.ok === false &&
      inlineResultRpcObj.reason === "inline_result_not_allowed",
    inlineResultRpcError?.message ?? JSON.stringify(inlineResultRpc),
  );
  const { count: inlineResultRpcRows } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uidFree)
    .eq("idempotency_key", inlineResultRpcKey);
  check("rejected inline RPC result appends no spend", inlineResultRpcRows === 0);

  const directInlineKey = `inline-direct-${crypto.randomUUID()}`;
  const { error: directInlineError } = await admin.from("ai_credit_spends").insert({
    user_id: uidFree,
    grow_id: growIdFree,
    period_key: "1970-01",
    weight: 1,
    model_tier: "standard",
    feature: "ai_doctor_review",
    status: "spent",
    idempotency_key: directInlineKey,
    result: { summary: "constraint must reject this" },
  });
  check(
    "ledger constraint rejects direct inline cached result",
    !!directInlineError,
    directInlineError?.message,
  );
  const { count: directInlineRows } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uidFree)
    .eq("idempotency_key", directInlineKey);
  check("rejected direct inline result appends no spend", directInlineRows === 0);

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
    const { data } = await serverSpend(uidFree, "live", {
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
  const { data: denied } = await serverSpend(uidFree, "live", {
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
  // An authenticated owner cannot manufacture a refund through either RPC
  // shape. The edge-only server path performs the real reversal afterward.
  const refundKey = "refund-" + crypto.randomUUID();
  if (isContractPhase) {
    const { data: ownerLegacyRefund, error: ownerLegacyRefundError } = await free.rpc(
      "ai_credit_refund",
      {
        p_spend_id: spends[0],
        p_idempotency_key: `owner-legacy-refund-${crypto.randomUUID()}`,
        p_reason: "test",
      },
    );
    check(
      "contract: authenticated owner cannot invoke legacy refund",
      !!ownerLegacyRefundError || (ownerLegacyRefund as any)?.reason === "not_authorized",
      ownerLegacyRefundError?.message ?? JSON.stringify(ownerLegacyRefund),
    );
  } else {
    console.log("  - expand: legacy refund denial intentionally deferred to contract release");
  }
  const { data: ownerServerRefund, error: ownerServerRefundError } = await free.rpc(
    "ai_credit_refund",
    {
      p_expected_user_id: uidFree,
      p_spend_id: spends[0],
      p_idempotency_key: `owner-server-refund-${crypto.randomUUID()}`,
      p_reason: "test",
    },
  );
  check(
    "authenticated owner cannot invoke service-only refund overload",
    !!ownerServerRefundError || (ownerServerRefund as any)?.reason === "not_authorized",
    ownerServerRefundError?.message ?? JSON.stringify(ownerServerRefund),
  );
  const { count: clientRefundCount } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("refund_of", spends[0]);
  check("client service-overload refund denial appends no reversal", clientRefundCount === 0);

  const { data: ref } = await serverRefund(
    uidFree,
    spends[0],
    refundKey,
    "upstream_failure_harness",
  );
  check("server refund succeeds", (ref as any)?.ok === true && (ref as any)?.status === "refunded");
  const { data: reversalRow } = await admin
    .from("ai_credit_spends")
    .select("user_id,status,weight,refund_of")
    .eq("id", (ref as any)?.refund_id)
    .single();
  check(
    "server refund appends an owned negative-weight reversal",
    reversalRow?.user_id === uidFree &&
      reversalRow?.status === "refunded" &&
      reversalRow?.weight === -1 &&
      reversalRow?.refund_of === spends[0],
    JSON.stringify(reversalRow),
  );
  // Now spend one more with a production-shaped result=null key, attach the
  // validated output, and prove a same-key retry returns that output without
  // changing the financial row.
  const { data: s1 } = await serverSpend(uidFree, "live", {
    p_feature: "ai_doctor_review",
    p_grow_id: growIdFree,
    p_model_tier: "standard",
    p_idempotency_key: replayKey,
    p_result: null,
  });
  check("post-refund spend allowed", (s1 as any)?.ok === true && (s1 as any)?.status === "spent");
  check(
    "fresh spend returns a parseable spend_created_at",
    typeof (s1 as any)?.spend_created_at === "string" &&
      !Number.isNaN(Date.parse((s1 as any).spend_created_at)),
    JSON.stringify(s1),
  );
  check(
    "fresh spend returns bound grow_id and zero database age",
    (s1 as any)?.grow_id === growIdFree && (s1 as any)?.spend_age_ms === 0,
    JSON.stringify(s1),
  );
  const replaySpendId = (s1 as any)?.spend_id as string;
  const { data: otherUserSameKey, error: otherUserSameKeyError } = await serverSpend(
    uidPro,
    "live",
    {
      p_feature: "ai_doctor_review",
      p_grow_id: growIdPro,
      p_model_tier: "standard",
      p_idempotency_key: replayKey,
      p_result: null,
    },
  );
  const otherUserSameKeyObj = otherUserSameKey as {
    ok?: boolean;
    status?: string;
    spend_id?: string;
  } | null;
  check(
    "same idempotency key remains isolated between users",
    !otherUserSameKeyError &&
      otherUserSameKeyObj?.ok === true &&
      otherUserSameKeyObj.status === "spent" &&
      otherUserSameKeyObj.spend_id !== replaySpendId,
    otherUserSameKeyError?.message ?? JSON.stringify(otherUserSameKey),
  );
  const { data: sameKeyOwners } = await admin
    .from("ai_credit_spends")
    .select("user_id")
    .eq("idempotency_key", replayKey);
  check(
    "same-key isolation stores one spend per owning user",
    (sameKeyOwners ?? []).length === 2 &&
      new Set((sameKeyOwners ?? []).map((row) => row.user_id)).size === 2,
    JSON.stringify(sameKeyOwners),
  );
  const cachedResult = {
    summary: "History and sensors support a cautious review.",
    confidence: "moderate",
  };
  const { data: spendBeforeAttach } = await admin
    .from("ai_credit_spends")
    .select("id,user_id,weight,status,feature,result,created_at")
    .eq("id", replaySpendId)
    .single();

  const invalidAttachCases = [
    {
      label: "wrong user",
      userId: uidPro,
      feature: "ai_doctor_review" as const,
      result: cachedResult,
      reason: "spend_not_recordable",
    },
    {
      label: "wrong feature",
      userId: uidFree,
      feature: "ai_coach" as const,
      result: cachedResult,
      reason: "feature_mismatch",
    },
    {
      label: "null feature",
      userId: uidFree,
      feature: null,
      result: cachedResult,
      reason: "invalid_feature",
    },
    {
      label: "scalar result",
      userId: uidFree,
      feature: "ai_doctor_review" as const,
      result: "not-an-object",
      reason: "invalid_result_shape",
    },
    {
      label: "null result",
      userId: uidFree,
      feature: "ai_doctor_review" as const,
      result: null,
      reason: "result_required",
    },
    {
      label: "empty result",
      userId: uidFree,
      feature: "ai_doctor_review" as const,
      result: {},
      reason: "invalid_result_shape",
    },
    {
      label: "oversized result",
      userId: uidFree,
      feature: "ai_doctor_review" as const,
      result: { summary: "x".repeat(131073) },
      reason: "result_too_large",
    },
  ];
  for (const attachCase of invalidAttachCases) {
    const { data, error } = await serverAttachResult(
      attachCase.userId,
      replaySpendId,
      attachCase.feature,
      attachCase.result,
    );
    check(
      `result recorder rejects ${attachCase.label}`,
      !error && (data as any)?.ok === false && (data as any)?.reason === attachCase.reason,
      error?.message ?? JSON.stringify(data),
    );
  }

  const { data: recordedResult, error: recordedResultError } = await serverAttachResult(
    uidFree,
    replaySpendId,
    "ai_doctor_review",
    cachedResult,
  );
  check(
    "service recorder attaches validated result once",
    !recordedResultError &&
      (recordedResult as any)?.ok === true &&
      (recordedResult as any)?.status === "recorded",
    recordedResultError?.message ?? JSON.stringify(recordedResult),
  );
  const { data: sidecarAfterAttach } = await admin
    .from("ai_credit_spend_results")
    .select("spend_id,feature,result,recorded_at")
    .eq("spend_id", replaySpendId)
    .single();
  const persistedSidecarResult = sidecarAfterAttach?.result as Record<string, unknown> | null;
  check(
    "result sidecar stores the expected feature and object",
    sidecarAfterAttach?.feature === "ai_doctor_review" &&
      persistedSidecarResult?.summary === cachedResult.summary &&
      persistedSidecarResult?.confidence === cachedResult.confidence &&
      typeof sidecarAfterAttach?.recorded_at === "string",
    JSON.stringify(sidecarAfterAttach),
  );
  const { data: ownerResultRows, error: ownerResultSelectError } = await free
    .from("ai_credit_spend_results")
    .select("spend_id")
    .eq("spend_id", replaySpendId);
  check(
    "authenticated result-cache SELECT of an owned attached result is denied / empty",
    !!ownerResultSelectError || (ownerResultRows ?? []).length === 0,
    ownerResultSelectError?.message,
  );
  const { data: anonResultRows, error: anonResultSelectError } = await anon
    .from("ai_credit_spend_results")
    .select("spend_id")
    .eq("spend_id", replaySpendId);
  check(
    "anon result-cache SELECT of a known attached result is denied / empty",
    !!anonResultSelectError || (anonResultRows ?? []).length === 0,
    anonResultSelectError?.message,
  );
  const { data: ownerResultUpdate, error: ownerResultUpdateError } = await free
    .from("ai_credit_spend_results")
    .update({ result: { summary: "client mutation" } })
    .eq("spend_id", replaySpendId)
    .select();
  check(
    "authenticated result-cache UPDATE denied / no-op",
    !!ownerResultUpdateError || (ownerResultUpdate ?? []).length === 0,
    ownerResultUpdateError?.message,
  );
  const { data: ownerResultDelete, error: ownerResultDeleteError } = await free
    .from("ai_credit_spend_results")
    .delete()
    .eq("spend_id", replaySpendId)
    .select();
  check(
    "authenticated result-cache DELETE denied / no-op",
    !!ownerResultDeleteError || (ownerResultDelete ?? []).length === 0,
    ownerResultDeleteError?.message,
  );
  const { data: sidecarAfterOwnerMutations } = await admin
    .from("ai_credit_spend_results")
    .select("feature,result,recorded_at")
    .eq("spend_id", replaySpendId)
    .single();
  check(
    "authenticated mutation attempts leave attached result unchanged",
    JSON.stringify(sidecarAfterOwnerMutations) ===
      JSON.stringify({
        feature: sidecarAfterAttach?.feature,
        result: sidecarAfterAttach?.result,
        recorded_at: sidecarAfterAttach?.recorded_at,
      }),
    JSON.stringify(sidecarAfterOwnerMutations),
  );
  const { data: spendAfterAttach } = await admin
    .from("ai_credit_spends")
    .select("id,user_id,weight,status,feature,result,created_at")
    .eq("id", replaySpendId)
    .single();
  check(
    "attaching output leaves the spend row immutable",
    JSON.stringify(spendAfterAttach) === JSON.stringify(spendBeforeAttach),
    JSON.stringify({ before: spendBeforeAttach, after: spendAfterAttach }),
  );

  const { data: serviceUpdateData, error: serviceUpdateError } = await admin
    .from("ai_credit_spend_results")
    .update({ result: { summary: "service mutation attempt" } })
    .eq("spend_id", replaySpendId)
    .select();
  check(
    "service role cannot UPDATE an attached result",
    !!serviceUpdateError || (serviceUpdateData ?? []).length === 0,
    serviceUpdateError?.message,
  );
  const { data: serviceDeleteData, error: serviceDeleteError } = await admin
    .from("ai_credit_spend_results")
    .delete()
    .eq("spend_id", replaySpendId)
    .select();
  check(
    "service role cannot DELETE an attached result directly",
    !!serviceDeleteError || (serviceDeleteData ?? []).length === 0,
    serviceDeleteError?.message,
  );

  const { data: equalAttach } = await serverAttachResult(
    uidFree,
    replaySpendId,
    "ai_doctor_review",
    cachedResult,
  );
  check(
    "equal result attachment replays successfully",
    (equalAttach as any)?.ok === true && (equalAttach as any)?.status === "replayed",
    JSON.stringify(equalAttach),
  );
  const { data: conflictingAttach } = await serverAttachResult(
    uidFree,
    replaySpendId,
    "ai_doctor_review",
    { ...cachedResult, confidence: "high" },
  );
  check(
    "different result attachment is rejected as a conflict",
    (conflictingAttach as any)?.ok === false &&
      (conflictingAttach as any)?.reason === "result_conflict",
    JSON.stringify(conflictingAttach),
  );

  const { data: s2 } = await serverSpend(uidFree, "live", {
    p_feature: "ai_doctor_review",
    p_grow_id: growIdFree,
    p_model_tier: "standard",
    p_idempotency_key: replayKey,
    p_result: null,
  });
  check("replay returns status='replayed'", (s2 as any)?.status === "replayed");
  const replayedResult = (s2 as any)?.result as Record<string, unknown> | null;
  check(
    "same-key replay returns the cached validated result",
    replayedResult?.summary === cachedResult.summary &&
      replayedResult?.confidence === cachedResult.confidence,
    JSON.stringify(s2),
  );
  check(
    "same-key replay returns the original spend_created_at",
    (s2 as any)?.spend_created_at === (s1 as any)?.spend_created_at,
    JSON.stringify(s2),
  );
  check(
    "same-key replay returns bound grow_id and nonnegative database age",
    (s2 as any)?.grow_id === growIdFree &&
      Number.isInteger((s2 as any)?.spend_age_ms) &&
      (s2 as any)?.spend_age_ms >= 0,
    JSON.stringify(s2),
  );
  const replayConflictCases = [
    {
      label: "cross-feature",
      environment: "live" as const,
      feature: "ai_coach" as const,
      growId: growIdFree,
      modelTier: "standard" as const,
    },
    {
      label: "cross-grow",
      environment: "live" as const,
      feature: "ai_doctor_review" as const,
      growId: growIdFreeOther,
      modelTier: "standard" as const,
    },
    {
      label: "cross-model",
      environment: "live" as const,
      feature: "ai_doctor_review" as const,
      growId: growIdFree,
      modelTier: "escalated" as const,
    },
    {
      label: "cross-environment",
      environment: "sandbox" as const,
      feature: "ai_doctor_review" as const,
      growId: growIdFree,
      modelTier: "standard" as const,
    },
  ];
  for (const conflictCase of replayConflictCases) {
    const { data, error } = await serverSpend(uidFree, conflictCase.environment, {
      p_feature: conflictCase.feature,
      p_grow_id: conflictCase.growId,
      p_model_tier: conflictCase.modelTier,
      p_idempotency_key: replayKey,
      p_result: null,
    });
    check(
      `${conflictCase.label} same-key replay is rejected without cached output`,
      !error &&
        (data as any)?.ok === false &&
        (data as any)?.status === "invalid" &&
        (data as any)?.reason === "idempotency_key_conflict" &&
        !Object.prototype.hasOwnProperty.call(data ?? {}, "result"),
      error?.message ?? JSON.stringify(data),
    );
  }
  const { count: rowCount } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uidFree)
    .eq("idempotency_key", replayKey);
  check("replay did not insert a 2nd row", rowCount === 1);
  const { data: replaySpendRows } = await admin
    .from("ai_credit_spends")
    .select("weight")
    .eq("user_id", uidFree)
    .eq("idempotency_key", replayKey);
  check(
    "cached same-key replay adds no credit weight",
    (replaySpendRows ?? []).length === 1 && replaySpendRows?.[0]?.weight === 1,
    JSON.stringify(replaySpendRows),
  );

  const cachedRefundKey = `cached-refund-${crypto.randomUUID()}`;
  const { data: cachedRefund } = await serverRefund(
    uidFree,
    replaySpendId,
    cachedRefundKey,
    "cached_result_refund_harness",
  );
  check(
    "cached spend can still be reversed append-only",
    (cachedRefund as any)?.ok === true && (cachedRefund as any)?.status === "refunded",
    JSON.stringify(cachedRefund),
  );
  const { data: refundedReplay } = await serverSpend(uidFree, "live", {
    p_feature: "ai_doctor_review",
    p_grow_id: growIdFree,
    p_model_tier: "standard",
    p_idempotency_key: replayKey,
    p_result: null,
  });
  check(
    "refund suppresses cached output on same-key replay",
    (refundedReplay as any)?.ok === false &&
      (refundedReplay as any)?.status === "invalid" &&
      (refundedReplay as any)?.reason === "spend_refunded" &&
      !Object.prototype.hasOwnProperty.call(refundedReplay ?? {}, "result"),
    JSON.stringify(refundedReplay),
  );
  const { data: attachAfterRefund } = await serverAttachResult(
    uidFree,
    replaySpendId,
    "ai_doctor_review",
    cachedResult,
  );
  check(
    "result recorder rejects a reversed spend",
    (attachAfterRefund as any)?.ok === false &&
      (attachAfterRefund as any)?.reason === "spend_refunded",
    JSON.stringify(attachAfterRefund),
  );

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
  const { data: refReplay } = await serverRefund(
    uidFree,
    spends[0],
    refundKey,
    "upstream_failure_harness",
  );
  check(
    "refund replay returns the same reversal id",
    (refReplay as any)?.status === "replayed" &&
      (refReplay as any)?.refund_id === (ref as any)?.refund_id,
  );
  const { count: reversalCount } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("refund_of", spends[0]);
  check("refund replay remains append-only and idempotent", reversalCount === 1);

  console.log("\n→ concurrent same-key refund serializes before replay lookup");
  const concurrentRefundKey = `concurrent-refund-${crypto.randomUUID()}`;
  const concurrentRefundResponses = await Promise.all([
    serverRefund(uidFree, spends[1], concurrentRefundKey, "concurrent_refund_harness"),
    serverRefund(uidFree, spends[1], concurrentRefundKey, "concurrent_refund_harness"),
  ]);
  const concurrentRefundErrors = concurrentRefundResponses
    .map((response) => response.error)
    .filter(Boolean);
  const concurrentRefundResults = concurrentRefundResponses.map(
    (response) => response.data as { status?: string; refund_id?: string } | null,
  );
  const concurrentRefundStatuses = concurrentRefundResults.map((result) => result?.status).sort();
  check(
    "concurrent same-key refunds return refunded + replayed without RPC error",
    concurrentRefundErrors.length === 0 &&
      JSON.stringify(concurrentRefundStatuses) === JSON.stringify(["refunded", "replayed"]),
    concurrentRefundErrors.map((error) => error?.message).join("; "),
  );
  check(
    "concurrent refund replay returns the original reversal id",
    !!concurrentRefundResults[0]?.refund_id &&
      concurrentRefundResults[0]?.refund_id === concurrentRefundResults[1]?.refund_id,
    JSON.stringify(concurrentRefundResults),
  );
  const { count: concurrentRefundRowCount } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("refund_of", spends[1]);
  check("concurrent same-key refund inserts exactly one reversal", concurrentRefundRowCount === 1);

  console.log("\n→ concurrent same-key spend serializes before replay lookup");
  const concurrentKey = `concurrent-replay-${crypto.randomUUID()}`;
  const concurrentArgs: ServerSpendArgs = {
    p_feature: "ai_doctor_review",
    p_grow_id: growIdPro,
    p_model_tier: "standard",
    p_idempotency_key: concurrentKey,
    p_result: null,
  };
  const concurrentResponses = await Promise.all([
    serverSpend(uidPro, "live", concurrentArgs),
    serverSpend(uidPro, "live", concurrentArgs),
  ]);
  const concurrentErrors = concurrentResponses.map((response) => response.error).filter(Boolean);
  const concurrentResults = concurrentResponses.map(
    (response) => response.data as { status?: string; spend_id?: string } | null,
  );
  const concurrentStatuses = concurrentResults.map((result) => result?.status).sort();
  check(
    "concurrent same-key calls return spent + replayed without RPC error",
    concurrentErrors.length === 0 &&
      JSON.stringify(concurrentStatuses) === JSON.stringify(["replayed", "spent"]),
    concurrentErrors.map((error) => error?.message).join("; "),
  );
  check(
    "concurrent replay returns the original spend id",
    !!concurrentResults[0]?.spend_id &&
      concurrentResults[0]?.spend_id === concurrentResults[1]?.spend_id,
    JSON.stringify(concurrentResults),
  );
  const { count: concurrentRowCount } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uidPro)
    .eq("idempotency_key", concurrentKey);
  check("concurrent same-key spend inserts exactly one row", concurrentRowCount === 1);

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

    const { data: spendData, error: spendError } = await serverSpend(uidPro, "live", {
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

    const { data: spendData, error: spendError } = await serverSpend(uidPro, "live", {
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
  const { data: pro100 } = await serverSpend(uidPro, "live", {
    p_feature: "ai_coach",
    p_grow_id: null,
    p_model_tier: "standard",
    p_idempotency_key: "pro-100-" + crypto.randomUUID(),
    p_result: null,
  });
  check("Pro spend #100 allowed", (pro100 as any)?.ok === true && (pro100 as any)?.remaining === 0);
  const { data: pro101 } = await serverSpend(uidPro, "live", {
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
  const { data: tierSpend } = await serverSpend(uidPro, "live", {
    p_feature: "ai_coach",
    p_grow_id: null,
    p_model_tier: "escalated",
    p_idempotency_key: "tier-" + crypto.randomUUID(),
    p_result: null,
  });
  check("escalated tier records weight=5", (tierSpend as any)?.weight === 5);

  console.log("\n→ account deletion cascades through spend result sidecars");
  const uidResultCascade = await adminCreateUser(EMAIL_RESULT_CASCADE);
  const { data: resultCascadeGrow, error: resultCascadeGrowError } = await admin
    .from("grows")
    .insert({
      user_id: uidResultCascade,
      name: "Result cascade harness grow",
      grow_type: "indoor",
    })
    .select("id")
    .single();
  if (resultCascadeGrowError || !resultCascadeGrow) {
    throw new Error(`create result cascade grow: ${resultCascadeGrowError?.message}`);
  }
  const { data: resultCascadeSpend, error: resultCascadeSpendError } = await serverSpend(
    uidResultCascade,
    "live",
    {
      p_feature: "ai_doctor_review",
      p_grow_id: resultCascadeGrow.id,
      p_model_tier: "standard",
      p_idempotency_key: `result-cascade-${crypto.randomUUID()}`,
      p_result: null,
    },
  );
  const resultCascadeSpendId = (resultCascadeSpend as any)?.spend_id as string;
  const { data: resultCascadeAttach, error: resultCascadeAttachError } = await serverAttachResult(
    uidResultCascade,
    resultCascadeSpendId,
    "ai_doctor_review",
    { summary: "delete this with the account" },
  );
  check(
    "cascade fixture has an attached result",
    !resultCascadeSpendError &&
      !resultCascadeAttachError &&
      (resultCascadeAttach as any)?.status === "recorded",
    resultCascadeSpendError?.message ??
      resultCascadeAttachError?.message ??
      JSON.stringify(resultCascadeAttach),
  );
  const { error: resultCascadeDeleteError } = await admin.auth.admin.deleteUser(uidResultCascade);
  check(
    "cascade fixture account deletion succeeds",
    !resultCascadeDeleteError,
    resultCascadeDeleteError?.message,
  );
  const { count: deletedSpendCount } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("id", resultCascadeSpendId);
  const { count: deletedResultCount } = await admin
    .from("ai_credit_spend_results")
    .select("spend_id", { count: "exact", head: true })
    .eq("spend_id", resultCascadeSpendId);
  check(
    "account deletion removes both spend and result sidecar",
    deletedSpendCount === 0 && deletedResultCount === 0,
    JSON.stringify({ deletedSpendCount, deletedResultCount }),
  );
  if (resultCascadeDeleteError) await cleanupUser(uidResultCascade);

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
