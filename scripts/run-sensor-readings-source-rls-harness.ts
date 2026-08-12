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
const OPERATOR_ATTESTED_PROVENANCE = "operator_attested_real_payload";
const OPERATOR_ATTESTATION_BOUNDARY = "operator-ggs-real-payload-commit";
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

interface HarnessError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function errorDetail(error: HarnessError | null | undefined): string {
  if (!error) return "no_error_no_row";
  return [
    `code=${error.code ?? "none"}`,
    error.message ? `message=${error.message}` : null,
    error.details ? `details=${error.details}` : null,
    error.hint ? `hint=${error.hint}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

// PostgREST and SQLSTATE verdicts always carry an error code; transport-level
// failures (socket resets, gateway 5xx bodies) do not. Only code-less errors
// may retry, so a retry can never re-litigate a real allow/deny verdict, and
// every deny assertion is still decided by the authoritative service readback.
const FIXTURE_TRANSPORT_ATTEMPTS = 3;

function isTransportError(error: HarnessError | null | undefined): boolean {
  return !!error && !error.code;
}

async function withTransportRetry<R extends { error: HarnessError | null }>(
  label: string,
  run: () => PromiseLike<R>,
): Promise<R> {
  let result = await run();
  for (
    let attempt = 2;
    attempt <= FIXTURE_TRANSPORT_ATTEMPTS && isTransportError(result.error);
    attempt += 1
  ) {
    console.error(
      `  ! transport error on "${label}" (retry ${attempt}/${FIXTURE_TRANSPORT_ATTEMPTS}): ` +
        errorDetail(result.error),
    );
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt - 1)));
    result = await run();
  }
  return result;
}

async function createUser(label: string) {
  const password = `Verdant!${crypto.randomUUID()}`;
  const email = `sensor-source-${label}-${crypto.randomUUID()}@verdant.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture_user_create_${errorDetail(error)}`);
  return { id: data.user.id, email, password };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`fixture_sign_in_${errorDetail(error)}`);
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
    const ownerClient = await signIn(ownerFixture.email, ownerFixture.password);
    const otherClient = await signIn(otherFixture.email, otherFixture.password);

    const { data: ownerTent, error: ownerTentError } = await withTransportRetry(
      "owner tent fixture",
      () =>
        ownerClient
          .from("tents")
          .insert({ user_id: ownerFixture.id, name: "Sensor source owner tent" })
          .select("id")
          .single(),
    );
    if (ownerTentError || !ownerTent) {
      throw new Error(`fixture_owner_tent_${errorDetail(ownerTentError)}`);
    }
    ownerTentId = ownerTent.id as string;

    const { data: otherTent, error: otherTentError } = await withTransportRetry(
      "other tent fixture",
      () =>
        otherClient
          .from("tents")
          .insert({ user_id: otherFixture.id, name: "Sensor source other tent" })
          .select("id")
          .single(),
    );
    if (otherTentError || !otherTent) {
      throw new Error(`fixture_other_tent_${errorDetail(otherTentError)}`);
    }
    otherTentId = otherTent.id as string;

    for (const [index, source] of ["manual", "csv"].entries()) {
      const row = reading(ownerFixture.id, ownerTentId, source, index * 1_000);
      const { error } = await withTransportRetry(`authenticated ${source} INSERT`, () =>
        ownerClient.from("sensor_readings").insert(row),
      );
      // sensor_readings_dedupe_uidx makes this tuple identify at most one
      // row, so the service readback decides the verdict: a committed-but-
      // lost first attempt whose replay hit 23505 still counts as the
      // allowed row landing exactly once.
      const { count, error: countError } = await withTransportRetry(
        `authenticated ${source} INSERT readback`,
        () =>
          admin
            .from("sensor_readings")
            .select("id", { count: "exact", head: true })
            .eq("user_id", row.user_id)
            .eq("tent_id", row.tent_id)
            .eq("source", source)
            .eq("captured_at", row.captured_at),
      );
      check(
        `authenticated ${source} INSERT succeeds`,
        !countError && count === 1,
        error || countError ? errorDetail(error ?? countError) : undefined,
      );
    }

    const reservedMarkerForgeries = [
      {
        label: "operator provenance",
        raw_payload: { provenance: OPERATOR_ATTESTED_PROVENANCE },
      },
      {
        label: "operator attestation boundary",
        raw_payload: {
          operator_attestation: { boundary: OPERATOR_ATTESTATION_BOUNDARY },
        },
      },
    ] as const;
    for (const [index, attempt] of reservedMarkerForgeries.entries()) {
      const row = {
        ...reading(ownerFixture.id, ownerTentId, "manual", (index + 12) * 1_000),
        raw_payload: attempt.raw_payload,
      };
      const { data, error } = await withTransportRetry(
        `reserved ${attempt.label} forgery INSERT`,
        () => ownerClient.from("sensor_readings").insert(row).select("id"),
      );
      const { count, error: countError } = await withTransportRetry(
        `reserved ${attempt.label} forgery readback`,
        () =>
          admin
            .from("sensor_readings")
            .select("id", { count: "exact", head: true })
            .eq("user_id", row.user_id)
            .eq("tent_id", row.tent_id)
            .eq("captured_at", row.captured_at),
      );
      check(
        `authenticated client cannot forge reserved ${attempt.label}`,
        !isTransportError(error) &&
          (!!error || (data ?? []).length === 0) &&
          !countError &&
          count === 0,
        error || countError ? errorDetail(error ?? countError) : undefined,
      );
    }

    const blockedSources = ["live", "ecowitt", "mqtt", "webhook", "pi_bridge"];
    for (const [index, source] of blockedSources.entries()) {
      const row = reading(ownerFixture.id, ownerTentId, source, (index + 2) * 1_000);
      const { data, error } = await withTransportRetry(`direct ${source} provenance INSERT`, () =>
        ownerClient.from("sensor_readings").insert(row).select("id"),
      );
      const { count, error: countError } = await withTransportRetry(
        `direct ${source} provenance readback`,
        () =>
          admin
            .from("sensor_readings")
            .select("id", { count: "exact", head: true })
            .eq("user_id", row.user_id)
            .eq("tent_id", row.tent_id)
            .eq("source", source)
            .eq("captured_at", row.captured_at),
      );
      check(
        `authenticated direct ${source} provenance is denied`,
        !isTransportError(error) &&
          (!!error || (data ?? []).length === 0) &&
          !countError &&
          count === 0,
        error || countError ? errorDetail(error ?? countError) : undefined,
      );
    }

    const crossTent = reading(ownerFixture.id, otherTentId, "manual", 8_000);
    const { data: crossData, error: crossError } = await withTransportRetry(
      "cross-tent manual INSERT",
      () => ownerClient.from("sensor_readings").insert(crossTent).select("id"),
    );
    const { count: crossCount, error: crossCountError } = await withTransportRetry(
      "cross-tent manual readback",
      () =>
        admin
          .from("sensor_readings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", crossTent.user_id)
          .eq("tent_id", crossTent.tent_id)
          .eq("source", crossTent.source)
          .eq("captured_at", crossTent.captured_at),
    );
    check(
      "authenticated manual INSERT into another user's tent is denied",
      !isTransportError(crossError) &&
        (!!crossError || (crossData ?? []).length === 0) &&
        !crossCountError &&
        crossCount === 0,
      crossError || crossCountError ? errorDetail(crossError ?? crossCountError) : undefined,
    );

    const forgedOwner = reading(otherFixture.id, ownerTentId, "manual", 9_000);
    const { data: forgedData, error: forgedError } = await withTransportRetry(
      "forged user_id INSERT",
      () => ownerClient.from("sensor_readings").insert(forgedOwner).select("id"),
    );
    const { count: forgedCount, error: forgedCountError } = await withTransportRetry(
      "forged user_id readback",
      () =>
        admin
          .from("sensor_readings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", forgedOwner.user_id)
          .eq("tent_id", forgedOwner.tent_id)
          .eq("source", forgedOwner.source)
          .eq("captured_at", forgedOwner.captured_at),
    );
    check(
      "authenticated client cannot forge row user_id",
      !isTransportError(forgedError) &&
        (!!forgedError || (forgedData ?? []).length === 0) &&
        !forgedCountError &&
        forgedCount === 0,
      forgedError || forgedCountError ? errorDetail(forgedError ?? forgedCountError) : undefined,
    );

    const anonRow = reading(ownerFixture.id, ownerTentId, "manual", 10_000);
    const { data: anonData, error: anonError } = await withTransportRetry("anonymous INSERT", () =>
      anonymous.from("sensor_readings").insert(anonRow).select("id"),
    );
    const { count: anonCount, error: anonCountError } = await withTransportRetry(
      "anonymous INSERT readback",
      () =>
        admin
          .from("sensor_readings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", anonRow.user_id)
          .eq("tent_id", anonRow.tent_id)
          .eq("source", anonRow.source)
          .eq("captured_at", anonRow.captured_at),
    );
    check(
      "anonymous INSERT is denied",
      !isTransportError(anonError) &&
        (!!anonError || (anonData ?? []).length === 0) &&
        !anonCountError &&
        anonCount === 0,
      anonError || anonCountError ? errorDetail(anonError ?? anonCountError) : undefined,
    );

    const serviceRoleRow = reading(ownerFixture.id, ownerTentId, "live", 11_000);
    const { error: serviceRoleError } = await withTransportRetry("service-role live INSERT", () =>
      admin.from("sensor_readings").insert(serviceRoleRow),
    );
    // Readback-decided for the same committed-but-lost reason as the
    // manual/csv positive controls above.
    const { count: serviceRoleCount, error: serviceRoleReadError } = await withTransportRetry(
      "service-role live INSERT readback",
      () =>
        admin
          .from("sensor_readings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", serviceRoleRow.user_id)
          .eq("tent_id", serviceRoleRow.tent_id)
          .eq("source", "live")
          .eq("captured_at", serviceRoleRow.captured_at),
    );
    check(
      "service-role RLS bypass can INSERT trusted live provenance",
      !serviceRoleReadError && serviceRoleCount === 1,
      serviceRoleError || serviceRoleReadError
        ? errorDetail(serviceRoleError ?? serviceRoleReadError)
        : undefined,
    );

    const rpcCapturedAt = new Date(Date.now() - 30_000).toISOString();
    const rpcIdempotencyKey = `operator-ggs-rls-${crypto.randomUUID()}`;
    const rpcBridgeId = crypto.randomUUID();
    const rpcTentId = ownerTentId;
    const { data: rpcData, error: rpcError } = await withTransportRetry(
      "service-role pi_ingest_commit_batch",
      () =>
        admin.rpc("pi_ingest_commit_batch", {
          p_user_id: ownerFixture.id,
          p_bridge_id: rpcBridgeId,
          p_tent_id: rpcTentId,
          p_rows: [
            {
              idempotency_key: rpcIdempotencyKey,
              device_id: "GGS-RLS-HARNESS",
              metric: "soil_moisture_pct",
              value: 42.5,
              captured_at: rpcCapturedAt,
              source: "manual",
              quality: "ok",
              raw_payload: {
                provenance: OPERATOR_ATTESTED_PROVENANCE,
                operator_attestation: {
                  attested: true,
                  boundary: OPERATOR_ATTESTATION_BOUNDARY,
                },
              },
            },
          ],
        }),
    );
    const rpcCounts = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      inserted?: number;
      rejected?: number;
    } | null;
    const { data: rpcRows, error: rpcReadError } = await withTransportRetry(
      "pi_ingest_commit_batch readback",
      () =>
        admin
          .from("sensor_readings")
          .select("source,raw_payload")
          .eq("user_id", ownerFixture.id)
          .eq("tent_id", rpcTentId)
          .eq("captured_at", rpcCapturedAt),
    );
    check(
      "service-role pi_ingest_commit_batch preserves reserved operator attestation",
      !rpcError &&
        !rpcReadError &&
        // A committed-but-lost first attempt replays the identical payload
        // and dedupes on (user_id, idempotency_key) as inserted=0/rejected=1;
        // either shape must still show the row present exactly once with the
        // reserved markers preserved.
        ((rpcCounts?.inserted === 1 && rpcCounts.rejected === 0) ||
          (rpcCounts?.inserted === 0 && rpcCounts.rejected === 1)) &&
        rpcRows?.length === 1 &&
        rpcRows[0]?.source === "manual" &&
        rpcRows[0]?.raw_payload?.provenance === OPERATOR_ATTESTED_PROVENANCE &&
        rpcRows[0]?.raw_payload?.operator_attestation?.boundary === OPERATOR_ATTESTATION_BOUNDARY,
      rpcError || rpcReadError ? errorDetail(rpcError ?? rpcReadError) : undefined,
    );
  } finally {
    const userIds = [owner?.id, other?.id].filter((id): id is string => typeof id === "string");
    const tentIds = [ownerTentId, otherTentId].filter((id): id is string => typeof id === "string");
    if (userIds.length > 0) {
      await admin.from("pi_ingest_idempotency_keys").delete().in("user_id", userIds);
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
