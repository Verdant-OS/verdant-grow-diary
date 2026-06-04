/**
 * Tests the VPD stage mapping ownership scanner:
 *   scripts/assert-vpd-stage-normalization-ownership.mjs
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = "scripts/assert-vpd-stage-normalization-ownership.mjs";

function runScannerIn(cwd: string) {
  return spawnSync("node", [resolve(ROOT, SCRIPT)], {
    cwd,
    encoding: "utf8",
  });
}

describe("scripts/assert-vpd-stage-normalization-ownership.mjs", () => {
  it("the scanner file and package script exist", () => {
    expect(() => require("node:fs").readFileSync(resolve(ROOT, SCRIPT), "utf8"))
      .not.toThrow();
    const pkg = JSON.parse(
      require("node:fs").readFileSync(resolve(ROOT, "package.json"), "utf8"),
    );
    expect(pkg.scripts["test:vpd-stage-normalization-ownership"]).toMatch(
      /assert-vpd-stage-normalization-ownership\.mjs/,
    );
  });

  it("passes against the real repo", () => {
    const res = spawnSync("node", [resolve(ROOT, SCRIPT)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (res.status !== 0) {
      // Make failures self-describing.
      throw new Error(
        "Scanner unexpectedly failed:\n" + res.stdout + "\n" + res.stderr,
      );
    }
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/VPD stage mapping ownership OK/);
  });

  it("fails when a synthetic duplicate mapping appears outside the allow-list", () => {
    const tmp = mkdtempSync(join(tmpdir(), "vpd-mapping-guard-"));
    try {
      // Stage a minimal repo layout the scanner expects.
      mkdirSync(join(tmp, "src/components"), { recursive: true });
      mkdirSync(join(tmp, "src/lib"), { recursive: true });
      mkdirSync(join(tmp, "src/test"), { recursive: true });
      mkdirSync(join(tmp, "docs"), { recursive: true });
      mkdirSync(join(tmp, "scripts"), { recursive: true });

      // Copy the real scanner so it runs against the tmp repo.
      cpSync(
        resolve(ROOT, SCRIPT),
        join(tmp, SCRIPT),
      );

      // Synthetic violation: a UI file duplicates the mapping pair.
      writeFileSync(
        join(tmp, "src/components/Offender.tsx"),
        `const MAP = { "preflower": "early_flower" };\nexport default MAP;\n`,
        "utf8",
      );

      const res = runScannerIn(tmp);
      expect(res.status).toBe(1);
      const out = res.stdout + res.stderr;
      expect(out).toMatch(/VPD stage mapping ownership violated/);
      expect(out).toMatch(/src\/components\/Offender\.tsx:1/);
      expect(out).toMatch(/preflower -> early_flower/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ignores the allow-listed scanner and helper files", () => {
    // The scanner contains the pair literals in its own source for the
    // regex definitions; allow-listing prevents self-flagging.
    const res = spawnSync("node", [resolve(ROOT, SCRIPT)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(res.status).toBe(0);
  });
});
