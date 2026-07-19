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
  });

  it("uses authenticated clients for allow and deny proofs", () => {
    expect(harness).toContain("signInWithPassword");
    expect(harness).toContain('from("vpd_calibration_records")');
    expect(harness).toContain('from("vpd_measurement_provenance")');
    expect(harness).toMatch(/authenticated owner can insert current canopy calibration/i);
    expect(harness).toMatch(/authenticated owner can insert formula-matched leaf provenance/i);
  });

  it("proves formula parity with non-zero measured corrections", () => {
    expect(harness).toMatch(/temperature_reference_value_c:\s*26/);
    expect(harness).toMatch(/temperature_sensor_value_c:\s*25/);
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
      "UPDATE is denied",
      "DELETE is denied",
      "anonymous INSERT is denied",
    ]) {
      expect(harness).toContain(proof);
    }
  });

  it("uses the service role only for fixtures, authoritative readback, and cleanup", () => {
    expect(harness).toMatch(/service role is used only for fixture setup, readback, and teardown/i);
    expect(harness).not.toMatch(/serviceRole[^\n]*expectInsertAllowed/i);
  });
});
