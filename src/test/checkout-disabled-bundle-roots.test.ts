/**
 * Behavioral contracts for scripts/lib/checkoutDisabledBundleRoots.mjs.
 * Temp fixtures only — no network, no real build.
 *
 * The checkout-disabled rollback verifier must scan whichever layout the
 * build actually emitted (declared by nitro.json, else a conventional
 * `.output/` or `dist/` tree), so a layout move yields a real verdict rather
 * than `bundleFiles: 0`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverBundleRoots } from "../../scripts/lib/checkoutDisabledBundleRoots.mjs";

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) {
    const root = fixtures.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "checkout-disabled-roots-"));
  fixtures.push(root);
  return root;
}

describe("discoverBundleRoots", () => {
  it("uses publicDir and serverEntry declared by .output/nitro.json", () => {
    const root = makeRoot();
    mkdirSync(join(root, ".output", "public", "assets"), { recursive: true });
    mkdirSync(join(root, ".output", "server"), { recursive: true });
    writeFileSync(
      join(root, ".output", "nitro.json"),
      JSON.stringify({
        preset: "cloudflare-module",
        publicDir: "public",
        serverEntry: "server/index.mjs",
      }),
      "utf8",
    );

    const found = discoverBundleRoots(root);
    expect(found.map((r) => r.path)).toEqual([
      resolve(root, ".output", "public"),
      resolve(root, ".output", "server"),
    ]);
    expect(found[0].source).toContain("nitro.json");
  });

  it("falls back to the dist/client + dist/server layout when no nitro.json exists", () => {
    const root = makeRoot();
    mkdirSync(join(root, "dist", "client", "assets"), { recursive: true });
    mkdirSync(join(root, "dist", "server"), { recursive: true });

    const found = discoverBundleRoots(root);
    expect(found.map((r) => r.path)).toEqual([
      resolve(root, "dist", "client"),
      resolve(root, "dist", "server"),
    ]);
  });

  it("returns only directories that exist, with no duplicates, and nothing for an empty tree", () => {
    const root = makeRoot();
    expect(discoverBundleRoots(root)).toEqual([]);

    mkdirSync(join(root, ".output", "public"), { recursive: true });
    writeFileSync(
      join(root, ".output", "nitro.json"),
      JSON.stringify({ publicDir: "public", serverEntry: "server/index.mjs" }),
      "utf8",
    );
    const found = discoverBundleRoots(root);
    // server/ is declared but absent on disk; public/ is declared and conventional, listed once.
    expect(found.map((r) => r.path)).toEqual([resolve(root, ".output", "public")]);
  });
});
