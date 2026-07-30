/**
 * Dependency-resolution contract for Phase A security patches.
 * Reads package.json, canonical bun.lock, and the synchronized npm
 * compatibility lock.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const bunLock = readFileSync(resolve(root, "bun.lock"), "utf8");
const packageLock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
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

function resolvedVersions(packageName: string): Version[] {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = bunLock.matchAll(
    new RegExp(`\\["${escaped}@(\\d+\\.\\d+\\.\\d+)(?:[-+][^"]+)?",`, "g"),
  );
  return [...matches].map((match) => parseVersion(match[1]));
}

function npmResolvedVersions(packageName: string): Version[] {
  const suffix = `/node_modules/${packageName}`;
  return Object.entries(packageLock.packages)
    .filter(
      ([path, value]) =>
        (path === `node_modules/${packageName}` || path.endsWith(suffix)) &&
        typeof (value as { version?: unknown }).version === "string",
    )
    .map(([, value]) => parseVersion((value as { version: string }).version));
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

function deploymentSourceFiles(): string[] {
  return [
    ...productionSourceFiles(resolve(root, "src")),
    ...productionSourceFiles(resolve(root, "supabase/functions")),
    ...productionSourceFiles(resolve(root, "scripts")),
    resolve(root, "vite.config.ts"),
  ];
}

describe("dependency security Phase A resolution floors", () => {
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
      isAtLeast(parseVersion(packageJson.devDependencies.vitest), [3, 2, 6]),
      packageJson.devDependencies.vitest,
    ).toBe(true);
  });

  it.each([
    ["vite", [6, 4, 3] as const],
    ["postcss", [8, 5, 18] as const],
    ["brace-expansion", [1, 1, 16] as const],
    ["fast-uri", [3, 1, 4] as const],
    ["form-data", [4, 0, 6] as const],
    ["js-yaml", [4, 3, 0] as const],
    ["ajv", [6, 15, 0] as const],
    ["picomatch", [2, 3, 2] as const],
    ["rollup", [4, 59, 0] as const],
    ["vitest", [3, 2, 6] as const],
  ])("resolves every %s instance at or above %s in both locks", (packageName, minimum) => {
    for (const [lockName, versions] of [
      ["bun.lock", resolvedVersions(packageName)],
      ["package-lock.json", npmResolvedVersions(packageName)],
    ] as const) {
      expect(versions.length, `${packageName} must be present in ${lockName}`).toBeGreaterThan(0);
      for (const version of versions) {
        expect(
          isAtLeast(version, minimum),
          `${lockName}: ${packageName}@${version.join(".")}`,
        ).toBe(true);
      }
    }
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
      "fast-uri": "3.1.4",
      "form-data": "4.0.6",
      "js-yaml": "4.3.0",
    });
    expect(packageJson.overrides?.postcss).toBeUndefined();
    expect(packageJson.overrides?.vite).toBeUndefined();
    expect(packageJson.overrides?.minimatch).toBeUndefined();
    expect(packageJson.overrides?.picomatch).toBeUndefined();
  });

  it("keeps the reviewed exception set exact and reviewable", () => {
    expect(
      exceptionDocument.exceptions.map(
        (exception: { package: string; advisoryId: string; severity: string }) =>
          `${exception.package}#${exception.advisoryId}:${exception.severity}`,
      ),
    ).toEqual(["brace-expansion#1124334:high", "react-router#1124282:high", "esbuild#1120680:low"]);
  });

  it("does not import any excepted package from production source", () => {
    const directImport =
      /(?:from\s+["'](?:brace-expansion|esbuild|react-router)["']|import\s*\(\s*["'](?:brace-expansion|esbuild|react-router)["']\s*\)|require\s*\(\s*["'](?:brace-expansion|esbuild|react-router)["']\s*\))/;
    const offenders = productionSourceFiles(resolve(root, "src"))
      .filter((path) => directImport.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(root.length + 1).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it("keeps the React Router exception limited to a non-RSC declarative app", () => {
    expect(packageJson.dependencies?.["react-router"]).toBeUndefined();
    expect(readFileSync(resolve(root, "src/App.tsx"), "utf8")).toMatch(/<BrowserRouter>/);

    const rscApi =
      /(?:unstable[_-][A-Za-z0-9_$]*RSC[A-Za-z0-9_$]*|routeRSCServerRequest|RSCStaticRouter|createCallServer|createServerReference|react-server-dom|@vitejs\/plugin-rsc|\.rsc\b)/i;
    const offenders = deploymentSourceFiles()
      .filter((path) => rscApi.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(root.length + 1).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });

  it.each(["react-router", "react-router-dom"])(
    "recognizes unstable RSC APIs re-exported through %s",
    (packageName) => {
      const rscApi =
        /(?:unstable[_-][A-Za-z0-9_$]*RSC[A-Za-z0-9_$]*|routeRSCServerRequest|RSCStaticRouter|createCallServer|createServerReference|react-server-dom|@vitejs\/plugin-rsc|\.rsc\b)/i;
      expect(rscApi.test(`import { unstable_matchRSCServerRequest } from "${packageName}";`)).toBe(
        true,
      );
    },
  );
});
