#!/usr/bin/env -S bun run
/**
 * Runtime RLS proof for VPD calibration and measurement provenance.
 *
 * A real authenticated client performs every allow/deny assertion. The
 * service role is used only for fixture setup, readback, and teardown.
 *
 * Run after applying the current migrations:
 *   bun run test:vpd-calibration-provenance-rls
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY
 *   (SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY also work).
 *
 * Remote disposable project opt-in:
 *   VPD_CALIBRATION_PROVENANCE_RLS_HARNESS_ALLOW_REMOTE=1
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REMOTE_CONFIRM_ENV = "VPD_CALIBRATION_PROVENANCE_RLS_HARNESS_ALLOW_REMOTE";
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

const isLocal =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";
if (!isLocal && process.env[REMOTE_CONFIRM_ENV] !== "1") {
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

function check(name: string, ok: boolean, detail?: string | null): void {
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
  const email = `vpd-provenance-${label}-${crypto.randomUUID()}@verdant.test`;
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

async function seedTent(userId: string, label: string): Promise<string> {
  const { data, error } = await admin
    .from("tents")
    .insert({ user_id: userId, name: `VPD provenance ${label}` })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`fixture_tent_${error?.code ?? "failed"}`);
  return data.id as string;
}

interface ReadingSet {
  airId: string;
  humidityId: string;
  vpdId: string;
  observedAt: string;
}

async function seedReadingSet(args: {
  userId: string;
  tentId: string;
  label: string;
  minutesAgo: number;
  vpdValue?: number;
}): Promise<ReadingSet> {
  const observedAt = new Date(Date.now() - args.minutesAgo * 60_000).toISOString();
  const base = {
    user_id: args.userId,
    tent_id: args.tentId,
    quality: "ok",
    source: "manual",
    device_id: "vpd-probe-1",
    captured_at: observedAt,
    ts: observedAt,
    raw_payload: { harness: args.label },
  };
  const { data, error } = await admin
    .from("sensor_readings")
    .insert([
      { ...base, metric: "temperature_c", value: 25 },
      { ...base, metric: "humidity_pct", value: 60 },
      { ...base, metric: "vpd_kpa", value: args.vpdValue ?? 0.73 },
    ])
    .select("id,metric");
  if (error || data?.length !== 3) {
    throw new Error(`fixture_readings_${error?.code ?? "failed"}`);
  }
  const idFor = (metric: string) =>
    data.find((row) => row.metric === metric)?.id as string | undefined;
  const airId = idFor("temperature_c");
  const humidityId = idFor("humidity_pct");
  const vpdId = idFor("vpd_kpa");
  if (!airId || !humidityId || !vpdId) throw new Error("fixture_reading_ids_missing");
  return { airId, humidityId, vpdId, observedAt };
}

function calibrationRow(args: {
  userId: string;
  tentId: string;
  verifiedAt: string;
  humidityReference?: number;
  placement?: string;
}) {
  return {
    user_id: args.userId,
    tent_id: args.tentId,
    device_id: "vpd-probe-1",
    sensor_label: "Canopy temperature/RH probe",
    sensor_commissioned_at: "2025-01-01T00:00:00.000Z",
    placement: args.placement ?? "canopy",
    temperature_verified_at: args.verifiedAt,
    temperature_reference: "NIST-traceable handheld reference",
    temperature_reference_value_c: 26,
    temperature_sensor_value_c: 25,
    temperature_verified_at_operating_conditions: true,
    humidity_verified_at: args.verifiedAt,
    humidity_reference_rh_pct: args.humidityReference ?? 75,
    humidity_sensor_rh_pct: (args.humidityReference ?? 75) - 2,
    evidence_source: "manual",
  };
}

function leafProvenanceRow(args: {
  userId: string;
  tentId: string;
  readings: ReadingSet;
  calibrationId: string;
  leafMeasuredAt?: string;
}) {
  return {
    user_id: args.userId,
    tent_id: args.tentId,
    vpd_reading_id: args.readings.vpdId,
    air_temperature_reading_id: args.readings.airId,
    humidity_reading_id: args.readings.humidityId,
    calibration_record_id: args.calibrationId,
    measurement_basis: "leaf",
    leaf_temperature_c: 23,
    leaf_temperature_measured_at: args.leafMeasuredAt ?? args.readings.observedAt,
    leaf_temperature_method: "infrared",
    algorithm_version: "tetens_leaf_air_v1",
  };
}

async function expectInsertDenied(args: {
  client: SupabaseClient;
  table: string;
  row: Record<string, unknown>;
  label: string;
}): Promise<void> {
  const { data, error } = await args.client.from(args.table).insert(args.row).select("id");
  check(args.label, !!error || (data ?? []).length === 0, error?.code);
}

async function main(): Promise<void> {
  let owner: Awaited<ReturnType<typeof createUser>> | null = null;
  let other: Awaited<ReturnType<typeof createUser>> | null = null;
  const tentIds: string[] = [];
  const readingIds: string[] = [];
  const calibrationIds: string[] = [];
  const provenanceIds: string[] = [];

  try {
    owner = await createUser("owner");
    other = await createUser("other");
    const ownerTentId = await seedTent(owner.id, "owner tent");
    const otherTentId = await seedTent(other.id, "other tent");
    tentIds.push(ownerTentId, otherTentId);

    const ownerClient = await signIn(owner.email, owner.password);
    const verifiedAt = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

    const { data: calibration, error: calibrationError } = await ownerClient
      .from("vpd_calibration_records")
      .insert(calibrationRow({ userId: owner.id, tentId: ownerTentId, verifiedAt }))
      .select("id")
      .single();
    check(
      "authenticated owner can insert current canopy calibration",
      !calibrationError && !!calibration?.id,
      calibrationError?.code,
    );
    if (!calibration?.id) throw new Error("valid_calibration_missing");
    const validCalibrationId = calibration.id as string;
    calibrationIds.push(validCalibrationId);

    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_calibration_records",
      row: calibrationRow({
        userId: owner.id,
        tentId: ownerTentId,
        verifiedAt,
        humidityReference: 74.9,
      }),
      label: "RH reference below 75 is denied",
    });
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_calibration_records",
      row: calibrationRow({ userId: owner.id, tentId: otherTentId, verifiedAt }),
      label: "another user's tent is denied",
    });
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_calibration_records",
      row: calibrationRow({ userId: other.id, tentId: ownerTentId, verifiedAt }),
      label: "forged user_id is denied",
    });

    const validReadings = await seedReadingSet({
      userId: owner.id,
      tentId: ownerTentId,
      label: "valid",
      minutesAgo: 4,
    });
    readingIds.push(validReadings.airId, validReadings.humidityId, validReadings.vpdId);
    const { data: provenance, error: provenanceError } = await ownerClient
      .from("vpd_measurement_provenance")
      .insert(
        leafProvenanceRow({
          userId: owner.id,
          tentId: ownerTentId,
          readings: validReadings,
          calibrationId: validCalibrationId,
        }),
      )
      .select("id")
      .single();
    check(
      "authenticated owner can insert formula-matched leaf provenance",
      !provenanceError && !!provenance?.id,
      provenanceError?.code,
    );
    if (!provenance?.id) throw new Error("valid_provenance_missing");
    provenanceIds.push(provenance.id as string);

    const { data: nonCanopyCalibration, error: nonCanopyCalibrationError } = await ownerClient
      .from("vpd_calibration_records")
      .insert(
        calibrationRow({
          userId: owner.id,
          tentId: ownerTentId,
          verifiedAt,
          placement: "above_canopy",
        }),
      )
      .select("id")
      .single();
    if (nonCanopyCalibrationError || !nonCanopyCalibration?.id) {
      throw new Error(
        `non_canopy_calibration_fixture_${nonCanopyCalibrationError?.code ?? "failed"}`,
      );
    }
    calibrationIds.push(nonCanopyCalibration.id as string);
    const nonCanopyReadings = await seedReadingSet({
      userId: owner.id,
      tentId: ownerTentId,
      label: "non-canopy",
      minutesAgo: 5,
    });
    readingIds.push(nonCanopyReadings.airId, nonCanopyReadings.humidityId, nonCanopyReadings.vpdId);
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_measurement_provenance",
      row: leafProvenanceRow({
        userId: owner.id,
        tentId: ownerTentId,
        readings: nonCanopyReadings,
        calibrationId: nonCanopyCalibration.id as string,
      }),
      label: "non-canopy placement is denied",
    });

    const staleVerifiedAt = new Date(Date.now() - 366 * 24 * 60 * 60_000).toISOString();
    const { data: staleCalibration, error: staleCalibrationError } = await ownerClient
      .from("vpd_calibration_records")
      .insert(
        calibrationRow({ userId: owner.id, tentId: ownerTentId, verifiedAt: staleVerifiedAt }),
      )
      .select("id")
      .single();
    if (staleCalibrationError || !staleCalibration?.id) {
      throw new Error(`stale_calibration_fixture_${staleCalibrationError?.code ?? "failed"}`);
    }
    calibrationIds.push(staleCalibration.id as string);
    const staleReadings = await seedReadingSet({
      userId: owner.id,
      tentId: ownerTentId,
      label: "stale",
      minutesAgo: 6,
    });
    readingIds.push(staleReadings.airId, staleReadings.humidityId, staleReadings.vpdId);
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_measurement_provenance",
      row: leafProvenanceRow({
        userId: owner.id,
        tentId: ownerTentId,
        readings: staleReadings,
        calibrationId: staleCalibration.id as string,
      }),
      label: "stale calibration is denied",
    });

    const skewReadings = await seedReadingSet({
      userId: owner.id,
      tentId: ownerTentId,
      label: "skew",
      minutesAgo: 8,
    });
    readingIds.push(skewReadings.airId, skewReadings.humidityId, skewReadings.vpdId);
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_measurement_provenance",
      row: leafProvenanceRow({
        userId: owner.id,
        tentId: ownerTentId,
        readings: skewReadings,
        calibrationId: validCalibrationId,
        leafMeasuredAt: new Date(Date.parse(skewReadings.observedAt) - 16 * 60_000).toISOString(),
      }),
      label: "leaf reading outside 15 minutes is denied",
    });

    const mismatchReadings = await seedReadingSet({
      userId: owner.id,
      tentId: ownerTentId,
      label: "mismatch",
      minutesAgo: 10,
      vpdValue: 1.5,
    });
    readingIds.push(mismatchReadings.airId, mismatchReadings.humidityId, mismatchReadings.vpdId);
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_measurement_provenance",
      row: leafProvenanceRow({
        userId: owner.id,
        tentId: ownerTentId,
        readings: mismatchReadings,
        calibrationId: validCalibrationId,
      }),
      label: "formula mismatch is denied",
    });

    const { error: updateError } = await ownerClient
      .from("vpd_calibration_records")
      .update({ notes: "must remain immutable" })
      .eq("id", validCalibrationId);
    const { data: updateReadback } = await admin
      .from("vpd_calibration_records")
      .select("notes")
      .eq("id", validCalibrationId)
      .single();
    check(
      "UPDATE is denied",
      !!updateError && updateReadback?.notes !== "must remain immutable",
      updateError?.code,
    );

    const { error: deleteError } = await ownerClient
      .from("vpd_calibration_records")
      .delete()
      .eq("id", validCalibrationId);
    const { count: afterDeleteCount } = await admin
      .from("vpd_calibration_records")
      .select("id", { count: "exact", head: true })
      .eq("id", validCalibrationId);
    check("DELETE is denied", !!deleteError && afterDeleteCount === 1, deleteError?.code);

    await expectInsertDenied({
      client: anonymous,
      table: "vpd_calibration_records",
      row: calibrationRow({ userId: owner.id, tentId: ownerTentId, verifiedAt }),
      label: "anonymous INSERT is denied",
    });
  } finally {
    if (provenanceIds.length > 0) {
      await admin.from("vpd_measurement_provenance").delete().in("id", provenanceIds);
    }
    if (readingIds.length > 0) {
      await admin.from("sensor_readings").delete().in("id", readingIds);
    }
    if (calibrationIds.length > 0) {
      await admin.from("vpd_calibration_records").delete().in("id", calibrationIds);
    }
    if (tentIds.length > 0) await admin.from("tents").delete().in("id", tentIds);
    if (owner) await admin.auth.admin.deleteUser(owner.id).catch(() => undefined);
    if (other) await admin.auth.admin.deleteUser(other.id).catch(() => undefined);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
