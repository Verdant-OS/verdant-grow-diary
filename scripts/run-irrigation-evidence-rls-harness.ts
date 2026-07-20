#!/usr/bin/env -S bun run
/**
 * Runtime RLS / trust-boundary proof for the hardened quicklog_save_event
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
 * malformed payload writes zero rows; replay = exactly one committed event set;
 * same-key/different-request conflict; history cannot leak another owner's rows.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
    console.error(`[irrigation-evidence] missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[irrigation-evidence] SUPABASE_URL is invalid");
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

if (localLaneConfirmed && !localHost) {
  console.error("[irrigation-evidence] local security lane requires a loopback database");
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
      `[irrigation-evidence] refusing unverified remote database; set ${REMOTE_CONFIRM_ENV}=1 and ${EXPECTED_REMOTE_REF_ENV} to the canonical disposable project ref.`,
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
function reasonOf(data: unknown): string | null {
  return isRecord(data) && typeof data.reason === "string" ? data.reason : null;
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

  // 8. malformed payload writes zero rows
  const badKey = key();
  const bad = await save(
    ownerC,
    baseArgs({ p_idempotency_key: badKey, p_water: { volume_ml: 1000, ec_ms_cm: 999 } }),
  );
  const { count: badEvents } = await admin
    .from("quicklog_idempotency")
    .select("idempotency_key", { count: "exact", head: true })
    .eq("user_id", owner.id)
    .eq("idempotency_key", badKey);
  check(
    "out-of-range payload rejected as invalid_typed_payload",
    reasonOf(bad.env) === "invalid_typed_payload",
  );
  check("rejected payload wrote zero idempotency rows", (badEvents ?? 0) === 0);

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
  const { count: growEvents } = await admin
    .from("grow_events")
    .select("id", { count: "exact", head: true })
    .eq("id", eventId as string);
  const { count: waterRows } = await admin
    .from("watering_events")
    .select("event_id", { count: "exact", head: true })
    .eq("event_id", eventId as string);
  const { count: idemRows } = await admin
    .from("quicklog_idempotency")
    .select("idempotency_key", { count: "exact", head: true })
    .eq("user_id", owner.id)
    .eq("idempotency_key", rKey);
  check(
    "replay committed exactly one grow_event + one watering + one idempotency row",
    growEvents === 1 && waterRows === 1 && idemRows === 1,
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

  // 12. history cannot leak another owner's rows
  const { data: leak } = await strangerC
    .from("grow_events")
    .select("id")
    .eq("tent_id", oTent)
    .limit(50);
  check("stranger cannot read owner grow_events", Array.isArray(leak) && leak.length === 0);
}

async function teardown(): Promise<void> {
  for (const table of [
    "grow_events",
    "diary_entries",
    "quicklog_idempotency",
    "quicklog_audit_events",
    "plants",
    "tents",
    "grows",
  ]) {
    await admin
      .from(table)
      .delete()
      .in("user_id", createdUserIds)
      .then(
        () => {},
        () => {},
      );
  }
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const table of ["grow_events", "quicklog_idempotency", "plants", "tents", "grows"]) {
    const { count } = await admin
      .from(table)
      .select("user_id", { count: "exact", head: true })
      .in("user_id", createdUserIds);
    check(`teardown: ${table} has zero leftovers`, (count ?? 0) === 0, `count=${count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    failed += 1;
  })
  .finally(async () => {
    await teardown().catch((e) => console.error("teardown_failed", e));
    console.log(`\nirrigation evidence RLS harness: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
