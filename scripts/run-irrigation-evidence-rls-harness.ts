#!/usr/bin/env -S bun run
/**
 * Runtime authorization / RLS read-isolation proof for hardened quicklog_save_event
 * (irrigation evidence ledger). Deliberately opt-in, defaults to a no-op,
 * refuses the Verdant production project ref, and requires loopback for the
 * local lane. Creates disposable @verdant.test users + scoped rows and removes
 * them in finally (zero-leftover verified). service_role is used ONLY for
 * seeding / read-back / teardown — every authz assertion runs through a real
 * password-signed-in anon-key JWT client.
 *
 * Run locally against a disposable stack:
 *   IRRIGATION_EVIDENCE_RLS_HARNESS=1 bun run test:irrigation-evidence-rls
 *   (or)  bun run scripts/run-irrigation-evidence-rls-harness.ts --confirm-local-security-lane
 *
 * Proves: owner success; anon + stranger denial; spoofed detail ownership
 * rejection; cross-grow / cross-owner / wrong-tent / untented-plant+tent failure;
 * malformed payload writes no partial event set; sequential and concurrent replay
 * commit exactly once; same-key/different-request fails closed; related history
 * tables cannot leak another owner's rows; teardown leaves no rows or auth users.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SQL } from "bun";

const CONFIRM_ENV = "IRRIGATION_EVIDENCE_RLS_HARNESS";
const REMOTE_CONFIRM_ENV = "IRRIGATION_EVIDENCE_RLS_HARNESS_ALLOW_REMOTE";
const EXPECTED_REMOTE_REF_ENV = "IRRIGATION_EVIDENCE_RLS_HARNESS_EXPECTED_PROJECT_REF";
const LOCAL_LANE_FLAG = "--confirm-local-security-lane";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const localLaneConfirmed = process.argv.includes(LOCAL_LANE_FLAG);

if (process.env[CONFIRM_ENV] !== "1" && !localLaneConfirmed) {
  console.log(
    `[irrigation-evidence] SKIP — set ${CONFIRM_ENV}=1 (or pass ${LOCAL_LANE_FLAG}) to run the disposable database harness.`,
  );
  process.exit(0);
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const DATABASE_URL = process.env.SUPABASE_DB_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY!;

for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_DB_URL", DATABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
] as const) {
  if (!value) {
    console.error(`[irrigation-evidence] missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
let databaseHostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
  databaseHostname = new URL(DATABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[irrigation-evidence] Supabase API or database URL is invalid");
  process.exit(2);
}

if (
  hostname === PRODUCTION_PROJECT_REF ||
  hostname.startsWith(`${PRODUCTION_PROJECT_REF}.`) ||
  hostname.includes(`.${PRODUCTION_PROJECT_REF}.`)
) {
  console.error("[irrigation-evidence] refusing Verdant production database");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";
const localDatabaseHost =
  databaseHostname === "localhost" ||
  databaseHostname === "127.0.0.1" ||
  databaseHostname === "[::1]" ||
  databaseHostname === "::1";

if (localLaneConfirmed && (!localHost || !localDatabaseHost)) {
  console.error(
    "[irrigation-evidence] local security lane requires loopback API and database URLs",
  );
  process.exit(2);
}

const expectedRemoteRef = process.env[EXPECTED_REMOTE_REF_ENV];
if (!localHost) {
  const expectedRemoteHost = expectedRemoteRef ? `${expectedRemoteRef}.supabase.co` : null;
  const expectedRemoteDatabaseHost = expectedRemoteRef
    ? `db.${expectedRemoteRef}.supabase.co`
    : null;
  const remoteConfirmed =
    process.env[REMOTE_CONFIRM_ENV] === "1" &&
    /^[a-z0-9]{20}$/.test(expectedRemoteRef ?? "") &&
    expectedRemoteRef !== PRODUCTION_PROJECT_REF &&
    hostname === expectedRemoteHost &&
    databaseHostname === expectedRemoteDatabaseHost;
  if (!remoteConfirmed) {
    console.error(
      `[irrigation-evidence] refusing unverified remote API/database pair; set ${REMOTE_CONFIRM_ENV}=1 and ${EXPECTED_REMOTE_REF_ENV} to the canonical disposable project ref.`,
    );
    process.exit(2);
  }
} else if (!localDatabaseHost) {
  console.error("[irrigation-evidence] loopback API requires a loopback database URL");
  process.exit(2);
}

const runId = crypto.randomUUID().slice(0, 8);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const raceDb = new SQL(DATABASE_URL, { max: 1 });

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
function reasonOf(data: unknown): string | null {
  return isRecord(data) && typeof data.reason === "string" ? data.reason : null;
}

const COMMITTED_EVENT_TABLES = [
  "grow_events",
  "watering_events",
  "feeding_events",
  "diary_entries",
  "quicklog_idempotency",
] as const;

const OWNER_READ_TABLES = [
  "grow_events",
  "watering_events",
  "feeding_events",
  "diary_entries",
  "quicklog_idempotency",
  "quicklog_audit_events",
] as const;

const CLEANUP_TABLES = [
  "watering_events",
  "feeding_events",
  "quicklog_audit_events",
  "quicklog_idempotency",
  "diary_entries",
  "grow_events",
  "plants",
  "tents",
  "grows",
] as const;

const RACE_KEY_PREFIX = "irrigationrace_";
const RACE_BARRIER_SCHEMA = "irrigation_evidence_harness";
const RACE_BARRIER_TRIGGER = "irrigation_evidence_harness_race_barrier";
const RACE_ADVISORY_CLASS_ID = 3812026;
const RACE_ADVISORY_OBJECT_ID = 1;

type UserRowSnapshot = Record<(typeof COMMITTED_EVENT_TABLES)[number], number>;

async function exactCountWhere(table: string, filters: Record<string, string>): Promise<number> {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`count_${table}_failed:${error.message}`);
  if (count === null) throw new Error(`count_${table}_failed:null_count`);
  return count;
}

async function snapshotUserRows(userId: string): Promise<UserRowSnapshot> {
  const counts = await Promise.all(
    COMMITTED_EVENT_TABLES.map((table) => exactCountWhere(table, { user_id: userId })),
  );
  return Object.fromEntries(
    COMMITTED_EVENT_TABLES.map((table, index) => [table, counts[index]]),
  ) as UserRowSnapshot;
}

function changedSnapshotTables(before: UserRowSnapshot, after: UserRowSnapshot): string[] {
  return COMMITTED_EVENT_TABLES.filter((table) => before[table] !== after[table]);
}

async function eventSetCounts(userId: string, eventId: string, idempotencyKey: string) {
  const [grow, watering, feeding, idempotency] = await Promise.all([
    exactCountWhere("grow_events", { id: eventId, user_id: userId }),
    exactCountWhere("watering_events", { event_id: eventId, user_id: userId }),
    exactCountWhere("feeding_events", { event_id: eventId, user_id: userId }),
    exactCountWhere("quicklog_idempotency", {
      user_id: userId,
      idempotency_key: idempotencyKey,
    }),
  ]);
  const { count: diary, error: diaryError } = await admin
    .from("diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .contains("details", { linked_grow_event_id: eventId });
  if (diaryError) throw new Error(`count_diary_entries_failed:${diaryError.message}`);
  if (diary === null) throw new Error("count_diary_entries_failed:null_count");
  return { grow, watering, feeding, diary, idempotency };
}

function exactlyOneWateringSet(counts: Awaited<ReturnType<typeof eventSetCounts>>): boolean {
  return (
    counts.grow === 1 &&
    counts.watering === 1 &&
    counts.feeding === 0 &&
    counts.diary === 1 &&
    counts.idempotency === 1
  );
}

async function installRaceBarrier(): Promise<void> {
  await raceDb.unsafe(
    `DROP TRIGGER IF EXISTS ${RACE_BARRIER_TRIGGER} ON public.quicklog_idempotency`,
  );
  await raceDb.unsafe(`DROP SCHEMA IF EXISTS ${RACE_BARRIER_SCHEMA} CASCADE`);
  await raceDb.unsafe(`CREATE SCHEMA ${RACE_BARRIER_SCHEMA}`);
  await raceDb.unsafe(`REVOKE ALL ON SCHEMA ${RACE_BARRIER_SCHEMA} FROM PUBLIC`);
  await raceDb.unsafe(`
    CREATE FUNCTION ${RACE_BARRIER_SCHEMA}.race_barrier()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog
    AS $function$
    BEGIN
      IF left(NEW.idempotency_key, 15) = '${RACE_KEY_PREFIX}' THEN
        PERFORM pg_advisory_xact_lock(${RACE_ADVISORY_CLASS_ID}, ${RACE_ADVISORY_OBJECT_ID});
        PERFORM pg_sleep(3);
      END IF;
      RETURN NEW;
    END;
    $function$
  `);
  await raceDb.unsafe(`
    CREATE TRIGGER ${RACE_BARRIER_TRIGGER}
    BEFORE INSERT ON public.quicklog_idempotency
    FOR EACH ROW
    EXECUTE FUNCTION ${RACE_BARRIER_SCHEMA}.race_barrier()
  `);
}

async function removeRaceBarrier(): Promise<void> {
  await raceDb.unsafe(
    `DROP TRIGGER IF EXISTS ${RACE_BARRIER_TRIGGER} ON public.quicklog_idempotency`,
  );
  await raceDb.unsafe(`DROP SCHEMA IF EXISTS ${RACE_BARRIER_SCHEMA} CASCADE`);
}

async function waitForRaceContention(): Promise<boolean> {
  const deadline = Date.now() + 2_500;
  while (Date.now() < deadline) {
    const rows = (await raceDb.unsafe(`
      SELECT
        count(*) FILTER (WHERE granted)::integer AS granted_count,
        count(*) FILTER (WHERE NOT granted)::integer AS waiting_count
      FROM pg_catalog.pg_locks
      WHERE locktype = 'advisory'
        AND classid = ${RACE_ADVISORY_CLASS_ID}::oid
        AND objid = ${RACE_ADVISORY_OBJECT_ID}::oid
        AND objsubid = 2
    `)) as unknown as Array<{ granted_count: number | string; waiting_count: number | string }>;
    const row = rows[0];
    if (Number(row?.granted_count ?? 0) >= 1 && Number(row?.waiting_count ?? 0) >= 1) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

const createdUserIds: string[] = [];
async function createUser(label: string) {
  const email = `irrigation-${label}-${runId}@verdant.test`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`create_user_failed:${error?.message ?? "unknown"}`);
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}
async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign_in_failed:${error.message ?? "unknown"}`);
  return c;
}
async function seedId(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from(table).insert(row).select("id").single();
  if (error || !data?.id) throw new Error(`seed_${table}_failed:${error?.message ?? "unknown"}`);
  return data.id as string;
}
function key(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
function raceKey(): string {
  return `${RACE_KEY_PREFIX}${key()}`;
}
async function save(client: SupabaseClient, args: Record<string, unknown>) {
  const { data, error } = await client.rpc("quicklog_save_event", args);
  return { env: isRecord(data) ? data : null, error };
}

async function main() {
  const owner = await createUser("owner");
  const stranger = await createUser("stranger");
  const ownerC = await signIn(owner.email, owner.password);
  const strangerC = await signIn(stranger.email, stranger.password);
  const anonC = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

  // Owner scope: grow, tent, plant-in-tent, untented plant, other tent.
  const oGrow = await seedId("grows", { user_id: owner.id, name: `irr grow ${runId}` });
  const oTent = await seedId("tents", { user_id: owner.id, grow_id: oGrow, name: "T1" });
  const oTent2 = await seedId("tents", { user_id: owner.id, grow_id: oGrow, name: "T2" });
  const oPlantInTent = await seedId("plants", {
    user_id: owner.id,
    grow_id: oGrow,
    tent_id: oTent,
    name: "P-tented",
  });
  const oPlantUntented = await seedId("plants", {
    user_id: owner.id,
    grow_id: oGrow,
    tent_id: null,
    name: "P-untented",
  });
  // Stranger scope.
  const sGrow = await seedId("grows", { user_id: stranger.id, name: `irr strange grow ${runId}` });
  const sTent = await seedId("tents", { user_id: stranger.id, grow_id: sGrow, name: "ST1" });
  const sPlant = await seedId("plants", {
    user_id: stranger.id,
    grow_id: sGrow,
    tent_id: sTent,
    name: "SP",
  });

  const water = { volume_ml: 1000, ph: 6.1, ec_ms_cm: 1.8 };
  const baseArgs = (over: Record<string, unknown>) => ({
    p_idempotency_key: key(),
    p_grow_id: oGrow,
    p_event_type: "watering",
    p_tent_id: oTent,
    p_plant_id: oPlantInTent,
    p_water: water,
    ...over,
  });

  // 1. owner success
  const ok = await save(ownerC, baseArgs({}));
  check("owner saves own grow/tent/plant", ok.env?.ok === true, JSON.stringify(ok.env));

  // 2. anon denied (REVOKE EXECUTE FROM anon)
  const an = await save(anonC, baseArgs({}));
  check("anon cannot call quicklog_save_event", an.error !== null || an.env?.ok !== true);

  // 3. stranger → grow_not_owned
  const st = await save(strangerC, baseArgs({}));
  check(
    "stranger cannot write to owner grow",
    reasonOf(st.env) === "grow_not_owned",
    JSON.stringify(st.env),
  );

  // 4. cross-grow tent
  const xt = await save(ownerC, baseArgs({ p_tent_id: sTent }));
  check("cross-owner tent → tent_not_in_grow", reasonOf(xt.env) === "tent_not_in_grow");

  // 5. cross-owner plant
  const xp = await save(ownerC, baseArgs({ p_plant_id: sPlant, p_tent_id: oTent }));
  check("cross-owner plant → plant_not_in_grow", reasonOf(xp.env) === "plant_not_in_grow");

  // 6. assigned plant + wrong tent
  const wt = await save(ownerC, baseArgs({ p_plant_id: oPlantInTent, p_tent_id: oTent2 }));
  check("tented plant + wrong tent → plant_not_in_tent", reasonOf(wt.env) === "plant_not_in_tent");

  // 7. THE FIX: untented plant + non-null tent must fail closed
  const un = await save(ownerC, baseArgs({ p_plant_id: oPlantUntented, p_tent_id: oTent }));
  check(
    "untented plant + non-null tent → plant_not_in_tent (defect fixed)",
    reasonOf(un.env) === "plant_not_in_tent",
    JSON.stringify(un.env),
  );

  // 7b. untented plant + null tent is allowed
  const un2 = await save(ownerC, baseArgs({ p_plant_id: oPlantUntented, p_tent_id: null }));
  check("untented plant + null tent succeeds", un2.env?.ok === true, JSON.stringify(un2.env));

  // 8. malformed payload writes no partial committed event set. A single
  // validation_failed audit row is expected and proves the rejection was recorded.
  const beforeBad = await snapshotUserRows(owner.id);
  const badKey = key();
  const bad = await save(
    ownerC,
    baseArgs({ p_idempotency_key: badKey, p_water: { volume_ml: 1000, ec_ms_cm: 999 } }),
  );
  const afterBad = await snapshotUserRows(owner.id);
  const badChangedTables = changedSnapshotTables(beforeBad, afterBad);
  const badAuditRows = await exactCountWhere("quicklog_audit_events", {
    user_id: owner.id,
    idempotency_key: badKey,
    status: "validation_failed",
    reason: "invalid_typed_payload",
  });
  check(
    "out-of-range payload rejected as invalid_typed_payload",
    reasonOf(bad.env) === "invalid_typed_payload",
  );
  check(
    "rejected payload wrote no grow/watering/feeding/diary/idempotency rows",
    badChangedTables.length === 0,
    `changed=${badChangedTables.join(",") || "none"}`,
  );
  check("rejected payload wrote exactly one validation audit row", badAuditRows === 1);

  // 8b. unexpected key rejected
  const bad2 = await save(ownerC, baseArgs({ p_water: { volume_ml: 1000, surprise: 1 } }));
  check("unexpected water key rejected", reasonOf(bad2.env) === "invalid_typed_payload");

  // 9. replay = exactly one committed set
  const rKey = key();
  const r1 = await save(ownerC, baseArgs({ p_idempotency_key: rKey }));
  const r2 = await save(ownerC, baseArgs({ p_idempotency_key: rKey }));
  const eventId = r1.env?.grow_event_id;
  check(
    "replay returns the original event, reused=true",
    r2.env?.ok === true && r2.env?.reused === true && r2.env?.grow_event_id === eventId,
  );
  const replayCounts = await eventSetCounts(owner.id, eventId as string, rKey);
  check(
    "sequential replay committed exactly one full watering event set",
    exactlyOneWateringSet(replayCounts),
    JSON.stringify(replayCounts),
  );

  // 10. same key / different request → conflict
  const conflict = await save(
    ownerC,
    baseArgs({ p_idempotency_key: rKey, p_water: { volume_ml: 2000 } }),
  );
  check(
    "same key, different request → idempotency_key_conflict",
    reasonOf(conflict.env) === "idempotency_key_conflict",
    JSON.stringify(conflict.env),
  );

  // 11. spoofed ownership key in details rejected
  const spoof = await save(ownerC, baseArgs({ p_details: { user_id: stranger.id } }));
  check("ownership-spoofing detail key rejected", reasonOf(spoof.env) === "invalid_typed_payload");

  // 12. Install a disposable database-only barrier. For race-prefixed keys,
  // the first INSERT holds a transaction-scoped advisory lock while the second
  // waits on the same lock. pg_locks must show both transactions before the
  // response assertions are allowed to count as concurrent-race proof.
  await installRaceBarrier();
  const parallelReplayKey = raceKey();
  const parallelReplayArgs = baseArgs({ p_idempotency_key: parallelReplayKey });
  const parallelReplayAPromise = save(ownerC, parallelReplayArgs);
  const parallelReplayBPromise = save(ownerC, parallelReplayArgs);
  const parallelReplayContention = await waitForRaceContention();
  const [parallelReplayA, parallelReplayB] = await Promise.all([
    parallelReplayAPromise,
    parallelReplayBPromise,
  ]);
  const parallelReplayResults = [parallelReplayA, parallelReplayB];
  const parallelReplayEventIds = parallelReplayResults.map((result) => result.env?.grow_event_id);
  const parallelReplayFlags = parallelReplayResults
    .map((result) => result.env?.reused)
    .sort((a, b) => Number(a) - Number(b));
  check(
    "parallel identical requests overlapped at the idempotency insert",
    parallelReplayContention,
  );
  check(
    "parallel identical requests both succeed with one shared event",
    parallelReplayResults.every((result) => result.env?.ok === true) &&
      typeof parallelReplayEventIds[0] === "string" &&
      parallelReplayEventIds[0] === parallelReplayEventIds[1],
    JSON.stringify(parallelReplayResults.map((result) => result.env)),
  );
  check(
    "parallel identical requests return one original and one reused envelope",
    parallelReplayFlags.length === 2 &&
      parallelReplayFlags[0] === false &&
      parallelReplayFlags[1] === true,
    JSON.stringify(parallelReplayFlags),
  );
  const parallelReplayCounts = await eventSetCounts(
    owner.id,
    parallelReplayEventIds[0] as string,
    parallelReplayKey,
  );
  check(
    "parallel identical requests committed exactly one full watering event set",
    exactlyOneWateringSet(parallelReplayCounts),
    JSON.stringify(parallelReplayCounts),
  );

  // 13. Concurrent same-key / different-request calls fail closed. Either
  // request may win, but exactly one set may commit and the loser must conflict.
  const parallelConflictKey = raceKey();
  const parallelConflictAPromise = save(
    ownerC,
    baseArgs({
      p_idempotency_key: parallelConflictKey,
      p_water: { volume_ml: 1200, ph: 6.1, ec_ms_cm: 1.8 },
    }),
  );
  const parallelConflictBPromise = save(
    ownerC,
    baseArgs({
      p_idempotency_key: parallelConflictKey,
      p_water: { volume_ml: 1300, ph: 6.1, ec_ms_cm: 1.8 },
    }),
  );
  const parallelConflictContention = await waitForRaceContention();
  const [parallelConflictA, parallelConflictB] = await Promise.all([
    parallelConflictAPromise,
    parallelConflictBPromise,
  ]);
  const parallelConflictResults = [parallelConflictA, parallelConflictB];
  const parallelConflictWinners = parallelConflictResults.filter(
    (result) => result.env?.ok === true,
  );
  const parallelConflictLosers = parallelConflictResults.filter(
    (result) => reasonOf(result.env) === "idempotency_key_conflict",
  );
  check(
    "parallel different requests overlapped at the idempotency insert",
    parallelConflictContention,
  );
  check(
    "parallel different requests produce exactly one success and one conflict",
    parallelConflictWinners.length === 1 && parallelConflictLosers.length === 1,
    JSON.stringify(parallelConflictResults.map((result) => result.env)),
  );
  const parallelConflictEventId = parallelConflictWinners[0]?.env?.grow_event_id;
  check(
    "parallel different-request winner returns a concrete event id",
    typeof parallelConflictEventId === "string",
  );
  const parallelConflictCounts = await eventSetCounts(
    owner.id,
    parallelConflictEventId as string,
    parallelConflictKey,
  );
  check(
    "parallel different requests committed exactly one full watering event set",
    exactlyOneWateringSet(parallelConflictCounts),
    JSON.stringify(parallelConflictCounts),
  );

  // 14. Every related owner-readable table is RLS-isolated. A PostgREST denial
  // or a successful empty result is safe; any returned owner row is a failure.
  for (const table of OWNER_READ_TABLES) {
    const { data, error } = await strangerC
      .from(table)
      .select("user_id")
      .eq("user_id", owner.id)
      .limit(50);
    const recognizedReadDenial =
      error !== null &&
      (error.code === "42501" || /permission denied|row-level security/i.test(error.message));
    check(
      `stranger cannot read owner ${table}`,
      recognizedReadDenial || (error === null && Array.isArray(data) && data.length === 0),
      error && !recognizedReadDenial
        ? error.message
        : `rows=${Array.isArray(data) ? data.length : "unknown"}`,
    );
  }

  // 15. Server trust boundary (2026-07-22 revoke): authenticated must be
  // denied on legacy typed-event RPCs. Denial MUST be a genuine permission
  // rejection — "function does not exist" / "no function matches" / PostgREST
  // cache misses do NOT count, because they wouldn't prove the privilege was
  // revoked (they'd prove the function isn't callable at all).
  const isGenuinePermissionDenial = (
    err: { code?: string | null; message?: string | null } | null,
  ): boolean => {
    if (!err) return false;
    if (err.code === "42501") return true;
    return /permission denied/i.test(err.message ?? "");
  };
  const isMissingFunction = (
    err: { code?: string | null; message?: string | null } | null,
  ): boolean => {
    if (!err) return false;
    if (err.code === "42883" || err.code === "PGRST202" || err.code === "PGRST203") return true;
    return /does not exist|could not find the function|no function matches|schema cache/i.test(
      err.message ?? "",
    );
  };
  const legacyWatering = await ownerC.rpc("create_watering_event" as never, {
    _grow_id: oGrow,
    _volume_ml: 100,
    _tent_id: oTent,
    _plant_id: oPlantInTent,
  } as never);
  check(
    "authenticated denied create_watering_event with genuine permission error (not missing-function)",
    isGenuinePermissionDenial(legacyWatering.error) && !isMissingFunction(legacyWatering.error),
    legacyWatering.error?.message ?? "expected 42501 / permission denied, got success",
  );
  const legacyFeeding = await ownerC.rpc("create_feeding_event" as never, {
    _grow_id: oGrow,
    _line_id: "default",
    _products: [],
    _tent_id: oTent,
    _plant_id: oPlantInTent,
  } as never);
  check(
    "authenticated denied create_feeding_event with genuine permission error (not missing-function)",
    isGenuinePermissionDenial(legacyFeeding.error) && !isMissingFunction(legacyFeeding.error),
    legacyFeeding.error?.message ?? "expected 42501 / permission denied, got success",
  );

  // 16. Direct DML denial for INSERT / UPDATE / DELETE on all three event
  // tables via the authenticated client. SELECT on own rows must remain
  // available. Seed one owner-owned row per subtype via service_role so
  // UPDATE / DELETE have a real target — a missing target could mask denial.
  const seededParent = await admin
    .from("grow_events")
    .insert({
      user_id: owner.id,
      grow_id: oGrow,
      tent_id: oTent,
      event_type: "watering",
      source: "manual",
    })
    .select("id")
    .single();
  check("seed: service_role inserted grow_events row", seededParent.error === null, seededParent.error?.message);
  const seededEventId = seededParent.data?.id as string | undefined;
  if (seededEventId) {
    const seededWater = await admin
      .from("watering_events")
      .insert({ event_id: seededEventId, user_id: owner.id, volume_ml: 100 });
    check("seed: service_role inserted watering_events row", seededWater.error === null, seededWater.error?.message);
    const seededFeed = await admin
      .from("feeding_events")
      .insert({ event_id: seededEventId, user_id: owner.id, line_id: "x", products: [] });
    check("seed: service_role inserted feeding_events row", seededFeed.error === null, seededFeed.error?.message);
  }

  for (const table of ["grow_events", "watering_events", "feeding_events"] as const) {
    const insertPayload: Record<string, unknown> =
      table === "grow_events"
        ? {
            user_id: owner.id,
            grow_id: oGrow,
            tent_id: oTent,
            event_type: "watering",
            source: "manual",
          }
        : {
            event_id: crypto.randomUUID(),
            user_id: owner.id,
            ...(table === "watering_events" ? { volume_ml: 100 } : { line_id: "x", products: [] }),
          };
    const ins = await ownerC.from(table).insert(insertPayload);
    check(
      `authenticated denied INSERT on ${table} (genuine permission error)`,
      isGenuinePermissionDenial(ins.error),
      ins.error?.message ?? "expected 42501 / permission denied, got success",
    );

    const upd = await ownerC.from(table).update({ user_id: owner.id }).eq("user_id", owner.id);
    check(
      `authenticated denied UPDATE on ${table} (genuine permission error)`,
      isGenuinePermissionDenial(upd.error),
      upd.error?.message ?? "expected 42501 / permission denied, got success",
    );

    const del = await ownerC.from(table).delete().eq("user_id", owner.id);
    check(
      `authenticated denied DELETE on ${table} (genuine permission error)`,
      isGenuinePermissionDenial(del.error),
      del.error?.message ?? "expected 42501 / permission denied, got success",
    );

    const sel = await ownerC.from(table).select("user_id").eq("user_id", owner.id).limit(1);
    check(`authenticated retains SELECT on ${table}`, sel.error === null, sel.error?.message);
  }

  // 17. service_role retains legacy-RPC EXECUTE and direct write access —
  // needed for admin/edge-function code paths that must repair or backfill
  // evidence rows without going through the canonical Quick Log path.
  const svcWatering = await admin.rpc("create_watering_event" as never, {
    _grow_id: oGrow,
    _volume_ml: 5,
    _tent_id: oTent,
    _plant_id: oPlantInTent,
  } as never);
  check(
    "service_role can call legacy create_watering_event",
    svcWatering.error === null,
    svcWatering.error?.message,
  );
  const svcFeeding = await admin.rpc("create_feeding_event" as never, {
    _grow_id: oGrow,
    _line_id: "default",
    _products: [],
    _tent_id: oTent,
    _plant_id: oPlantInTent,
  } as never);
  check(
    "service_role can call legacy create_feeding_event",
    svcFeeding.error === null,
    svcFeeding.error?.message,
  );
  const svcDirect = await admin
    .from("grow_events")
    .insert({
      user_id: owner.id,
      grow_id: oGrow,
      tent_id: oTent,
      event_type: "watering",
      source: "manual",
    })
    .select("id")
    .single();
  check("service_role retains direct INSERT on grow_events", svcDirect.error === null, svcDirect.error?.message);
}


async function teardown(): Promise<void> {
  try {
    await removeRaceBarrier();
    check("teardown: disposable race barrier removed", true);
  } catch (error) {
    check(
      "teardown: disposable race barrier removed",
      false,
      error instanceof Error ? error.message : "unknown database error",
    );
  }

  if (createdUserIds.length === 0) {
    await raceDb.close();
    return;
  }

  for (const table of CLEANUP_TABLES) {
    const { error } = await admin.from(table).delete().in("user_id", createdUserIds);
    check(`teardown: ${table} delete succeeded`, error === null, error?.message ?? undefined);
  }

  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    check(`teardown: auth user ${id.slice(0, 8)} deleted`, error === null, error?.message);
  }

  for (const table of CLEANUP_TABLES) {
    const { count, error } = await admin
      .from(table)
      .select("user_id", { count: "exact", head: true })
      .in("user_id", createdUserIds);
    check(
      `teardown: ${table} has zero leftovers`,
      error === null && count === 0,
      error?.message ?? `count=${count}`,
    );
  }

  for (const id of createdUserIds) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    const recognizedNotFound =
      error !== null &&
      (error.status === 404 || /user not found|not found/i.test(error.message ?? ""));
    check(
      `teardown: auth user ${id.slice(0, 8)} has zero leftovers`,
      recognizedNotFound || (!error && !data.user),
      error && !recognizedNotFound ? error.message : data.user ? "user still exists" : undefined,
    );
  }

  await raceDb.close();
}

main()
  .catch((e) => {
    console.error(e);
    failed += 1;
  })
  .finally(async () => {
    await teardown().catch((e) => {
      console.error("teardown_failed", e);
      failed += 1;
    });
    console.log(`\nirrigation evidence RLS harness: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
