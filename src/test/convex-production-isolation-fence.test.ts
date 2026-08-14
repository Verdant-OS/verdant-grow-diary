/**
 * @source-scan-justified: This safety fence proves forbidden Convex import
 * surfaces and root dependency entries are absent; the absence itself is the
 * runtime boundary under test.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { readFileCached } from "@/test/helpers/cachedSrcTextScan";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const THIS_TEST = resolve(ROOT, "src/test/convex-production-isolation-fence.test.ts");
const WORKFLOW = resolve(ROOT, ".github/workflows/convex-component-sandbox.yml");
const CODE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const CONVEX_IMPORT =
  /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire(?:\.resolve)?\s*\(\s*)["'](?:npm:)?(?:convex(?:\/[^"']*)?|@convex-dev\/[^"']+)["']/;

function dependencyNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((name): name is string => typeof name === "string");
  }
  if (value && typeof value === "object") {
    return Object.keys(value);
  }
  return [];
}

function convexDependencyOffenders(manifest: Record<string, unknown>): string[] {
  const dependencyGroups = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "bundleDependencies",
  ];

  return dependencyGroups.flatMap((group) =>
    dependencyNames(manifest[group])
      .filter((name) => name === "convex" || name.startsWith("@convex-dev/"))
      .map((name) => `${group}:${name}`),
  );
}

function productionConvexImportOffenders(): string[] {
  const roots = ["src", "supabase/functions", "scripts"];
  const tracked = spawnSync("git", ["grep", "-Iil", "-e", "convex", "--", ...roots], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (tracked.status !== 0 && tracked.status !== 1) {
    throw new Error(`git grep failed: ${tracked.stderr}`);
  }
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", ...roots],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (untracked.status !== 0) {
    throw new Error(`git ls-files failed: ${untracked.stderr}`);
  }

  return [...new Set(`${tracked.stdout}\n${untracked.stdout}`.split(/\r?\n/).filter(Boolean))]
    .map((path) => resolve(ROOT, path))
    .filter((path) => CODE_EXTENSION.test(path) && path !== THIS_TEST)
    .filter((path) => CONVEX_IMPORT.test(stripSourceComments(readFileCached(path))))
    .map((path) => relative(ROOT, path).replaceAll("\\", "/"))
    .sort();
}

describe("Convex production isolation fence", () => {
  it("recognizes static, dynamic, and require-based Convex imports", () => {
    const importShapes = [
      'import { query } from "convex/server";',
      'const client = await import("convex/browser");',
      'const limiter = require("@convex-dev/ratelimiter");',
    ];

    expect(importShapes.every((source) => CONVEX_IMPORT.test(source))).toBe(true);
  });

  it("keeps Convex imports out of production source surfaces", () => {
    expect(productionConvexImportOffenders()).toEqual([]);
  });

  it("keeps Convex out of every root dependency group", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;

    expect(convexDependencyOffenders(manifest).sort()).toEqual([]);
  });

  it("recognizes object, array, and aliased bundled dependency groups", () => {
    expect(
      convexDependencyOffenders({
        dependencies: { convex: "1.43.0" },
        bundledDependencies: ["safe-package", "@convex-dev/ratelimiter"],
        bundleDependencies: ["convex"],
      }).sort(),
    ).toEqual([
      "bundleDependencies:convex",
      "bundledDependencies:@convex-dev/ratelimiter",
      "dependencies:convex",
    ]);
  });

  it("keeps the nested proof suite wired into its path-scoped CI gate", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(WORKFLOW, "utf8");

    expect(manifest.scripts?.["test:convex-component-sandbox"]).toBe(
      "bun run --cwd=spikes/convex-component-sandbox validate",
    );
    expect(workflow).toContain("bun run test:convex-component-sandbox");
    expect(workflow).toContain("spikes/convex-component-sandbox");
    expect(workflow).not.toMatch(/convex\s+deploy/);
  });

  it("keeps Convex configuration out of the repository root", () => {
    expect(existsSync(resolve(ROOT, "convex"))).toBe(false);
    expect(existsSync(resolve(ROOT, "convex.config.ts"))).toBe(false);
  });
});
