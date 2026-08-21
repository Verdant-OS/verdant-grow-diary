import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";
const TEST_SANDBOX_TOKEN = "test_prebuild_policy_fixture";
const OTHER_SANDBOX_TOKEN = "test_prebuild_policy_override";
const TEST_LIVE_TOKEN = "live_prebuild_policy_fixture";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD_SCRIPT = resolve(REPO_ROOT, "scripts/assert-paddle-production-sandbox.mjs");

let temporaryRoots: string[] = [];
let previousToken: string | undefined;
let hadPreviousToken = false;

function createTemporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "verdant-paddle-prebuild-"));
  temporaryRoots.push(root);
  return root;
}

function createEnvRoot(productionLines: string[], productionLocalLines: string[] = []): string {
  const root = createTemporaryRoot();
  writeFileSync(resolve(root, ".env.production"), `${productionLines.join("\n")}\n`, "utf8");
  if (productionLocalLines.length > 0) {
    writeFileSync(
      resolve(root, ".env.production.local"),
      `${productionLocalLines.join("\n")}\n`,
      "utf8",
    );
  }
  return root;
}

function runGuard(root: string, tokenOverride?: string, debug?: string) {
  const env = { ...process.env };
  delete env[TOKEN_NAME];
  delete env.DEBUG;
  if (tokenOverride !== undefined) env[TOKEN_NAME] = tokenOverride;
  if (debug !== undefined) env.DEBUG = debug;
  return spawnSync(process.execPath, [GUARD_SCRIPT], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

function combinedOutput(result: ReturnType<typeof runGuard>): string {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

beforeEach(() => {
  hadPreviousToken = Object.hasOwn(process.env, TOKEN_NAME);
  previousToken = process.env[TOKEN_NAME];
  delete process.env[TOKEN_NAME];
});

afterEach(() => {
  if (hadPreviousToken) process.env[TOKEN_NAME] = previousToken;
  else delete process.env[TOKEN_NAME];
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
  temporaryRoots = [];
});

describe("Paddle production prebuild guard", () => {
  it("runs before every existing prebuild command without changing dev scripts", () => {
    const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
    const prebuildCommands = packageJson.scripts.prebuild.split(/\s*&&\s*/u);

    expect(prebuildCommands).toEqual([
      "node scripts/assert-paddle-production-sandbox.mjs",
      "node scripts/verify-edge-shared-in-sync.mjs",
      "node scripts/check-no-src-lib-imports.mjs",
      "node scripts/stamp-version.mjs",
    ]);
    expect(packageJson.scripts.dev).toBe("vite dev");
    expect(packageJson.scripts["build:dev"]).toBe("vite build --mode development");
  });

  it("accepts the canonical production environment without exposing its token", () => {
    const result = runGuard(REPO_ROOT);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[paddle-production-policy] sandbox source verified.\n");
    expect(result.stderr).toBe("");
    expect(combinedOutput(result)).not.toContain("VITE_PAYMENTS_CLIENT_TOKEN=");
  });

  it("accepts an identical mode-local sandbox value", () => {
    const root = createEnvRoot(
      [`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`],
      [`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`],
    );
    const result = runGuard(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[paddle-production-policy] sandbox source verified.\n");
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
  });

  it("fails closed when the canonical production file is missing", () => {
    const result = runGuard(createTemporaryRoot());

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("[paddle-production-policy] canonical_paddle_env_read_failed\n");
  });

  it("bounds the canonical production file before parsing it", () => {
    const root = createEnvRoot([`${TOKEN_NAME}=test_${"a".repeat(64 * 1024)}`]);
    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("[paddle-production-policy] canonical_paddle_env_too_large\n");
    expect(result.stdout).toBe("");
  });

  it("rejects a raw live token even when a sandbox ambient value masks Vite", () => {
    const root = createEnvRoot([`${TOKEN_NAME}=${TEST_LIVE_TOKEN}`]);
    const result = runGuard(root, TEST_SANDBOX_TOKEN);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("[paddle-production-policy] canonical_paddle_token_not_sandbox\n");
    expect(combinedOutput(result)).not.toContain(TEST_LIVE_TOKEN);
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
  });

  it("rejects duplicate canonical assignments regardless of their values", () => {
    const root = createEnvRoot([
      `${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`,
      `${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`,
    ]);
    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("[paddle-production-policy] canonical_paddle_token_count_invalid\n");
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
  });

  it.each([
    {
      name: "live mode-local override",
      localToken: TEST_LIVE_TOKEN,
      expectedReason: "effective_paddle_token_not_sandbox",
    },
    {
      name: "different sandbox mode-local override",
      localToken: OTHER_SANDBOX_TOKEN,
      expectedReason: "effective_paddle_token_mismatch",
    },
  ])("rejects a $name without logging credential bytes", ({ localToken, expectedReason }) => {
    const root = createEnvRoot(
      [`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`],
      [`${TOKEN_NAME}=${localToken}`],
    );
    const result = runGuard(root, undefined, "vite:env");

    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`[paddle-production-policy] ${expectedReason}\n`);
    expect(result.stdout).toBe("");
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
    expect(combinedOutput(result)).not.toContain(localToken);
  });

  it.each([
    { name: "live", token: TEST_LIVE_TOKEN, reason: "effective_paddle_token_not_sandbox" },
    { name: "empty", token: "", reason: "effective_paddle_token_not_sandbox" },
    {
      name: "different sandbox",
      token: OTHER_SANDBOX_TOKEN,
      reason: "effective_paddle_token_mismatch",
    },
  ])("rejects a $name ambient build override", ({ token, reason }) => {
    const root = createEnvRoot([`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`]);
    const result = runGuard(root, token);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`[paddle-production-policy] ${reason}\n`);
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
    if (token) expect(combinedOutput(result)).not.toContain(token);
  });
});
