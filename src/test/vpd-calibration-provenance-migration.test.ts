import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260719075033_vpd_calibration_provenance.sql",
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

function policyBlock(name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sql.match(new RegExp(`CREATE\\s+POLICY\\s+"${escapedName}"[\\s\\S]*?;`, "i"))?.[0] ?? "";
}

describe("VPD calibration provenance migration", () => {
  it("creates append-only calibration and measurement provenance tables with RLS", () => {
    expect(sql).toMatch(/CREATE TABLE public\.vpd_calibration_records/i);
    expect(sql).toMatch(/CREATE TABLE public\.vpd_measurement_provenance/i);
    expect(sql).toMatch(/ALTER TABLE public\.vpd_calibration_records ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(
      /ALTER TABLE public\.vpd_measurement_provenance ENABLE ROW LEVEL SECURITY/i,
    );

    expect(sql).toMatch(
      /GRANT SELECT, INSERT ON public\.vpd_calibration_records TO authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT SELECT, INSERT ON public\.vpd_measurement_provenance TO authenticated/i,
    );
    expect(sql).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*authenticated/i);
    expect(sql).not.toMatch(/\bTO anon\b/i);
    expect(sql).not.toMatch(/FOR\s+(UPDATE|DELETE)/i);
  });

  it("persists the complete minimum calibration evidence without trusting a status flag", () => {
    for (const column of [
      "device_id",
      "sensor_commissioned_at",
      "placement",
      "temperature_verified_at",
      "temperature_reference",
      "temperature_verified_at_operating_conditions",
      "humidity_verified_at",
      "humidity_reference_rh_pct",
      "recorded_at",
    ]) {
      expect(sql).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }

    expect(sql).toMatch(/humidity_reference_rh_pct\s*>=\s*75/i);
    expect(sql).toMatch(/humidity_reference_rh_pct\s*<=\s*100/i);
    expect(sql).toMatch(/placement\s+IN\s*\([^)]*'canopy'[^)]*'unknown'/i);
    expect(sql).not.toMatch(/\b(is_verified|can_compare_to_stage_target)\b/i);
  });

  it("pins canonical temperature evidence to minus 20 through 60 C", () => {
    expect(sql).toMatch(/temperature_reference_value_c\s*>=\s*-20/i);
    expect(sql).toMatch(/temperature_reference_value_c\s*<=\s*60/i);
    expect(sql).toMatch(/temperature_sensor_value_c\s*>=\s*-20/i);
    expect(sql).toMatch(/temperature_sensor_value_c\s*<=\s*60/i);
    expect(sql).toMatch(
      /leaf_temperature_c\s+IS NULL\s+OR\s*\(leaf_temperature_c\s*>=\s*-20\s+AND\s+leaf_temperature_c\s*<=\s*60\)/i,
    );
    expect(sql).toMatch(/v_air\.value\s*<\s*-20\s+OR\s+v_air\.value\s*>\s*60/i);
    expect(sql).toMatch(/v_corrected_air_temp_c\s*<\s*-20\s+OR\s+v_corrected_air_temp_c\s*>\s*60/i);
    expect(sql).not.toMatch(/temperature_(?:reference_value|sensor_value)_c\s*(?:>=|<)\s*-50/i);
  });

  it("derives and applies measured temperature and RH corrections", () => {
    expect(sql).toMatch(/temperature_reference_value_c\s+numeric/i);
    expect(sql).toMatch(/temperature_sensor_value_c\s+numeric/i);
    expect(sql).toMatch(/humidity_sensor_rh_pct\s+numeric/i);
    expect(sql).toMatch(
      /temperature_correction_offset_c\s+numeric\([^)]*\)\s+GENERATED ALWAYS AS\s*\(\s*temperature_reference_value_c\s*-\s*temperature_sensor_value_c\s*\)\s*STORED/i,
    );
    expect(sql).toMatch(
      /humidity_correction_offset_pct\s+numeric\([^)]*\)\s+GENERATED ALWAYS AS\s*\(\s*humidity_reference_rh_pct\s*-\s*humidity_sensor_rh_pct\s*\)\s*STORED/i,
    );
    expect(sql).toMatch(
      /v_corrected_air_temp_c\s*:=\s*v_air\.value\s*\+\s*v_calibration\.temperature_correction_offset_c/i,
    );
    expect(sql).toMatch(
      /v_corrected_humidity_pct\s*:=\s*v_humidity\.value\s*\+\s*v_calibration\.humidity_correction_offset_pct/i,
    );
    expect(sql).toMatch(
      /v_expected_vpd\s*:=\s*v_leaf_saturation_kpa\s*-\s*\(v_air_saturation_kpa\s*\*\s*v_corrected_humidity_pct\s*\/\s*100\)/i,
    );
  });

  it("links one provenance row to exact VPD, temperature, humidity, and calibration records", () => {
    expect(sql).toMatch(/vpd_reading_id\s+uuid\s+NOT NULL\s+UNIQUE/i);
    expect(sql).toMatch(/air_temperature_reading_id\s+uuid\s+NOT NULL/i);
    expect(sql).toMatch(/humidity_reading_id\s+uuid\s+NOT NULL/i);
    expect(sql).toMatch(/calibration_record_id\s+uuid/i);
    expect(sql).toMatch(/leaf_temperature_c\s+numeric/i);
    expect(sql).toMatch(/leaf_temperature_measured_at\s+timestamptz/i);
    expect(sql).toMatch(/measurement_basis[^;]*'leaf'[^;]*'air_estimate'[^;]*'grower_entered'/i);
    expect(sql).toMatch(/algorithm_version\s+text/i);
  });

  it("validates exact row lineage, freshness, coherence, and the leaf-to-air formula", () => {
    expect(sql).toMatch(
      /CREATE(?: OR REPLACE)? FUNCTION public\.validate_vpd_measurement_provenance\(\)/i,
    );
    expect(sql).toMatch(/SECURITY INVOKER/i);
    expect(sql).toMatch(/SET search_path\s*=\s*public,\s*pg_temp/i);

    for (const metric of ["temperature_c", "humidity_pct", "vpd_kpa"]) {
      expect(sql).toMatch(new RegExp(`metric\\s*=\\s*'${metric}'`, "i"));
    }
    expect(sql).toMatch(/user_id\s*=\s*NEW\.user_id/i);
    expect(sql).toMatch(/tent_id\s*=\s*NEW\.tent_id/i);
    expect(sql).toMatch(/interval\s+'365 days'/i);
    expect(sql).toMatch(/interval\s+'15 minutes'/i);
    expect(sql).toMatch(/0\.6108\s*\*\s*exp/i);
    expect(sql).toMatch(/abs\s*\([^)]*vpd[^)]*-\s*v_expected_vpd/i);
    expect(sql).not.toMatch(/GREATEST\s*\(\s*0\s*,/i);
  });

  it("uses one evaluation clock and rejects future or forged insertion timestamps", () => {
    expect(sql.match(/v_evaluated_at\s+timestamptz\s*:=\s*clock_timestamp\(\)/gi)).toHaveLength(2);
    expect(sql).toMatch(/v_vpd_observed_at\s*>\s*v_evaluated_at\s*\+\s*interval\s+'5 minutes'/i);
    expect(sql).toMatch(
      /NEW\.leaf_temperature_measured_at\s*>\s*v_evaluated_at\s*\+\s*interval\s+'5 minutes'/i,
    );
    expect(sql).toMatch(
      /v_calibration\.temperature_verified_at\s*>\s*v_evaluated_at[\s\S]*?v_calibration\.humidity_verified_at\s*>\s*v_evaluated_at/i,
    );
    expect(
      sql.match(/NEW\.recorded_at\s*<\s*v_evaluated_at\s*-\s*interval\s+'5 minutes'/gi),
    ).toHaveLength(2);
    expect(
      sql.match(/NEW\.recorded_at\s*>\s*v_evaluated_at\s*\+\s*interval\s+'5 minutes'/gi),
    ).toHaveLength(2);
  });

  it("requires exact nonblank device lineage and trusted VPD source evidence", () => {
    expect(sql).toMatch(/NULLIF\s*\(\s*btrim\(v_air\.device_id\)\s*,\s*''\s*\)\s+IS NULL/i);
    expect(sql).toMatch(/v_air\.device_id\s*<>\s*v_calibration\.device_id/i);
    expect(sql).toMatch(/NULLIF\s*\(\s*btrim\(v_humidity\.device_id\)\s*,\s*''\s*\)\s+IS NULL/i);
    expect(sql).toMatch(/v_humidity\.device_id\s*<>\s*v_calibration\.device_id/i);
    expect(sql.match(/v_vpd\.source\s+NOT IN\s*\(/gi)).toHaveLength(2);
    expect(sql.match(/v_air\.source\s+NOT IN\s*\(/gi)).toHaveLength(1);
    expect(sql.match(/v_humidity\.source\s+NOT IN\s*\(/gi)).toHaveLength(1);
    for (const trustedSource of ["live", "manual", "csv", "ecowitt", "mqtt", "webhook"]) {
      expect(sql).toContain(`'${trustedSource}'`);
    }
    expect(sql).not.toMatch(/v_vpd\.source\s+IN\s*\(\s*'demo'/i);
  });

  it("owns rows through auth users and keeps tent deletion cascade-safe", () => {
    expect(
      sql.match(
        /user_id\s+uuid\s+NOT NULL\s+DEFAULT auth\.uid\(\)\s+REFERENCES auth\.users\(id\)\s+ON DELETE CASCADE/gi,
      ),
    ).toHaveLength(2);
    expect(
      sql.match(/tent_id\s+uuid\s+NOT NULL\s+REFERENCES public\.tents\(id\)\s+ON DELETE CASCADE/gi),
    ).toHaveLength(2);
    expect(sql).toMatch(
      /calibration_record_id\s+uuid\s+REFERENCES public\.vpd_calibration_records\(id\)\s+ON DELETE CASCADE/i,
    );
  });

  it("enforces grower and tent ownership for both inserts", () => {
    const calibrationInsert = policyBlock("Users insert own VPD calibration records");
    const provenanceInsert = policyBlock("Users insert own VPD measurement provenance");

    for (const policy of [calibrationInsert, provenanceInsert]) {
      expect(policy).toMatch(/FOR INSERT/i);
      expect(policy).toMatch(/TO authenticated/i);
      expect(policy).toMatch(/auth\.uid\(\)\s*=\s*user_id/i);
      expect(policy).toMatch(/recorded_at\s*>=\s*now\(\)\s*-\s*interval\s+'5 minutes'/i);
      expect(policy).toMatch(/recorded_at\s*<=\s*now\(\)\s*\+\s*interval\s+'5 minutes'/i);
      expect(policy).toMatch(
        /EXISTS\s*\([\s\S]*?FROM\s+public\.tents[\s\S]*?user_id\s*=\s*auth\.uid\(\)/i,
      );
    }
  });

  it("cannot mutate existing telemetry or create automation side effects", () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.sensor_readings/i);
    expect(sql).not.toMatch(
      /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(sensor_readings|alerts|action_queue)\b/i,
    );
    expect(sql).not.toMatch(
      /execute_device|setpoint_write|irrigation_control|light_control|fan_control|\bcron\b/i,
    );
  });
});
