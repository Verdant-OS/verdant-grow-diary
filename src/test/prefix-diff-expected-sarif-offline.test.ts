/**
 * Mirrors the prefix-diff-sarif workflow's offline job:
 *   node scripts/diff-money-migration-prefixes.mjs --expected --sarif --sarif-out=…
 * Must succeed without psql or any database URL.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "..", "..", "scripts", "diff-money-migration-prefixes.mjs");
const SARIF_SCHEMA =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/Schemata/sarif-schema-2.1.0.json";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "prefix-diff-offline-sarif-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("prefix-diff offline manifest SARIF (CI prefix-diff-offline job)", () => {
  it("writes empty-results SARIF to --sarif-out and exits 0 without psql", () => {
    const outFile = join(workDir, "prefix-diff-expected.sarif");
    const r = spawnSync(
      process.execPath,
      [SCRIPT, "--expected", "--sarif", `--sarif-out=${outFile}`],
      {
        encoding: "utf8",
        env: { PATH: "", HOME: process.env.HOME ?? "/root" },
      },
    );
    expect(r.status).toBe(0);
    expect(existsSync(outFile)).toBe(true);
    expect(r.stdout).toBe("");
    const sarif = JSON.parse(readFileSync(outFile, "utf8"));
    expect(sarif.$schema).toBe(SARIF_SCHEMA);
    expect(sarif.runs[0].results).toEqual([]);
    expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(true);
  });
});
