import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * @source-scan-justified: vitest.config cannot be imported from inside this
 * suite. Under jsdom the import fails on esbuild's TextEncoder invariant
 * ("new TextEncoder().encode("") instanceof Uint8Array" is incorrectly
 * false); running this file in the node test environment instead fails in the
 * shared setup (src/test/setup.ts defines window.scrollTo). Both verified
 * 2026-08-07. Asserting the -swc variant is ABSENT is also inherently a
 * source-level claim. Re-check if the setup gains a node-safe path.
 * NOTE: do not name the node-environment directive literally here — Vitest
 * parses that token out of leading comments and would retarget this file.
 * See AGENTS.md > Testing Standard.
 */

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("Vitest React plugin contract", () => {
  it("loads the declared React plugin instead of an undeclared SWC package", () => {
    const root = process.cwd();
    const config = readFileSync(resolve(root, "vitest.config.ts"), "utf8");
    const manifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as PackageManifest;

    expect(config).toMatch(/from\s+["']@vitejs\/plugin-react["']/);
    expect(config).not.toMatch(/from\s+["']@vitejs\/plugin-react-swc["']/);
    expect(
      manifest.devDependencies?.["@vitejs/plugin-react"] ??
        manifest.dependencies?.["@vitejs/plugin-react"],
    ).toBeTruthy();
  });
});
