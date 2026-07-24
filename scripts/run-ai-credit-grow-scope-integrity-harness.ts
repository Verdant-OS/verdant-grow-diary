#!/usr/bin/env -S bun run
/**
 * Disposable runtime proof for AI-credit grow-scope integrity.
 *
 * The harness is opt-in and local-only by default. It exercises both the
 * service-only seven-argument spend RPC and, while the expand compatibility
 * path exists, the authenticated five-argument overload. It never runs as
 * part of the default test suite.
 *
 * Local expand-stage run:
 *   AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS=1 \
 *     bun run scripts/run-ai-credit-grow-scope-integrity-harness.ts
 *
 * If the legacy overload has already been revoked:
 *   AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS=1 \
 *   AI_CREDIT_GROW_SCOPE_LEGACY_MODE=revoked \
 *     bun run scripts/run-ai-credit-grow-scope-integrity-harness.ts
 *
 * A remote disposable non-production project additionally requires:
 *   AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS_ALLOW_REMOTE=1
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY
 * (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CONFIRM_ENV = "AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS";
const REMOTE_CONFIRM_ENV = "AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS_ALLOW_REMOTE";
const LEGACY_MODE_ENV = "AI_CREDIT_GROW_SCOPE_LEGACY_MODE";

if (process.env[CONFIRM_ENV] !== "1") {
  console.log(
    `[ai-credit-grow-scope] SKIP — set ${CONFIRM_ENV}=1 to run the disposable database harness.`,
  );
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY!;

for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
] as const) {
  if (!value) {
    console.error(`[ai-credit-grow-scope] missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[ai-credit-grow-scope] SUPABASE_URL is not a valid URL");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";
if (!localHost && process.env[REMOTE_CONFIRM_ENV] !== "1") {
  console.error(
    `[ai-credit-grow-scope] refusing remote database; set ${REMOTE_CONFIRM_ENV}=1 only for a disposable non-production project.`,
  );
  process.exit(2);
}

const legacyMode = process.env[LEGACY_MODE_ENV] ?? "available";
if (legacyMode !== "available" && legacyMode !== "revoked") {
  console.error(`[ai-credit-grow-scope] ${LEGACY_MODE_ENV} must be 'available' or 'revoked'`);
  process.exit(2);
}

const runId = crypto.randomUUID().slice(0, 8);
const password = crypto.randomUUID();
const emails = {
  free: `ai-credit-grow-free-${runId}@verdant.test`,
  pro: `ai-credit-grow-pro-${runId}@verdant.test`,
  staff: `ai-credit-grow-staff-${runId}@verdant.test`,
} as const;
const futurePeriodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type JsonRecord = Record<string, unknown>;
type RpcResponse = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};
type SpendReply = {
  ok?: boolean;
  status?: string;
  reason?: string;
  plan_id?: string;
  scope?: string;
  grow_id?: string | null;
  spend_id?: string;
};

let passed = 0;
let failed = 0;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function spendReply(value: unknown): SpendReply | null {
  if (!isRecord(value)) return null;
  const growId = value.grow_id;
  return {
    ok: typeof value.ok === "boolean" ? value.ok : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
    plan_id: typeof value.plan_id === "string" ? value.plan_id : undefined,
    scope: typeof value.scope === "string" ? value.scope : undefined,
    grow_id: growId === null ? null : typeof growId === "string" ? growId : undefined,
    spend_id: typeof value.spend_id === "string" ? value.spend_id : undefined,
  };
}

function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "unexpected";
}

function isExpectedLegacyRevocation(error: unknown, data: unknown): boolean {
  const code = errorCode(error);
  return (
    spendReply(data)?.reason === "not_authorized" ||
    code === "42501" ||
    code === "42883" ||
    code === "PGRST202"
  );
}

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function createUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`create_user_failed:${error?.code ?? "unknown"}`);
  return data.user.id;
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign_in_failed:${error.code ?? "unknown"}`);
  return client;
}

async function createGrow(userId: string, name: string, id?: string): Promise<string> {
  const { data, error } = await admin
    .from("grows")
    .insert({
      ...(id ? { id } : {}),
      user_id: userId,
      name,
      grow_type: "indoor",
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`create_grow_failed:${error?.code ?? "unknown"}`);
  return data.id as string;
}

async function spendCount(userId: string): Promise<number> {
  const { count, error } = await admin
    .from("ai_credit_spends")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || count === null) throw new Error(`count_spends_failed:${error?.code ?? "unknown"}`);
  return count;
}

async function clearSpends(userIds: string[]): Promise<void> {
  const { error } = await admin.from("ai_credit_spends").delete().in("user_id", userIds);
  if (error) throw new Error(`clear_spends_failed:${error.code ?? "unknown"}`);
}

async function assertRejectedWithoutSpend(
  label: string,
  userId: string,
  operation: (idempotencyKey: string) => PromiseLike<RpcResponse>,
  expectedReason: "grow_not_owned" | "grow_id_required_for_plan" | "limit_reached",
): Promise<void> {
  const idempotencyKey = `grow-scope-rejected:${runId}:${crypto.randomUUID()}`;
  const before = await spendCount(userId);
  const { data, error } = await operation(idempotencyKey);
  const after = await spendCount(userId);
  const { data: rowsWithKey, error: keyReadError } = await admin
    .from("ai_credit_spends")
    .select("id,user_id")
    .eq("idempotency_key", idempotencyKey);
  const reply = spendReply(data);
  check(
    label,
    !error &&
      !keyReadError &&
      reply?.ok === false &&
      reply.reason === expectedReason &&
      after === before &&
      rowsWithKey?.length === 0,
    error?.message ??
      keyReadError?.message ??
      JSON.stringify({ reply, before, after, rowsWithKey, idempotencyKey }),
  );
}

async function assertAllowed(
  label: string,
  userId: string,
  operation: (idempotencyKey: string) => PromiseLike<RpcResponse>,
  expectedPlan: "free" | "pro_monthly" | "staff",
  expectedScope: "per_grow" | "per_month",
  expectedGrowId: string | null,
  expectReplyGrowId = false,
): Promise<void> {
  const idempotencyKey = `grow-scope-allowed:${runId}:${crypto.randomUUID()}`;
  const before = await spendCount(userId);
  const { data, error } = await operation(idempotencyKey);
  const reply = spendReply(data);
  const { data: ledgerRow, error: ledgerError } = reply?.spend_id
    ? await admin
        .from("ai_credit_spends")
        .select("user_id,grow_id,idempotency_key,feature,status")
        .eq("id", reply.spend_id)
        .maybeSingle()
    : { data: null, error: null };
  const after = await spendCount(userId);
  check(
    label,
    !error &&
      !ledgerError &&
      reply?.ok === true &&
      reply.status === "spent" &&
      reply.plan_id === expectedPlan &&
      reply.scope === expectedScope &&
      typeof reply.spend_id === "string" &&
      after === before + 1 &&
      ledgerRow?.user_id === userId &&
      ledgerRow?.grow_id === expectedGrowId &&
      ledgerRow?.idempotency_key === idempotencyKey &&
      ledgerRow?.feature === "ai_doctor_review" &&
      ledgerRow?.status === "spent" &&
      (!expectReplyGrowId || reply.grow_id === expectedGrowId),
    error?.message ??
      ledgerError?.message ??
      JSON.stringify({ reply, ledgerRow, before, after, idempotencyKey }),
  );
}

async function cleanupStep(
  name: string,
  operation: () => PromiseLike<{ error: unknown | null }>,
  failures: string[],
): Promise<void> {
  try {
    const { error } = await operation();
    if (!error) return;
    failures.push(`${name}:${errorCode(error)}`);
  } catch (error: unknown) {
    failures.push(`${name}:${errorCode(error)}`);
  }
}

async function run(): Promise<void> {
  const userIds: string[] = [];
  const cleanupFailures: string[] = [];

  try {
    console.log(`[ai-credit-grow-scope] creating disposable fixtures (${legacyMode})`);
    const uidFree = await createUser(emails.free);
    userIds.push(uidFree);
    const uidPro = await createUser(emails.pro);
    userIds.push(uidPro);
    const uidStaff = await createUser(emails.staff);
    userIds.push(uidStaff);

    const { error: staffRoleError } = await admin
      .from("user_roles")
      .insert({ user_id: uidStaff, role: "staff" });
    if (staffRoleError) throw new Error(`seed_staff_role_failed:${staffRoleError.code}`);

    const { error: proSubscriptionError } = await admin.from("subscriptions").insert({
      user_id: uidPro,
      paddle_subscription_id: `grow_scope_${runId}_${crypto.randomUUID()}`,
      paddle_customer_id: `grow_scope_customer_${runId}`,
      product_id: "verdant_pro",
      price_id: "pro_monthly",
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: futurePeriodEnd,
      cancel_at_period_end: false,
      environment: "live",
    });
    if (proSubscriptionError) {
      throw new Error(`seed_pro_subscription_failed:${proSubscriptionError.code}`);
    }

    const growFree = await createGrow(uidFree, "Free ownership fixture");
    const growPro = await createGrow(uidPro, "Pro ownership fixture");
    const growStaff = await createGrow(uidStaff, "Staff ownership fixture");
    const nonexistentGrow = crypto.randomUUID();

    const pro = await signedInClient(emails.pro);
    const staff = await signedInClient(emails.staff);
    const free = await signedInClient(emails.free);

    const serviceSpend = (userId: string, growId: string | null, idempotencyKey: string) =>
      admin.rpc("ai_credit_spend", {
        p_user_id: userId,
        p_billing_environment: "live",
        p_feature: "ai_doctor_review",
        p_grow_id: growId,
        p_model_tier: "standard",
        p_idempotency_key: idempotencyKey,
        p_result: null,
      });
    const legacySpend = (client: SupabaseClient, growId: string | null, idempotencyKey: string) =>
      client.rpc("ai_credit_spend", {
        p_feature: "ai_doctor_review",
        p_grow_id: growId,
        p_model_tier: "standard",
        p_idempotency_key: idempotencyKey,
        p_result: null,
      });

    console.log("[ai-credit-grow-scope] service overload ownership and null matrix");
    await assertRejectedWithoutSpend(
      "service Pro foreign grow rejected with no spend delta",
      uidPro,
      (idempotencyKey) => serviceSpend(uidPro, growFree, idempotencyKey),
      "grow_not_owned",
    );
    await assertRejectedWithoutSpend(
      "service Pro nonexistent grow rejected with no spend delta",
      uidPro,
      (idempotencyKey) => serviceSpend(uidPro, nonexistentGrow, idempotencyKey),
      "grow_not_owned",
    );
    await assertAllowed(
      "service Pro own grow succeeds",
      uidPro,
      (idempotencyKey) => serviceSpend(uidPro, growPro, idempotencyKey),
      "pro_monthly",
      "per_month",
      growPro,
      true,
    );
    await assertAllowed(
      "service paid null grow remains allowed",
      uidPro,
      (idempotencyKey) => serviceSpend(uidPro, null, idempotencyKey),
      "pro_monthly",
      "per_month",
      null,
      true,
    );
    await assertRejectedWithoutSpend(
      "service staff foreign grow rejected with no spend delta",
      uidStaff,
      (idempotencyKey) => serviceSpend(uidStaff, growFree, idempotencyKey),
      "grow_not_owned",
    );
    await assertRejectedWithoutSpend(
      "service staff nonexistent grow rejected with no spend delta",
      uidStaff,
      (idempotencyKey) => serviceSpend(uidStaff, nonexistentGrow, idempotencyKey),
      "grow_not_owned",
    );
    await assertAllowed(
      "service staff own grow succeeds",
      uidStaff,
      (idempotencyKey) => serviceSpend(uidStaff, growStaff, idempotencyKey),
      "staff",
      "per_month",
      growStaff,
      true,
    );
    await assertAllowed(
      "service staff null grow remains allowed",
      uidStaff,
      (idempotencyKey) => serviceSpend(uidStaff, null, idempotencyKey),
      "staff",
      "per_month",
      null,
      true,
    );
    await assertRejectedWithoutSpend(
      "service Free null grow remains rejected with no spend delta",
      uidFree,
      (idempotencyKey) => serviceSpend(uidFree, null, idempotencyKey),
      "grow_id_required_for_plan",
    );

    await clearSpends(userIds);

    console.log("[ai-credit-grow-scope] legacy compatibility overload");
    if (legacyMode === "available") {
      await assertRejectedWithoutSpend(
        "legacy Pro foreign grow rejected with no spend delta",
        uidPro,
        (idempotencyKey) => legacySpend(pro, growFree, idempotencyKey),
        "grow_not_owned",
      );
      await assertRejectedWithoutSpend(
        "legacy Pro nonexistent grow rejected with no spend delta",
        uidPro,
        (idempotencyKey) => legacySpend(pro, nonexistentGrow, idempotencyKey),
        "grow_not_owned",
      );
      await assertAllowed(
        "legacy Pro own grow succeeds",
        uidPro,
        (idempotencyKey) => legacySpend(pro, growPro, idempotencyKey),
        "pro_monthly",
        "per_month",
        growPro,
      );
      await assertAllowed(
        "legacy paid null grow remains allowed",
        uidPro,
        (idempotencyKey) => legacySpend(pro, null, idempotencyKey),
        "pro_monthly",
        "per_month",
        null,
      );
      await assertRejectedWithoutSpend(
        "legacy staff foreign grow rejected with no spend delta",
        uidStaff,
        (idempotencyKey) => legacySpend(staff, growFree, idempotencyKey),
        "grow_not_owned",
      );
      await assertRejectedWithoutSpend(
        "legacy staff nonexistent grow rejected with no spend delta",
        uidStaff,
        (idempotencyKey) => legacySpend(staff, nonexistentGrow, idempotencyKey),
        "grow_not_owned",
      );
      await assertAllowed(
        "legacy staff own grow succeeds",
        uidStaff,
        (idempotencyKey) => legacySpend(staff, growStaff, idempotencyKey),
        "staff",
        "per_month",
        growStaff,
      );
      await assertAllowed(
        "legacy staff null grow remains allowed",
        uidStaff,
        (idempotencyKey) => legacySpend(staff, null, idempotencyKey),
        "staff",
        "per_month",
        null,
      );
      await assertRejectedWithoutSpend(
        "legacy Free null grow remains rejected with no spend delta",
        uidFree,
        (idempotencyKey) => legacySpend(free, null, idempotencyKey),
        "grow_id_required_for_plan",
      );
    } else {
      const idempotencyKey = `grow-scope-legacy-revoked:${runId}:${crypto.randomUUID()}`;
      const before = await spendCount(uidPro);
      const { data, error } = await legacySpend(pro, growPro, idempotencyKey);
      const after = await spendCount(uidPro);
      const { data: rowsWithKey, error: keyReadError } = await admin
        .from("ai_credit_spends")
        .select("id,user_id")
        .eq("idempotency_key", idempotencyKey);
      check(
        "contract legacy spend overload is revoked with no spend delta",
        !keyReadError &&
          isExpectedLegacyRevocation(error, data) &&
          after === before &&
          rowsWithKey?.length === 0,
        error?.message ??
          keyReadError?.message ??
          JSON.stringify({ data, before, after, rowsWithKey, idempotencyKey }),
      );
    }

    await clearSpends(userIds);

    console.log("[ai-credit-grow-scope] Free deletion/recreation quota continuity");
    for (let index = 1; index <= 3; index += 1) {
      await assertAllowed(
        `Free owned grow spend ${index} succeeds`,
        uidFree,
        (idempotencyKey) => serviceSpend(uidFree, growFree, idempotencyKey),
        "free",
        "per_grow",
        growFree,
        true,
      );
    }
    const countBeforeGrowDelete = await spendCount(uidFree);
    const { error: growDeleteError } = await free
      .from("grows")
      .delete()
      .eq("id", growFree)
      .eq("user_id", uidFree);
    const { data: historicalRows, error: historicalRowsError } = await admin
      .from("ai_credit_spends")
      .select("grow_id")
      .eq("user_id", uidFree)
      .eq("grow_id", growFree);
    check(
      "Free grow deletion preserves all historical grow-scoped spend rows",
      !growDeleteError &&
        !historicalRowsError &&
        historicalRows?.length === 3 &&
        (await spendCount(uidFree)) === countBeforeGrowDelete,
      growDeleteError?.message ?? historicalRowsError?.message,
    );
    await createGrow(uidFree, "Free recreated ownership fixture", growFree);
    await assertRejectedWithoutSpend(
      "same-UUID Free grow recreation cannot reset the three-credit allowance",
      uidFree,
      (idempotencyKey) => serviceSpend(uidFree, growFree, idempotencyKey),
      "limit_reached",
    );
  } finally {
    console.log("[ai-credit-grow-scope] tearing down disposable fixtures");
    if (userIds.length > 0) {
      await cleanupStep(
        "credit_spends",
        () => admin.from("ai_credit_spends").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "subscriptions",
        () => admin.from("subscriptions").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "billing_subscriptions",
        () => admin.from("billing_subscriptions").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "user_roles",
        () => admin.from("user_roles").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "grows",
        () => admin.from("grows").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "profiles",
        () => admin.from("profiles").delete().in("user_id", userIds),
        cleanupFailures,
      );
      for (const userId of userIds) {
        await cleanupStep(
          `auth_user:${userId}`,
          () => admin.auth.admin.deleteUser(userId),
          cleanupFailures,
        );
      }
    }
    if (cleanupFailures.length > 0) {
      failed += cleanupFailures.length;
      console.error(
        `[ai-credit-grow-scope] cleanup failures for ${runId}: ${cleanupFailures.join(", ")}`,
      );
    }
  }

  console.log(`[ai-credit-grow-scope] result: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

run().catch((error: unknown) => {
  console.error(`[ai-credit-grow-scope] harness failed: ${errorCode(error)}`);
  process.exitCode = 1;
});
