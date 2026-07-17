#!/usr/bin/env -S bun run
/**
 * Runtime RLS and grant proof for the private AI Doctor completion ledger.
 *
 * This harness is deliberately opt-in and defaults to a no-op. It creates
 * disposable @verdant.test users and ledger rows, then removes them in finally.
 * It may target a remote non-production project only with an additional
 * explicit environment acknowledgement.
 *
 * Run locally:
 *   AI_DOCTOR_COMPLETION_RLS_HARNESS=1 bun run test:ai-doctor-review-completion-rls
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY
 * (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CONFIRM_ENV = "AI_DOCTOR_COMPLETION_RLS_HARNESS";
const REMOTE_CONFIRM_ENV = "AI_DOCTOR_COMPLETION_RLS_HARNESS_ALLOW_REMOTE";

if (process.env[CONFIRM_ENV] !== "1") {
  console.log(
    `[ai-doctor-completion] SKIP — set ${CONFIRM_ENV}=1 to run the disposable database harness.`,
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
    console.error(`[ai-doctor-completion] missing ${name}`);
    process.exit(2);
  }
}

const hostname = new URL(SUPABASE_URL).hostname;
const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";
if (!localHost && process.env[REMOTE_CONFIRM_ENV] !== "1") {
  console.error(
    `[ai-doctor-completion] refusing remote database; set ${REMOTE_CONFIRM_ENV}=1 only for a disposable non-production project.`,
  );
  process.exit(2);
}

const runId = crypto.randomUUID().slice(0, 8);
const emailA = `ai-doctor-completion-a-${runId}@verdant.test`;
const emailB = `ai-doctor-completion-b-${runId}@verdant.test`;
const passwordA = crypto.randomUUID();
const passwordB = crypto.randomUUID();
const periodKey = new Date().toISOString().slice(0, 7);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isDenied(error: { code?: string } | null): boolean {
  return error?.code === "42501";
}

function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "unexpected";
}

async function createUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`create_user_failed:${error?.code ?? "unknown"}`);
  return data.user.id;
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign_in_failed:${error.code ?? "unknown"}`);
  return client;
}

async function seedSpend(
  userId: string,
  feature: "ai_doctor_review" | "ai_coach",
): Promise<string> {
  const { data, error } = await admin
    .from("ai_credit_spends")
    .insert({
      user_id: userId,
      period_key: periodKey,
      weight: 1,
      model_tier: "standard",
      feature,
      status: "spent",
      idempotency_key: `completion-harness:${runId}:${feature}:${crypto.randomUUID()}`,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`seed_spend_failed:${error?.code ?? "unknown"}`);
  return data.id;
}

async function readCompletion(spendId: string) {
  return admin
    .from("ai_doctor_review_completions")
    .select("spend_id,user_id,completed_at,recorded_by")
    .eq("spend_id", spendId)
    .maybeSingle();
}

function isIntactCompletion(
  row: unknown,
  spendId: string,
  userId: string,
  completedAt: string | null,
): boolean {
  return (
    isRecord(row) &&
    row.spend_id === spendId &&
    row.user_id === userId &&
    row.completed_at === completedAt &&
    row.recorded_by === "ai_doctor_review_edge"
  );
}

async function cleanupStep(
  name: string,
  operation: () => Promise<{ error: unknown | null }>,
  failures: string[],
): Promise<void> {
  try {
    const { error } = await operation();
    if (!error) {
      check(`cleanup ${name}`, true);
      return;
    }
    const code = errorCode(error);
    failures.push(`${name}:${code}`);
    check(`cleanup ${name}`, false, code);
  } catch (error: unknown) {
    const code = errorCode(error);
    failures.push(`${name}:${code}`);
    check(`cleanup ${name}`, false, code);
  }
}

async function run(): Promise<void> {
  let uidA: string | null = null;
  let uidB: string | null = null;
  const cleanupFailures: string[] = [];

  try {
    console.log("[ai-doctor-completion] creating disposable test users");
    uidA = await createUser(emailA, passwordA);
    uidB = await createUser(emailB, passwordB);
    const owner = await signedInClient(emailA, passwordA);
    const anonymous = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const reviewSpendId = await seedSpend(uidA, "ai_doctor_review");
    const authenticatedForgeSpendId = await seedSpend(uidA, "ai_doctor_review");
    const anonymousForgeSpendId = await seedSpend(uidA, "ai_doctor_review");

    console.log("[ai-doctor-completion] seeding one server-recorded protected completion");
    {
      const { data, error } = await admin.rpc("record_ai_doctor_review_completion", {
        p_spend_id: reviewSpendId,
        p_expected_user_id: uidA,
      });
      check(
        "service role records matching AI Doctor spend",
        !error && isRecord(data) && data.ok === true && data.status === "recorded",
        error?.code,
      );
    }

    const { data: seededCompletion, error: seededCompletionError } =
      await readCompletion(reviewSpendId);
    const protectedCompletedAt =
      !seededCompletionError && typeof seededCompletion?.completed_at === "string"
        ? seededCompletion.completed_at
        : null;
    check(
      "server-recorded completion exists before client-role probes",
      typeof protectedCompletedAt === "string" &&
        isIntactCompletion(seededCompletion, reviewSpendId, uidA, protectedCompletedAt),
      seededCompletionError?.code,
    );

    console.log("[ai-doctor-completion] proving client roles cannot read, write, or invoke");
    {
      const { error } = await owner
        .from("ai_doctor_review_completions")
        .select("spend_id")
        .eq("spend_id", reviewSpendId);
      check(
        "authenticated SELECT cannot read the server-recorded completion",
        isDenied(error),
        error?.code,
      );
    }
    {
      const { error } = await owner
        .from("ai_doctor_review_completions")
        .insert({ spend_id: authenticatedForgeSpendId, user_id: uidA })
        .select("spend_id");
      const { data: forgedCompletion, error: forgedCompletionError } =
        await readCompletion(authenticatedForgeSpendId);
      check(
        "authenticated INSERT cannot forge a completion",
        isDenied(error) && !forgedCompletionError && !forgedCompletion,
        error?.code ?? forgedCompletionError?.code,
      );
    }
    {
      const { error } = await owner
        .from("ai_doctor_review_completions")
        .update({ completed_at: "2000-01-01T00:00:00.000Z" })
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      const { data: protectedCompletion, error: protectedCompletionError } =
        await readCompletion(reviewSpendId);
      check(
        "authenticated UPDATE cannot alter a completion",
        isDenied(error) &&
          !protectedCompletionError &&
          isIntactCompletion(protectedCompletion, reviewSpendId, uidA, protectedCompletedAt),
        error?.code ?? protectedCompletionError?.code,
      );
    }
    {
      const { error } = await owner
        .from("ai_doctor_review_completions")
        .delete()
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      const { data: protectedCompletion, error: protectedCompletionError } =
        await readCompletion(reviewSpendId);
      check(
        "authenticated DELETE cannot remove a completion",
        isDenied(error) &&
          !protectedCompletionError &&
          isIntactCompletion(protectedCompletion, reviewSpendId, uidA, protectedCompletedAt),
        error?.code ?? protectedCompletionError?.code,
      );
    }
    {
      const { error } = await owner.rpc("record_ai_doctor_review_completion", {
        p_spend_id: reviewSpendId,
        p_expected_user_id: uidA,
      });
      check("authenticated RPC cannot record a completion", isDenied(error), error?.code);
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_completions")
        .select("spend_id")
        .eq("spend_id", reviewSpendId);
      check("anon SELECT cannot read the server-recorded completion", isDenied(error), error?.code);
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_completions")
        .insert({ spend_id: anonymousForgeSpendId, user_id: uidA })
        .select("spend_id");
      const { data: forgedCompletion, error: forgedCompletionError } =
        await readCompletion(anonymousForgeSpendId);
      check(
        "anon INSERT cannot forge a completion",
        isDenied(error) && !forgedCompletionError && !forgedCompletion,
        error?.code ?? forgedCompletionError?.code,
      );
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_completions")
        .update({ completed_at: "2000-01-01T00:00:00.000Z" })
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      const { data: protectedCompletion, error: protectedCompletionError } =
        await readCompletion(reviewSpendId);
      check(
        "anon UPDATE cannot alter a completion",
        isDenied(error) &&
          !protectedCompletionError &&
          isIntactCompletion(protectedCompletion, reviewSpendId, uidA, protectedCompletedAt),
        error?.code ?? protectedCompletionError?.code,
      );
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_completions")
        .delete()
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      const { data: protectedCompletion, error: protectedCompletionError } =
        await readCompletion(reviewSpendId);
      check(
        "anon DELETE cannot remove a completion",
        isDenied(error) &&
          !protectedCompletionError &&
          isIntactCompletion(protectedCompletion, reviewSpendId, uidA, protectedCompletedAt),
        error?.code ?? protectedCompletionError?.code,
      );
    }
    {
      const { error } = await anonymous.rpc("record_ai_doctor_review_completion", {
        p_spend_id: reviewSpendId,
        p_expected_user_id: uidA,
      });
      check("anon RPC cannot record a completion", isDenied(error), error?.code);
    }

    console.log("[ai-doctor-completion] proving service-only eligibility and idempotency");
    {
      const { data, error } = await admin.rpc("record_ai_doctor_review_completion", {
        p_spend_id: reviewSpendId,
        p_expected_user_id: uidA,
      });
      const { data: rows, error: readError } = await admin
        .from("ai_doctor_review_completions")
        .select("spend_id,user_id,completed_at,recorded_by")
        .eq("spend_id", reviewSpendId);
      const row = rows?.[0];
      check(
        "service retry is idempotent and returns expected completion linkage",
        !error &&
          isRecord(data) &&
          data.ok === true &&
          !readError &&
          rows?.length === 1 &&
          row?.spend_id === reviewSpendId &&
          row.user_id === uidA &&
          typeof row.completed_at === "string" &&
          row.recorded_by === "ai_doctor_review_edge",
        error?.code ?? readError?.code,
      );
    }
    {
      const { data, error } = await admin.rpc("record_ai_doctor_review_completion", {
        p_spend_id: reviewSpendId,
        p_expected_user_id: uidB,
      });
      check(
        "service role rejects mismatched expected user",
        !error && isRecord(data) && data.ok === false && data.reason === "spend_not_eligible",
        error?.code,
      );
    }
    {
      const coachSpendId = await seedSpend(uidA, "ai_coach");
      const { data, error } = await admin.rpc("record_ai_doctor_review_completion", {
        p_spend_id: coachSpendId,
        p_expected_user_id: uidA,
      });
      check(
        "service role rejects AI Coach spend",
        !error && isRecord(data) && data.ok === false && data.reason === "spend_not_eligible",
        error?.code,
      );
    }
    {
      const refundedSpendId = await seedSpend(uidA, "ai_doctor_review");
      const { error: refundError } = await admin.from("ai_credit_spends").insert({
        user_id: uidA,
        period_key: periodKey,
        weight: -1,
        model_tier: "standard",
        feature: "ai_doctor_review",
        status: "refunded",
        refund_of: refundedSpendId,
        idempotency_key: `completion-harness:${runId}:refund:${crypto.randomUUID()}`,
      });
      const { data, error } = await admin.rpc("record_ai_doctor_review_completion", {
        p_spend_id: refundedSpendId,
        p_expected_user_id: uidA,
      });
      check(
        "service role rejects refunded spend",
        !refundError &&
          !error &&
          isRecord(data) &&
          data.ok === false &&
          data.reason === "spend_refunded",
        refundError?.code ?? error?.code,
      );
    }
  } finally {
    console.log("[ai-doctor-completion] tearing down disposable test rows");
    if (uidA || uidB) {
      const userIds = [uidA, uidB].filter((id): id is string => Boolean(id));
      await cleanupStep(
        "completion rows",
        () => admin.from("ai_doctor_review_completions").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "credit-spend rows",
        () => admin.from("ai_credit_spends").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "profile rows",
        () => admin.from("profiles").delete().in("user_id", userIds),
        cleanupFailures,
      );
      for (const userId of userIds) {
        await cleanupStep("auth user", () => admin.auth.admin.deleteUser(userId), cleanupFailures);
      }
    }
    if (cleanupFailures.length > 0) {
      console.error(
        `[ai-doctor-completion] cleanup failures for ${runId}: ${cleanupFailures.join(", ")}`,
      );
    }
  }

  console.log(`[ai-doctor-completion] result: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

run().catch((error: unknown) => {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "unexpected";
  console.error(`[ai-doctor-completion] harness failed: ${code}`);
  process.exit(1);
});
