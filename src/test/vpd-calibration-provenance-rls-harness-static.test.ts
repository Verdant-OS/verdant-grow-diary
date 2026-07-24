import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HARNESS_PATH = resolve(
  __dirname,
  "../../scripts/run-vpd-calibration-provenance-rls-harness.ts",
);
const PACKAGE_PATH = resolve(__dirname, "../../package.json");

const harness = readFileSync(HARNESS_PATH, "utf8");
const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8")) as {
  scripts?: Record<string, string>;
};

describe("VPD calibration provenance runtime RLS harness contract", () => {
  it("is exposed as an explicit local security lane", () => {
    expect(packageJson.scripts?.["test:vpd-calibration-provenance-rls"]).toBe(
      "bun run scripts/run-vpd-calibration-provenance-rls-harness.ts",
    );
    expect(harness).toContain("VPD_CALIBRATION_PROVENANCE_RLS_HARNESS_ALLOW_REMOTE");
    expect(harness).toMatch(/refusing remote database/i);
    expect(packageJson.scripts?.["test:security-db-local"]).toContain(
      "bun run test:vpd-calibration-provenance-rls",
    );
  });

  it("uses authenticated clients for allow and deny proofs", () => {
    expect(harness).toContain("signInWithPassword");
    expect(harness).toContain('from("vpd_calibration_records")');
    expect(harness).toContain('from("vpd_measurement_provenance")');
    expect(harness).toMatch(/authenticated owner can insert current canopy calibration/i);
    expect(harness).toMatch(/authenticated owner can insert formula-matched leaf provenance/i);
  });

  it("proves formula parity with non-zero measured corrections", () => {
    expect(harness).toMatch(
      /temperature_reference_value_c:\s*args\.temperatureReferenceValue \?\? 26/,
    );
    expect(harness).toMatch(/temperature_sensor_value_c:\s*args\.temperatureSensorValue \?\? 25/);
    expect(harness).toMatch(/humidity_sensor_rh_pct:\s*\(args\.humidityReference \?\? 75\) - 2/);
    expect(harness).toMatch(/vpdValue \?\? 0\.73/);
  });

  it("proves the critical fail-closed boundaries", () => {
    for (const proof of [
      "RH reference below 75 is denied",
      "another user's tent is denied",
      "forged user_id is denied",
      "non-canopy placement is denied",
      "stale calibration is denied",
      "leaf reading outside 15 minutes is denied",
      "formula mismatch is denied",
      "null temperature device_id is denied",
      "blank humidity device_id is denied",
      "mismatched temperature device_id is denied",
      "mismatched humidity device_id is denied",
      "demo VPD source is denied",
      "future legacy measurement timestamps are denied",
      "future leaf measurement timestamp is denied",
      "future calibration verification is denied",
      "backdated calibration recorded_at is denied",
      "future calibration recorded_at is denied",
      "backdated provenance recorded_at is denied",
      "future provenance recorded_at is denied",
      "calibration below minus 20 C is denied",
      "calibration above 60 C is denied",
      "leaf temperature below minus 20 C is denied",
      "leaf temperature above 60 C is denied",
      "air temperature below minus 20 C is denied",
      "air temperature above 60 C is denied",
      "calibration UPDATE is denied",
      "calibration DELETE is denied",
      "provenance UPDATE is denied",
      "provenance DELETE is denied",
      "anonymous INSERT is denied",
    ]) {
      expect(harness).toContain(proof);
    }
  });

  it("proves visibility, canonical boundaries, negative VPD, and deletion cascades", () => {
    for (const proof of [
      "cross-user calibration SELECT returns no rows",
      "cross-user provenance SELECT returns no rows",
      "minus 20 C calibration boundary is accepted",
      "60 C calibration boundary is accepted",
      "100 percent RH reference boundary is accepted",
      "minus 20 C measurement boundary is accepted",
      "60 C measurement boundary is accepted",
      "formula-matched negative leaf VPD is preserved",
      "tent deletion cascades calibration and provenance safely",
      "auth user deletion cascades calibration and provenance safely",
    ]) {
      expect(harness).toContain(proof);
    }
  });

  it("backs deny assertions with authoritative service-role readback", () => {
    expect(harness).toMatch(/const id = crypto\.randomUUID\(\)/);
    expect(harness).toMatch(/expectedDatabaseErrorCodes\.has\(error\.code\)/);
    expect(harness).toMatch(/\.select\("id", \{ count: "exact", head: true \}\)/);
    expect(harness).toMatch(/!readbackError && count === 0/);
    expect(harness).toContain("unauthorized-row cleanup");
    expect(harness).not.toMatch(/!!error \|\| \(data \?\? \[\]\)\.length === 0/);
  });

  it("uses the service role only for fixtures, authoritative readback, and cleanup", () => {
    expect(harness).toMatch(/service role is used only for fixture setup, readback, and teardown/i);
    expect(harness).not.toMatch(/serviceRole[^\n]*expectInsertAllowed/i);
  });
});
