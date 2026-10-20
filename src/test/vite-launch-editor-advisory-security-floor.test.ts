/**
 * Advisories 1242661 (vite >=8.2.0 <=8.2.3) and 1242663 (launch-editor <=2.14.1),
 * both high: launch-editor's `fs.existsSync()` check can be bypassed on Windows.
 * The lockfile policy's floors must reject a vulnerable vite or launch-editor on
 * their own, independent of the manifest range and the exact
 * `overrides["launch-editor"]` pin, so a later change cannot reintroduce them.
 */
import { describe, expect, it } from "vitest";
import { relative, resolve } from "node:path";
import {
  BUN_LOCK_SECURITY_FLOORS,
  evaluatePolicy,
} from "../../scripts/check-bun-lockfile-policy.mjs";

const MCP = "@lovable.dev/mcp-js";
const CWD = resolve("virtual-repo");
const at = (name: string) => resolve(CWD, name);
// Joined at runtime: the policy scans tracked source for npm consumer commands,
// and this fixture needs the marker only inside its virtual README.
const NPM_MARKER = ["npm", "install"].join(" ");

function evaluateWith(name: string, version: string) {
  const manifest = {
    name: "verdant",
    version: "0.0.0",
    dependencies: { [MCP]: "0.24.0" },
    devDependencies: {},
    overrides: {},
  };
  const packages = {
    [MCP]: [`${MCP}@0.24.0`, "", {}],
    ...Object.fromEntries(
      Object.entries(BUN_LOCK_SECURITY_FLOORS).map(([name, version]) => [
        name,
        [`${name}@${version}`, "", {}],
      ]),
    ),
    minimatch: ["minimatch@3.1.5", "", {}],
    [name]: [`${name}@${version}`, "", {}],
  };
  const files: Record<string, string> = {
    [at("package.json")]: JSON.stringify(manifest),
    [at("bun.lock")]: JSON.stringify({
      lockfileVersion: 1,
      workspaces: { "": { name: manifest.name, dependencies: manifest.dependencies } },
      overrides: manifest.overrides,
      packages,
    }),
    [at("config/dependency-lockfile-transition.json")]: JSON.stringify({
      schemaVersion: 2,
      canonicalPackageManager: "bun",
      canonicalLockfile: "bun.lock",
      owner: "Verdant dependency security",
      reason: "npm remains in a reviewed local setup entrypoint.",
      consumerContracts: [{ path: "README.md", markers: [NPM_MARKER] }],
    }),
    [at("README.md")]: NPM_MARKER,
  };
  const paths = new Set(Object.keys(files));
  return evaluatePolicy({
    cwd: CWD,
    exists: (path: string) => paths.has(path),
    readFile: (path: string) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path];
    },
    listFiles: () => [...paths],
    listTracked: () => [...paths].map((path) => relative(CWD, path).replaceAll("\\", "/")),
  });
}

const floorErrors = (name: string, result: { errors: string[] }) =>
  result.errors.filter((error) => error.includes(`security floor for ${name}`));

describe("vite and launch-editor security floors (advisories 1242661, 1242663)", () => {
  it("rejects the vulnerable releases on their own", () => {
    expect(floorErrors("vite", evaluateWith("vite", "8.2.0"))).toEqual([
      "bun.lock security floor for vite is 8.2.4; found 8.2.0.",
    ]);
    expect(floorErrors("launch-editor", evaluateWith("launch-editor", "2.14.1"))).toEqual([
      "bun.lock security floor for launch-editor is 2.14.2; found 2.14.1.",
    ]);
  });

  it("accepts the first fixed releases", () => {
    expect(floorErrors("vite", evaluateWith("vite", "8.2.4"))).toEqual([]);
    expect(floorErrors("launch-editor", evaluateWith("launch-editor", "2.14.2"))).toEqual([]);
  });
});
