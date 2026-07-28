#!/usr/bin/env -S bun run
/**
 * Runtime PostgREST proof for the Free 90-day sensor-history RLS cap.
 *
 * Real signed-in clients prove:
 *   - Free and expired accounts see only recent history
 *   - legacy-only billing_subscriptions Pro remains limited to recent history
 *   - live canonical Pro, Craft, and Founder rows see full history
 *   - cross-user isolation remains intact
 *   - service_role retains trusted recovery access
 *   - reads never delete or rewrite stored sensor evidence
 *
 * Run:
 *   bun run scripts/run-sensor-history-read-cap-rls-harness.ts
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_ANON_KEY)
 *
 * Remote disposable project opt-in:
 *   SENSOR_HISTORY_READ_CAP_RLS_HARNESS_ALLOW_REMOTE=1
 *   SENSOR_HISTORY_READ_CAP_RLS_HARNESS_EXPECTED_PROJECT_REF=<project-ref>
 *
 * Verdant production is always refused.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REMOTE_CONFIRM_ENV = "SENSOR_HISTORY_READ_CAP_RLS_HARNESS_ALLOW_REMOTE";
const EXPECTED_REMOTE_REF_ENV = "SENSOR_HISTORY_READ_CAP_RLS_HARNESS_EXPECTED_PROJECT_REF";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["SUPABASE_ANON_KEY", ANON_KEY],
]) {
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(SUPABASE_URL!).hostname.toLowerCase().replace(/\.$/, "");
} catch {
  console.error("[sensor-history-read-cap] SUPABASE_URL is invalid");
  process.exit(2);
}

if (
  hostname === PRODUCTION_PROJECT_REF ||
  hostname.startsWith(`${PRODUCTION_PROJECT_REF}.`) ||
  hostname.includes(`.${PRODUCTION_PROJECT_REF}.`)
) {
  console.error("[sensor-history-read-cap] refusing Verdant production database");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

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
      `[sensor-history-read-cap] refusing unverified remote database; set ${REMOTE_CONFIRM_ENV}=1 and ${EXPECTED_REMOTE_REF_ENV} to the canonical disposable project ref.`,
    );
    process.exit(2);
  }
}

const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const PASSWORD = crypto.randomUUID();
const RUN_ID = crypto.randomUUID();
const NOW = Date.now();
const RECENT_AT = new Date(NOW - 24 * 60 * 60 * 1_000).toISOString();
const OLD_AT = new Date(NOW - 91 * 24 * 60 * 60 * 1_000).toISOString();
const FUTURE_END = new Date(NOW + 30 * 24 * 60 * 60 * 1_000).toISOString();
const PAST_END = new Date(NOW - 24 * 60 * 60 * 1_000).toISOString();

type AccountKey = "free" | "legacyOnly" | "lovablePro" | "craft" | "founder" | "expired" | "other";

const EMAILS: Record<AccountKey, string> = {
  free: `sensor-history-free-${RUN_ID}@verdant.test`,
  legacyOnly: `sensor-history-legacy-only-${RUN_ID}@verdant.test`,
  lovablePro: `sensor-history-lovable-pro-${RUN_ID}@verdant.test`,
  craft: `sensor-history-craft-${RUN_ID}@verdant.test`,
  founder: `sensor-history-founder-${RUN_ID}@verdant.test`,
  expired: `sensor-history-expired-${RUN_ID}@verdant.test`,
  other: `sensor-history-other-${RUN_ID}@verdant.test`,
};

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

function isSameInstant(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string") return false;
  const actualMs = Date.parse(actual);
  const expectedMs = Date.parse(expected);
  return Number.isFinite(actualMs) && Number.isFinite(expectedMs) && actualMs === expectedMs;
}

async function createUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

async function seedHistory(userId: string, label: string): Promise<string> {
  const { data: tent, error: tentError } = await admin
    .from("tents")
    .insert({ user_id: userId, name: `${label} tent`, stage: "seedling" })
    .select("id")
    .single();
  if (tentError || !tent) throw new Error(`seed tent ${label}: ${tentError?.message}`);

  const { error: readingError } = await admin.from("sensor_readings").insert([
    {
      user_id: userId,
      tent_id: tent.id,
      metric: "temperature_c",
      value: 22,
      quality: "ok",
      source: "manual",
      captured_at: OLD_AT,
      ts: OLD_AT,
    },
    {
      user_id: userId,
      tent_id: tent.id,
      metric: "temperature_c",
      value: 24,
      quality: "ok",
      source: "manual",
      captured_at: RECENT_AT,
      ts: RECENT_AT,
    },
  ]);
  if (readingError) throw new Error(`seed readings ${label}: ${readingError.message}`);
  return tent.id;
}

async function readOwnHistory(client: SupabaseClient, userId: string) {
  return client
    .from("sensor_readings")
    .select("id,user_id,captured_at,ts,value")
    .eq("user_id", userId)
    .order("captured_at", { ascending: true });
}

async function main(): Promise<void> {
  const userIds = {} as Record<AccountKey, string>;
  const createdUserIds: string[] = [];

  try {
    for (const key of Object.keys(EMAILS) as AccountKey[]) {
      const userId = await createUser(EMAILS[key]);
      createdUserIds.push(userId);
      userIds[key] = userId;
    }

    for (const key of Object.keys(EMAILS) as AccountKey[]) {
      await seedHistory(userIds[key]!, key);
    }

    const { error: billingError } = await admin.from("billing_subscriptions").insert({
      user_id: userIds.legacyOnly!,
      plan_id: "pro_monthly",
      status: "active",
      provider: "paddle",
      current_period_end: FUTURE_END,
    });
    if (billingError) throw new Error(`seed billing_subscriptions: ${billingError.message}`);

    const { error: subscriptionsError } = await admin.from("subscriptions").insert([
      {
        user_id: userIds.lovablePro!,
        paddle_subscription_id: `subscription_${crypto.randomUUID()}`,
        paddle_customer_id: `customer_${crypto.randomUUID()}`,
        product_id: "pro",
        price_id: "pro_annual",
        status: "active",
        current_period_start: RECENT_AT,
        current_period_end: FUTURE_END,
        cancel_at_period_end: false,
        environment: "live",
      },
      {
        user_id: userIds.craft!,
        paddle_subscription_id: `subscription_${crypto.randomUUID()}`,
        paddle_customer_id: `customer_${crypto.randomUUID()}`,
        product_id: "craft",
        price_id: "craft_monthly",
        status: "active",
        current_period_start: RECENT_AT,
        current_period_end: FUTURE_END,
        cancel_at_period_end: false,
        environment: "live",
      },
      {
        user_id: userIds.founder!,
        paddle_subscription_id: `lifetime_${crypto.randomUUID()}`,
        paddle_customer_id: `customer_${crypto.randomUUID()}`,
        product_id: "founder_lifetime",
        price_id: "founder_lifetime",
        status: "active",
        current_period_start: RECENT_AT,
        current_period_end: null,
        cancel_at_period_end: false,
        environment: "live",
      },
      {
        user_id: userIds.expired!,
        paddle_subscription_id: `subscription_${crypto.randomUUID()}`,
        paddle_customer_id: `customer_${crypto.randomUUID()}`,
        product_id: "pro",
        price_id: "pro_monthly",
        status: "expired",
        current_period_start: OLD_AT,
        current_period_end: PAST_END,
        cancel_at_period_end: false,
        environment: "live",
      },
    ]);
    if (subscriptionsError) {
      throw new Error(`seed subscriptions: ${subscriptionsError.message}`);
    }

    const clients = {} as Record<AccountKey, SupabaseClient>;
    await Promise.all(
      (Object.keys(EMAILS) as AccountKey[]).map(async (key) => {
        clients[key] = await signedInClient(EMAILS[key]);
      }),
    );

    const { count: storedBefore, error: countBeforeError } = await admin
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .in("user_id", Object.values(userIds));
    if (countBeforeError) throw new Error(`count before: ${countBeforeError.message}`);

    const free = await readOwnHistory(clients.free, userIds.free!);
    check(
      "Free sees recent sensor history",
      free.error == null &&
        free.data?.some((row) => isSameInstant(row.captured_at, RECENT_AT)) === true,
      free.error?.message,
    );
    check(
      "Free cannot read sensor history older than 90 days",
      free.error == null &&
        free.data?.length === 1 &&
        free.data.every((row) => !isSameInstant(row.captured_at, OLD_AT)),
      free.error?.message,
    );

    const legacyOnly = await readOwnHistory(clients.legacyOnly, userIds.legacyOnly!);
    check(
      "Legacy-only Pro cannot read sensor history older than 90 days",
      legacyOnly.error == null &&
        legacyOnly.data?.length === 1 &&
        isSameInstant(legacyOnly.data[0]?.captured_at, RECENT_AT),
      legacyOnly.error?.message,
    );

    for (const [key, name] of [
      ["lovablePro", "Lovable Pro sees full sensor history"],
      ["craft", "Lovable Craft sees full sensor history"],
      ["founder", "Lovable Founder sees full sensor history"],
    ] as const) {
      const result = await readOwnHistory(clients[key], userIds[key]!);
      check(
        name,
        result.error == null &&
          result.data?.length === 2 &&
          result.data.some((row) => isSameInstant(row.captured_at, OLD_AT)),
        result.error?.message,
      );
    }

    const expired = await readOwnHistory(clients.expired, userIds.expired!);
    check(
      "Expired paid row resolves to the Free history window",
      expired.error == null &&
        expired.data?.length === 1 &&
        isSameInstant(expired.data[0]?.captured_at, RECENT_AT),
      expired.error?.message,
    );

    const crossUser = await clients.free
      .from("sensor_readings")
      .select("id,user_id,captured_at")
      .eq("user_id", userIds.other!);
    check(
      "Cross-user sensor history stays isolated",
      crossUser.error == null && crossUser.data?.length === 0,
      crossUser.error?.message,
    );

    const adminFree = await readOwnHistory(admin, userIds.free!);
    check(
      "service_role can still read all stored sensor history",
      adminFree.error == null &&
        adminFree.data?.length === 2 &&
        adminFree.data.some((row) => isSameInstant(row.captured_at, OLD_AT)),
      adminFree.error?.message,
    );

    const { count: storedAfter, error: countAfterError } = await admin
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .in("user_id", Object.values(userIds));
    check(
      "The read cap does not delete or rewrite sensor history",
      countAfterError == null && storedBefore === 14 && storedAfter === storedBefore,
      countAfterError?.message ?? `before=${storedBefore} after=${storedAfter}`,
    );
  } finally {
    const ids = createdUserIds;
    if (ids.length > 0) {
      await admin.from("sensor_readings").delete().in("user_id", ids);
      await admin.from("tents").delete().in("user_id", ids);
      await admin.from("billing_subscriptions").delete().in("user_id", ids);
      await admin.from("subscriptions").delete().in("user_id", ids);
      for (const userId of ids) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) console.error(`teardown ${userId}: ${error.message}`);
      }
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
