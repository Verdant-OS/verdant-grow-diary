#!/usr/bin/env -S bun run
/**
 * Runtime RLS and grant proof for private AI Doctor session history.
 *
 * This harness is deliberately opt-in and defaults to a no-op. It creates
 * disposable @verdant.test users and scoped rows, then removes them in finally.
 * It may target a remote non-production project only with an additional
 * explicit environment acknowledgement. Verdant production is always refused.
 *
 * Run locally:
 *   AI_DOCTOR_SESSIONS_RLS_HARNESS=1 bun run test:ai-doctor-sessions-rls
 *
 * Remote disposable projects additionally require:
 *   AI_DOCTOR_SESSIONS_RLS_HARNESS_ALLOW_REMOTE=1
 *   AI_DOCTOR_SESSIONS_RLS_HARNESS_EXPECTED_PROJECT_REF=<project-ref>
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY
 * (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CONFIRM_ENV = "AI_DOCTOR_SESSIONS_RLS_HARNESS";
const REMOTE_CONFIRM_ENV = "AI_DOCTOR_SESSIONS_RLS_HARNESS_ALLOW_REMOTE";
const EXPECTED_REMOTE_REF_ENV = "AI_DOCTOR_SESSIONS_RLS_HARNESS_EXPECTED_PROJECT_REF";
const LOCAL_LANE_FLAG = "--confirm-local-security-lane";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const localLaneConfirmed = process.argv.includes(LOCAL_LANE_FLAG);

if (process.env[CONFIRM_ENV] !== "1" && !localLaneConfirmed) {
  console.log(
    `[ai-doctor-sessions] SKIP — set ${CONFIRM_ENV}=1 to run the disposable database harness.`,
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
    console.error(`[ai-doctor-sessions] missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[ai-doctor-sessions] SUPABASE_URL is invalid");
  process.exit(2);
}

if (
  hostname === PRODUCTION_PROJECT_REF ||
  hostname.startsWith(`${PRODUCTION_PROJECT_REF}.`) ||
  hostname.includes(`.${PRODUCTION_PROJECT_REF}.`)
) {
  console.error("[ai-doctor-sessions] refusing Verdant production database");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

if (localLaneConfirmed && !localHost) {
  console.error("[ai-doctor-sessions] local security lane requires a loopback database");
  process.exit(2);
}

if (!localHost) {
  const expectedRemoteRef = process.env[EXPECTED_REMOTE_REF_ENV];
  const expectedRemoteHost = expectedRemoteRef ? `${expectedRemoteRef}.supabase.co` : null;
  const remoteConfirmed =
    process.env[REMOTE_CONFIRM_ENV] === "1" &&
    /^[a-z0-9]{20}$/.test(expectedRemoteRef ?? "") &&
    expectedRemoteRef !== PRODUCTION_PROJECT_REF &&
    hostname === expectedRemoteHost;

  if (remoteConfirmed) {
    // The caller acknowledged a specific disposable project and the URL matches it exactly.
  } else {
    console.error(
      `[ai-doctor-sessions] refusing unverified remote database; set ${REMOTE_CONFIRM_ENV}=1 and ${EXPECTED_REMOTE_REF_ENV} to the canonical disposable project ref.`,
    );
    process.exit(2);
  }
}

const runId = crypto.randomUUID().slice(0, 8);
const emailA = `ai-doctor-sessions-a-${runId}@verdant.test`;
const emailB = `ai-doctor-sessions-b-${runId}@verdant.test`;
const passwordA = crypto.randomUUID();
const passwordB = crypto.randomUUID();

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

function errorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "unexpected";
}

function isDenied(error: { code?: string } | null): boolean {
  return error?.code === "42501";
}

function isDeniedOrNoRows(error: { code?: string } | null, rows: unknown[] | null): boolean {
  return isDenied(error) || (!error && Array.isArray(rows) && rows.length === 0);
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

interface ScopeFixtures {
  growId: string;
  tentId: string;
  plantId: string;
}

async function seedScopes(userId: string, label: string): Promise<ScopeFixtures> {
  const { data: grow, error: growError } = await admin
    .from("grows")
    .insert({ user_id: userId, name: `RLS grow ${label}` })
    .select("id")
    .single();
  if (growError || !grow?.id) {
    throw new Error(`seed_grow_failed:${growError?.code ?? "unknown"}`);
  }

  const { data: tent, error: tentError } = await admin
    .from("tents")
    .insert({ user_id: userId, name: `RLS tent ${label}` })
    .select("id")
    .single();
  if (tentError || !tent?.id) {
    throw new Error(`seed_tent_failed:${tentError?.code ?? "unknown"}`);
  }

  const { data: plant, error: plantError } = await admin
    .from("plants")
    .insert({
      user_id: userId,
      tent_id: tent.id,
      name: `RLS plant ${label}`,
    })
    .select("id")
    .single();
  if (plantError || !plant?.id) {
    throw new Error(`seed_plant_failed:${plantError?.code ?? "unknown"}`);
  }

  return { growId: grow.id, tentId: tent.id, plantId: plant.id };
}

async function readSession(sessionId: string) {
  return admin
    .from("ai_doctor_sessions")
    .select("id,user_id,grow_id,tent_id,plant_id,question")
    .eq("id", sessionId)
    .maybeSingle();
}

function isIntactSession(
  row: unknown,
  expected: {
    id: string;
    userId: string;
    scope: ScopeFixtures;
    question: string;
  },
): boolean {
  return (
    isRecord(row) &&
    row.id === expected.id &&
    row.user_id === expected.userId &&
    row.grow_id === expected.scope.growId &&
    row.tent_id === expected.scope.tentId &&
    row.plant_id === expected.scope.plantId &&
    row.question === expected.question
  );
}

async function assertRejectedInsert(
  name: string,
  client: SupabaseClient,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("ai_doctor_sessions").insert(payload).select("id");
  const { data: stored, error: readError } = await readSession(sessionId);
  check(name, isDenied(error) && !readError && !stored, error?.code ?? readError?.code);
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
    console.log("[ai-doctor-sessions] creating disposable users and owned scopes");
    uidA = await createUser(emailA, passwordA);
    uidB = await createUser(emailB, passwordB);
    const ownerA = await signedInClient(emailA, passwordA);
    const ownerB = await signedInClient(emailB, passwordB);
    const anonymous = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const scopeA = await seedScopes(uidA, "A");
    const scopeB = await seedScopes(uidB, "B");

    const sessionAId = crypto.randomUUID();
    const sessionADefaultId = crypto.randomUUID();
    const sessionBId = crypto.randomUUID();
    const questionA = `RLS owner question ${runId}`;
    const questionB = `RLS second owner question ${runId}`;

    console.log("[ai-doctor-sessions] proving owner inserts and owner-only reads");
    {
      const { data, error } = await ownerA
        .from("ai_doctor_sessions")
        .insert({
          id: sessionAId,
          user_id: uidA,
          grow_id: scopeA.growId,
          tent_id: scopeA.tentId,
          plant_id: scopeA.plantId,
          question: questionA,
        })
        .select("id,user_id,grow_id,tent_id,plant_id,question")
        .single();
      check(
        "owner inserts a fully owned session with explicit user_id",
        !error &&
          isIntactSession(data, {
            id: sessionAId,
            userId: uidA,
            scope: scopeA,
            question: questionA,
          }),
        error?.code,
      );
    }
    {
      const { data, error } = await ownerA
        .from("ai_doctor_sessions")
        .insert({
          id: sessionADefaultId,
          grow_id: scopeA.growId,
          tent_id: scopeA.tentId,
          plant_id: scopeA.plantId,
          question: `RLS default owner ${runId}`,
        })
        .select("id,user_id")
        .single();
      check(
        "auth.uid default records the signed-in owner",
        !error && data?.id === sessionADefaultId && data.user_id === uidA,
        error?.code,
      );
    }
    {
      const { data, error } = await ownerB
        .from("ai_doctor_sessions")
        .insert({
          id: sessionBId,
          user_id: uidB,
          grow_id: scopeB.growId,
          tent_id: scopeB.tentId,
          plant_id: scopeB.plantId,
          question: questionB,
        })
        .select("id,user_id,grow_id,tent_id,plant_id,question")
        .single();
      check(
        "second owner inserts a fully owned session",
        !error &&
          isIntactSession(data, {
            id: sessionBId,
            userId: uidB,
            scope: scopeB,
            question: questionB,
          }),
        error?.code,
      );
    }
    {
      const { data, error } = await ownerA.from("ai_doctor_sessions").select("id").order("id");
      const ids = data?.map((row) => row.id).sort() ?? [];
      check(
        "owner listing contains only that owner's sessions",
        !error &&
          ids.length === 2 &&
          ids.includes(sessionAId) &&
          ids.includes(sessionADefaultId) &&
          !ids.includes(sessionBId),
        error?.code,
      );
    }
    {
      const { data, error } = await ownerB
        .from("ai_doctor_sessions")
        .select("id")
        .eq("id", sessionAId);
      const { data: protectedRow, error: readError } = await readSession(sessionAId);
      check(
        "another owner cannot read a known foreign session",
        !error &&
          data?.length === 0 &&
          !readError &&
          isIntactSession(protectedRow, {
            id: sessionAId,
            userId: uidA,
            scope: scopeA,
            question: questionA,
          }),
        error?.code ?? readError?.code,
      );
    }
    for (const [field, value] of [
      ["grow_id", scopeA.growId],
      ["tent_id", scopeA.tentId],
      ["plant_id", scopeA.plantId],
    ] as const) {
      const { data, error } = await ownerB.from("ai_doctor_sessions").select("id").eq(field, value);
      check(
        `foreign ${field} filter does not reveal another owner's sessions`,
        !error && data?.length === 0,
        error?.code,
      );
    }

    console.log("[ai-doctor-sessions] proving insert ownership checks");
    {
      const rejectedId = crypto.randomUUID();
      await assertRejectedInsert("owner cannot forge another user's user_id", ownerA, rejectedId, {
        id: rejectedId,
        user_id: uidB,
        grow_id: scopeA.growId,
        tent_id: scopeA.tentId,
        plant_id: scopeA.plantId,
        question: `RLS forged owner ${runId}`,
      });
    }
    for (const [name, overrides] of [
      ["owner cannot reference another user's grow", { grow_id: scopeB.growId }],
      ["owner cannot reference another user's tent", { tent_id: scopeB.tentId }],
      ["owner cannot reference another user's plant", { plant_id: scopeB.plantId }],
    ] as const) {
      const rejectedId = crypto.randomUUID();
      await assertRejectedInsert(name, ownerA, rejectedId, {
        id: rejectedId,
        user_id: uidA,
        grow_id: scopeA.growId,
        tent_id: scopeA.tentId,
        plant_id: scopeA.plantId,
        question: `RLS rejected scope ${runId}`,
        ...overrides,
      });
    }

    console.log("[ai-doctor-sessions] proving authenticated history is immutable");
    for (const [actor, client] of [
      ["owner", ownerA],
      ["another user", ownerB],
    ] as const) {
      const { data, error } = await client
        .from("ai_doctor_sessions")
        .update({ question: `RLS unauthorized update ${runId}` })
        .eq("id", sessionAId)
        .select("id");
      const { data: protectedRow, error: readError } = await readSession(sessionAId);
      const mutationDenied = actor === "owner" ? isDenied(error) : isDeniedOrNoRows(error, data);
      check(
        `${actor} cannot update persisted history`,
        mutationDenied &&
          !readError &&
          isIntactSession(protectedRow, {
            id: sessionAId,
            userId: uidA,
            scope: scopeA,
            question: questionA,
          }),
        error?.code ?? readError?.code,
      );
    }
    for (const [actor, client] of [
      ["owner", ownerA],
      ["another user", ownerB],
    ] as const) {
      const { data, error } = await client
        .from("ai_doctor_sessions")
        .delete()
        .eq("id", sessionAId)
        .select("id");
      const { data: protectedRow, error: readError } = await readSession(sessionAId);
      const mutationDenied = actor === "owner" ? isDenied(error) : isDeniedOrNoRows(error, data);
      check(
        `${actor} cannot delete persisted history`,
        mutationDenied &&
          !readError &&
          isIntactSession(protectedRow, {
            id: sessionAId,
            userId: uidA,
            scope: scopeA,
            question: questionA,
          }),
        error?.code ?? readError?.code,
      );
    }

    console.log("[ai-doctor-sessions] proving anonymous isolation");
    {
      const { data, error } = await anonymous
        .from("ai_doctor_sessions")
        .select("id")
        .eq("id", sessionAId);
      const { data: protectedRow, error: readError } = await readSession(sessionAId);
      check(
        "anonymous SELECT cannot read persisted history",
        isDeniedOrNoRows(error, data) &&
          !readError &&
          isIntactSession(protectedRow, {
            id: sessionAId,
            userId: uidA,
            scope: scopeA,
            question: questionA,
          }),
        error?.code ?? readError?.code,
      );
    }
    {
      const rejectedId = crypto.randomUUID();
      await assertRejectedInsert(
        "anonymous INSERT cannot create persisted history",
        anonymous,
        rejectedId,
        {
          id: rejectedId,
          user_id: uidA,
          grow_id: scopeA.growId,
          tent_id: scopeA.tentId,
          plant_id: scopeA.plantId,
          question: `RLS anonymous insert ${runId}`,
        },
      );
    }
    {
      const { data, error } = await anonymous
        .from("ai_doctor_sessions")
        .update({ question: `RLS anonymous update ${runId}` })
        .eq("id", sessionAId)
        .select("id");
      const { data: protectedRow, error: readError } = await readSession(sessionAId);
      check(
        "anonymous UPDATE cannot alter persisted history",
        isDeniedOrNoRows(error, data) &&
          !readError &&
          isIntactSession(protectedRow, {
            id: sessionAId,
            userId: uidA,
            scope: scopeA,
            question: questionA,
          }),
        error?.code ?? readError?.code,
      );
    }
    {
      const { data, error } = await anonymous
        .from("ai_doctor_sessions")
        .delete()
        .eq("id", sessionAId)
        .select("id");
      const { data: protectedRow, error: readError } = await readSession(sessionAId);
      check(
        "anonymous DELETE cannot remove persisted history",
        isDeniedOrNoRows(error, data) &&
          !readError &&
          isIntactSession(protectedRow, {
            id: sessionAId,
            userId: uidA,
            scope: scopeA,
            question: questionA,
          }),
        error?.code ?? readError?.code,
      );
    }
  } finally {
    console.log("[ai-doctor-sessions] tearing down disposable rows");
    const userIds = [uidA, uidB].filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      await cleanupStep(
        "session rows",
        () => admin.from("ai_doctor_sessions").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "plant rows",
        () => admin.from("plants").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "tent rows",
        () => admin.from("tents").delete().in("user_id", userIds),
        cleanupFailures,
      );
      await cleanupStep(
        "grow rows",
        () => admin.from("grows").delete().in("user_id", userIds),
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
        `[ai-doctor-sessions] cleanup failures for ${runId}: ${cleanupFailures.join(", ")}`,
      );
    }
  }

  console.log(`[ai-doctor-sessions] result: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

run().catch((error: unknown) => {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "unexpected";
  console.error(`[ai-doctor-sessions] harness failed: ${code}`);
  process.exit(1);
});
