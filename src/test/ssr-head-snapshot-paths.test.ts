import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSsrHeadSnapshotPaths } from "../../scripts/ssr-head-snapshot-paths.mjs";

describe("resolveSsrHeadSnapshotPaths", () => {
  it("keeps generated documents in dist while loading the Nitro bundle from .output", () => {
    const root = resolve("verdant-build-root");

    expect(resolveSsrHeadSnapshotPaths("dist", undefined, root)).toEqual({
      distDir: resolve(root, "dist"),
      serverEntry: resolve(root, ".output", "server", "index.mjs"),
      manifestPath: resolve(root, "dist", "seo-manifest.json"),
    });
  });

  it("accepts an explicit server bundle without coupling it to the document directory", () => {
    const root = resolve("verdant-build-root");

    expect(resolveSsrHeadSnapshotPaths("public-seo", "custom/server.mjs", root)).toEqual({
      distDir: resolve(root, "public-seo"),
      serverEntry: resolve(root, "custom", "server.mjs"),
      manifestPath: resolve(root, "public-seo", "seo-manifest.json"),
    });
  });
});
