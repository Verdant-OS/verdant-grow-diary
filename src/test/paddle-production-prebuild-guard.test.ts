import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";
const TEST_SANDBOX_TOKEN = "test_sandboxfixture0000000000000";
const OTHER_SANDBOX_TOKEN = "test_sandboxfixtureother00000000";
const TEST_LIVE_TOKEN = "live_livefixture0000000000000000";
const OTHER_LIVE_TOKEN = "live_livefixtureother00000000000";
const GARBAGE_TOKEN = "pk_not_a_paddle_client_token";
const LIVE_STRIPE_KEY = `pk_live_${"A1b2C3d4".repeat(12)}`;
const OTHER_LIVE_STRIPE_KEY = `pk_live_${"Z9y8X7w6".repeat(12)}`;
const TEST_STRIPE_KEY = `pk_test_${"A1b2C3d4".repeat(12)}`;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD_SCRIPT = resolve(REPO_ROOT, "scripts/assert-paddle-production-sandbox.mjs");
const GUARD_MODULE_URL = pathToFileURL(GUARD_SCRIPT).href;
const CORE_MODULE_URL = pathToFileURL(
  resolve(REPO_ROOT, "scripts/e2e/managed-session-materialize-core.mjs"),
).href;
const VITE_IMPORT = pathToFileURL(resolve(REPO_ROOT, "node_modules/vite/dist/node/index.js")).href;

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

function runGuard(root: string, tokenOverride?: string, debug?: string, preloadVite = false) {
  const env = { ...process.env };
  delete env[TOKEN_NAME];
  delete env.DEBUG;
  if (tokenOverride !== undefined) env[TOKEN_NAME] = tokenOverride;
  if (debug !== undefined) env.DEBUG = debug;
  const args = preloadVite ? ["--import", VITE_IMPORT, GUARD_SCRIPT] : [GUARD_SCRIPT];
  return spawnSync(process.execPath, args, {
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

const OK = "[payments-production-policy] live Stripe key verified.\n";
const fail = (reason: string) => `[payments-production-policy] ${reason}\n`;

describe("Production payments prebuild guard (live Stripe key only)", () => {
  it("does not expose a reentrant process-global verifier API", async () => {
    const guardModule = await import(/* @vite-ignore */ GUARD_MODULE_URL);
    expect(Object.keys(guardModule)).toEqual([]);
  });

  it("runs before every existing prebuild command without changing dev scripts", () => {
    const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
    expect(packageJson.scripts.prebuild.split(/\s*&&\s*/u)).toEqual([
      "node scripts/restore-env-production-from-head.mjs",
      "node scripts/assert-paddle-production-sandbox.mjs",
      "node scripts/verify-edge-shared-in-sync.mjs",
      "node scripts/check-no-src-lib-imports.mjs",
      "node scripts/stamp-version.mjs",
      "node scripts/verify-publish-provenance.mjs",
    ]);
    expect(packageJson.scripts.dev).toBe("vite dev");
  });

  it("accepts the project's committed production settings without exposing the key", () => {
    const result = runGuard(REPO_ROOT);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(OK);
    expect(result.stderr).toBe("");
  });

  it.each([
    { name: "unquoted", line: `${TOKEN_NAME}=${LIVE_STRIPE_KEY}` },
    { name: "double-quoted", line: `${TOKEN_NAME}="${LIVE_STRIPE_KEY}"` },
  ])("accepts one $name live Stripe key", ({ line }) => {
    const result = runGuard(createEnvRoot([line]));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(OK);
    expect(combinedOutput(result)).not.toContain(LIVE_STRIPE_KEY);
  });

  it.each([
    { name: "Stripe test key", value: TEST_STRIPE_KEY, reason: "canonical_stripe_key_not_live" },
    {
      name: "Paddle live token",
      value: TEST_LIVE_TOKEN,
      reason: "canonical_stripe_key_not_stripe",
    },
    {
      name: "Paddle sandbox token",
      value: TEST_SANDBOX_TOKEN,
      reason: "canonical_stripe_key_not_stripe",
    },
    { name: "garbage value", value: GARBAGE_TOKEN, reason: "canonical_stripe_key_invalid" },
    { name: "too-short live key", value: "pk_live_short", reason: "canonical_stripe_key_invalid" },
    {
      name: "live key with a symbol",
      value: `${LIVE_STRIPE_KEY}-x`,
      reason: "canonical_stripe_key_invalid",
    },
    { name: "empty value", value: "", reason: "canonical_stripe_key_invalid" },
    {
      name: "unclosed quote",
      value: `"${LIVE_STRIPE_KEY}`,
      reason: "canonical_stripe_key_invalid",
    },
  ])("blocks a $name without logging key bytes", ({ value, reason }) => {
    const result = runGuard(createEnvRoot([`${TOKEN_NAME}=${value}`]));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(fail(reason));
    if (value) expect(combinedOutput(result)).not.toContain(value);
  });

  it.each([
    { name: "identical live keys", lines: [LIVE_STRIPE_KEY, LIVE_STRIPE_KEY] },
    { name: "two different live keys", lines: [LIVE_STRIPE_KEY, OTHER_LIVE_STRIPE_KEY] },
    { name: "live plus test key", lines: [LIVE_STRIPE_KEY, TEST_STRIPE_KEY] },
  ])("blocks duplicate assignments: $name", ({ lines }) => {
    const result = runGuard(createEnvRoot(lines.map((v) => `${TOKEN_NAME}=${v}`)));
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(fail("canonical_stripe_key_count_invalid"));
    expect(combinedOutput(result)).not.toContain(LIVE_STRIPE_KEY);
  });

  it("blocks a file with no payments key", () => {
    const result = runGuard(createEnvRoot(["OTHER=1"]));
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(fail("canonical_stripe_key_count_invalid"));
  });

  it("fails closed when the production settings file is missing", () => {
    const result = runGuard(createTemporaryRoot());
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(fail("canonical_payments_env_read_failed"));
  });

  it("bounds the production settings file before parsing it", () => {
    const result = runGuard(createEnvRoot([`${TOKEN_NAME}=pk_live_${"a".repeat(64 * 1024)}`]));
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(fail("canonical_payments_env_too_large"));
  });

  it.each([
    { name: "Stripe test key", value: TEST_STRIPE_KEY, reason: "effective_stripe_key_not_live" },
    {
      name: "different live key",
      value: OTHER_LIVE_STRIPE_KEY,
      reason: "effective_stripe_key_mismatch",
    },
    { name: "Paddle token", value: TEST_LIVE_TOKEN, reason: "effective_stripe_key_not_stripe" },
    { name: "garbage", value: GARBAGE_TOKEN, reason: "effective_stripe_key_invalid" },
  ])("blocks a $name local override of the live key", ({ value, reason }) => {
    const root = createEnvRoot([`${TOKEN_NAME}=${LIVE_STRIPE_KEY}`], [`${TOKEN_NAME}=${value}`]);
    const result = runGuard(root, undefined, "vite:env");
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(fail(reason));
    expect(combinedOutput(result)).not.toContain(LIVE_STRIPE_KEY);
    expect(combinedOutput(result)).not.toContain(value);
  });

  it.each([
    { name: "Stripe test key", value: TEST_STRIPE_KEY, reason: "effective_stripe_key_not_live" },
    { name: "empty", value: "", reason: "effective_stripe_key_invalid" },
  ])("blocks a $name build-environment override", ({ value, reason }) => {
    const result = runGuard(createEnvRoot([`${TOKEN_NAME}=${LIVE_STRIPE_KEY}`]), value);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(fail(reason));
  });

  it("accepts an identical local override and stays quiet with cached Vite debug", () => {
    const root = createEnvRoot(
      [`${TOKEN_NAME}=${LIVE_STRIPE_KEY}`],
      [`${TOKEN_NAME}=${LIVE_STRIPE_KEY}`],
    );
    const result = runGuard(root, undefined, "vite:env", true);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(OK);
    expect(result.stderr).toBe("");
  });
});

describe("Paddle production vs sandbox token resolvers", () => {
  it("keeps sandbox-only rejection while production accepts live_", async () => {
    const core = await import(/* @vite-ignore */ CORE_MODULE_URL);
    const liveLine = `${TOKEN_NAME}=${TEST_LIVE_TOKEN}\n`;
    const sandboxLine = `${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}\n`;
    const garbageLine = `${TOKEN_NAME}=${GARBAGE_TOKEN}\n`;

    expect(core.resolveCanonicalPaddleSandboxToken(liveLine)).toEqual({
      ok: false,
      reason: "canonical_paddle_token_not_sandbox",
    });
    expect(core.resolveCanonicalPaddleProductionToken(liveLine)).toEqual({
      ok: true,
      token: TEST_LIVE_TOKEN,
    });
    expect(core.resolveCanonicalPaddleProductionToken(sandboxLine)).toEqual({
      ok: true,
      token: TEST_SANDBOX_TOKEN,
    });
    expect(core.resolveCanonicalPaddleProductionToken(garbageLine)).toEqual({
      ok: false,
      reason: "canonical_paddle_token_invalid",
    });
    expect(core.resolveCanonicalPaddleSandboxToken(garbageLine)).toEqual({
      ok: false,
      reason: "canonical_paddle_token_not_sandbox",
    });
  });
});
