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

test("report.missingByEnv groups guarded Craft and credit-pack rows by env", () => {
  const { res, report } = runVerifier("sandbox");
  assert.equal(res.status, 2, "missing key → exit 2");
  assert.ok(report.missingByEnv, "missingByEnv is present");
  assert.ok(Array.isArray(report.missingByEnv.sandbox), "sandbox array present");
  assert.equal(report.missingByEnv.sandbox.length, 4);
  for (const row of report.missingByEnv.sandbox) {
    assert.equal(row.env, "sandbox");
    assert.equal(row.status, "skip");
    assert.match(row.externalId, /^(?:craft_|credit_pack_)/);
  }
  // Exact guarded catalog, sorted by externalId for deterministic downstream tooling.
  const ids = report.missingByEnv.sandbox.map((r) => r.externalId);
  assert.deepEqual(ids, ["craft_annual", "craft_monthly", "credit_pack_150", "credit_pack_50"]);
  // No live entry when live wasn't requested.
  assert.equal(report.missingByEnv.live, undefined);
});
