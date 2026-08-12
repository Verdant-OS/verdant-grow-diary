/**
 * Pure evaluator and Windows CLI contracts for the transitional lock policy.
 * No network and no dependency installation.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BUN_LOCK_SECURITY_FLOORS,
  FORBIDDEN_LOCKFILES,
  PACKAGE_LOCK_SECURITY_FLOORS,
  evaluatePolicy,
  isExactSemver,
  resolvedVersionInBunLock,
} from "../../scripts/check-bun-lockfile-policy.mjs";
import {
  npmCiDryRunInvocation,
  runNpmLockSemanticCheck,
} from "../../scripts/check-npm-lock-semantic.mjs";

const MCP = "@lovable.dev/mcp-js";
const CWD = resolve("virtual-repo");
const at = (name: string) => resolve(CWD, name);
const lockGood = `"${MCP}": ["${MCP}@0.24.0", "https://example/tgz", {}, "sha512-abc"]`;

function packageJson(spec = "0.24.0", overrides: Record<string, string> = {}) {
  return {
    name: "verdant",
    version: "0.0.0",
    dependencies: { [MCP]: spec },
    devDependencies: {},
    overrides,
  };
}

function bunLock(manifest = packageJson()) {
  return JSON.stringify({
    lockfileVersion: 1,
    workspaces: {
      "": {
        name: manifest.name,
        dependencies: manifest.dependencies,
        devDependencies: manifest.devDependencies,
      },
    },
    overrides: manifest.overrides,
    packages: {
      [MCP]: [`${MCP}@0.24.0`, "", {}],
      ...Object.fromEntries(
        Object.entries(BUN_LOCK_SECURITY_FLOORS).map(([name, version]) => [
          name,
          [`${name}@${version}`, "", {}],
        ]),
      ),
    },
  });
}

function packageLock(manifest = packageJson()) {
  return {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: manifest.name,
        version: manifest.version,
        dependencies: manifest.dependencies,
        devDependencies: manifest.devDependencies,
      },
      [`node_modules/${MCP}`]: { version: "0.24.0" },
      ...Object.fromEntries(
        Object.entries(PACKAGE_LOCK_SECURITY_FLOORS).map(([name, version]) => [
          `node_modules/${name}`,
          { version },
        ]),
      ),
      "node_modules/minimatch": { version: "3.1.5" },
      ...(manifest.overrides["fast-uri"]
        ? { "node_modules/fast-uri": { version: manifest.overrides["fast-uri"] } }
        : {}),
    },
  };
}

function transition(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    canonicalPackageManager: "bun",
    canonicalLockfile: "bun.lock",
    compatibilityLockfile: "package-lock.json",
    owner: "Verdant dependency security",
    reason: "npm remains in a reviewed local setup entrypoint.",
    reviewBy: "2026-08-25",
    consumerContracts: [{ path: "README.md", markers: ["npm install"] }],
    ...overrides,
  };
}

function policyFiles({
  manifest = packageJson(),
  bunLockText = bunLock(manifest),
  npmLock = packageLock(manifest),
  transitionConfig = transition(),
  readme = "npm install",
  extra = {},
}: {
  manifest?: ReturnType<typeof packageJson>;
  bunLockText?: string;
  npmLock?: ReturnType<typeof packageLock> | Record<string, unknown>;
  transitionConfig?: ReturnType<typeof transition>;
  readme?: string;
  extra?: Record<string, string>;
} = {}) {
  return {
    [at("package.json")]: JSON.stringify(manifest),
    [at("bun.lock")]: bunLockText,
    [at("package-lock.json")]: JSON.stringify(npmLock),
    [at("config/dependency-lockfile-transition.json")]: JSON.stringify(transitionConfig),
    [at("README.md")]: readme,
    ...extra,
  };
}

function makeFs(files: Record<string, string>) {
  const paths = new Set(Object.keys(files));
  return {
    exists: (path: string) => paths.has(path),
    readFile: (path: string) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path];
    },
    listFiles: () => [...paths],
  };
}

function evaluate(files = policyFiles(), today = "2026-07-25") {
  return evaluatePolicy({ cwd: CWD, ...makeFs(files), today });
}

describe("isExactSemver", () => {
  it.each(["0.24.0", "1.2.3", "1.2.3-rc.1", "10.0.0-beta+build.4"])(
    "accepts exact semver %s",
    (value) => expect(isExactSemver(value)).toBe(true),
  );

  it.each([
    "^0.24.0",
    "~0.24.0",
    "0.24.x",
    "*",
    "latest",
    ">=0.24.0",
    "workspace:*",
    "file:./x",
    "git+https://x",
    "",
  ])("rejects non-exact %s", (value) => expect(isExactSemver(value)).toBe(false));
});

describe("resolvedVersionInBunLock", () => {
  it("finds the resolved version", () => {
    expect(resolvedVersionInBunLock(lockGood, MCP)).toEqual(["0.24.0"]);
  });

  it("returns null when the package is missing", () => {
    expect(resolvedVersionInBunLock('"other": ["other@1.0.0"]', MCP)).toBeNull();
  });
});

describe("evaluatePolicy", () => {
  it("passes with Bun canonical and the synchronized reviewed npm compatibility lock", () => {
    expect(evaluate()).toMatchObject({
      ok: true,
      errors: [],
      transition: {
        owner: "Verdant dependency security",
        reviewBy: "2026-08-25",
        consumers: ["README.md"],
      },
    });
  });

  it.each([["bun.lock"], ["package-lock.json"]])("fails when required %s is missing", (name) => {
    const files = policyFiles();
    delete files[at(name)];
    expect(evaluate(files).errors.join(" ")).toContain(`Required lockfile is missing: ${name}`);
  });

  it.each(FORBIDDEN_LOCKFILES.map((name: string) => ({ name })) as Array<{ name: string }>)(
    "fails when forbidden $name exists",
    ({ name }) => {
      const files = policyFiles({ extra: { [at(name)]: "x" } });
      expect(evaluate(files).errors.join(" ")).toContain(`Forbidden lockfile present: ${name}`);
    },
  );

  it.each(["^0.24.0", "~0.24.0", "latest", "*"])(
    "fails when @lovable.dev/mcp-js uses %s",
    (spec) => {
      const manifest = packageJson(spec);
      const result = evaluate(
        policyFiles({
          manifest,
          npmLock: packageLock(manifest),
        }),
      );
      expect(result.errors.join(" ")).toMatch(/pinned to an exact semver/);
    },
  );

  it("fails when either lock resolves a different MCP version", () => {
    const bunFiles = policyFiles();
    const staleBun = JSON.parse(bunFiles[at("bun.lock")]);
    staleBun.packages[MCP][0] = `${MCP}@0.23.0`;
    bunFiles[at("bun.lock")] = JSON.stringify(staleBun);
    expect(evaluate(bunFiles).errors.join(" ")).toMatch(/bun\.lock resolves.*0\.23\.0/);

    const npmFiles = policyFiles();
    const stale = JSON.parse(npmFiles[at("package-lock.json")]);
    stale.packages[`node_modules/${MCP}`].version = "0.23.0";
    npmFiles[at("package-lock.json")] = JSON.stringify(stale);
    expect(evaluate(npmFiles).errors.join(" ")).toMatch(/package-lock\.json resolves.*0\.23\.0/);
  });

  it("fails when Bun root workspace metadata drifts from package.json", () => {
    const files = policyFiles();
    const stale = JSON.parse(files[at("bun.lock")]);
    stale.workspaces[""].dependencies[MCP] = "^0.24.0";
    files[at("bun.lock")] = JSON.stringify(stale);
    expect(evaluate(files).errors.join(" ")).toContain(
      "bun.lock root workspace dependencies is not synchronized",
    );
  });

  it("fails when package-lock root declarations drift from package.json", () => {
    const files = policyFiles();
    const stale = JSON.parse(files[at("package-lock.json")]);
    stale.packages[""].dependencies[MCP] = "0.23.0";
    files[at("package-lock.json")] = JSON.stringify(stale);
    expect(evaluate(files).errors.join(" ")).toContain(
      "package-lock.json root dependencies is not synchronized",
    );
  });

  it("fails when an exact npm override is not resolved consistently", () => {
    const manifest = packageJson("0.24.0", { "fast-uri": "3.1.5" });
    const stale = packageLock(manifest);
    stale.packages["node_modules/fast-uri"]!.version = "3.0.0";
    expect(evaluate(policyFiles({ manifest, npmLock: stale })).errors.join(" ")).toContain(
      "package-lock.json override for fast-uri@3.1.5 is not synchronized",
    );
  });

  it.each([
    ["postcss", "8.5.6"],
    ["postcss", "8.5.18-rc.0"],
    ["brace-expansion", "1.1.17"],
  ])("fails when the npm graph regresses the %s security floor", (packageName, version) => {
    const files = policyFiles();
    const stale = JSON.parse(files[at("package-lock.json")]);
    stale.packages[`node_modules/${packageName}`].version = version;
    files[at("package-lock.json")] = JSON.stringify(stale);
    expect(evaluate(files).errors.join(" ")).toContain(
      `package-lock.json security floor for ${packageName}`,
    );
  });

  it("fails when the canonical Bun graph regresses the esbuild security floor", () => {
    const files = policyFiles();
    files[at("bun.lock")] = files[at("bun.lock")].replace("esbuild@0.28.1", "esbuild@0.28.0");
    expect(evaluate(files).errors.join(" ")).toContain("bun.lock security floor for esbuild");
  });

  it.each(["2.1.3", "3.0.5", "4.0.1", "5.0.8"])(
    "fails when brace-expansion regresses to vulnerable release %s",
    (version) => {
      const files = policyFiles();
      const stale = JSON.parse(files[at("package-lock.json")]);
      stale.packages["node_modules/brace-expansion"].version = version;
      files[at("package-lock.json")] = JSON.stringify(stale);
      expect(evaluate(files).errors.join(" ")).toContain(
        "package-lock.json major-aware security floor for brace-expansion",
      );
    },
  );

  it.each(["1.1.18", "2.1.4", "3.0.6", "5.0.9", "6.0.0"])(
    "accepts brace-expansion patched boundary %s",
    (version) => {
      const files = policyFiles();
      const current = JSON.parse(files[at("package-lock.json")]);
      current.packages["node_modules/brace-expansion"].version = version;
      files[at("package-lock.json")] = JSON.stringify(current);
      expect(evaluate(files)).toMatchObject({ ok: true, errors: [] });
    },
  );

  it("fails after the owned transition review date", () => {
    expect(evaluate(policyFiles(), "2026-08-26").errors.join(" ")).toContain(
      "Lockfile transition review is overdue",
    );
  });

  it("fails when a reviewed npm marker disappears", () => {
    expect(evaluate(policyFiles({ readme: "bun install" })).errors.join(" ")).toContain(
      'README.md is missing reviewed marker "npm install"',
    );
  });

  it("fails when a declared consumer adds a command outside its exact allowlist", () => {
    expect(
      evaluate(
        policyFiles({ readme: "npm install\nnpm install definitely-unreviewed@latest" }),
      ).errors.join(" "),
    ).toContain("contains unreviewed command");
  });

  it("fails when a new npm entrypoint is not declared", () => {
    const files = policyFiles({
      extra: {
        [at("vercel.json")]: '{"installCommand":"npm install"}',
      },
    });
    expect(evaluate(files).errors.join(" ")).toContain(
      "Undeclared npm install/ci consumer found at vercel.json",
    );
  });

  it.each([
    ["scripts/bootstrap.ps1", "npm install --no-audit"],
    ["scripts/bootstrap.cmd", "npm.cmd install --no-audit"],
  ])("discovers %s as an undeclared executable root consumer", (path, command) => {
    const files = policyFiles({ extra: { [at(path)]: command } });
    expect(evaluate(files).errors.join(" ")).toContain(
      `Undeclared npm install/ci consumer found at ${path}`,
    );
  });

  it("rejects drive-absolute transition consumer paths", () => {
    expect(() =>
      evaluate(
        policyFiles({
          transitionConfig: transition({
            consumerContracts: [
              {
                path: "C:/Windows/System32/drivers/etc/hosts",
                markers: ["npm install"],
              },
            ],
          }),
        }),
      ),
    ).toThrow(/must stay inside the repo/);
  });

  it("does not classify a global npm CLI install as a root lock consumer", () => {
    const files = policyFiles({
      extra: {
        [at(".github/workflows/lighthouse.yml")]: "run: npm install -g @lhci/cli@0.14.x",
      },
    });
    expect(evaluate(files)).toMatchObject({ ok: true, errors: [] });
  });

  it("passes against the repository's current transitional state", () => {
    const root = resolve(__dirname, "../..");
    expect(evaluatePolicy({ cwd: root, today: "2026-07-25" })).toMatchObject({
      ok: true,
      errors: [],
    });
    for (const forbidden of FORBIDDEN_LOCKFILES) {
      expect(existsSync(resolve(root, forbidden)), forbidden).toBe(false);
    }
  }, 15_000);

  it("runs as a CLI on Windows and finds uppercase undeclared consumers", () => {
    const root = mkdtempSync(join(tmpdir(), "verdant-lockfile-policy-"));
    const script = resolve(__dirname, "../../scripts/check-bun-lockfile-policy.mjs");
    const reviewedMarker = "NPM.CMD ci";
    try {
      const manifest = packageJson();
      mkdirSync(join(root, "config"), { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify(manifest), "utf8");
      writeFileSync(join(root, "bun.lock"), bunLock(manifest), "utf8");
      writeFileSync(join(root, "package-lock.json"), JSON.stringify(packageLock(manifest)), "utf8");
      writeFileSync(
        join(root, "config/dependency-lockfile-transition.json"),
        JSON.stringify(
          transition({
            consumerContracts: [{ path: "README.md", markers: [reviewedMarker] }],
          }),
        ),
        "utf8",
      );
      writeFileSync(join(root, "README.md"), reviewedMarker, "utf8");
      expect(spawnSync("git", ["init"], { cwd: root, encoding: "utf8" }).status).toBe(0);
      expect(spawnSync("git", ["add", "."], { cwd: root, encoding: "utf8" }).status).toBe(0);

      const result = spawnSync(process.execPath, [script], {
        cwd: root,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("bun.lock canonical");
      expect(result.stdout).toContain("package-lock.json synchronized for 1 npm consumers");

      writeFileSync(join(root, "rogue.ps1"), "NPM.EXE ci", "utf8");
      expect(spawnSync("git", ["add", "rogue.ps1"], { cwd: root, encoding: "utf8" }).status).toBe(
        0,
      );
      const rejected = spawnSync(process.execPath, [script], {
        cwd: root,
        encoding: "utf8",
      });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("Undeclared npm install/ci consumer found at rogue.ps1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});

describe("isolated npm semantic lock check", () => {
  it("uses a cross-platform no-lifecycle dry-run invocation", () => {
    expect(npmCiDryRunInvocation("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" })).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        "npm ci --dry-run --ignore-scripts --no-audit --no-fund --cache .npm-cache",
      ],
    });
    expect(npmCiDryRunInvocation("linux", {})).toEqual({
      command: "npm",
      args: [
        "ci",
        "--dry-run",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--cache",
        ".npm-cache",
      ],
    });
  });

  it("rejects a ranged dependency resolution drift in a disposable copy", () => {
    const repositoryRoot = resolve(__dirname, "../..");
    const fixtureRoot = mkdtempSync(join(tmpdir(), "verdant-npm-semantic-fixture-"));
    try {
      writeFileSync(
        join(fixtureRoot, "package.json"),
        readFileSync(join(repositoryRoot, "package.json"), "utf8"),
        "utf8",
      );
      const staleLock = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8"));
      staleLock.packages["node_modules/react"].version = "19.0.0";
      writeFileSync(join(fixtureRoot, "package-lock.json"), JSON.stringify(staleLock), "utf8");

      expect(runNpmLockSemanticCheck({ repoRoot: fixtureRoot })).toEqual({
        ok: false,
        error: expect.stringContaining("not semantically synchronized"),
      });
      expect(existsSync(join(fixtureRoot, "node_modules"))).toBe(false);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
