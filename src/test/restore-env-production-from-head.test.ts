import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";
const TEST_SANDBOX_TOKEN = "test_sandboxfixture";
const TEST_LIVE_TOKEN = "live_livefixture";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RESTORE_SCRIPT = resolve(REPO_ROOT, "scripts/restore-env-production-from-head.mjs");
const RESTORE_MODULE_URL = pathToFileURL(RESTORE_SCRIPT).href;

let temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "verdant-restore-env-prod-"));
  temporaryRoots.push(root);
  return root;
}

function git(root: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      GIT_AUTHOR_NAME: "fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.com",
      GIT_COMMITTER_NAME: "fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.com",
    },
  });
}

function initRepoWithEnvProduction(token: string): string {
  const root = createTemporaryRoot();
  const init = git(root, ["init"]);
  expect(init.status).toBe(0);
  git(root, ["config", "user.email", "fixture@example.com"]);
  git(root, ["config", "user.name", "fixture"]);
  writeFileSync(resolve(root, ".env.production"), `${TOKEN_NAME}=${token}\n`, "utf8");
  const add = git(root, ["add", ".env.production"]);
  expect(add.status).toBe(0);
  const commit = git(root, ["commit", "-m", "fixture env"]);
  expect(commit.status).toBe(0);
  return root;
}

function runRestoreCli(root: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [RESTORE_SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function combinedOutput(result: ReturnType<typeof runRestoreCli>): string {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots = [];
});

describe("classifyPaymentsClientTokenClass (resolved import)", () => {
  it("classifies fixture prefixes without exposing bytes in the return value", async () => {
    const mod = await import(/* @vite-ignore */ RESTORE_MODULE_URL);

    expect(mod.classifyPaymentsClientTokenClass(`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}\n`)).toBe(
      "test_",
    );
    expect(mod.classifyPaymentsClientTokenClass(`${TOKEN_NAME}=${TEST_LIVE_TOKEN}\n`)).toBe(
      "live_",
    );
    expect(mod.classifyPaymentsClientTokenClass("OTHER=1\n")).toBe("missing");
    expect(mod.classifyPaymentsClientTokenClass(`${TOKEN_NAME}=pk_garbage\n`)).toBe("malformed");
    expect(mod.classifyPaymentsClientTokenClass(null)).toBe("malformed");
  });
});

describe("restoreEnvProductionFromHead", () => {
  it("restores working-tree live_ fixture to HEAD test_ class", async () => {
    const mod = await import(/* @vite-ignore */ RESTORE_MODULE_URL);
    const root = initRepoWithEnvProduction(TEST_SANDBOX_TOKEN);
    writeFileSync(resolve(root, ".env.production"), `${TOKEN_NAME}=${TEST_LIVE_TOKEN}\n`, "utf8");

    const before = mod.classifyPaymentsClientTokenClass(
      readFileSync(resolve(root, ".env.production"), "utf8"),
    );
    expect(before).toBe("live_");

    const result = mod.restoreEnvProductionFromHead({ rootDir: root });
    expect(result).toEqual({ ok: true, tokenClass: "test_" });

    const after = mod.classifyPaymentsClientTokenClass(
      readFileSync(resolve(root, ".env.production"), "utf8"),
    );
    expect(after).toBe("test_");

    const cli = runRestoreCli(root);
    expect(cli.status).toBe(0);
    expect(cli.stdout).toBe(
      "[restore-env-production] restored .env.production from HEAD; token class=test_\n",
    );
    expect(combinedOutput(cli)).not.toContain(TEST_SANDBOX_TOKEN);
    expect(combinedOutput(cli)).not.toContain(TEST_LIVE_TOKEN);
  });

  it("restores working-tree test_ fixture to HEAD live_ class", async () => {
    const mod = await import(/* @vite-ignore */ RESTORE_MODULE_URL);
    const root = initRepoWithEnvProduction(TEST_LIVE_TOKEN);
    writeFileSync(
      resolve(root, ".env.production"),
      `${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}\n`,
      "utf8",
    );

    const result = mod.restoreEnvProductionFromHead({ rootDir: root });
    expect(result).toEqual({ ok: true, tokenClass: "live_" });
    expect(
      mod.classifyPaymentsClientTokenClass(readFileSync(resolve(root, ".env.production"), "utf8")),
    ).toBe("live_");

    const cli = runRestoreCli(root);
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain("token class=live_");
    expect(combinedOutput(cli)).not.toContain(TEST_SANDBOX_TOKEN);
    expect(combinedOutput(cli)).not.toContain(TEST_LIVE_TOKEN);
  });

  it("fails closed when HEAD has no .env.production", async () => {
    const mod = await import(/* @vite-ignore */ RESTORE_MODULE_URL);
    const root = createTemporaryRoot();
    expect(git(root, ["init"]).status).toBe(0);
    git(root, ["config", "user.email", "fixture@example.com"]);
    git(root, ["config", "user.name", "fixture"]);
    writeFileSync(resolve(root, "README"), "x\n", "utf8");
    expect(git(root, ["add", "README"]).status).toBe(0);
    expect(git(root, ["commit", "-m", "no env"]).status).toBe(0);
    writeFileSync(resolve(root, ".env.production"), `${TOKEN_NAME}=${TEST_LIVE_TOKEN}\n`, "utf8");

    const result = mod.restoreEnvProductionFromHead({ rootDir: root });
    expect(result).toEqual({ ok: false, reason: "head_env_production_missing" });
    // Working tree must not be invented/cleared from a missing HEAD blob.
    expect(readFileSync(resolve(root, ".env.production"), "utf8")).toContain(TOKEN_NAME);

    const cli = runRestoreCli(root);
    expect(cli.status).toBe(1);
    expect(cli.stderr).toBe("[restore-env-production] head_env_production_missing\n");
    expect(combinedOutput(cli)).not.toContain(TEST_LIVE_TOKEN);
  });

  it("fails closed when git is unavailable", async () => {
    const mod = await import(/* @vite-ignore */ RESTORE_MODULE_URL);
    const root = initRepoWithEnvProduction(TEST_SANDBOX_TOKEN);
    const emptyBin = resolve(root, ".empty-bin");
    mkdirSync(emptyBin);

    const result = mod.restoreEnvProductionFromHead({
      rootDir: root,
      gitShow: (dir: string, rel: string) => {
        const priorPath = process.env.PATH;
        process.env.PATH = emptyBin;
        try {
          return mod.gitShowHeadEnvProduction(dir, rel);
        } finally {
          process.env.PATH = priorPath;
        }
      },
    });
    expect(result).toEqual({ ok: false, reason: "git_unavailable" });
  });

  it("refuses to restore any path other than .env.production", async () => {
    const mod = await import(/* @vite-ignore */ RESTORE_MODULE_URL);
    const root = initRepoWithEnvProduction(TEST_SANDBOX_TOKEN);
    expect(mod.gitShowHeadEnvProduction(root, ".env")).toEqual({
      ok: false,
      reason: "unsupported_restore_path",
    });
  });
});

describe("prebuild wires restore first (compose with later verify)", () => {
  it("places restore-env-production-from-head ahead of assert-paddle and stamp-version", () => {
    const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
    const prebuildCommands = packageJson.scripts.prebuild.split(/\s*&&\s*/u);

    expect(prebuildCommands[0]).toBe("node scripts/restore-env-production-from-head.mjs");
    expect(prebuildCommands).toContain("node scripts/assert-paddle-production-sandbox.mjs");
    expect(prebuildCommands).toContain("node scripts/stamp-version.mjs");
    expect(prebuildCommands.indexOf("node scripts/restore-env-production-from-head.mjs")).toBe(0);
    expect(
      prebuildCommands.indexOf("node scripts/restore-env-production-from-head.mjs"),
    ).toBeLessThan(prebuildCommands.indexOf("node scripts/assert-paddle-production-sandbox.mjs"));
    // #1126 may later append verify-publish-provenance; do not require it here.
    expect(prebuildCommands).not.toContain("node scripts/verify-publish-provenance.mjs");
  });
});
