/**
 * Behavioral contracts for scripts/verify-checkout-disabled-bundle.mjs, run as
 * a child process against temp build fixtures. No network, no real build.
 *
 * The rollback gate must fail when a forbidden Paddle call survives in any
 * emitted bundle, including the `.mjs` server bundle Nitro writes, so the
 * receipt cannot read `pass: true` on a build that still carries checkout.
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
  const root = mkdtempSync(join(tmpdir(), "checkout-disabled-verifier-"));
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

describe("verify-checkout-disabled-bundle", () => {
  it("fails when the .mjs server bundle still carries a Paddle checkout call", () => {
    const root = makeBuild(`export default { open() { return "Paddle.Checkout.open"; } };\n`);
    const { status, receipt } = runVerifier(root);
    expect(status).toBe(1);
    expect(receipt.pass).toBe(false);
    expect(receipt.bundleFiles).toBe(2);
    expect(receipt.forbiddenHits).toHaveLength(1);
    expect(receipt.forbiddenHits[0]).toContain("Paddle.Checkout.open");
    expect(receipt.forbiddenHits[0]).toContain(join("server", "index.mjs"));
  });

  it("passes when both bundles carry the paused copy and no Paddle call", () => {
    const root = makeBuild(`const copy = ${JSON.stringify(PAUSED_COPY)};\nexport default {};\n`);
    const { status, receipt } = runVerifier(root);
    expect(status).toBe(0);
    expect(receipt.pass).toBe(true);
    expect(receipt.bundleFiles).toBe(2);
    expect(receipt.pausedCopyHits).toBe(2);
    expect(receipt.forbiddenHits).toEqual([]);
  });
});
