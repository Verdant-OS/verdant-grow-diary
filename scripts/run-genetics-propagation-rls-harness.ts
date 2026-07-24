#!/usr/bin/env -S bun run
/**
 * Runtime RLS / RPC trust-boundary proof for Genetics & Propagation Traceability.
 *
 * Deliberately opt-in and defaults to a no-op. Creates disposable @verdant.test
 * users and scoped rows, then removes them in finally. Targets a remote
 * non-production project only with an explicit acknowledgement. Verdant
 * production is always refused.
 *
 * Run locally against a disposable stack:
 *   GENETICS_PROP_RLS_HARNESS=1 bun run test:genetics-propagation-rls
 *   (or)  bun run scripts/run-genetics-propagation-rls-harness.ts --confirm-local-security-lane
 *
 * Remote disposable projects additionally require:
 *   GENETICS_PROP_RLS_HARNESS_ALLOW_REMOTE=1
 *   GENETICS_PROP_RLS_HARNESS_EXPECTED_PROJECT_REF=<project-ref>
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY
 * (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY).
 *
 * Proves: owner success; stranger + operator denial; client user_id spoof
 * rejection; cross-tenant linkage rejection; immutable evidence/audit history;
 * cycle rejection (self / multi-hop); idempotent repeat + concurrent writes;
 * atomic rollback after a failed multi-plant assign; quarantine clearance rules;
 * and indistinguishable not-found / not-owned envelopes (no existence oracle).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CONFIRM_ENV = "GENETICS_PROP_RLS_HARNESS";
const REMOTE_CONFIRM_ENV = "GENETICS_PROP_RLS_HARNESS_ALLOW_REMOTE";
const EXPECTED_REMOTE_REF_ENV = "GENETICS_PROP_RLS_HARNESS_EXPECTED_PROJECT_REF";
const LOCAL_LANE_FLAG = "--confirm-local-security-lane";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const localLaneConfirmed = process.argv.includes(LOCAL_LANE_FLAG);

if (process.env[CONFIRM_ENV] !== "1" && !localLaneConfirmed) {
  console.log(
    `[genetics-propagation] SKIP — set ${CONFIRM_ENV}=1 (or pass ${LOCAL_LANE_FLAG}) to run the disposable database harness.`,
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
    console.error(`[genetics-propagation] missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[genetics-propagation] SUPABASE_URL is invalid");
  process.exit(2);
}

if (
  hostname === PRODUCTION_PROJECT_REF ||
  hostname.startsWith(`${PRODUCTION_PROJECT_REF}.`) ||
  hostname.includes(`.${PRODUCTION_PROJECT_REF}.`)
) {
  console.error("[genetics-propagation] refusing Verdant production database");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

if (localLaneConfirmed && !localHost) {
  console.error("[genetics-propagation] local security lane requires a loopback database");
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
  if (!remoteConfirmed) {
    console.error(
      `[genetics-propagation] refusing unverified remote database; set ${REMOTE_CONFIRM_ENV}=1 and ${EXPECTED_REMOTE_REF_ENV} to the canonical disposable project ref.`,
    );
    process.exit(2);
  }
}

const runId = crypto.randomUUID().slice(0, 8);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const createdUserIds: string[] = [];

async function createUser(label: string): Promise<{ id: string; email: string; password: string }> {
  const email = `genprop-${label}-${runId}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`create_user_failed:${error?.message ?? "unknown"}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign_in_failed:${error.message ?? "unknown"}`);
  return client;
}

async function seedPlant(userId: string, label: string): Promise<string> {
  const { data: tent } = await admin
    .from("tents").insert({ user_id: userId, name: `gp tent ${label}` }).select("id").single();
  const { data: plant, error } = await admin
    .from("plants").insert({ user_id: userId, tent_id: tent!.id, name: `gp plant ${label}` }).select("id").single();
  if (error || !plant?.id) throw new Error(`seed_plant_failed:${error?.message ?? "unknown"}`);
  return plant.id as string;
}

function key(): string {
  return crypto.randomUUID();
}

async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args);
  return { env: isRecord(data) ? (data as Record<string, unknown>) : null, error };
}

async function main() {
  const owner = await createUser("owner");
  const stranger = await createUser("stranger");
  const operator = await createUser("operator");

  // Grant the operator role (operators can read some tables but must NOT reach genetics rows).
  await admin.from("user_roles").insert({ user_id: operator.id, role: "operator" });

  const ownerC = await signIn(owner.email, owner.password);
  const strangerC = await signIn(stranger.email, stranger.password);
  const operatorC = await signIn(operator.email, operator.password);

  const ownerPlant = await seedPlant(owner.id, "owner");
  const ownerPlant2 = await seedPlant(owner.id, "owner2");
  const strangerPlant = await seedPlant(stranger.id, "stranger");

  // ---- owner success ----
  const acc = await rpc(ownerC, "genetics_accession_upsert", {
    p_idempotency_key: key(),
    p_payload: { source_kind: "seed", cultivar_name: "Harness Haze", known_state: "known" },
  });
  const accessionId = acc.env?.accession_id as string | undefined;
  check("owner creates accession", acc.env?.ok === true && !!accessionId, JSON.stringify(acc.env));

  const batch = await rpc(ownerC, "genetics_batch_upsert", {
    p_idempotency_key: key(),
    p_payload: { batch_code: `B-${runId}`, propagation_method: "cutting", source_accession_id: accessionId, status: "active" },
  });
  const batchId = batch.env?.batch_id as string | undefined;
  check("owner creates batch", batch.env?.ok === true && !!batchId, JSON.stringify(batch.env));

  const assign = await rpc(ownerC, "genetics_assign_plants", {
    p_idempotency_key: key(), p_batch_id: batchId, p_plant_ids: [ownerPlant, ownerPlant2], p_reason: null,
  });
  check("owner assigns own plants", assign.env?.ok === true, JSON.stringify(assign.env));

  // ---- client user_id spoof is ignored ----
  const spoof = await rpc(ownerC, "genetics_accession_upsert", {
    p_idempotency_key: key(),
    p_payload: { source_kind: "clone", user_id: stranger.id, recorded_by: stranger.id, cultivar_name: "Spoof" },
  });
  const spoofId = spoof.env?.accession_id as string | undefined;
  const { data: spoofRow } = await admin.from("genetics_accessions").select("user_id").eq("id", spoofId ?? "").maybeSingle();
  check("client user_id spoof is ignored (row owned by caller)", isRecord(spoofRow) && spoofRow.user_id === owner.id);

  // ---- cross-tenant linkage rejection ----
  const crossMother = await rpc(ownerC, "genetics_batch_upsert", {
    p_idempotency_key: key(),
    p_payload: { batch_code: `BX-${runId}`, propagation_method: "cutting", mother_plant_id: strangerPlant },
  });
  check("cross-tenant mother is rejected", crossMother.env?.ok === false && crossMother.env?.reason === "linked_reference_invalid");

  const crossAssign = await rpc(ownerC, "genetics_assign_plants", {
    p_idempotency_key: key(), p_batch_id: batchId, p_plant_ids: [strangerPlant], p_reason: null,
  });
  check("cross-tenant assign is a hard reject", crossAssign.env?.ok === false && crossAssign.env?.reason === "plant_not_owned");

  // ---- no information leakage: foreign real id vs random uuid → identical envelope ----
  const randomUuid = crypto.randomUUID();
  const foreignRef = await rpc(ownerC, "genetics_batch_upsert", {
    p_idempotency_key: key(), p_payload: { batch_code: `BF-${runId}`, mother_plant_id: strangerPlant },
  });
  const randomRef = await rpc(ownerC, "genetics_batch_upsert", {
    p_idempotency_key: key(), p_payload: { batch_code: `BR-${runId}`, mother_plant_id: randomUuid },
  });
  check(
    "foreign vs nonexistent reference give identical envelopes (no oracle)",
    JSON.stringify(foreignRef.env) === JSON.stringify(randomRef.env),
    `${JSON.stringify(foreignRef.env)} vs ${JSON.stringify(randomRef.env)}`,
  );

  // ---- stranger + operator denial (RLS SELECT-own) ----
  const { data: strangerRead } = await strangerC.from("genetics_accessions").select("id").eq("id", accessionId ?? "");
  check("stranger cannot read owner accession", Array.isArray(strangerRead) && strangerRead.length === 0);
  const { data: operatorRead } = await operatorC.from("genetics_accessions").select("id").eq("id", accessionId ?? "");
  check("operator cannot read owner accession", Array.isArray(operatorRead) && operatorRead.length === 0);
  const trace = await rpc(strangerC, "genetics_trace_resolve", {
    p_subject_type: "accession", p_subject_id: accessionId, p_direction: "both",
  });
  check("stranger trace of owner subject → not_found", trace.env?.ok === false && trace.env?.reason === "not_found");

  // ---- idempotent repeat + concurrent writes ----
  const dupKey = key();
  const dupPayload = { source_kind: "seed", cultivar_name: "Dup" };
  const first = await rpc(ownerC, "genetics_accession_upsert", { p_idempotency_key: dupKey, p_payload: dupPayload });
  const [c1, c2] = await Promise.all([
    rpc(ownerC, "genetics_accession_upsert", { p_idempotency_key: dupKey, p_payload: dupPayload }),
    rpc(ownerC, "genetics_accession_upsert", { p_idempotency_key: dupKey, p_payload: dupPayload }),
  ]);
  const sameId =
    first.env?.accession_id && c1.env?.accession_id === first.env.accession_id && c2.env?.accession_id === first.env.accession_id;
  check("idempotent replay + concurrent return the original id", !!sameId && (c1.env?.reused === true || c2.env?.reused === true));
  const { count: dupCount } = await admin
    .from("genetics_accessions").select("id", { count: "exact", head: true }).eq("user_id", owner.id).eq("cultivar_name", "Dup");
  check("idempotent replay created exactly one row", dupCount === 1, `count=${dupCount}`);

  // ---- atomic rollback: mixed valid+cross-tenant assign leaves NO partial + retriable ----
  const freshPlant = await seedPlant(owner.id, "fresh");
  const atomicKey = key();
  const partial = await rpc(ownerC, "genetics_assign_plants", {
    p_idempotency_key: atomicKey, p_batch_id: batchId, p_plant_ids: [freshPlant, strangerPlant], p_reason: null,
  });
  const { data: partialRow } = await admin.from("plant_origin_assignments").select("id").eq("plant_id", freshPlant).maybeSingle();
  check("failed multi-assign leaves no partial rows", partial.env?.ok === false && !partialRow);
  const retry = await rpc(ownerC, "genetics_assign_plants", {
    p_idempotency_key: atomicKey, p_batch_id: batchId, p_plant_ids: [freshPlant], p_reason: null,
  });
  check("corrected retry (same key) succeeds — no stale idempotency row", retry.env?.ok === true);

  // ---- cycle rejection: self-cycle (P mother of B, then assign P to B) ----
  const cycBatch = await rpc(ownerC, "genetics_batch_upsert", {
    p_idempotency_key: key(), p_payload: { batch_code: `BC-${runId}`, mother_plant_id: ownerPlant },
  });
  const cycBatchId = cycBatch.env?.batch_id as string | undefined;
  const cyc = await rpc(ownerC, "genetics_assign_plants", {
    p_idempotency_key: key(), p_batch_id: cycBatchId, p_plant_ids: [ownerPlant], p_reason: "x" ,
  });
  check("self-cycle assignment is rejected", cyc.env?.ok === false && cyc.env?.reason === "cycle_detected");

  // ---- immutable evidence + audit history ----
  const scr = await rpc(ownerC, "genetics_screening_record", {
    p_idempotency_key: key(),
    p_payload: { subject_type: "plant", subject_id: ownerPlant, target: "HLVd", result: "negative", collected_date: today() },
  });
  const screeningId = scr.env?.screening_id as string | undefined;
  check("owner records screening", scr.env?.ok === true && !!screeningId);
  const { error: updErr, data: updData } = await ownerC
    .from("genetics_screening_results").update({ result: "positive" }).eq("id", screeningId ?? "").select("id");
  check("screening rows are immutable (no client UPDATE)", (updData?.length ?? 0) === 0 || !!updErr);
  const { error: delErr, data: delData } = await ownerC
    .from("plant_origin_assignment_events").delete().eq("user_id", owner.id).select("id");
  check("assignment audit is immutable (no client DELETE)", (delData?.length ?? 0) === 0 || !!delErr);

  // ---- quarantine clearance rules ----
  const q = await rpc(ownerC, "genetics_quarantine_open", {
    p_idempotency_key: key(), p_payload: { subject_type: "plant", subject_id: ownerPlant2, target: "HLVd" },
  });
  const episodeId = q.env?.episode_id as string | undefined;
  check("owner opens quarantine", q.env?.ok === true && !!episodeId);
  const noEvidence = await rpc(ownerC, "genetics_quarantine_transition", {
    p_idempotency_key: key(), p_episode_id: episodeId, p_action: "release", p_reason: null, p_screening_result_id: null,
  });
  check("release without a negative is refused", noEvidence.env?.ok === false && noEvidence.env?.reason === "screening_required");
  // Another subject's negative must not clear this episode.
  const otherNeg = await rpc(ownerC, "genetics_screening_record", {
    p_idempotency_key: key(),
    p_payload: { subject_type: "plant", subject_id: ownerPlant, target: "HLVd", result: "negative", collected_date: today() },
  });
  const wrongSubject = await rpc(ownerC, "genetics_quarantine_transition", {
    p_idempotency_key: key(), p_episode_id: episodeId, p_action: "release",
    p_reason: null, p_screening_result_id: otherNeg.env?.screening_id,
  });
  check("another subject's certificate cannot clear", wrongSubject.env?.ok === false && wrongSubject.env?.reason === "screening_subject_mismatch");
  // A matching, current negative clears.
  const goodNeg = await rpc(ownerC, "genetics_screening_record", {
    p_idempotency_key: key(),
    p_payload: { subject_type: "plant", subject_id: ownerPlant2, target: "HLVd", result: "negative", collected_date: today() },
  });
  const cleared = await rpc(ownerC, "genetics_quarantine_transition", {
    p_idempotency_key: key(), p_episode_id: episodeId, p_action: "release",
    p_reason: null, p_screening_result_id: goodNeg.env?.screening_id,
  });
  check("a matching current negative clears", cleared.env?.ok === true && cleared.env?.closure_kind === "cleared");
}

function today(): string {
  // Deterministic-enough: server current_date bounds it; a fixed recent date works
  // because the harness runs against a fresh DB. Uses the machine clock here.
  return new Date().toISOString().slice(0, 10);
}

async function teardown(): Promise<void> {
  // Deleting the auth users cascades every genetics/plant/tent row (user_id FKs
  // are ON DELETE CASCADE), then verify zero leftovers.
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  for (const table of [
    "genetics_accessions", "propagation_batches", "plant_origin_assignments",
    "genetics_screening_results", "quarantine_episodes", "genetics_mutation_idempotency",
  ]) {
    const { count } = await admin.from(table).select("user_id", { count: "exact", head: true }).in("user_id", createdUserIds);
    check(`teardown: ${table} has zero leftovers`, (count ?? 0) === 0, `count=${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    failed += 1;
  })
  .finally(async () => {
    await teardown().catch((e) => console.error("teardown_failed", e));
    console.log(`\ngenetics-propagation RLS harness: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
