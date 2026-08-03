import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
