/**
 * Pure evaluator and Windows CLI contracts for the lockfile policy. bun.lock is
 * the only lockfile; the npm compatibility lock was retired on 2026-10-03.
 * No network and no dependency installation.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  BUN_LOCK_SECURITY_FLOORS,
  FORBIDDEN_LOCKFILES,
  evaluatePolicy,
  isExactSemver,
  resolvedVersionInBunLock,
} from "../../scripts/check-bun-lockfile-policy.mjs";

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
      minimatch: ["minimatch@3.1.5", "", {}],
    },
  });
}

function transition(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    canonicalPackageManager: "bun",
    canonicalLockfile: "bun.lock",
    owner: "Verdant dependency security",
    reason: "npm remains in a reviewed local setup entrypoint.",
    consumerContracts: [{ path: "README.md", markers: ["npm install"] }],
    ...overrides,
  };
}

function policyFiles({
  manifest = packageJson(),
  bunLockText = bunLock(manifest),
  transitionConfig = transition(),
  readme = "npm install",
  extra = {},
}: {
  manifest?: ReturnType<typeof packageJson>;
  bunLockText?: string;
  transitionConfig?: Record<string, unknown>;
  readme?: string;
  extra?: Record<string, string>;
} = {}) {
  return {
    [at("package.json")]: JSON.stringify(manifest),
    [at("bun.lock")]: bunLockText,
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
    listTracked: () => [...paths].map((path) => relative(CWD, path).replaceAll("\\", "/")),
  };
}

function evaluate(files = policyFiles()) {
  return evaluatePolicy({ cwd: CWD, ...makeFs(files) });
}

function withBunPackage(key: string, descriptor: string, files = policyFiles()) {
  const lock = JSON.parse(files[at("bun.lock")]);
  lock.packages[key] = [descriptor, "", {}];
  files[at("bun.lock")] = JSON.stringify(lock);
  return files;
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

  it("finds versions under nested Bun lock keys and aliases", () => {
    const nested = [
      '"hono": ["hono@4.13.5", "", {}]',
      '"legacy/hono": ["hono@4.13.5", "", {}]',
      '"compat-rollup/rollup": ["rollup@4.59.0", "", {}]',
    ].join(",\n");
    expect(resolvedVersionInBunLock(nested, "hono")).toEqual(["4.13.5"]);
    expect(resolvedVersionInBunLock(nested, "rollup")).toEqual(["4.59.0"]);
  });

  it("returns every distinct resolved version sorted", () => {
    const nested = [
      '"hono": ["hono@4.13.5", "", {}]',
      '"legacy/hono": ["hono@4.13.4", "", {}]',
    ].join(",\n");
    expect(resolvedVersionInBunLock(nested, "hono")).toEqual(["4.13.4", "4.13.5"]);
  });
});

describe("evaluatePolicy", () => {
  it("passes with Bun canonical and bun.lock as the only lockfile", () => {
    expect(evaluate()).toMatchObject({
      ok: true,
      errors: [],
      transition: {
        owner: "Verdant dependency security",
        consumers: ["README.md"],
      },
    });
  });

  it("fails when the required bun.lock is missing", () => {
    const files = policyFiles();
    delete files[at("bun.lock")];
    expect(evaluate(files).errors.join(" ")).toContain("Required lockfile is missing: bun.lock");
  });

  it("forbids the retired npm compatibility lock alongside every other foreign lockfile", () => {
    expect(FORBIDDEN_LOCKFILES).toEqual(
      expect.arrayContaining(["package-lock.json", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"]),
    );
  });

  it.each(FORBIDDEN_LOCKFILES.map((name: string) => ({ name })) as Array<{ name: string }>)(
    "fails when forbidden $name exists",
    ({ name }) => {
      const files = policyFiles({ extra: { [at(name)]: "x" } });
      expect(evaluate(files).errors.join(" ")).toContain(`Forbidden lockfile present: ${name}`);
    },
  );

  it.each(
    FORBIDDEN_LOCKFILES.flatMap((name: string) => [
      { path: `spikes/example/${name}` },
      { path: `packages/a/b/${name}` },
    ]) as Array<{ path: string }>,
  )("fails when a tracked $path is nested below the root", ({ path }) => {
    const files = policyFiles({ extra: { [at(path)]: "x" } });
    expect(evaluate(files).errors.join(" ")).toContain(`Forbidden lockfile present: ${path}`);
  });

  it("allows a nested bun.lock and files that only end in a forbidden name", () => {
    const files = policyFiles({
      extra: {
        [at("spikes/example/bun.lock")]: "{}",
        [at("docs/old-package-lock.json.md")]: "notes",
      },
    });
    expect(evaluate(files).errors.join(" ")).not.toContain("Forbidden lockfile present");
  });

  it.each(["^0.24.0", "~0.24.0", "latest", "*"])(
    "fails when @lovable.dev/mcp-js uses %s",
    (spec) => {
      const result = evaluate(policyFiles({ manifest: packageJson(spec) }));
      expect(result.errors.join(" ")).toMatch(/pinned to an exact semver/);
    },
  );

  it("fails when bun.lock resolves a different MCP version", () => {
    const files = policyFiles();
    const stale = JSON.parse(files[at("bun.lock")]);
    stale.packages[MCP][0] = `${MCP}@0.23.0`;
    files[at("bun.lock")] = JSON.stringify(stale);
    expect(evaluate(files).errors.join(" ")).toMatch(/bun\.lock resolves.*0\.23\.0/);
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

  it("fails when bun.lock overrides drift from package.json", () => {
    const manifest = packageJson("0.24.0", { "fast-uri": "3.1.8" });
    const files = policyFiles({ manifest, bunLockText: bunLock(packageJson()) });
    expect(evaluate(files).errors.join(" ")).toContain(
      "bun.lock overrides are not synchronized with package.json",
    );
  });

  it("rejects an outdated undici in the canonical Bun graph", () => {
    const files = withBunPackage("undici", "undici@6.28.0");
    expect(evaluate(files).errors.join(" ")).toContain("bun.lock security floor for undici");
  });

  it("accepts removal of optional Rollup from the canonical Bun graph", () => {
    const files = policyFiles();
    const current = JSON.parse(files[at("bun.lock")]);
    for (const key of Object.keys(current.packages)) {
      if (key === "rollup" || key.endsWith("/rollup")) delete current.packages[key];
    }
    files[at("bun.lock")] = JSON.stringify(current);
    expect(evaluate(files)).toMatchObject({ ok: true, errors: [] });
  });

  it("fails when a required Bun security floor package is absent entirely", () => {
    const files = policyFiles();
    const current = JSON.parse(files[at("bun.lock")]);
    delete current.packages.vitest;
    files[at("bun.lock")] = JSON.stringify(current);
    expect(evaluate(files).errors.join(" ")).toContain("bun.lock security floor for vitest");
  });

  it.each(["rollup", "legacy-vite/rollup", "compat-rollup"])(
    "rejects below-floor Rollup in Bun at %s",
    (lockPath) => {
      const files = withBunPackage(lockPath, "rollup@4.58.0");
      expect(evaluate(files).errors.join(" ")).toContain("bun.lock security floor for rollup");
    },
  );

  it.each(["rollup", "legacy-vite/rollup", "compat-rollup"])(
    "accepts patched optional Rollup in Bun at %s",
    (lockPath) => {
      const files = withBunPackage(lockPath, "rollup@4.59.0");
      expect(evaluate(files)).toMatchObject({ ok: true, errors: [] });
    },
  );

  it("rejects a stale nested Bun package even when its root copy meets the floor", () => {
    const files = withBunPackage("legacy/hono", "hono@4.13.4");
    expect(evaluate(files).errors.join(" ")).toContain("bun.lock security floor for hono");
  });

  it.each([
    ["@hono/node-server", "2.0.9"],
    ["@modelcontextprotocol/sdk", "1.29.0"],
    ["hono", "4.12.33"],
    ["hono", "4.13.4"],
    ["js-yaml", "4.3.1"],
    ["qs", "6.15.3"],
    ["vitest", "4.1.10"],
    ["@vitest/mocker", "4.1.10"],
    ["esbuild", "0.28.0"],
    ["undici", "6.28.0"],
    // Floors carried over from the retired package-lock.json check.
    ["vite", "6.4.2"],
    ["postcss", "8.5.6"],
    ["postcss", "8.5.18-rc.0"],
    ["fast-uri", "3.1.5"],
    ["fast-uri", "3.1.6"],
    ["form-data", "4.0.5"],
    ["ajv", "6.14.0"],
    ["picomatch", "2.3.1"],
    ["brace-expansion", "1.1.17"],
  ])(
    "fails when the canonical Bun graph regresses the %s security floor",
    (packageName, version) => {
      const files = withBunPackage(packageName, `${packageName}@${version}`);
      expect(evaluate(files).errors.join(" ")).toContain(
        `bun.lock security floor for ${packageName}`,
      );
    },
  );

  it.each(["1.1.18", "1.1.20", "2.1.4", "2.1.6", "3.0.6", "3.0.8", "4.0.1", "5.0.9", "5.0.11"])(
    "fails when root brace-expansion regresses to vulnerable release %s",
    (version) => {
      const files = withBunPackage("brace-expansion", `brace-expansion@${version}`);
      expect(evaluate(files).errors.join(" ")).toContain(
        "bun.lock major-aware security floor for brace-expansion",
      );
    },
  );

  it.each(["1.1.21", "2.1.7", "3.0.9", "5.0.12", "6.0.0"])(
    "accepts root brace-expansion patched boundary %s",
    (version) => {
      const files = withBunPackage("brace-expansion", `brace-expansion@${version}`);
      expect(evaluate(files).errors.join(" ")).not.toContain("brace-expansion");
    },
  );

  it.each(["1.1.18", "1.1.20", "2.1.4", "2.1.6", "3.0.6", "3.0.8", "4.0.1", "5.0.9", "5.0.11"])(
    "rejects a vulnerable nested Bun brace-expansion %s alongside a patched root",
    (version) => {
      const files = withBunPackage("legacy/brace-expansion", `brace-expansion@${version}`);
      expect(evaluate(files).errors.join(" ")).toContain(
        "bun.lock major-aware security floor for brace-expansion",
      );
    },
  );

  it.each(["1.1.21", "2.1.7", "3.0.9", "5.0.12", "6.0.0"])(
    "accepts a patched nested Bun brace-expansion %s",
    (version) => {
      const files = withBunPackage("legacy/brace-expansion", `brace-expansion@${version}`);
      expect(evaluate(files)).toMatchObject({ ok: true, errors: [] });
    },
  );

  it.each(["3.1.4", "9.0.8"])("rejects minimatch %s inside an advisory major", (version) => {
    const files = withBunPackage("legacy/minimatch", `minimatch@${version}`);
    expect(evaluate(files).errors.join(" ")).toContain(
      `bun.lock minimatch security floor drifted at ${version}`,
    );
  });

  it.each(["3.1.5", "5.1.9", "9.0.9", "10.2.6"])("accepts minimatch %s", (version) => {
    const files = withBunPackage("legacy/minimatch", `minimatch@${version}`);
    expect(evaluate(files)).toMatchObject({ ok: true, errors: [] });
  });

  it.each([
    ["schemaVersion 1", { schemaVersion: 1 }, /schemaVersion 2/],
    ["a compatibility lockfile", { compatibilityLockfile: "package-lock.json" }, /retired/],
    ["a review date", { reviewBy: "2026-10-10" }, /retired/],
    ["a non-Bun canonical lock", { canonicalLockfile: "package-lock.json" }, /Bun and bun\.lock/],
  ])("rejects a config that declares %s", (_label, override, pattern) => {
    expect(() => evaluate(policyFiles({ transitionConfig: transition(override) }))).toThrow(
      pattern,
    );
  });

  it("accepts an empty npm-reference allowlist when no npm command text remains", () => {
    const files = policyFiles({
      transitionConfig: transition({ consumerContracts: [] }),
      readme: "bun install",
    });
    expect(evaluate(files)).toMatchObject({ ok: true, errors: [] });
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
        // Synthetic undeclared path — not the real vercel.json (which pins bun,
        // not npm, via top-level installCommand).
        [at("scripts/ad-hoc-npm-install.sh")]: "npm install",
      },
    });
    expect(evaluate(files).errors.join(" ")).toContain(
      "Undeclared npm install/ci consumer found at scripts/ad-hoc-npm-install.sh",
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

  it.each([
    ["npm cache", "    cache: npm", "npm cache"],
    ["quoted npm cache", '    cache: "npm" # setup-node', "npm cache"],
    ["single-quoted npm cache", "    cache: 'npm'", "npm cache"],
    ["inline npm cache", 'with: { "cache": "npm" }', "npm cache"],
    ["uppercase npm cache", "    cache: NPM", "npm cache"],
    ["npm lock hash", "key: ${{ hashFiles('package-lock.json') }}", "retired npm lock"],
    [
      "mixed lock hash",
      "key: ${{ hashFiles('bun.lock', '**/package-lock.json') }}",
      "retired npm lock",
    ],
    [
      "multiline npm lock hash",
      "key: ${{ hashFiles(\n  'package-lock.json'\n) }}",
      "retired npm lock",
    ],
  ])("rejects workflow %s without an install command", (_label, contents, diagnostic) => {
    const path = ".github/workflows/cache-only.yml";
    const files = policyFiles({ extra: { [at(path)]: contents } });
    const result = evaluate(files);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain(diagnostic);
    expect(result.errors.join(" ")).toContain(path);
  });

  it.each([
    "cache: bun\nkey: ${{ hashFiles('bun.lock') }}",
    "# cache: npm\n# key: ${{ hashFiles('package-lock.json') }}",
  ])("accepts Bun caching and commented historical cache examples: %s", (contents) => {
    expect(
      evaluate(policyFiles({ extra: { [at(".github/workflows/cache-only.yaml")]: contents } })),
    ).toMatchObject({ ok: true, errors: [] });
  });

  it("documents a frozen Bun setup with no executable npm bootstrap", () => {
    const root = resolve(__dirname, "../..");
    const skill = readFileSync(
      resolve(root, ".claude/skills/run-verdant-grow-diary/SKILL.md"),
      "utf8",
    );
    const setup = skill.split("### Dependencies (first run)")[1].split("\n---")[0];
    const commands = [...setup.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1].trim());
    expect(commands).toEqual(["bun install --frozen-lockfile"]);
    // Absence scan over executable documentation, not effective configuration.
    const allCommands = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
    expect(allCommands.join("\n")).not.toMatch(/\bnpm(?:\.cmd|\.exe)?\s+(?:ci|install)\b/i);
    expect(skill.split("## Troubleshooting")[1]).toContain("not a supported recovery path");
  });

  it("keeps AGENTS setup guidance on the frozen Bun path", () => {
    const root = resolve(__dirname, "../..");
    const agents = readFileSync(resolve(root, "AGENTS.md"), "utf8");
    const guidance = agents
      .split("**Package manager — check `node_modules` first;")[1]
      .split("- **Dev server.")[0];
    const prose = guidance.replace(/\s+/g, " ");
    expect(prose).toContain(
      "absent, use `bun install --frozen-lockfile` as the SKILL's supported setup path.",
    );
    expect(prose).toContain(
      "Historical install observations below do not authorize an unpinned npm fallback",
    );
    expect(prose).toContain(
      "If the frozen install fails, report the exact blocker as `BLOCKED`; do not install an unpinned npm tree or regenerate the lockfile.",
    );
    // Forbidden-instruction absence scan over documentation, not resolved config.
    expect(prose).not.toContain("do **not** reach for `bun install --frozen-lockfile`");
    expect(prose).not.toContain("SKILL's verified npm public-registry-override bootstrap");
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

  it("passes against the repository's current state", () => {
    const root = resolve(__dirname, "../..");
    expect(evaluatePolicy({ cwd: root })).toMatchObject({
      ok: true,
      errors: [],
    });
    for (const forbidden of FORBIDDEN_LOCKFILES) {
      expect(existsSync(resolve(root, forbidden)), forbidden).toBe(false);
    }

    // vercel.json must not reintroduce illegal `projectSettings`. Top-level
    // bunVersion/installCommand/buildCommand are schema-legal and pin the same
    // package manager GitHub CI uses. The historical preview checklist's npm
    // text stays pinned via docs/preview-deployment-verification.md.
    const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(vercel).not.toHaveProperty("projectSettings");
    expect(vercel.installCommand).toBe("bun install --frozen-lockfile");
    expect(vercel.buildCommand).toBe("bun run build");
    expect(vercel.bunVersion).toBe("1.x");
    expect(vercel).not.toHaveProperty("outputDirectory");

    const transition = JSON.parse(
      readFileSync(resolve(root, "config/dependency-lockfile-transition.json"), "utf8"),
    ) as { consumerContracts: Array<{ path: string }> };
    const consumerPaths = transition.consumerContracts.map(({ path }) => path);
    // bun install is not an npm consumer — keep vercel.json off the npm allowlist.
    expect(consumerPaths).not.toContain("vercel.json");
    expect(consumerPaths).toContain("docs/preview-deployment-verification.md");
    // The SEO monitoring workflow moved to Bun; it must not return to the allowlist.
    expect(consumerPaths).not.toContain(".github/workflows/seo-monitoring.yml");
    expect(consumerPaths).not.toContain(".claude/skills/run-verdant-grow-diary/SKILL.md");
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
      expect(result.stdout).toContain("bun.lock canonical and the only lockfile");
      expect(result.stdout).toContain("1 reviewed npm command references");

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

      rmSync(join(root, "rogue.ps1"));
      const workflow = join(root, ".github/workflows/cache-only.yaml");
      mkdirSync(join(root, ".github/workflows"), { recursive: true });
      for (const [contents, diagnostic] of [
        ["cache: npm", "npm cache"],
        ["key: ${{ hashFiles('package-lock.json') }}", "retired npm lock"],
      ]) {
        writeFileSync(workflow, contents, "utf8");
        expect(spawnSync("git", ["add", "."], { cwd: root, encoding: "utf8" }).status).toBe(0);
        const cacheRejected = spawnSync(process.execPath, [script], {
          cwd: root,
          encoding: "utf8",
        });
        expect(cacheRejected.status).toBe(1);
        expect(cacheRejected.stderr).toContain(diagnostic);
      }

      writeFileSync(join(root, "package-lock.json"), "{}", "utf8");
      const relocked = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
      expect(relocked.status).toBe(1);
      expect(relocked.stderr).toContain("Forbidden lockfile present: package-lock.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});
