#!/usr/bin/env -S bun run
/**
 * Runtime ACL harness for the 20260805090000 security-advisor-hardening
 * migration: lovable_paddle_events, lead_events, quicklog_save_manual.
 *
 * This checks EFFECTIVE privileges the way the running app actually sees
 * them -- through PostgREST via supabase-js, same as every other local
 * security lane in this repo -- not raw pg_catalog introspection.
 *
 * For lead_events specifically this is a stronger signal than it first
 * looks: before the migration, anon held a blanket table-level SELECT
 * grant and RLS (which evaluates AFTER the grant check) filtered every row
 * out, so an anon SELECT returned an empty array with no error. After the
 * migration, anon has no table-level grant at all, so the same SELECT now
 * fails at the grant layer with a hard permission error -- a real,
 * verifiable before/after difference, not a restatement of what RLS
 * already did.
 *
 * For quicklog_save_manual: the function is SECURITY DEFINER and used to
 * run to completion for anon callers, returning an application-level
 * "not_authenticated" response, because anon still had EXECUTE. After the
 * migration, anon should get a hard database permission error before the
 * function body ever runs -- a categorically different, easily
 * distinguished signal.
 *
 * This harness is intentionally local-only because it creates an Auth user
 * with the operator role to prove the lead_events re-grant didn't get lost
 * in the revoke-then-regrant rewrite:
 *
 *   bun run scripts/run-security-advisor-hardening-followup-db-security.ts --confirm-local-security-lane
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY
 *     (SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY are accepted aliases)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_LANE_FLAG = "--confirm-local-security-lane";

if (!process.argv.includes(LOCAL_LANE_FLAG)) {
  console.log(
    `[security-advisor-hardening-followup] SKIP — pass ${LOCAL_LANE_FLAG} to run the disposable local ACL harness.`,
  );
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

for (const [name, value] of [
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["SUPABASE_ANON_KEY", anonKey],
] as const) {
  if (!value) {
    console.error(`[security-advisor-hardening-followup] missing ${name}`);
    process.exit(2);
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

let targetHostname: string;
try {
  targetHostname = new URL(supabaseUrl!).hostname;
} catch {
  console.error("[security-advisor-hardening-followup] database API URL is invalid");
  process.exit(2);
}

if (!isLoopbackHost(targetHostname)) {
  console.error("[security-advisor-hardening-followup] local security lane requires a loopback database");
  process.exit(2);
}

const admin = createClient(supabaseUrl!, serviceKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonymous = createClient(supabaseUrl!, anonKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runId = crypto.randomUUID();
const marker = `sec-hardening-${runId}`;
const createdUserIds: string[] = [];
let createdLeadId: string | null = null;
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

function safeError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message.slice(0, 300);
  if (typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    const code = typeof record.code === "string" ? record.code : "db_error";
    const message = typeof record.message === "string" ? record.message : "request failed";
    return `${code}: ${message}`.slice(0, 300);
  }
  return String(error).slice(0, 300);
}

const PERMISSION_DENIAL_CODES = new Set(["42501"]);
function isPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const message = typeof record.message === "string" ? record.message : "";
  return PERMISSION_DENIAL_CODES.has(code) || /permission denied/i.test(message);
}

async function createUser(label: string): Promise<{ id: string; email: string; password: string }> {
  const email = `sec-hardening-${label}-${runId}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`create synthetic user failed: ${safeError(error) ?? "missing user"}`);
  }
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signedInClient(user: { email: string; password: string }): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) {
    throw new Error(`sign in synthetic user failed: ${safeError(error)}`);
  }
  return client;
}

async function checkLovablePaddleEvents(): Promise<void> {
  console.log("→ lovable_paddle_events: anon has no effective table privilege");

  const { error: selectError } = await anonymous
    .from("lovable_paddle_events")
    .select("id")
    .limit(1);
  check(
    "anon select on lovable_paddle_events denied at the grant layer",
    isPermissionDenied(selectError),
    selectError ? safeError(selectError) : "select unexpectedly succeeded",
  );

  const { error: insertError } = await anonymous
    .from("lovable_paddle_events")
    .insert({ event_type: `${marker}:probe` } as never);
  check(
    "anon insert on lovable_paddle_events denied at the grant layer",
    isPermissionDenied(insertError),
    insertError ? safeError(insertError) : "insert unexpectedly succeeded",
  );
}

async function checkLeadEvents(): Promise<void> {
  console.log("→ lead_events: anon denied, operator-role authenticated still allowed");

  const { error: anonSelectError } = await anonymous.from("lead_events").select("id").limit(1);
  check(
    "anon select on lead_events denied at the grant layer",
    isPermissionDenied(anonSelectError),
    anonSelectError ? safeError(anonSelectError) : "select unexpectedly succeeded",
  );

  const { error: anonInsertError } = await anonymous.from("lead_events").insert({
    lead_id: "00000000-0000-0000-0000-000000000000",
    event_type: "note",
    note: `${marker}:probe`,
  } as never);
  check(
    "anon insert on lead_events denied at the grant layer",
    isPermissionDenied(anonInsertError),
    anonInsertError ? safeError(anonInsertError) : "insert unexpectedly succeeded",
  );

  const operator = await createUser("operator");
  const { error: roleError } = await admin
    .from("user_roles")
    .insert({ user_id: operator.id, role: "operator" });
  if (roleError) {
    throw new Error(`grant synthetic operator role failed: ${safeError(roleError)}`);
  }
  const operatorClient = await signedInClient(operator);

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({ email: `sec-hardening-lead-${runId}@verdant.test` } as never)
    .select("id")
    .single();
  if (leadError || !lead) {
    throw new Error(`create synthetic lead failed: ${safeError(leadError) ?? "missing row"}`);
  }
  createdLeadId = lead.id as string;

  const { error: operatorInsertError } = await operatorClient.from("lead_events").insert({
    lead_id: createdLeadId,
    actor_user_id: operator.id,
    event_type: "note",
    note: `${marker}:operator-note`,
  } as never);
  check(
    "operator-role authenticated insert on lead_events allowed (re-grant intact)",
    !operatorInsertError,
    safeError(operatorInsertError),
  );

  const { data: operatorRead, error: operatorReadError } = await operatorClient
    .from("lead_events")
    .select("id")
    .eq("lead_id", createdLeadId);
  check(
    "operator-role authenticated select on lead_events allowed (re-grant intact)",
    !operatorReadError && Array.isArray(operatorRead) && operatorRead.length > 0,
    safeError(operatorReadError),
  );
}

async function checkQuicklogSaveManual(): Promise<void> {
  console.log("→ quicklog_save_manual: anon gets a grant-layer denial, not a business-logic response");

  const probePayload = {
    p_target_type: "tent",
    p_target_id: "00000000-0000-0000-0000-000000000000",
    p_action: "note",
    p_volume_ml: null,
    p_note: `${marker}:probe`,
    p_temperature_c: null,
    p_humidity_pct: null,
    p_vpd_kpa: null,
    p_occurred_at: null,
    p_details: null,
    p_stage: null,
    p_idempotency_key: `${marker}:idem`,
  };

  const { error: anonError } = await anonymous.rpc("quicklog_save_manual" as never, probePayload as never);
  check(
    "anon call to quicklog_save_manual denied at the grant layer (not a not_authenticated response)",
    isPermissionDenied(anonError),
    anonError ? safeError(anonError) : "rpc unexpectedly succeeded for anon",
  );

  const submitter = await createUser("submitter");
  const submitterClient = await signedInClient(submitter);
  const { error: authError } = await submitterClient.rpc(
    "quicklog_save_manual" as never,
    probePayload as never,
  );
  // Not asserting success here -- the probe target doesn't exist, so the
  // function's own business logic is expected to reject it. What matters
  // is that authenticated callers never hit the grant-layer denial anon
  // does, proving the EXECUTE grant to authenticated is intact.
  check(
    "authenticated call to quicklog_save_manual is not denied at the grant layer",
    !isPermissionDenied(authError),
    authError ? safeError(authError) : undefined,
  );
}

async function main(): Promise<void> {
  await checkLovablePaddleEvents();
  await checkLeadEvents();
  await checkQuicklogSaveManual();
}

async function cleanupStep(
  label: string,
  operation: () => Promise<{ error: unknown }>,
  cleanupErrors: string[],
): Promise<void> {
  try {
    const { error } = await operation();
    if (error) cleanupErrors.push(`${label}: ${safeError(error)}`);
  } catch (error) {
    cleanupErrors.push(`${label}: ${safeError(error)}`);
  }
}

async function teardown(): Promise<string[]> {
  const cleanupErrors: string[] = [];

  await cleanupStep(
    "delete lead_events marker rows",
    async () => {
      const { error } = await admin.from("lead_events").delete().like("note", `${marker}%`);
      return { error };
    },
    cleanupErrors,
  );
  if (createdLeadId) {
    await cleanupStep(
      "delete synthetic lead",
      async () => {
        const { error } = await admin.from("leads").delete().eq("id", createdLeadId as string);
        return { error };
      },
      cleanupErrors,
    );
  }
  if (createdUserIds.length > 0) {
    await cleanupStep(
      "delete user_roles",
      async () => {
        const { error } = await admin.from("user_roles").delete().in("user_id", createdUserIds);
        return { error };
      },
      cleanupErrors,
    );
    await cleanupStep(
      "delete profiles",
      async () => {
        const { error } = await admin.from("profiles").delete().in("user_id", createdUserIds);
        return { error };
      },
      cleanupErrors,
    );
  }
  for (const userId of createdUserIds) {
    await cleanupStep(
      "delete auth user",
      async () => {
        const { error } = await admin.auth.admin.deleteUser(userId);
        return { error };
      },
      cleanupErrors,
    );
  }

  return cleanupErrors;
}

await main()
  .catch((error) => {
    failed += 1;
    console.error(`[security-advisor-hardening-followup] harness error: ${safeError(error)}`);
  })
  .finally(async () => {
    const teardownProblems = await teardown().catch((error) => [
      `teardown execution: ${safeError(error)}`,
    ]);
    if (teardownProblems.length > 0) {
      failed += 1;
      console.error(`[security-advisor-hardening-followup] teardown failed: ${teardownProblems.join("; ")}`);
    }

    console.log(`\nsecurity-advisor-hardening-followup ACL harness: ${passed} passed, ${failed} failed`);
    process.exitCode = failed === 0 ? 0 : 1;
  });
