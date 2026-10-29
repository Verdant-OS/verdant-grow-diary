/**
 * Supplemental layout probes for scripts/lib/checkoutDisabledBundleRoots.mjs.
 * The primary contracts live in checkout-disabled-bundle-roots.test.ts (locked).
 *
 * #2539 rollback gate: a Nitro layout move must still yield real bundle roots,
 * not bundleFiles: 0.
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
  const root = mkdtempSync(join(tmpdir(), "checkout-disabled-roots-probes-"));
  fixtures.push(root);
  return root;
}

describe("discoverBundleRoots — supplemental layout probes", () => {
  it("reads publicDir and serverEntry from dist/nitro.json when that is the emitted layout", () => {
    const root = makeRoot();
    mkdirSync(join(root, "dist", "client", "assets"), { recursive: true });
    mkdirSync(join(root, "dist", "server"), { recursive: true });
    writeFileSync(
      join(root, "dist", "nitro.json"),
      JSON.stringify({
        publicDir: "client",
        serverEntry: "server/index.mjs",
      }),
      "utf8",
    );

    const found = discoverBundleRoots(root);
    expect(found.map((r) => r.path)).toEqual([
      resolve(root, "dist", "client"),
      resolve(root, "dist", "server"),
    ]);
    expect(found[0].source).toContain("dist/nitro.json");
  });

  it("uses .vercel/output/nitro.json when Vercel Nitro emits static/server trees", () => {
    const root = makeRoot();
    mkdirSync(join(root, ".vercel", "output", "static"), { recursive: true });
    mkdirSync(join(root, ".vercel", "output", "server"), { recursive: true });
    writeFileSync(
      join(root, ".vercel", "output", "nitro.json"),
      JSON.stringify({
        publicDir: "static",
        serverEntry: "server/index.mjs",
      }),
      "utf8",
    );

    const found = discoverBundleRoots(root);
    expect(found.map((r) => r.path)).toEqual([
      resolve(root, ".vercel", "output", "static"),
      resolve(root, ".vercel", "output", "server"),
    ]);
  });
});
