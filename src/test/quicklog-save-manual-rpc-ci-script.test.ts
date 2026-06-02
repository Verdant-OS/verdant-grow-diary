/**
 * Ensures the targeted QuickLog RPC ownership/security CI slice stays wired:
 *   - package.json exposes `test:quicklog-rpc-ownership`
 *   - the script runs the ownership + reason-code + mixed-boundary tests
 *   - .github/workflows/ci.yml invokes that script as a dedicated step
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const pkg = JSON.parse(
  readFileSync(resolve(ROOT, "package.json"), "utf8"),
) as { scripts?: Record<string, string> };
const ciPath = resolve(ROOT, ".github/workflows/ci.yml");
const ci = existsSync(ciPath) ? readFileSync(ciPath, "utf8") : "";

const SCRIPT = "test:quicklog-rpc-ownership";
const REQUIRED = [
  "src/test/quicklog-save-manual-rpc-ownership.test.ts",
  "src/test/quicklog-save-manual-rpc-reason-codes.test.ts",
  "src/test/quicklog-save-manual-rpc-mixed-boundary.test.ts",
];

describe("QuickLog RPC ownership CI wiring", () => {
  it("package.json defines the targeted script", () => {
    expect(pkg.scripts?.[SCRIPT]).toBeTruthy();
  });

  it("the script runs only the ownership/security slice via vitest", () => {
    const cmd = pkg.scripts![SCRIPT];
    expect(cmd).toMatch(/vitest\s+run/);
    for (const f of REQUIRED) expect(cmd).toContain(f);
  });

  it("CI workflow invokes the targeted script as its own step", () => {
    expect(ci.length).toBeGreaterThan(50);
    expect(ci).toMatch(new RegExp(`run:\\s*bun\\s+run\\s+${SCRIPT}`));
  });

  it("CI still runs the full suite after the targeted slice", () => {
    expect(ci).toMatch(/bunx\s+vitest\s+run\s*$/m);
  });
});
