#!/usr/bin/env -S bun run
/**
 * Runtime RLS, grant, and atomic-finalizer proof for AI Doctor evidence receipts.
 *
 * This intentionally defaults to a no-op. With an explicit opt-in it creates
 * disposable @verdant.test users and credit spends, exercises the protected
 * finalizer, then tears everything down in finally. It refuses a non-local
 * database unless a second explicit acknowledgement is present.
 *
 * Run locally after the evidence-receipt migration is applied:
 *   AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS=1 \
 *     bun run scripts/run-ai-doctor-review-evidence-receipt-rls-harness.ts
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY
 * (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY).
 *
 * A remote disposable project additionally requires:
 *   AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS_ALLOW_REMOTE=1
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CONFIRM_ENV = "AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS";
const REMOTE_CONFIRM_ENV = "AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS_ALLOW_REMOTE";

if (process.env[CONFIRM_ENV] !== "1") {
  console.log(
    `[ai-doctor-evidence-receipt] SKIP — set ${CONFIRM_ENV}=1 to run the disposable database harness.`,
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
    console.error(`[ai-doctor-evidence-receipt] missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname;
} catch {
  console.error("[ai-doctor-evidence-receipt] SUPABASE_URL is not a valid URL");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";
if (!localHost && process.env[REMOTE_CONFIRM_ENV] !== "1") {
  console.error(
    `[ai-doctor-evidence-receipt] refusing remote database; set ${REMOTE_CONFIRM_ENV}=1 only for a disposable non-production project.`,
  );
  process.exit(2);
}

const runId = crypto.randomUUID().slice(0, 8);
const emailA = `ai-doctor-evidence-a-${runId}@verdant.test`;
const emailB = `ai-doctor-evidence-b-${runId}@verdant.test`;
const passwordA = crypto.randomUUID();
const passwordB = crypto.randomUUID();
const periodKey = new Date().toISOString().slice(0, 7);
const HMAC_FINGERPRINT = `hmac-sha256:${"a".repeat(64)}`;
const HMAC_KEY_ID = "test-key-v1";

const EVIDENCE = {
  schemaVersion: 1,
  packetSchemaVersion: 1,
  clientCollectionDecision: null,
  plantProfile: {
    hasStrain: false,
    hasStage: false,
    hasMedium: false,
    hasPotSize: false,
  },
  readiness: {
    state: "insufficient",
    evidenceCount: 0,
    missingCount: 0,
  },
  recentEvents: [],
  recentSensorSnapshot: null,
  recentSensorSnapshotAnnotation: null,
  importedSensorHistory: null,
  rootZoneObservations: [],
  missingLiveSensorReadings: true,
} as const;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

type JsonRecord = Record<string, unknown>;

interface FinalizeArgs {
  p_expected_user_id: string;
  p_spend_id: string;
  p_result: JsonRecord;
  p_evidence: JsonRecord;
  p_prompt_hmac_sha256: string;
  p_prompt_hmac_key_id: string;
  p_model_id: string;
  p_tool_schema_version: string;
  p_prompt_contract_version: string;
  p_session_id: string | null;
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

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "unexpected";
}

function isDenied(error: { code?: string } | null, data?: unknown): boolean {
  return (
    error?.code === "42501" ||
    (isRecord(data) && data.ok === false && data.reason === "not_authorized")
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function finalizerReply(
  data: unknown,
): { ok?: boolean; status?: string; reason?: string; spend_id?: string } | null {
  if (!isRecord(data)) return null;
  return {
    ok: typeof data.ok === "boolean" ? data.ok : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
    reason: typeof data.reason === "string" ? data.reason : undefined,
    spend_id: typeof data.spend_id === "string" ? data.spend_id : undefined,
  };
}

function buildFinalizeArgs(userId: string, spendId: string, sessionId: string): FinalizeArgs {
  return {
    p_expected_user_id: userId,
    p_spend_id: spendId,
    p_result: {
      summary: "Evidence-receipt harness result",
      confidence: "low",
    },
    p_evidence: EVIDENCE,
    p_prompt_hmac_sha256: HMAC_FINGERPRINT,
    p_prompt_hmac_key_id: HMAC_KEY_ID,
    p_model_id: "gpt-5.4-mini",
    p_tool_schema_version: "ai-doctor-review-tool-v1",
    p_prompt_contract_version: "ai-doctor-review-prompt-v1",
    p_session_id: sessionId,
  };
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
      idempotency_key: `evidence-receipt-harness:${runId}:${feature}:${crypto.randomUUID()}`,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`seed_spend_failed:${error?.code ?? "unknown"}`);
  return data.id;
}

async function finalize(args: FinalizeArgs) {
  return admin.rpc("ai_doctor_finalize_review", args);
}

async function readPair(spendId: string) {
  const [cacheResponse, receiptResponse] = await Promise.all([
    admin
      .from("ai_credit_spend_results")
      .select("spend_id,feature,result")
      .eq("spend_id", spendId)
      .maybeSingle(),
    admin
      .from("ai_doctor_review_evidence_receipts")
      .select(
        "spend_id,user_id,session_id,evidence,prompt_hmac_sha256,prompt_hmac_key_id,model_id,tool_schema_version,prompt_contract_version",
      )
      .eq("spend_id", spendId)
      .maybeSingle(),
  ]);
  return { cacheResponse, receiptResponse };
}

function hasIntactPair(pair: Awaited<ReturnType<typeof readPair>>, args: FinalizeArgs): boolean {
  const cache = pair.cacheResponse.data;
  const receipt = pair.receiptResponse.data;
  return (
    !pair.cacheResponse.error &&
    !pair.receiptResponse.error &&
    isRecord(cache) &&
    isRecord(receipt) &&
    cache.spend_id === args.p_spend_id &&
    cache.feature === "ai_doctor_review" &&
    canonicalJson(cache.result) === canonicalJson(args.p_result) &&
    receipt.spend_id === args.p_spend_id &&
    receipt.user_id === args.p_expected_user_id &&
    receipt.session_id === args.p_session_id &&
    canonicalJson(receipt.evidence) === canonicalJson(args.p_evidence) &&
    receipt.prompt_hmac_sha256 === args.p_prompt_hmac_sha256 &&
    receipt.prompt_hmac_key_id === args.p_prompt_hmac_key_id &&
    receipt.model_id === args.p_model_id &&
    receipt.tool_schema_version === args.p_tool_schema_version &&
    receipt.prompt_contract_version === args.p_prompt_contract_version
  );
}

async function receiptCount(spendId: string): Promise<number | null> {
  const { count, error } = await admin
    .from("ai_doctor_review_evidence_receipts")
    .select("spend_id", { count: "exact", head: true })
    .eq("spend_id", spendId);
  return error ? null : count;
}

async function cacheCount(spendId: string): Promise<number | null> {
  const { count, error } = await admin
    .from("ai_credit_spend_results")
    .select("spend_id", { count: "exact", head: true })
    .eq("spend_id", spendId);
  return error ? null : count;
}

async function cleanupStep(
  name: string,
  operation: () => PromiseLike<{ error: unknown | null }>,
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
    console.log("[ai-doctor-evidence-receipt] creating disposable test users");
    uidA = await createUser(emailA, passwordA);
    uidB = await createUser(emailB, passwordB);
    const owner = await signedInClient(emailA, passwordA);
    const anonymous = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const reviewSpendId = await seedSpend(uidA, "ai_doctor_review");
    const coachSpendId = await seedSpend(uidA, "ai_coach");
    const directDmlSpendId = await seedSpend(uidA, "ai_doctor_review");
    const args = buildFinalizeArgs(uidA, reviewSpendId, crypto.randomUUID());

    console.log("[ai-doctor-evidence-receipt] proving atomic fresh/replay/conflict behavior");
    {
      const { data, error } = await finalize(args);
      const pair = await readPair(reviewSpendId);
      check(
        "service role finalizes a fresh AI Doctor result and receipt together",
        !error &&
          finalizerReply(data)?.ok === true &&
          finalizerReply(data)?.status === "recorded" &&
          finalizerReply(data)?.spend_id === reviewSpendId &&
          hasIntactPair(pair, args),
        error?.code,
      );
    }
    {
      const { data, error } = await finalize(args);
      const pair = await readPair(reviewSpendId);
      const [cacheRows, receiptRows] = await Promise.all([
        cacheCount(reviewSpendId),
        receiptCount(reviewSpendId),
      ]);
      check(
        "same finalizer inputs replay one intact cache-and-receipt pair",
        !error &&
          finalizerReply(data)?.ok === true &&
          finalizerReply(data)?.status === "replayed" &&
          cacheRows === 1 &&
          receiptRows === 1 &&
          hasIntactPair(pair, args),
        error?.code,
      );
    }
    {
      const { data, error } = await finalize({
        ...args,
        p_result: { ...args.p_result, confidence: "high" },
      });
      const pair = await readPair(reviewSpendId);
      check(
        "different result is rejected without changing the paired receipt",
        !error &&
          finalizerReply(data)?.ok === false &&
          finalizerReply(data)?.reason === "result_conflict" &&
          hasIntactPair(pair, args),
        error?.code,
      );
    }
    {
      const { data, error } = await finalize({
        ...args,
        p_evidence: { ...args.p_evidence, missingLiveSensorReadings: false },
      });
      const pair = await readPair(reviewSpendId);
      check(
        "different evidence is rejected without changing the paired result",
        !error &&
          finalizerReply(data)?.ok === false &&
          finalizerReply(data)?.reason === "receipt_conflict" &&
          hasIntactPair(pair, args),
        error?.code,
      );
    }
    {
      const { data, error } = await finalize({ ...args, p_expected_user_id: uidB });
      check(
        "service role rejects a mismatched expected user",
        !error &&
          finalizerReply(data)?.ok === false &&
          finalizerReply(data)?.reason === "spend_not_finalizable",
        error?.code,
      );
    }
    {
      const { data, error } = await finalize(
        buildFinalizeArgs(uidA, coachSpendId, crypto.randomUUID()),
      );
      check(
        "service role rejects a non-AI-Doctor spend",
        !error &&
          finalizerReply(data)?.ok === false &&
          finalizerReply(data)?.reason === "feature_mismatch",
        error?.code,
      );
    }

    console.log("[ai-doctor-evidence-receipt] proving receipt storage is private and immutable");
    const directReceipt = {
      spend_id: directDmlSpendId,
      user_id: uidA,
      session_id: crypto.randomUUID(),
      evidence: EVIDENCE,
      prompt_hmac_sha256: HMAC_FINGERPRINT,
      prompt_hmac_key_id: HMAC_KEY_ID,
      model_id: "gpt-5.4-mini",
      tool_schema_version: "ai-doctor-review-tool-v1",
      prompt_contract_version: "ai-doctor-review-prompt-v1",
    };

    {
      const { data, error } = await admin
        .from("ai_doctor_review_evidence_receipts")
        .select("spend_id")
        .eq("spend_id", reviewSpendId);
      check(
        "service role can read the protected receipt for server diagnostics",
        !error && (data ?? []).length === 1,
        error?.code,
      );
    }
    {
      const { error } = await admin
        .from("ai_doctor_review_evidence_receipts")
        .insert(directReceipt)
        .select("spend_id");
      check("service role direct INSERT is denied", isDenied(error), error?.code);
    }
    {
      const { error } = await admin
        .from("ai_doctor_review_evidence_receipts")
        .update({ model_id: "tampered" })
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      check("service role direct UPDATE is denied", isDenied(error), error?.code);
    }
    {
      const { error } = await admin
        .from("ai_doctor_review_evidence_receipts")
        .delete()
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      check("service role direct DELETE is denied", isDenied(error), error?.code);
    }
    {
      const { error } = await owner
        .from("ai_doctor_review_evidence_receipts")
        .select("spend_id")
        .eq("spend_id", reviewSpendId);
      check("authenticated SELECT cannot read its receipt", isDenied(error), error?.code);
    }
    {
      const { error } = await owner
        .from("ai_doctor_review_evidence_receipts")
        .insert(directReceipt)
        .select("spend_id");
      check("authenticated INSERT cannot forge a receipt", isDenied(error), error?.code);
    }
    {
      const { error } = await owner
        .from("ai_doctor_review_evidence_receipts")
        .update({ model_id: "tampered" })
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      check("authenticated UPDATE cannot alter a receipt", isDenied(error), error?.code);
    }
    {
      const { error } = await owner
        .from("ai_doctor_review_evidence_receipts")
        .delete()
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      check("authenticated DELETE cannot remove a receipt", isDenied(error), error?.code);
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_evidence_receipts")
        .select("spend_id")
        .eq("spend_id", reviewSpendId);
      check("anon SELECT cannot read a receipt", isDenied(error), error?.code);
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_evidence_receipts")
        .insert(directReceipt)
        .select("spend_id");
      check("anon INSERT cannot forge a receipt", isDenied(error), error?.code);
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_evidence_receipts")
        .update({ model_id: "tampered" })
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      check("anon UPDATE cannot alter a receipt", isDenied(error), error?.code);
    }
    {
      const { error } = await anonymous
        .from("ai_doctor_review_evidence_receipts")
        .delete()
        .eq("spend_id", reviewSpendId)
        .select("spend_id");
      check("anon DELETE cannot remove a receipt", isDenied(error), error?.code);
    }
    {
      const pair = await readPair(reviewSpendId);
      check(
        "all direct DML probes leave the server-recorded pair intact",
        hasIntactPair(pair, args),
        pair.cacheResponse.error?.code ?? pair.receiptResponse.error?.code,
      );
    }

    console.log("[ai-doctor-evidence-receipt] proving finalizer RPC is not a browser API");
    {
      const { data, error } = await owner.rpc("ai_doctor_finalize_review", args);
      check("authenticated client cannot invoke the finalizer", isDenied(error, data), error?.code);
    }
    {
      const { data, error } = await anonymous.rpc("ai_doctor_finalize_review", args);
      check("anon client cannot invoke the finalizer", isDenied(error, data), error?.code);
    }
  } finally {
    console.log("[ai-doctor-evidence-receipt] tearing down disposable test rows");
    const userIds = [uidA, uidB].filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      await cleanupStep(
        "credit-spend rows (cascades cache and receipt sidecars)",
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
        `[ai-doctor-evidence-receipt] cleanup failures for ${runId}: ${cleanupFailures.join(", ")}`,
      );
    }
  }

  console.log(`[ai-doctor-evidence-receipt] result: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

run().catch((error: unknown) => {
  const code = errorCode(error);
  console.error(`[ai-doctor-evidence-receipt] harness failed: ${code}`);
  process.exit(1);
});
