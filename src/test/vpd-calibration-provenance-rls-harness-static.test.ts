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
const seedReadingSet = harness.slice(
  harness.indexOf("async function seedReadingSet"),
  harness.indexOf("\nfunction calibrationRow"),
);
const withTransportRetry = harness.slice(
  harness.indexOf("async function withTransportRetry"),
  harness.indexOf("\nasync function createUser"),
);

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

  it("retries only code-less transport failures, loudly and bounded", () => {
    // A retry may never re-litigate a database verdict: PostgREST and
    // SQLSTATE rejections always carry an error code and must not retry.
    expect(harness).toMatch(/return !!error && !error\.code;/);
    expect(harness).toMatch(/const FIXTURE_TRANSPORT_ATTEMPTS = 3;/);
    // Pins are scoped to the function body (same technique as the
    // seedReadingSet slice) so a purely additive edit elsewhere in the
    // function cannot smuggle in an extra retry of coded errors: the body
    // must contain exactly the initial attempt plus the guarded loop retry.
    expect(withTransportRetry).toMatch(
      /attempt <= FIXTURE_TRANSPORT_ATTEMPTS && isTransportError\(result\.error\)/,
    );
    expect(withTransportRetry).toMatch(
      /console\.error\(\s*` {2}! transport error on "\$\{label\}"/,
    );
    expect(withTransportRetry.split("await run()").length - 1).toBe(2);
    expect(withTransportRetry.split("isTransportError").length - 1).toBe(1);
    // Deny assertions stay wrapped so a transport hiccup cannot fail them
    // spuriously, while the readback still decides the verdict.
    expect(harness).toMatch(/await withTransportRetry\(args\.label, \(\) =>/);
    expect(harness).toMatch(/await withTransportRetry\(`\$\{args\.label\} readback`, \(\) =>/);
    // The UPDATE/DELETE immutability checks may not report "denied" when the
    // client attempt itself died at the transport layer: the attempt error
    // must be part of each ok-condition, not only the detail string.
    for (const attemptGuard of [
      "!isTransportError(updateError) &&",
      "!isTransportError(deleteError) &&",
      "!isTransportError(provenanceUpdateError) &&",
      "!isTransportError(provenanceDeleteError) &&",
    ]) {
      expect(harness).toContain(attemptGuard);
    }
  });

  it("preserves full error evidence in fixture failures", () => {
    expect(harness).toMatch(/function errorDetail\(/);
    expect(harness).toMatch(/`code=\$\{error\.code \?\? "none"\}`/);
    expect(harness).toContain("no_error_no_row");
    expect(harness).toContain("stale_calibration_fixture_${errorDetail(staleCalibrationError)}");
    // The old pattern discarded message/details/hint and made transport
    // failures indistinguishable from database rejections.
    expect(harness).not.toContain('?.code ?? "failed"');
  });

  it("uses the service role only for fixtures, authoritative readback, and cleanup", () => {
    expect(harness).toMatch(/service role is used only for fixture setup, readback, and teardown/i);
    expect(harness).not.toMatch(/serviceRole[^\n]*expectInsertAllowed/i);
  });

  it("requires an explicit client for every tent fixture", () => {
    expect(harness).toMatch(
      /async function seedTent\(\s*client:\s*SupabaseClient,\s*userId:\s*string,\s*label:\s*string/,
    );
    expect(harness).toMatch(/const \{ data, error \} = await client\s*[\r\n]+\s*\.from\("tents"\)/);
    expect(harness).not.toMatch(
      /const \{ data, error \} = await admin\s*[\r\n]+\s*\.from\("tents"\)\s*[\r\n]+\s*\.insert/,
    );
  });

  it("seeds owner, cross-user, and cascade tents through their signed-in owners", () => {
    expect(harness).toContain('await seedTent(ownerClient, owner.id, "owner tent")');
    expect(harness).toContain('await seedTent(otherClient, other.id, "other tent")');
    expect(harness).toContain('await seedTent(ownerClient, owner.id, "tent delete cascade")');
    expect(harness).toMatch(
      /seedTent\(\s*cascadeUserClient,\s*cascadeUser\.id,\s*"auth user delete cascade"/,
    );
  });

  it("releases the Free active-tent slot before creating the owner cascade fixture", () => {
    const releaseIndex = harness.indexOf("free_tent_slot_release_");
    const cascadeIndex = harness.indexOf(
      'await seedTent(ownerClient, owner.id, "tent delete cascade")',
    );

    expect(releaseIndex).toBeGreaterThan(harness.indexOf("const ownerTentId"));
    expect(cascadeIndex).toBeGreaterThan(releaseIndex);
    expect(harness.slice(releaseIndex - 500, cascadeIndex)).toMatch(
      /\.from\("tents"\)[\s\S]*\.update\(\{ is_archived: true \}\)[\s\S]*\.eq\("id", ownerTentId\)/,
    );
  });

  it("uses caller-known UUIDs instead of relying on an insert representation", () => {
    expect(seedReadingSet).toMatch(/const airId = crypto\.randomUUID\(\)/);
    expect(seedReadingSet).toMatch(/const humidityId = crypto\.randomUUID\(\)/);
    expect(seedReadingSet).toMatch(/const vpdId = crypto\.randomUUID\(\)/);
    expect(seedReadingSet).toContain("id: airId");
    expect(seedReadingSet).toContain("id: humidityId");
    expect(seedReadingSet).toContain("id: vpdId");
    expect(seedReadingSet).not.toContain('.select("id,metric")');
    expect(seedReadingSet).toContain("return { airId, humidityId, vpdId, observedAt }");
  });
});
