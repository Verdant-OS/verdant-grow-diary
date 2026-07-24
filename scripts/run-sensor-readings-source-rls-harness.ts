#!/usr/bin/env -S bun run
/**
 * Runtime proof for the sensor_readings provenance INSERT fence.
 *
 * Proves with real authenticated clients that grower-authored manual/CSV
 * rows remain writable, while trusted live/transport labels cannot be
 * self-granted. The service role is used only for fixture setup, an explicit
 * service-role RLS-bypass assertion, authoritative read-back, and teardown.
 *
 * Run after applying the current migrations:
 *   bun run test:sensor-readings-source-rls
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY
 *   (SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY also work).
 *
 * Remote disposable project opt-in:
 *   SENSOR_READINGS_SOURCE_RLS_HARNESS_ALLOW_REMOTE=1
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REMOTE_CONFIRM_ENV = "SENSOR_READINGS_SOURCE_RLS_HARNESS_ALLOW_REMOTE";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

for (const [name, value] of [
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
  ["SUPABASE_ANON_KEY", anonKey],
] as const) {
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(2);
  }
}

let hostname: string;
try {
  hostname = new URL(supabaseUrl!).hostname;
} catch {
  console.error("invalid SUPABASE_URL");
  process.exit(2);
}

const localHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";
if (!localHost && process.env[REMOTE_CONFIRM_ENV] !== "1") {
  console.error(
    `refusing remote database; set ${REMOTE_CONFIRM_ENV}=1 only for a disposable non-production project`,
  );
  process.exit(2);
}

const admin = createClient(supabaseUrl!, serviceRoleKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonymous = createClient(supabaseUrl!, anonKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string | null) {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
}

async function createUser(label: string) {
  const password = `Verdant!${crypto.randomUUID()}`;
  const email = `sensor-source-${label}-${crypto.randomUUID()}@verdant.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture_user_create_${error?.code ?? "failed"}`);
  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`fixture_sign_in_${error.code ?? "failed"}`);
  return client;
}

function reading(userId: string, tentId: string, source: string, offsetMs: number) {
  const capturedAt = new Date(Date.now() - 60_000 + offsetMs).toISOString();
  return {
    user_id: userId,
    tent_id: tentId,
    metric: "temperature_c",
    value: 24.5,
    quality: "ok",
    source,
    captured_at: capturedAt,
    ts: capturedAt,
  };
}

async function main() {
  let owner: Awaited<ReturnType<typeof createUser>> | null = null;
  let other: Awaited<ReturnType<typeof createUser>> | null = null;
  let ownerTentId: string | null = null;
  let otherTentId: string | null = null;

  try {
    const ownerFixture = await createUser("owner");
    owner = ownerFixture;
    const otherFixture = await createUser("other");
    other = otherFixture;

    const { data: ownerTent, error: ownerTentError } = await admin
      .from("tents")
      .insert({ user_id: ownerFixture.id, name: "Sensor source owner tent" })
      .select("id")
      .single();
    if (ownerTentError || !ownerTent) {
      throw new Error(`fixture_owner_tent_${ownerTentError?.code ?? "failed"}`);
    }
    ownerTentId = ownerTent.id as string;

    const { data: otherTent, error: otherTentError } = await admin
      .from("tents")
      .insert({ user_id: otherFixture.id, name: "Sensor source other tent" })
      .select("id")
      .single();
    if (otherTentError || !otherTent) {
      throw new Error(`fixture_other_tent_${otherTentError?.code ?? "failed"}`);
    }
    otherTentId = otherTent.id as string;

    const ownerClient = await signIn(ownerFixture.email, ownerFixture.password);

    for (const [index, source] of ["manual", "csv"].entries()) {
      const row = reading(ownerFixture.id, ownerTentId, source, index * 1_000);
      const { data, error } = await ownerClient
        .from("sensor_readings")
        .insert(row)
        .select("id,source");
      check(
        `authenticated ${source} INSERT succeeds`,
        !error && data?.length === 1 && data[0]?.source === source,
        error?.code,
      );
    }

    const blockedSources = ["live", "ecowitt", "mqtt", "webhook", "pi_bridge"];
    for (const [index, source] of blockedSources.entries()) {
      const row = reading(ownerFixture.id, ownerTentId, source, (index + 2) * 1_000);
      const { data, error } = await ownerClient.from("sensor_readings").insert(row).select("id");
      const { count } = await admin
        .from("sensor_readings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ownerFixture.id)
        .eq("tent_id", ownerTentId)
        .eq("source", source)
        .eq("captured_at", row.captured_at);
      check(
        `authenticated direct ${source} provenance is denied`,
        (!!error || (data ?? []).length === 0) && count === 0,
        error?.code,
      );
    }

    const crossTent = reading(ownerFixture.id, otherTentId, "manual", 8_000);
    const { data: crossData, error: crossError } = await ownerClient
      .from("sensor_readings")
      .insert(crossTent)
      .select("id");
    const { count: crossCount, error: crossCountError } = await admin
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", crossTent.user_id)
      .eq("tent_id", crossTent.tent_id)
      .eq("source", crossTent.source)
      .eq("captured_at", crossTent.captured_at);
    check(
      "authenticated manual INSERT into another user's tent is denied",
      (!!crossError || (crossData ?? []).length === 0) && !crossCountError && crossCount === 0,
      crossError?.code ?? crossCountError?.code,
    );

    const forgedOwner = reading(otherFixture.id, ownerTentId, "manual", 9_000);
    const { data: forgedData, error: forgedError } = await ownerClient
      .from("sensor_readings")
      .insert(forgedOwner)
      .select("id");
    const { count: forgedCount, error: forgedCountError } = await admin
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", forgedOwner.user_id)
      .eq("tent_id", forgedOwner.tent_id)
      .eq("source", forgedOwner.source)
      .eq("captured_at", forgedOwner.captured_at);
    check(
      "authenticated client cannot forge row user_id",
      (!!forgedError || (forgedData ?? []).length === 0) && !forgedCountError && forgedCount === 0,
      forgedError?.code ?? forgedCountError?.code,
    );

    const anonRow = reading(ownerFixture.id, ownerTentId, "manual", 10_000);
    const { data: anonData, error: anonError } = await anonymous
      .from("sensor_readings")
      .insert(anonRow)
      .select("id");
    const { count: anonCount, error: anonCountError } = await admin
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", anonRow.user_id)
      .eq("tent_id", anonRow.tent_id)
      .eq("source", anonRow.source)
      .eq("captured_at", anonRow.captured_at);
    check(
      "anonymous INSERT is denied",
      (!!anonError || (anonData ?? []).length === 0) && !anonCountError && anonCount === 0,
      anonError?.code ?? anonCountError?.code,
    );

    const serviceRoleRow = reading(ownerFixture.id, ownerTentId, "live", 11_000);
    const { data: serviceRoleData, error: serviceRoleError } = await admin
      .from("sensor_readings")
      .insert(serviceRoleRow)
      .select("id,source");
    check(
      "service-role RLS bypass can INSERT trusted live provenance",
      !serviceRoleError && serviceRoleData?.length === 1 && serviceRoleData[0]?.source === "live",
      serviceRoleError?.code,
    );
  } finally {
    const userIds = [owner?.id, other?.id].filter((id): id is string => typeof id === "string");
    const tentIds = [ownerTentId, otherTentId].filter((id): id is string => typeof id === "string");
    if (userIds.length > 0) {
      await admin.from("sensor_readings").delete().in("user_id", userIds);
    }
    if (tentIds.length > 0) {
      await admin.from("tents").delete().in("id", tentIds);
    }
    if (owner) await admin.auth.admin.deleteUser(owner.id).catch(() => undefined);
    if (other) await admin.auth.admin.deleteUser(other.id).catch(() => undefined);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
