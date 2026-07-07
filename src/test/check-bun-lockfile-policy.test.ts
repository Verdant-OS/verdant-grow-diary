/**
 * Tests for scripts/check-bun-lockfile-policy.mjs — pure evaluator over
 * a virtual filesystem. No live process spawn, no network.
 */
import { describe, it, expect } from "vitest";
import {
  isExactSemver,
  resolvedVersionInBunLock,
  evaluatePolicy,
} from "../../scripts/check-bun-lockfile-policy.mjs";

function makeFs(files: Record<string, string>) {
  const set = new Set(Object.keys(files));
  return {
    exists: (p: string) => set.has(p),
    readFile: (p: string) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
  };
}

const MCP = "@lovable.dev/mcp-js";
const CWD = "/repo";
const pkg = (spec: string) => JSON.stringify({ name: "verdant", dependencies: { [MCP]: spec } });
const lockGood = `"${MCP}": ["${MCP}@0.20.0", "https://example/tgz", {}, "sha512-abc"]`;

describe("isExactSemver", () => {
  it.each(["0.20.0", "1.2.3", "1.2.3-rc.1", "10.0.0-beta+build.4"])(
    "accepts exact semver %s",
    (s) => expect(isExactSemver(s)).toBe(true),
  );

  it.each([
    "^0.20.0",
    "~0.20.0",
    "0.20.x",
    "*",
    "latest",
    ">=0.20.0",
    "workspace:*",
    "file:./x",
    "git+https://x",
    "",
  ])("rejects non-exact %s", (s) => expect(isExactSemver(s)).toBe(false));
});

describe("resolvedVersionInBunLock", () => {
  it("finds the resolved version", () => {
    expect(resolvedVersionInBunLock(lockGood, MCP)).toEqual(["0.20.0"]);
  });
  it("returns null when the package is missing", () => {
    expect(resolvedVersionInBunLock('"other": ["other@1.0.0"]', MCP)).toBeNull();
  });
});

describe("evaluatePolicy", () => {
  it("passes with bun.lock + exact pin + resolved version match", () => {
    const fs = makeFs({
      "/repo/bun.lock": lockGood,
      "/repo/package.json": pkg("0.20.0"),
    });
    const r = evaluatePolicy({ cwd: CWD, ...fs });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("fails when bun.lock is missing", () => {
    const fs = makeFs({ "/repo/package.json": pkg("0.20.0") });
    const r = evaluatePolicy({ cwd: CWD, ...fs });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/bun\.lock/);
  });

  it("fails when bun.lockb exists", () => {
    const fs = makeFs({
      "/repo/bun.lock": lockGood,
      "/repo/bun.lockb": "binary",
      "/repo/package.json": pkg("0.20.0"),
    });
    const r = evaluatePolicy({ cwd: CWD, ...fs });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/bun\.lockb/);
  });

  it.each(["package-lock.json", "yarn.lock", "pnpm-lock.yaml"])("fails when %s exists", (name) => {
    const fs = makeFs({
      "/repo/bun.lock": lockGood,
      [`/repo/${name}`]: "x",
      "/repo/package.json": pkg("0.20.0"),
    });
    const r = evaluatePolicy({ cwd: CWD, ...fs });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain(name);
  });

  it.each(["^0.20.0", "~0.20.0", "latest", "*"])(
    "fails when @lovable.dev/mcp-js uses %s",
    (spec) => {
      const fs = makeFs({
        "/repo/bun.lock": lockGood,
        "/repo/package.json": pkg(spec),
      });
      const r = evaluatePolicy({ cwd: CWD, ...fs });
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toMatch(/pinned to an exact semver/);
    },
  );

  it("fails when bun.lock resolves a different version than package.json pins", () => {
    const fs = makeFs({
      "/repo/bun.lock": `"${MCP}": ["${MCP}@0.19.0"]`,
      "/repo/package.json": pkg("0.20.0"),
    });
    const r = evaluatePolicy({ cwd: CWD, ...fs });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/resolves.*0\.19\.0/);
  });

  it("fails when @lovable.dev/mcp-js is missing from package.json", () => {
    const fs = makeFs({
      "/repo/bun.lock": lockGood,
      "/repo/package.json": JSON.stringify({ name: "x", dependencies: {} }),
    });
    const r = evaluatePolicy({ cwd: CWD, ...fs });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("not present");
  });
});
