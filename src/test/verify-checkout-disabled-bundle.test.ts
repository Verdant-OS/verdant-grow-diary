/**
 * Rollback artifact: production builds with VITE_CHECKOUT_DISABLED="true" must
 * ship paused copy and must not retain Paddle init/open in client bundles.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = resolve(REPO_ROOT, "scripts/verify-checkout-disabled-bundle.mjs");
const PAUSED_COPY =
  "New checkout is paused. Existing plans, renewals and billing management are not affected.";

let roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "verdant-checkout-disabled-"));
  roots.push(root);
  return root;
}

function writeBundle(root: string, relativePath: string, body: string) {
  const full = join(root, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body, "utf8");
}

function runVerifier(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("verify-checkout-disabled-bundle.mjs", () => {
  it("passes when paused copy is present and Paddle init/open are absent", () => {
    const root = tempRoot();
    writeBundle(root, ".output/public/assets/index.js", `export const x = "${PAUSED_COPY}";`);
    writeBundle(root, ".output/server/chunks/server.js", "// server chunk");

    const result = runVerifier(root);
    expect(result.status).toBe(0);
    const receipt = JSON.parse(
      readFileSync(join(root, "checkout-disabled-bundle-receipt.json"), "utf8"),
    );
    expect(receipt.pass).toBe(true);
    expect(receipt.forbiddenHits).toEqual([]);
    expect(receipt.pausedCopyHits).toBeGreaterThan(0);
  });

  it("fails when paused copy is missing from the built assets", () => {
    const root = tempRoot();
    writeBundle(root, ".output/public/assets/index.js", "export const x = 'checkout open';");

    const result = runVerifier(root);
    expect(result.status).toBe(1);
    const receipt = JSON.parse(
      readFileSync(join(root, "checkout-disabled-bundle-receipt.json"), "utf8"),
    );
    expect(receipt.pass).toBe(false);
    expect(receipt.pausedCopyHits).toBe(0);
  });

  it("fails when Paddle.Initialize remains in a client bundle", () => {
    const root = tempRoot();
    writeBundle(
      root,
      ".output/public/assets/index.js",
      `${PAUSED_COPY}; Paddle.Initialize({ token: "x" });`,
    );

    const result = runVerifier(root);
    expect(result.status).toBe(1);
    const receipt = JSON.parse(
      readFileSync(join(root, "checkout-disabled-bundle-receipt.json"), "utf8"),
    );
    expect(receipt.pass).toBe(false);
    expect(receipt.forbiddenHits.some((hit: string) => hit.includes("Paddle.Initialize"))).toBe(
      true,
    );
  });
});
