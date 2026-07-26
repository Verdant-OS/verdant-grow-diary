// Test that the verifier's JSON report includes missingByEnv grouping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runVerifier(env, extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), "paddle-craft-report-"));
  const jsonPath = join(dir, "report.json");
  const res = spawnSync(
    "bun",
    ["run", "scripts/verify-paddle-craft-catalog.ts", "--env", env, "--json-out", jsonPath],
    {
      encoding: "utf8",
      env: { ...process.env, PADDLE_SANDBOX_API_KEY: "", PADDLE_LIVE_API_KEY: "", ...extraEnv },
    },
  );
  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  rmSync(dir, { recursive: true, force: true });
  return { res, report };
}

test("report.missingByEnv groups non-pass rows by env (key unset → skip)", () => {
  const { res, report } = runVerifier("sandbox");
  assert.equal(res.status, 2, "missing key → exit 2");
  assert.ok(report.missingByEnv, "missingByEnv is present");
  assert.ok(Array.isArray(report.missingByEnv.sandbox), "sandbox array present");
  // Derived, not hardcoded: the preflight guards every PAID_PLAN_ID matching a
  // guarded prefix, so widening GUARDED_EXTERNAL_ID_PREFIXES (Craft + credit
  // packs today) must not require editing this contract test. Pinning "2" and
  // "craft_" made this fail with 4 !== 2 the moment packs were guarded.
  assert.ok(
    report.missingByEnv.sandbox.length >= 2,
    "expected at least the two Craft plans to be reported",
  );
  assert.equal(report.missingByEnv.sandbox.length, report.requiredIds.length);
  for (const row of report.missingByEnv.sandbox) {
    assert.equal(row.env, "sandbox");
    assert.equal(row.status, "skip");
    assert.ok(
      report.requiredIds.includes(row.externalId),
      `${row.externalId} reported but not in requiredIds`,
    );
  }
  // Sorted by externalId ascending — deterministic for downstream tooling.
  const ids = report.missingByEnv.sandbox.map((r) => r.externalId);
  assert.deepEqual(ids, [...ids].sort());
  // No live entry when live wasn't requested.
  assert.equal(report.missingByEnv.live, undefined);
});
