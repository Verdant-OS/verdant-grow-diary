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
  airValue?: number;
  humidityValue?: number;
  vpdValue?: number;
  airDeviceId?: string | null;
  humidityDeviceId?: string | null;
  vpdDeviceId?: string | null;
  airSource?: string;
  humiditySource?: string;
  vpdSource?: string;
  legacyTsOnly?: boolean;
}): Promise<ReadingSet> {
  const observedAt = new Date(Date.now() - args.minutesAgo * 60_000).toISOString();
  const base = {
    user_id: args.userId,
    tent_id: args.tentId,
    quality: "ok",
    source: "manual",
    captured_at: args.legacyTsOnly ? null : observedAt,
    ts: observedAt,
    raw_payload: { harness: args.label },
  };
  const { data, error } = await admin
    .from("sensor_readings")
    .insert([
      {
        ...base,
        metric: "temperature_c",
        value: args.airValue ?? 25,
        device_id: args.airDeviceId === undefined ? "vpd-probe-1" : args.airDeviceId,
        source: args.airSource ?? "manual",
      },
      {
        ...base,
        metric: "humidity_pct",
        value: args.humidityValue ?? 60,
        device_id: args.humidityDeviceId === undefined ? "vpd-probe-1" : args.humidityDeviceId,
        source: args.humiditySource ?? "manual",
      },
      {
        ...base,
        metric: "vpd_kpa",
        value: args.vpdValue ?? 0.73,
        device_id: args.vpdDeviceId === undefined ? "vpd-probe-1" : args.vpdDeviceId,
        source: args.vpdSource ?? "manual",
      },
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
  deviceId?: string;
  temperatureReferenceValue?: number;
  temperatureSensorValue?: number;
  recordedAt?: string;
}) {
  return {
    user_id: args.userId,
    tent_id: args.tentId,
    device_id: args.deviceId ?? "vpd-probe-1",
    sensor_label: "Canopy temperature/RH probe",
    sensor_commissioned_at: "2025-01-01T00:00:00.000Z",
    placement: args.placement ?? "canopy",
    temperature_verified_at: args.verifiedAt,
    temperature_reference: "NIST-traceable handheld reference",
    temperature_reference_value_c: args.temperatureReferenceValue ?? 26,
    temperature_sensor_value_c: args.temperatureSensorValue ?? 25,
    temperature_verified_at_operating_conditions: true,
    humidity_verified_at: args.verifiedAt,
    humidity_reference_rh_pct: args.humidityReference ?? 75,
    humidity_sensor_rh_pct: (args.humidityReference ?? 75) - 2,
    evidence_source: "manual",
    ...(args.recordedAt ? { recorded_at: args.recordedAt } : {}),
  };
}

function leafProvenanceRow(args: {
  userId: string;
  tentId: string;
  readings: ReadingSet;
  calibrationId: string;
  leafMeasuredAt?: string;
  leafTemperature?: number;
  recordedAt?: string;
}) {
  return {
    user_id: args.userId,
    tent_id: args.tentId,
    vpd_reading_id: args.readings.vpdId,
    air_temperature_reading_id: args.readings.airId,
    humidity_reading_id: args.readings.humidityId,
    calibration_record_id: args.calibrationId,
    measurement_basis: "leaf",
    leaf_temperature_c: args.leafTemperature ?? 23,
    leaf_temperature_measured_at: args.leafMeasuredAt ?? args.readings.observedAt,
    leaf_temperature_method: "infrared",
    algorithm_version: "tetens_leaf_air_v1",
    ...(args.recordedAt ? { recorded_at: args.recordedAt } : {}),
  };
}

function expectedLeafVpd(args: {
  airTemperature: number;
  humidity: number;
  leafTemperature: number;
  temperatureCorrection?: number;
  humidityCorrection?: number;
}): number {
  const airTemperature = args.airTemperature + (args.temperatureCorrection ?? 0);
  const humidity = args.humidity + (args.humidityCorrection ?? 0);
  const saturation = (temperature: number) =>
    0.6108 * Math.exp((17.27 * temperature) / (temperature + 237.3));
  return Number(
    (saturation(args.leafTemperature) - (saturation(airTemperature) * humidity) / 100).toFixed(3),
  );
}

async function expectInsertDenied(args: {
  client: SupabaseClient;
  table: string;
  row: Record<string, unknown>;
  label: string;
}): Promise<void> {
  const expectedDatabaseErrorCodes = new Set(["23503", "23514", "42501", "P0001"]);
  const id = crypto.randomUUID();
  const { error } = await args.client
    .from(args.table)
    .insert({ ...args.row, id })
    .select("id");
  const { count, error: readbackError } = await admin
    .from(args.table)
    .select("id", { count: "exact", head: true })
    .eq("id", id);
  check(
    args.label,
    !!error?.code && expectedDatabaseErrorCodes.has(error.code) && !readbackError && count === 0,
    error?.code ?? readbackError?.code ?? `service_readback_count_${count ?? "null"}`,
  );
  if (!readbackError && count && count > 0) {
    const { error: cleanupError } = await admin.from(args.table).delete().eq("id", id);
    check(
      `${args.label} unauthorized-row cleanup`,
      !cleanupError,
      cleanupError?.code ?? "cleanup_failed",
    );
  }
}

async function main(): Promise<void> {
  let owner: Awaited<ReturnType<typeof createUser>> | null = null;
  let other: Awaited<ReturnType<typeof createUser>> | null = null;
  let cascadeUser: Awaited<ReturnType<typeof createUser>> | null = null;
  const tentIds: string[] = [];
  const readingIds: string[] = [];
  const calibrationIds: string[] = [];
  const provenanceIds: string[] = [];
  const seedTrackedReadings = async (
    args: Parameters<typeof seedReadingSet>[0],
  ): Promise<ReadingSet> => {
    const readings = await seedReadingSet(args);
    readingIds.push(readings.airId, readings.humidityId, readings.vpdId);
    return readings;
  };

  try {
    owner = await createUser("owner");
    other = await createUser("other");
    const ownerTentId = await seedTent(owner.id, "owner tent");
    const otherTentId = await seedTent(other.id, "other tent");
    tentIds.push(ownerTentId, otherTentId);

    const ownerClient = await signIn(owner.email, owner.password);
    const otherClient = await signIn(other.email, other.password);
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

    for (const [label, temperature] of [
      ["minus 20 C calibration boundary is accepted", -20],
      ["60 C calibration boundary is accepted", 60],
    ] as const) {
      const { data, error } = await ownerClient
        .from("vpd_calibration_records")
        .insert(
          calibrationRow({
            userId: owner.id,
            tentId: ownerTentId,
            verifiedAt,
            temperatureReferenceValue: temperature,
            temperatureSensorValue: temperature,
          }),
        )
        .select("id")
        .single();
      check(label, !error && !!data?.id, error?.code);
      if (!data?.id) throw new Error(`temperature_boundary_calibration_${temperature}_missing`);
      calibrationIds.push(data.id as string);
    }

    const { data: upperRhCalibration, error: upperRhCalibrationError } = await ownerClient
      .from("vpd_calibration_records")
      .insert(
        calibrationRow({
          userId: owner.id,
          tentId: ownerTentId,
          verifiedAt,
          humidityReference: 100,
        }),
      )
      .select("id")
      .single();
    check(
      "100 percent RH reference boundary is accepted",
      !upperRhCalibrationError && !!upperRhCalibration?.id,
      upperRhCalibrationError?.code,
    );
    if (!upperRhCalibration?.id) throw new Error("upper_rh_boundary_calibration_missing");
    calibrationIds.push(upperRhCalibration.id as string);

    for (const [label, temperature] of [
      ["calibration below minus 20 C is denied", -20.01],
      ["calibration above 60 C is denied", 60.01],
    ] as const) {
      await expectInsertDenied({
        client: ownerClient,
        table: "vpd_calibration_records",
        row: calibrationRow({
          userId: owner.id,
          tentId: ownerTentId,
          verifiedAt,
          temperatureReferenceValue: temperature,
          temperatureSensorValue: temperature,
        }),
        label,
      });
    }

    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_calibration_records",
      row: calibrationRow({
        userId: owner.id,
        tentId: ownerTentId,
        verifiedAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      label: "future calibration verification is denied",
    });
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_calibration_records",
      row: calibrationRow({
        userId: owner.id,
        tentId: ownerTentId,
        verifiedAt,
        recordedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      }),
      label: "backdated calibration recorded_at is denied",
    });
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_calibration_records",
      row: calibrationRow({
        userId: owner.id,
        tentId: ownerTentId,
        verifiedAt,
        recordedAt: new Date(Date.now() + 6 * 60_000).toISOString(),
      }),
      label: "future calibration recorded_at is denied",
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
    const validProvenanceId = provenance.id as string;
    provenanceIds.push(validProvenanceId);

    const { data: ownerCalibrationRead, error: ownerCalibrationReadError } = await ownerClient
      .from("vpd_calibration_records")
      .select("id")
      .eq("id", validCalibrationId);
    check(
      "owner can read own calibration evidence",
      !ownerCalibrationReadError && ownerCalibrationRead?.length === 1,
      ownerCalibrationReadError?.code,
    );
    const { data: otherCalibrationRead, error: otherCalibrationReadError } = await otherClient
      .from("vpd_calibration_records")
      .select("id")
      .eq("id", validCalibrationId);
    check(
      "cross-user calibration SELECT returns no rows",
      !otherCalibrationReadError && otherCalibrationRead?.length === 0,
      otherCalibrationReadError?.code,
    );
    const { data: otherProvenanceRead, error: otherProvenanceReadError } = await otherClient
      .from("vpd_measurement_provenance")
      .select("id")
      .eq("id", validProvenanceId);
    check(
      "cross-user provenance SELECT returns no rows",
      !otherProvenanceReadError && otherProvenanceRead?.length === 0,
      otherProvenanceReadError?.code,
    );

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

    for (const [label, readingOptions] of [
      ["null temperature device_id is denied", { airDeviceId: null }],
      ["blank humidity device_id is denied", { humidityDeviceId: "   " }],
      ["mismatched temperature device_id is denied", { airDeviceId: "other-probe" }],
      ["mismatched humidity device_id is denied", { humidityDeviceId: "other-probe" }],
      ["demo VPD source is denied", { vpdSource: "demo" }],
    ] as const) {
      const readings = await seedTrackedReadings({
        userId: owner.id,
        tentId: ownerTentId,
        label,
        minutesAgo: 7,
        ...readingOptions,
      });
      await expectInsertDenied({
        client: ownerClient,
        table: "vpd_measurement_provenance",
        row: leafProvenanceRow({
          userId: owner.id,
          tentId: ownerTentId,
          readings,
          calibrationId: validCalibrationId,
        }),
        label,
      });
    }

    const futureReadings = await seedTrackedReadings({
      userId: owner.id,
      tentId: ownerTentId,
      label: "future legacy ts",
      minutesAgo: -6,
      legacyTsOnly: true,
    });
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_measurement_provenance",
      row: leafProvenanceRow({
        userId: owner.id,
        tentId: ownerTentId,
        readings: futureReadings,
        calibrationId: validCalibrationId,
      }),
      label: "future legacy measurement timestamps are denied",
    });

    const futureLeafReadings = await seedTrackedReadings({
      userId: owner.id,
      tentId: ownerTentId,
      label: "future leaf",
      minutesAgo: 1,
    });
    await expectInsertDenied({
      client: ownerClient,
      table: "vpd_measurement_provenance",
      row: leafProvenanceRow({
        userId: owner.id,
        tentId: ownerTentId,
        readings: futureLeafReadings,
        calibrationId: validCalibrationId,
        leafMeasuredAt: new Date(Date.now() + 6 * 60_000).toISOString(),
      }),
      label: "future leaf measurement timestamp is denied",
    });

    for (const [label, recordedAt] of [
      ["backdated provenance recorded_at is denied", new Date(Date.now() - 6 * 60_000)],
      ["future provenance recorded_at is denied", new Date(Date.now() + 6 * 60_000)],
    ] as const) {
      const readings = await seedTrackedReadings({
        userId: owner.id,
        tentId: ownerTentId,
        label,
        minutesAgo: 2,
      });
      await expectInsertDenied({
        client: ownerClient,
        table: "vpd_measurement_provenance",
        row: leafProvenanceRow({
          userId: owner.id,
          tentId: ownerTentId,
          readings,
          calibrationId: validCalibrationId,
          recordedAt: recordedAt.toISOString(),
        }),
        label,
      });
    }

    const negativeLeafTemperature = 10;
    const negativeVpd = expectedLeafVpd({
      airTemperature: 25,
      humidity: 60,
      leafTemperature: negativeLeafTemperature,
      temperatureCorrection: 1,
      humidityCorrection: 2,
    });
    const negativeReadings = await seedTrackedReadings({
      userId: owner.id,
      tentId: ownerTentId,
      label: "negative leaf VPD",
      minutesAgo: 3,
      vpdValue: negativeVpd,
    });
    const { data: negativeProvenance, error: negativeProvenanceError } = await ownerClient
      .from("vpd_measurement_provenance")
      .insert(
        leafProvenanceRow({
          userId: owner.id,
          tentId: ownerTentId,
          readings: negativeReadings,
          calibrationId: validCalibrationId,
          leafTemperature: negativeLeafTemperature,
        }),
      )
      .select("id")
      .single();
    check(
      "formula-matched negative leaf VPD is preserved",
      negativeVpd < 0 && !negativeProvenanceError && !!negativeProvenance?.id,
      negativeProvenanceError?.code,
    );
    if (!negativeProvenance?.id) throw new Error("negative_leaf_vpd_provenance_missing");
    provenanceIds.push(negativeProvenance.id as string);

    for (const [label, temperature] of [
      ["minus 20 C measurement boundary is accepted", -20],
      ["60 C measurement boundary is accepted", 60],
    ] as const) {
      const { data: boundaryCalibration, error: boundaryCalibrationError } = await ownerClient
        .from("vpd_calibration_records")
        .insert(
          calibrationRow({
            userId: owner.id,
            tentId: ownerTentId,
            verifiedAt,
            temperatureReferenceValue: temperature,
            temperatureSensorValue: temperature,
          }),
        )
        .select("id")
        .single();
      if (boundaryCalibrationError || !boundaryCalibration?.id) {
        throw new Error(`measurement_boundary_calibration_${temperature}_missing`);
      }
      calibrationIds.push(boundaryCalibration.id as string);
      const boundaryVpd = expectedLeafVpd({
        airTemperature: temperature,
        humidity: 60,
        leafTemperature: temperature,
        humidityCorrection: 2,
      });
      const readings = await seedTrackedReadings({
        userId: owner.id,
        tentId: ownerTentId,
        label,
        minutesAgo: 2,
        airValue: temperature,
        vpdValue: boundaryVpd,
      });
      const { data, error } = await ownerClient
        .from("vpd_measurement_provenance")
        .insert(
          leafProvenanceRow({
            userId: owner.id,
            tentId: ownerTentId,
            readings,
            calibrationId: boundaryCalibration.id as string,
            leafTemperature: temperature,
          }),
        )
        .select("id")
        .single();
      check(label, !error && !!data?.id, error?.code);
      if (!data?.id) throw new Error(`measurement_boundary_${temperature}_missing`);
      provenanceIds.push(data.id as string);
    }

    for (const [label, temperature] of [
      ["leaf temperature below minus 20 C is denied", -20.01],
      ["leaf temperature above 60 C is denied", 60.01],
    ] as const) {
      const readings = await seedTrackedReadings({
        userId: owner.id,
        tentId: ownerTentId,
        label,
        minutesAgo: 2,
      });
      await expectInsertDenied({
        client: ownerClient,
        table: "vpd_measurement_provenance",
        row: leafProvenanceRow({
          userId: owner.id,
          tentId: ownerTentId,
          readings,
          calibrationId: validCalibrationId,
          leafTemperature: temperature,
        }),
        label,
      });
    }

    for (const [label, temperature] of [
      ["air temperature below minus 20 C is denied", -20.01],
      ["air temperature above 60 C is denied", 60.01],
    ] as const) {
      const readings = await seedTrackedReadings({
        userId: owner.id,
        tentId: ownerTentId,
        label,
        minutesAgo: 2,
        airValue: temperature,
      });
      await expectInsertDenied({
        client: ownerClient,
        table: "vpd_measurement_provenance",
        row: leafProvenanceRow({
          userId: owner.id,
          tentId: ownerTentId,
          readings,
          calibrationId: validCalibrationId,
        }),
        label,
      });
    }

    const { error: updateError } = await ownerClient
      .from("vpd_calibration_records")
      .update({ notes: "must remain immutable" })
      .eq("id", validCalibrationId);
    const { data: updateReadback, error: updateReadbackError } = await admin
      .from("vpd_calibration_records")
      .select("notes")
      .eq("id", validCalibrationId)
      .single();
    check(
      "calibration UPDATE is denied",
      !updateReadbackError && updateReadback?.notes !== "must remain immutable",
      updateError?.code ?? updateReadbackError?.code,
    );

    const { error: deleteError } = await ownerClient
      .from("vpd_calibration_records")
      .delete()
      .eq("id", validCalibrationId);
    const { count: afterDeleteCount, error: deleteReadbackError } = await admin
      .from("vpd_calibration_records")
      .select("id", { count: "exact", head: true })
      .eq("id", validCalibrationId);
    check(
      "calibration DELETE is denied",
      !deleteReadbackError && afterDeleteCount === 1,
      deleteError?.code ?? deleteReadbackError?.code,
    );

    const { error: provenanceUpdateError } = await ownerClient
      .from("vpd_measurement_provenance")
      .update({ algorithm_version: "must_remain_immutable" })
      .eq("id", validProvenanceId);
    const { data: provenanceUpdateReadback, error: provenanceUpdateReadbackError } = await admin
      .from("vpd_measurement_provenance")
      .select("algorithm_version")
      .eq("id", validProvenanceId)
      .single();
    check(
      "provenance UPDATE is denied",
      !provenanceUpdateReadbackError &&
        provenanceUpdateReadback?.algorithm_version === "tetens_leaf_air_v1",
      provenanceUpdateError?.code ?? provenanceUpdateReadbackError?.code,
    );

    const { error: provenanceDeleteError } = await ownerClient
      .from("vpd_measurement_provenance")
      .delete()
      .eq("id", validProvenanceId);
    const { count: provenanceAfterDeleteCount, error: provenanceDeleteReadbackError } = await admin
      .from("vpd_measurement_provenance")
      .select("id", { count: "exact", head: true })
      .eq("id", validProvenanceId);
    check(
      "provenance DELETE is denied",
      !provenanceDeleteReadbackError && provenanceAfterDeleteCount === 1,
      provenanceDeleteError?.code ?? provenanceDeleteReadbackError?.code,
    );

    const cascadeTentId = await seedTent(owner.id, "tent delete cascade");
    tentIds.push(cascadeTentId);
    const { data: cascadeTentCalibration, error: cascadeTentCalibrationError } = await ownerClient
      .from("vpd_calibration_records")
      .insert(calibrationRow({ userId: owner.id, tentId: cascadeTentId, verifiedAt }))
      .select("id")
      .single();
    if (cascadeTentCalibrationError || !cascadeTentCalibration?.id) {
      throw new Error(`tent_cascade_calibration_${cascadeTentCalibrationError?.code ?? "failed"}`);
    }
    calibrationIds.push(cascadeTentCalibration.id as string);
    const cascadeTentReadings = await seedTrackedReadings({
      userId: owner.id,
      tentId: cascadeTentId,
      label: "tent delete cascade",
      minutesAgo: 2,
    });
    const { data: cascadeTentProvenance, error: cascadeTentProvenanceError } = await ownerClient
      .from("vpd_measurement_provenance")
      .insert(
        leafProvenanceRow({
          userId: owner.id,
          tentId: cascadeTentId,
          readings: cascadeTentReadings,
          calibrationId: cascadeTentCalibration.id as string,
        }),
      )
      .select("id")
      .single();
    if (cascadeTentProvenanceError || !cascadeTentProvenance?.id) {
      throw new Error(`tent_cascade_provenance_${cascadeTentProvenanceError?.code ?? "failed"}`);
    }
    provenanceIds.push(cascadeTentProvenance.id as string);
    const { error: cascadeTentDeleteError } = await ownerClient
      .from("tents")
      .delete()
      .eq("id", cascadeTentId);
    const [tentCalibrationReadback, tentProvenanceReadback, tentReadback] = await Promise.all([
      admin
        .from("vpd_calibration_records")
        .select("id", { count: "exact", head: true })
        .eq("id", cascadeTentCalibration.id as string),
      admin
        .from("vpd_measurement_provenance")
        .select("id", { count: "exact", head: true })
        .eq("id", cascadeTentProvenance.id as string),
      admin.from("tents").select("id", { count: "exact", head: true }).eq("id", cascadeTentId),
    ]);
    check(
      "tent deletion cascades calibration and provenance safely",
      !cascadeTentDeleteError &&
        !tentCalibrationReadback.error &&
        !tentProvenanceReadback.error &&
        !tentReadback.error &&
        tentCalibrationReadback.count === 0 &&
        tentProvenanceReadback.count === 0 &&
        tentReadback.count === 0,
      cascadeTentDeleteError?.code ??
        tentCalibrationReadback.error?.code ??
        tentProvenanceReadback.error?.code ??
        tentReadback.error?.code,
    );

    cascadeUser = await createUser("auth-delete-cascade");
    const cascadeUserClient = await signIn(cascadeUser.email, cascadeUser.password);
    const cascadeUserTentId = await seedTent(cascadeUser.id, "auth user delete cascade");
    tentIds.push(cascadeUserTentId);
    const { data: cascadeUserCalibration, error: cascadeUserCalibrationError } =
      await cascadeUserClient
        .from("vpd_calibration_records")
        .insert(calibrationRow({ userId: cascadeUser.id, tentId: cascadeUserTentId, verifiedAt }))
        .select("id")
        .single();
    if (cascadeUserCalibrationError || !cascadeUserCalibration?.id) {
      throw new Error(`user_cascade_calibration_${cascadeUserCalibrationError?.code ?? "failed"}`);
    }
    calibrationIds.push(cascadeUserCalibration.id as string);
    const cascadeUserReadings = await seedTrackedReadings({
      userId: cascadeUser.id,
      tentId: cascadeUserTentId,
      label: "auth user delete cascade",
      minutesAgo: 2,
    });
    const { data: cascadeUserProvenance, error: cascadeUserProvenanceError } =
      await cascadeUserClient
        .from("vpd_measurement_provenance")
        .insert(
          leafProvenanceRow({
            userId: cascadeUser.id,
            tentId: cascadeUserTentId,
            readings: cascadeUserReadings,
            calibrationId: cascadeUserCalibration.id as string,
          }),
        )
        .select("id")
        .single();
    if (cascadeUserProvenanceError || !cascadeUserProvenance?.id) {
      throw new Error(`user_cascade_provenance_${cascadeUserProvenanceError?.code ?? "failed"}`);
    }
    provenanceIds.push(cascadeUserProvenance.id as string);
    const { error: cascadeUserDeleteError } = await admin.auth.admin.deleteUser(cascadeUser.id);
    const [userCalibrationReadback, userProvenanceReadback] = await Promise.all([
      admin
        .from("vpd_calibration_records")
        .select("id", { count: "exact", head: true })
        .eq("id", cascadeUserCalibration.id as string),
      admin
        .from("vpd_measurement_provenance")
        .select("id", { count: "exact", head: true })
        .eq("id", cascadeUserProvenance.id as string),
    ]);
    check(
      "auth user deletion cascades calibration and provenance safely",
      !cascadeUserDeleteError &&
        !userCalibrationReadback.error &&
        !userProvenanceReadback.error &&
        userCalibrationReadback.count === 0 &&
        userProvenanceReadback.count === 0,
      cascadeUserDeleteError?.code ??
        userCalibrationReadback.error?.code ??
        userProvenanceReadback.error?.code,
    );
    if (!cascadeUserDeleteError) cascadeUser = null;

    await expectInsertDenied({
      client: anonymous,
      table: "vpd_calibration_records",
      row: calibrationRow({ userId: owner.id, tentId: ownerTentId, verifiedAt }),
      label: "anonymous INSERT is denied",
    });
  } finally {
    if (provenanceIds.length > 0) {
      const { error } = await admin
        .from("vpd_measurement_provenance")
        .delete()
        .in("id", provenanceIds);
      check("fixture cleanup removes provenance rows", !error, error?.code);
    }
    if (readingIds.length > 0) {
      const { error } = await admin.from("sensor_readings").delete().in("id", readingIds);
      check("fixture cleanup removes sensor rows", !error, error?.code);
    }
    if (calibrationIds.length > 0) {
      const { error } = await admin
        .from("vpd_calibration_records")
        .delete()
        .in("id", calibrationIds);
      check("fixture cleanup removes calibration rows", !error, error?.code);
    }
    if (tentIds.length > 0) {
      const { error } = await admin.from("tents").delete().in("id", tentIds);
      check("fixture cleanup removes tents", !error, error?.code);
    }
    for (const [label, user] of [
      ["owner", owner],
      ["other", other],
      ["cascade", cascadeUser],
    ] as const) {
      if (!user) continue;
      const { error } = await admin.auth.admin.deleteUser(user.id);
      check(`fixture cleanup removes ${label} auth user`, !error, error?.code);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

await main();
