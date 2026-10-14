/**
 * Dependency-resolution contract for Phase A security patches.
 * Reads package.json and bun.lock, the only lockfile (the npm compatibility
 * lock was retired on 2026-10-03).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const bunLock = readFileSync(resolve(root, "bun.lock"), "utf8");
const exceptionDocument = JSON.parse(
  readFileSync(resolve(root, "config/dependency-security-exceptions.json"), "utf8"),
);

type Version = readonly [number, number, number];

function parseVersion(value: string): Version {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Expected a semver in "${value}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isAtLeast(actual: Version, minimum: Version): boolean {
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

function isSafeBraceExpansionVersion(actual: Version): boolean {
  const [major] = actual;
  if (major === 1) return isAtLeast(actual, [1, 1, 21]);
  if (major === 2) return isAtLeast(actual, [2, 1, 7]);
  if (major === 3) return isAtLeast(actual, [3, 0, 9]);
  if (major === 4) return false;
  if (major === 5) return isAtLeast(actual, [5, 0, 12]);
  return major > 5;
}

function resolvedVersions(packageName: string): Version[] {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = bunLock.matchAll(
    new RegExp(`\\["${escaped}@(\\d+\\.\\d+\\.\\d+)(?:[-+][^"]+)?",`, "g"),
  );
  return [...matches].map((match) => parseVersion(match[1]));
}

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "test" ? [] : productionSourceFiles(path);
    }
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [path] : [];
  });
}

describe("dependency security Phase A resolution floors", () => {
  it("runs the final full-suite quarter in restartable isolated processes", () => {
    expect(packageJson.scripts["test:full:shard4"]).toBe(
      "node scripts/run-vitest-shard4-isolated.mjs",
    );
    const plan = JSON.parse(
      execFileSync(process.execPath, ["scripts/run-vitest-shard4-isolated.mjs", "--plan-json"], {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
      }),
    ) as {
      totalFiles: number;
      selectedFiles: string[];
      chunks: string[][];
      chunkSize: number;
      fingerprint: string;
      vitestFlags: string[];
    };
    expect(plan.totalFiles).toBeGreaterThan(0);
    expect(plan.selectedFiles).toHaveLength(Math.floor(plan.totalFiles / 4));
    expect(plan.chunks.length).toBeGreaterThan(1);
    expect(plan.chunks.every((chunk) => chunk.length > 0 && chunk.length <= 10)).toBe(true);
    expect(plan.chunks.flat()).toEqual(plan.selectedFiles);
    expect(new Set(plan.selectedFiles).size).toBe(plan.selectedFiles.length);
    expect(plan.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.vitestFlags).toEqual([
      "run",
      "--reporter=dot",
      "--pool=forks",
      "--maxWorkers=1",
      "--no-file-parallelism",
      "--isolate",
    ]);
  }, 35_000);

  it("fails closed on empty, duplicate, or out-of-repository shard discovery", async () => {
    const { planIsolatedShard4 } = await import("../../scripts/run-vitest-shard4-isolated.mjs");
    const fixture = resolve(root, "src/test/fixture.test.ts");
    await expect(planIsolatedShard4([], root)).rejects.toThrow("no test files");
    await expect(planIsolatedShard4([fixture, fixture], root)).rejects.toThrow("duplicate");
    await expect(planIsolatedShard4([resolve(root, "../outside.test.ts")], root)).rejects.toThrow(
      "outside the repository",
    );
  });

  it("spawns one fresh isolated Vitest process per chunk and stops on the first failure", async () => {
    const { runPlannedShard4 } = await import("../../scripts/run-vitest-shard4-isolated.mjs");
    const launches: { args: string[]; cwd: string; nodeOptions: string }[] = [];
    const spawn = (
      _executable: string,
      args: string[],
      options: { cwd: string; env: NodeJS.ProcessEnv },
    ) => {
      launches.push({ args, cwd: options.cwd, nodeOptions: options.env.NODE_OPTIONS ?? "" });
      return { status: launches.length === 2 ? 1 : 0 };
    };
    expect(() =>
      runPlannedShard4(
        { chunks: [["first.test.ts"], ["second.test.ts"], ["third.test.ts"]] },
        root,
        spawn,
      ),
    ).toThrow("chunk 2 failed");
    expect(launches).toHaveLength(2);
    expect(launches.map(({ args }) => args.at(-1))).toEqual(["first.test.ts", "second.test.ts"]);
    expect(
      launches.every(
        ({ args, cwd }) =>
          cwd === root && args.includes("--isolate") && args.includes("--no-file-parallelism"),
      ),
    ).toBe(true);
    expect(launches.every(({ nodeOptions }) => nodeOptions.includes("--max-old-space-size"))).toBe(
      true,
    );
  });

  it("declares the direct security floors", () => {
    expect(
      isAtLeast(parseVersion(packageJson.devDependencies.vite), [6, 4, 3]),
      packageJson.devDependencies.vite,
    ).toBe(true);
    expect(
      isAtLeast(parseVersion(packageJson.devDependencies.postcss), [8, 5, 18]),
      packageJson.devDependencies.postcss,
    ).toBe(true);
    expect(
      isAtLeast(parseVersion(packageJson.devDependencies.vitest), [4, 1, 11]),
      packageJson.devDependencies.vitest,
    ).toBe(true);
  });

  it.each([
    ["vite", [6, 4, 3] as const],
    ["postcss", [8, 5, 18] as const],
    ["esbuild", [0, 28, 1] as const],
    ["fast-uri", [3, 1, 8] as const],
    ["form-data", [4, 0, 6] as const],
    ["js-yaml", [4, 3, 2] as const],
    ["hono", [4, 13, 5] as const],
    ["qs", [6, 16, 0] as const],
    ["ajv", [6, 15, 0] as const],
    ["picomatch", [2, 3, 2] as const],
    ["vitest", [4, 1, 11] as const],
    ["@vitest/mocker", [4, 1, 11] as const],
    ["nanoid", [3, 3, 18] as const],
    ["undici", [6, 28, 1] as const],
  ])("resolves every %s instance at or above %s in bun.lock", (packageName, minimum) => {
    const versions = resolvedVersions(packageName);
    expect(versions.length, `${packageName} must be present in bun.lock`).toBeGreaterThan(0);
    for (const version of versions) {
      expect(isAtLeast(version, minimum), `bun.lock: ${packageName}@${version.join(".")}`).toBe(
        true,
      );
    }
  });

  it("keeps any remaining Rollup resolutions patched without requiring its retired subtree", () => {
    // Vitest 4 can reuse root Vite/Rolldown, so the old Vite 7/Rollup graph may be absent.
    for (const version of resolvedVersions("rollup")) {
      expect(isAtLeast(version, [4, 59, 0]), `bun.lock: rollup@${version.join(".")}`).toBe(true);
    }
  });

  it("keeps every brace-expansion resolution outside the current vulnerable ranges", () => {
    const versions = resolvedVersions("brace-expansion");
    expect(versions.length, "brace-expansion must be present in bun.lock").toBeGreaterThan(0);
    for (const version of versions) {
      expect(
        isSafeBraceExpansionVersion(version),
        `bun.lock: brace-expansion@${version.join(".")}`,
      ).toBe(true);
    }
  });

  it.each([
    [[1, 1, 17] as const, false],
    [[1, 1, 18] as const, false],
    [[1, 1, 20] as const, false],
    [[1, 1, 21] as const, true],
    [[2, 1, 3] as const, false],
    [[2, 1, 4] as const, false],
    [[2, 1, 6] as const, false],
    [[2, 1, 7] as const, true],
    [[3, 0, 5] as const, false],
    [[3, 0, 6] as const, false],
    [[3, 0, 8] as const, false],
    [[3, 0, 9] as const, true],
    [[4, 0, 1] as const, false],
    [[5, 0, 8] as const, false],
    [[5, 0, 9] as const, false],
    [[5, 0, 11] as const, false],
    [[5, 0, 12] as const, true],
  ])("classifies brace-expansion %s safety as %s", (version, expected) => {
    expect(isSafeBraceExpansionVersion(version)).toBe(expected);
  });

  it("does not use a cross-major brace-expansion override", () => {
    expect(packageJson.overrides?.["brace-expansion"]).toBeUndefined();
  });

  it("keeps every compatible minimatch major on its patched release", () => {
    const versions = resolvedVersions("minimatch");
    const majorThree = versions.filter(([major]) => major === 3);
    const majorNine = versions.filter(([major]) => major === 9);
    expect(majorThree.length).toBeGreaterThan(0);
    expect(majorNine.length).toBeGreaterThan(0);
    for (const version of majorThree) {
      expect(isAtLeast(version, [3, 1, 5]), `minimatch@${version.join(".")}`).toBe(true);
    }
    for (const version of majorNine) {
      expect(isAtLeast(version, [9, 0, 9]), `minimatch@${version.join(".")}`).toBe(true);
    }
  });

  it("pins only same-major compatible overrides", () => {
    expect(packageJson.overrides).toMatchObject({
      esbuild: "0.28.1",
      "fast-uri": "3.1.8",
      "form-data": "4.0.6",
      "js-yaml": "4.3.2",
      hono: "4.13.7",
      qs: "6.16.0",
      nanoid: "3.3.18",
      undici: "6.28.1",
    });
    expect(packageJson.overrides?.postcss).toBeUndefined();
    expect(packageJson.overrides?.vite).toBeUndefined();
    expect(packageJson.overrides?.minimatch).toBeUndefined();
    expect(packageJson.overrides?.picomatch).toBeUndefined();
  });

  it("keeps the reviewed exception set empty once every tracked advisory is remediated", () => {
    expect(
      exceptionDocument.exceptions.map(
        (exception: { package: string; advisoryId: string; severity: string }) =>
          `${exception.package}#${exception.advisoryId}:${exception.severity}`,
      ),
    ).toEqual([]);
  });

  it("does not import security-sensitive transitive packages from production source", () => {
    const directImport =
      /(?:from\s+["'](?:brace-expansion|esbuild)["']|import\s*\(\s*["'](?:brace-expansion|esbuild)["']\s*\)|require\s*\(\s*["'](?:brace-expansion|esbuild)["']\s*\))/;
    const offenders = productionSourceFiles(resolve(root, "src"))
      .filter((path) => directImport.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(root.length + 1).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});
