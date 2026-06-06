/**
 * Wiring test for the Shelly H&T edge source presence guard:
 *   - script file exists at scripts/assert-shelly-ht-edge-sources-present.mjs
 *   - package.json exposes `check:shelly-ht-edge-sources` and invokes it
 *   - CI workflow runs that script as a dedicated step
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/assert-shelly-ht-edge-sources-present.ts");
const PKG = resolve(ROOT, "package.json");
const CI = resolve(ROOT, ".github/workflows/ci.yml");

const SCRIPT_NAME = "check:shelly-ht-edge-sources";

describe("Shelly H&T edge source presence guard wiring", () => {
  it("guard script exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("package.json defines the guard script and runs the .ts file with bun", () => {
    const pkg = JSON.parse(readFileSync(PKG, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const cmd = pkg.scripts?.[SCRIPT_NAME];
    expect(cmd).toBeTruthy();
    expect(cmd).toContain("scripts/assert-shelly-ht-edge-sources-present.ts");
    expect(cmd).toMatch(/^bun\s+/);
  });

  it("CI workflow invokes the guard script as a dedicated step", () => {
    const ci = readFileSync(CI, "utf8");
    expect(ci).toMatch(
      new RegExp(`run:\\s*bun\\s+run\\s+${SCRIPT_NAME.replace(":", "\\:")}`),
    );
  });

  it("legacy .mjs guard script has been removed in favor of the .ts version", () => {
    const legacy = resolve(ROOT, "scripts/assert-shelly-ht-edge-sources-present.mjs");
    expect(existsSync(legacy)).toBe(false);
  });
});
