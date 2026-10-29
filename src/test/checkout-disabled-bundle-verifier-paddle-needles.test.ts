/**
 * Supplemental forbidden-needle coverage for scripts/verify-checkout-disabled-bundle.mjs.
 * Primary behavioral contracts live in checkout-disabled-bundle-verifier.test.ts (locked).
 *
 * The rollback gate must fail on any surviving Paddle init/open/environment call,
 * not only Paddle.Checkout.open (#2539 / 69bf1bd56).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../../scripts/verify-checkout-disabled-bundle.mjs");
const PAUSED_COPY =
  "New checkout is paused. Existing plans, renewals and billing management are not affected.";

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const root = fixtures.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function makeBuild(serverSource: string) {
  const root = mkdtempSync(join(tmpdir(), "checkout-disabled-verifier-needles-"));
  fixtures.push(root);
  mkdirSync(join(root, ".output", "public", "assets"), { recursive: true });
  mkdirSync(join(root, ".output", "server"), { recursive: true });
  writeFileSync(
    join(root, ".output", "nitro.json"),
    JSON.stringify({ publicDir: "public", serverEntry: "server/index.mjs" }),
    "utf8",
  );
  writeFileSync(
    join(root, ".output", "public", "assets", "app.js"),
    `const copy = ${JSON.stringify(PAUSED_COPY)};\n`,
    "utf8",
  );
  writeFileSync(join(root, ".output", "server", "index.mjs"), serverSource, "utf8");
  return root;
}

function runVerifier(cwd: string) {
  let status = 0;
  try {
    execFileSync(process.execPath, [SCRIPT], { cwd, stdio: "pipe" });
  } catch (error) {
    status = (error as { status?: number }).status ?? 1;
  }
  const receipt = JSON.parse(
    readFileSync(join(cwd, "checkout-disabled-bundle-receipt.json"), "utf8"),
  );
  return { status, receipt };
}

describe("verify-checkout-disabled-bundle — supplemental forbidden needles", () => {
  it.each(["Paddle.Initialize", "Paddle.Environment.set"] as const)(
    "fails when the server bundle still references %s",
    (needle) => {
      const root = makeBuild(`export default { x() { return ${JSON.stringify(needle)}; } };\n`);
      const { status, receipt } = runVerifier(root);
      expect(status).toBe(1);
      expect(receipt.pass).toBe(false);
      expect(receipt.forbiddenHits).toEqual(
        expect.arrayContaining([expect.stringContaining(needle)]),
      );
    },
  );
});
