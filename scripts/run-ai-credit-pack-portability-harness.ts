#!/usr/bin/env -S bun run
/**
 * Disposable runtime proof for AI credit-pack portability.
 *
 * The harness is opt-in, defaults to loopback Supabase, and always refuses
 * Verdant production. A remote run requires an exact disposable project ref.
 *
 * Local:
 *   AI_CREDIT_PACK_PORTABILITY_HARNESS=1 \
 *     bun run scripts/run-ai-credit-pack-portability-harness.ts
 *
 * Remote disposable project:
 *   AI_CREDIT_PACK_PORTABILITY_HARNESS=1
 *   AI_CREDIT_PACK_PORTABILITY_HARNESS_ALLOW_REMOTE=1
 *   AI_CREDIT_PACK_PORTABILITY_HARNESS_EXPECTED_PROJECT_REF=<project-ref>
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CONFIRM_ENV = "AI_CREDIT_PACK_PORTABILITY_HARNESS";
const REMOTE_CONFIRM_ENV = "AI_CREDIT_PACK_PORTABILITY_HARNESS_ALLOW_REMOTE";
const EXPECTED_REMOTE_REF_ENV = "AI_CREDIT_PACK_PORTABILITY_HARNESS_EXPECTED_PROJECT_REF";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";

if (process.env[CONFIRM_ENV] !== "1") {
  console.log(
    `[ai-credit-pack-portability] SKIP — set ${CONFIRM_ENV}=1 to run the disposable database harness.`,
  );
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";

for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
] as const) {
  if (!value) {
    console.error(`[ai-credit-pack-portability] missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[ai-credit-pack-portability] SUPABASE_URL is invalid");
  process.exit(2);
}

if (
  hostname === PRODUCTION_PROJECT_REF ||
  hostname.startsWith(`${PRODUCTION_PROJECT_REF}.`) ||
  hostname.includes(`.${PRODUCTION_PROJECT_REF}.`)
) {
  console.error("[ai-credit-pack-portability] refusing Verdant production database");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

if (!localHost) {
  const expectedRemoteRef = process.env[EXPECTED_REMOTE_REF_ENV] ?? "";
  const remoteConfirmed =
    process.env[REMOTE_CONFIRM_ENV] === "1" &&
    /^[a-z0-9]{20}$/.test(expectedRemoteRef) &&
    expectedRemoteRef !== PRODUCTION_PROJECT_REF &&
    hostname === `${expectedRemoteRef}.supabase.co`;

  if (!remoteConfirmed) {
    console.error(
      `[ai-credit-pack-portability] refusing unverified remote database; set ${REMOTE_CONFIRM_ENV}=1 and ${EXPECTED_REMOTE_REF_ENV} to the exact disposable project ref.`,
    );
    process.exit(2);
  }
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type BillingEnvironment = "live" | "sandbox";
type Feature = "ai_doctor_review" | "ai_coach";
type ModelTier = "standard" | "escalated";

interface SpendReceipt {
  ok?: boolean;
  status?: string;
  reason?: string;
  spend_id?: string;
  plan_id?: string;
  scope?: string;
  funded_by?: string;
  remaining?: number;
  pack_balance?: number;
}

interface RefundReceipt {
  ok?: boolean;
  status?: string;
  reason?: string;
  refund_id?: string;
}

interface DisposableUser {
  id: string;
  email: string;
  password: string;
  growId: string;
}

let passed = 0;
let failed = 0;
const createdUsers: string[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function spendReceipt(value: unknown): SpendReceipt | null {
  return record(value) as SpendReceipt | null;
}

function refundReceipt(value: unknown): RefundReceipt | null {
  return record(value) as RefundReceipt | null;
}

function errorDetail(error: unknown): string {
  const candidate = record(error);
  if (typeof candidate?.code === "string") return candidate.code;
  if (typeof candidate?.message === "string") {
    return candidate.message.replace(/[\r\n\t]+/g, " ").slice(0, 180);
  }
  return "unexpected";
}

async function createDisposableUser(label: string): Promise<DisposableUser> {
  const suffix = crypto.randomUUID();
  const email = `ai-pack-${label}-${suffix}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`create_user_${label}:${errorDetail(error)}`);
  }
  const id = data.user.id;
  createdUsers.push(id);

  const { data: grow, error: growError } = await admin
    .from("grows")
    .insert({
      user_id: id,
      name: `AI pack portability ${label}`,
      grow_type: "indoor",
    })
    .select("id")
    .single();
  if (growError || !grow?.id) {
    throw new Error(`create_grow_${label}:${errorDetail(growError)}`);
  }

  return { id, email, password, growId: grow.id as string };
}

async function signedInClient(user: DisposableUser): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`sign_in:${errorDetail(error)}`);
  return client;
}

async function seedPaidPlan(userId: string): Promise<void> {
  const now = new Date();
  const { error } = await admin.from("subscriptions").insert({
    user_id: userId,
    paddle_subscription_id: `harness_sub_${crypto.randomUUID()}`,
    paddle_customer_id: `harness_customer_${crypto.randomUUID()}`,
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_start: now.toISOString(),
    current_period_end: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    cancel_at_period_end: false,
    environment: "live",
  });
  if (error) throw new Error(`seed_paid_plan:${errorDetail(error)}`);
}

async function grantPack(
  userId: string,
  environment: BillingEnvironment,
  credits: number,
): Promise<void> {
  const { data, error } = await admin.rpc("grant_lovable_credit_pack", {
    p_expected_user_id: userId,
    p_paddle_transaction_id: `harness_txn_${crypto.randomUUID()}`,
    p_credits: credits,
    p_sku: credits === 150 ? "credit_pack_150" : "credit_pack_50",
    p_environment: environment,
  });
  const result = record(data);
  if (error || result?.ok !== true) {
    throw new Error(`grant_pack:${errorDetail(error ?? data)}`);
  }
}

function serverSpend(
  userId: string,
  environment: BillingEnvironment,
  input: {
    feature: Feature;
    growId: string | null;
    modelTier?: ModelTier;
    idempotencyKey?: string;
  },
) {
  return admin.rpc("ai_credit_spend", {
    p_user_id: userId,
    p_billing_environment: environment,
    p_feature: input.feature,
    p_grow_id: input.growId,
    p_model_tier: input.modelTier ?? "standard",
    p_idempotency_key: input.idempotencyKey ?? `harness_spend_${crypto.randomUUID()}`,
    p_result: null,
  });
}

function serverRefund(userId: string, spendId: string) {
  return admin.rpc("ai_credit_refund", {
    p_expected_user_id: userId,
    p_spend_id: spendId,
    p_idempotency_key: `harness_refund_${crypto.randomUUID()}`,
    p_reason: "credit_pack_portability_harness",
  });
}

async function exhaustFreeAllowance(user: DisposableUser): Promise<void> {
  for (let index = 1; index <= 3; index += 1) {
    const { data, error } = await serverSpend(user.id, "live", {
      feature: "ai_doctor_review",
      growId: user.growId,
    });
    const result = spendReceipt(data);
    check(
      `Free included spend ${index}/3 is allowance-funded`,
      !error &&
        result?.ok === true &&
        result.status === "spent" &&
        result.plan_id === "free" &&
        result.scope === "per_grow" &&
        result.funded_by === "allowance",
      error ? errorDetail(error) : JSON.stringify(result),
    );
  }
}

async function seedPaidAllowanceUsage(userId: string, count: number): Promise<void> {
  const periodKey = new Date().toISOString().slice(0, 7);
  const rows = Array.from({ length: count }, () => ({
    user_id: userId,
    grow_id: null,
    period_key: periodKey,
    weight: 1,
    model_tier: "standard" as const,
    feature: "ai_coach" as const,
    status: "spent" as const,
    idempotency_key: `harness_seed_${crypto.randomUUID()}`,
    meta: {
      funded_by: "allowance",
      server_billing_environment: "live",
    },
  }));
  const { error } = await admin.from("ai_credit_spends").insert(rows);
  if (error) throw new Error(`seed_paid_allowance:${errorDetail(error)}`);
}

async function countRows(
  table: "ai_credit_spends" | "ai_credit_grants",
  userId: string,
  filters: Record<string, string>,
): Promise<number | null> {
  let query = admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`count_${table}:${errorDetail(error)}`);
  return count;
}

async function cleanupUser(userId: string, cleanupFailures: string[]): Promise<void> {
  for (const table of [
    "ai_credit_spends",
    "ai_credit_grants",
    "subscriptions",
    "billing_subscriptions",
    "grows",
  ] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) cleanupFailures.push(`${table}:${errorDetail(error)}`);
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) cleanupFailures.push(`auth.users:${errorDetail(error)}`);
}

async function run(): Promise<void> {
  const cleanupFailures: string[] = [];
  try {
    console.log("[ai-credit-pack-portability] creating disposable fixtures");
    const free = await createDisposableUser("free");
    const paid = await createDisposableUser("paid");
    const environment = await createDisposableUser("environment");
    const replay = await createDisposableUser("replay");
    const race = await createDisposableUser("race");
    const refund = await createDisposableUser("refund");

    await seedPaidPlan(paid.id);
    await grantPack(free.id, "live", 1);
    await grantPack(paid.id, "live", 1);
    await grantPack(environment.id, "sandbox", 1);
    await grantPack(replay.id, "live", 1);
    await grantPack(race.id, "live", 1);
    await grantPack(refund.id, "live", 1);

    console.log("[ai-credit-pack-portability] proving client/server authority boundary");
    const freeClient = await signedInClient(free);
    const { data: clientSpoof, error: clientSpoofError } = await freeClient.rpc("ai_credit_spend", {
      p_user_id: paid.id,
      p_billing_environment: "sandbox",
      p_feature: "ai_coach",
      p_grow_id: paid.growId,
      p_model_tier: "escalated",
      p_idempotency_key: `client_spoof_${crypto.randomUUID()}`,
      p_result: null,
    });
    check(
      "authenticated client cannot choose another user, environment, or model tier",
      !!clientSpoofError || spendReceipt(clientSpoof)?.reason === "not_authorized",
      clientSpoofError ? errorDetail(clientSpoofError) : JSON.stringify(clientSpoof),
    );
    const { error: inventedAuthorityError } = await freeClient.rpc("ai_credit_spend", {
      p_user_id: free.id,
      p_billing_environment: "live",
      p_feature: "ai_doctor_review",
      p_grow_id: free.growId,
      p_model_tier: "standard",
      p_idempotency_key: `client_extra_${crypto.randomUUID()}`,
      p_result: null,
      p_weight: 0,
      p_plan_id: "staff",
    });
    check(
      "authenticated client cannot supply weight or plan authority parameters",
      !!inventedAuthorityError,
      errorDetail(inventedAuthorityError),
    );

    console.log("[ai-credit-pack-portability] proving Free allowance-first portability");
    await exhaustFreeAllowance(free);
    const { data: freeOverflow, error: freeOverflowError } = await serverSpend(free.id, "live", {
      feature: "ai_doctor_review",
      growId: free.growId,
    });
    const freeOverflowReceipt = spendReceipt(freeOverflow);
    check(
      "Free spend 4 uses the settled pack after the 3-per-grow allowance",
      !freeOverflowError &&
        freeOverflowReceipt?.ok === true &&
        freeOverflowReceipt.plan_id === "free" &&
        freeOverflowReceipt.scope === "per_grow" &&
        freeOverflowReceipt.funded_by === "pack" &&
        freeOverflowReceipt.pack_balance === 0,
      freeOverflowError ? errorDetail(freeOverflowError) : JSON.stringify(freeOverflowReceipt),
    );

    console.log("[ai-credit-pack-portability] proving paid allowance-first portability");
    await seedPaidAllowanceUsage(paid.id, 99);
    const { data: paidAllowance, error: paidAllowanceError } = await serverSpend(paid.id, "live", {
      feature: "ai_coach",
      growId: null,
    });
    const paidAllowanceReceipt = spendReceipt(paidAllowance);
    check(
      "paid spend 100 remains allowance-funded",
      !paidAllowanceError &&
        paidAllowanceReceipt?.ok === true &&
        paidAllowanceReceipt.plan_id === "pro_monthly" &&
        paidAllowanceReceipt.scope === "per_month" &&
        paidAllowanceReceipt.funded_by === "allowance" &&
        paidAllowanceReceipt.remaining === 0,
      paidAllowanceError ? errorDetail(paidAllowanceError) : JSON.stringify(paidAllowanceReceipt),
    );
    const { data: paidOverflow, error: paidOverflowError } = await serverSpend(paid.id, "live", {
      feature: "ai_coach",
      growId: null,
    });
    const paidOverflowReceipt = spendReceipt(paidOverflow);
    check(
      "paid spend 101 uses the settled pack",
      !paidOverflowError &&
        paidOverflowReceipt?.ok === true &&
        paidOverflowReceipt.funded_by === "pack" &&
        paidOverflowReceipt.pack_balance === 0,
      paidOverflowError ? errorDetail(paidOverflowError) : JSON.stringify(paidOverflowReceipt),
    );

    console.log("[ai-credit-pack-portability] proving sandbox/live isolation");
    await exhaustFreeAllowance(environment);
    const { data: liveDenied, error: liveDeniedError } = await serverSpend(environment.id, "live", {
      feature: "ai_doctor_review",
      growId: environment.growId,
    });
    const liveDeniedReceipt = spendReceipt(liveDenied);
    check(
      "sandbox-only grant cannot fund a live spend",
      !liveDeniedError &&
        liveDeniedReceipt?.ok === false &&
        liveDeniedReceipt.reason === "limit_reached" &&
        liveDeniedReceipt.pack_balance === 0,
      liveDeniedError ? errorDetail(liveDeniedError) : JSON.stringify(liveDeniedReceipt),
    );
    const { data: sandboxOverflow, error: sandboxOverflowError } = await serverSpend(
      environment.id,
      "sandbox",
      {
        feature: "ai_doctor_review",
        growId: environment.growId,
      },
    );
    const sandboxOverflowReceipt = spendReceipt(sandboxOverflow);
    check(
      "sandbox grant funds a sandbox spend after allowance exhaustion",
      !sandboxOverflowError &&
        sandboxOverflowReceipt?.ok === true &&
        sandboxOverflowReceipt.funded_by === "pack",
      sandboxOverflowError
        ? errorDetail(sandboxOverflowError)
        : JSON.stringify(sandboxOverflowReceipt),
    );

    console.log("[ai-credit-pack-portability] proving pack replay idempotency");
    await exhaustFreeAllowance(replay);
    const replayKey = `pack_replay_${crypto.randomUUID()}`;
    const firstReplayCall = await serverSpend(replay.id, "live", {
      feature: "ai_doctor_review",
      growId: replay.growId,
      idempotencyKey: replayKey,
    });
    const secondReplayCall = await serverSpend(replay.id, "live", {
      feature: "ai_doctor_review",
      growId: replay.growId,
      idempotencyKey: replayKey,
    });
    const firstReplayReceipt = spendReceipt(firstReplayCall.data);
    const secondReplayReceipt = spendReceipt(secondReplayCall.data);
    const replayRowCount = await countRows("ai_credit_spends", replay.id, {
      idempotency_key: replayKey,
    });
    check(
      "same pack key replays one spend id and inserts one row",
      !firstReplayCall.error &&
        !secondReplayCall.error &&
        firstReplayReceipt?.status === "spent" &&
        firstReplayReceipt.funded_by === "pack" &&
        secondReplayReceipt?.status === "replayed" &&
        firstReplayReceipt.spend_id === secondReplayReceipt.spend_id &&
        replayRowCount === 1,
      firstReplayCall.error
        ? errorDetail(firstReplayCall.error)
        : secondReplayCall.error
          ? errorDetail(secondReplayCall.error)
          : JSON.stringify({ firstReplayReceipt, secondReplayReceipt, replayRowCount }),
    );

    console.log("[ai-credit-pack-portability] proving unique-key race serialization");
    await exhaustFreeAllowance(race);
    const raceKeys = [`pack_race_a_${crypto.randomUUID()}`, `pack_race_b_${crypto.randomUUID()}`];
    const raceCalls = await Promise.all(
      raceKeys.map((idempotencyKey) =>
        serverSpend(race.id, "live", {
          feature: "ai_doctor_review",
          growId: race.growId,
          idempotencyKey,
        }),
      ),
    );
    const raceReceipts = raceCalls.map((call) => spendReceipt(call.data));
    const packWinners = raceReceipts.filter(
      (receipt) => receipt?.status === "spent" && receipt.funded_by === "pack",
    );
    const limitLosers = raceReceipts.filter(
      (receipt) => receipt?.status === "denied" && receipt.reason === "limit_reached",
    );
    const raceRows = await admin
      .from("ai_credit_spends")
      .select("id,meta")
      .eq("user_id", race.id)
      .in("idempotency_key", raceKeys);
    const storedPackRows = (raceRows.data ?? []).filter(
      (row) => record(row.meta)?.funded_by === "pack",
    );
    check(
      "one-credit concurrent unique keys yield one pack spend and one denial",
      raceCalls.every((call) => !call.error) &&
        !raceRows.error &&
        packWinners.length === 1 &&
        limitLosers.length === 1 &&
        storedPackRows.length === 1,
      raceRows.error
        ? errorDetail(raceRows.error)
        : JSON.stringify({ raceReceipts, storedPackRows: storedPackRows.length }),
    );

    console.log("[ai-credit-pack-portability] proving refund restores the grant pool");
    await exhaustFreeAllowance(refund);
    const firstPack = await serverSpend(refund.id, "live", {
      feature: "ai_doctor_review",
      growId: refund.growId,
    });
    const firstPackReceipt = spendReceipt(firstPack.data);
    if (firstPack.error || !firstPackReceipt?.spend_id) {
      throw new Error(
        `refund_fixture_spend:${firstPack.error ? errorDetail(firstPack.error) : "missing_spend_id"}`,
      );
    }
    const refundCall = await serverRefund(refund.id, firstPackReceipt.spend_id);
    const refunded = refundReceipt(refundCall.data);
    const restoredCall = await serverSpend(refund.id, "live", {
      feature: "ai_doctor_review",
      growId: refund.growId,
    });
    const restored = spendReceipt(restoredCall.data);
    check(
      "append-only refund restores one environment-bound pack credit",
      firstPackReceipt.funded_by === "pack" &&
        !refundCall.error &&
        refunded?.ok === true &&
        refunded.status === "refunded" &&
        !restoredCall.error &&
        restored?.ok === true &&
        restored.funded_by === "pack" &&
        restored.pack_balance === 0,
      refundCall.error
        ? errorDetail(refundCall.error)
        : restoredCall.error
          ? errorDetail(restoredCall.error)
          : JSON.stringify({ refunded, restored }),
    );
  } finally {
    console.log("[ai-credit-pack-portability] cleaning disposable fixtures");
    for (const userId of [...createdUsers].reverse()) {
      await cleanupUser(userId, cleanupFailures);
    }
    check(
      "all disposable users and rows were removed",
      cleanupFailures.length === 0,
      cleanupFailures.join(", "),
    );
  }

  console.log(`[ai-credit-pack-portability] Results: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((error: unknown) => {
  console.error(`[ai-credit-pack-portability] fatal: ${errorDetail(error)}`);
  process.exit(1);
});
