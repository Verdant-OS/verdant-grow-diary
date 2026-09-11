import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";
const TEST_SANDBOX_TOKEN = "test_sandboxfixture";
const OTHER_SANDBOX_TOKEN = "test_sandboxfixture_other";
const TEST_LIVE_TOKEN = "live_livefixture";
const OTHER_LIVE_TOKEN = "live_livefixture_other";
const GARBAGE_TOKEN = "pk_not_a_paddle_client_token";
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

describe("Paddle production prebuild guard", () => {
  it("does not expose a reentrant process-global verifier API", async () => {
    const guardModule = await import(/* @vite-ignore */ GUARD_MODULE_URL);

    expect(Object.keys(guardModule)).toEqual([]);
  });

  it("classifies the canonical file with the production resolver, not the sandbox resolver", () => {
    // The CLI module exports nothing, so the forbidden sandbox import cannot
    // be asserted via resolved bindings. Presence/absence of the import names
    // is the gate's wiring contract; live_ acceptance tests cover behavior.
    const source = readFileSync(GUARD_SCRIPT, "utf8");

    expect(source).toContain("resolveCanonicalPaddleProductionToken");
    expect(source).not.toContain("resolveCanonicalPaddleSandboxToken");
  });

  it("runs before every existing prebuild command without changing dev scripts", () => {
    const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
    const prebuildCommands = packageJson.scripts.prebuild.split(/\s*&&\s*/u);

    expect(prebuildCommands).toEqual([
      "node scripts/restore-env-production-from-head.mjs",
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
    expect(result.stdout).toBe("[paddle-production-policy] production client token verified.\n");
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
    expect(result.stdout).toBe("[paddle-production-policy] production client token verified.\n");
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
  });

  it("accepts a canonical live client token without exposing its bytes", () => {
    const root = createEnvRoot([`${TOKEN_NAME}=${TEST_LIVE_TOKEN}`]);
    const result = runGuard(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[paddle-production-policy] production client token verified.\n");
    expect(result.stderr).toBe("");
    expect(combinedOutput(result)).not.toContain(TEST_LIVE_TOKEN);
  });

  it("accepts an identical mode-local live value", () => {
    const root = createEnvRoot(
      [`${TOKEN_NAME}=${TEST_LIVE_TOKEN}`],
      [`${TOKEN_NAME}=${TEST_LIVE_TOKEN}`],
    );
    const result = runGuard(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[paddle-production-policy] production client token verified.\n");
    expect(combinedOutput(result)).not.toContain(TEST_LIVE_TOKEN);
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

  it.each([
    {
      name: "garbage",
      line: `${TOKEN_NAME}=${GARBAGE_TOKEN}`,
      reason: "canonical_paddle_token_invalid",
    },
    { name: "empty", line: `${TOKEN_NAME}=`, reason: "canonical_paddle_token_invalid" },
    {
      name: "unquoted-broken",
      line: `${TOKEN_NAME}="unclosed`,
      reason: "canonical_paddle_token_invalid",
    },
  ])(
    "rejects a $name canonical token without logging credential bytes",
    ({ line, reason, name }) => {
      const root = createEnvRoot([line]);
      const result = runGuard(root);

      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`[paddle-production-policy] ${reason}\n`);
      expect(result.stdout).toBe("");
      if (name === "garbage") expect(combinedOutput(result)).not.toContain(GARBAGE_TOKEN);
    },
  );

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
      name: "live mode-local override of sandbox",
      localToken: TEST_LIVE_TOKEN,
      expectedReason: "effective_paddle_token_mismatch",
    },
    {
      name: "different sandbox mode-local override",
      localToken: OTHER_SANDBOX_TOKEN,
      expectedReason: "effective_paddle_token_mismatch",
    },
    {
      name: "different live mode-local override",
      canonical: TEST_LIVE_TOKEN,
      localToken: OTHER_LIVE_TOKEN,
      expectedReason: "effective_paddle_token_mismatch",
    },
    {
      name: "garbage mode-local override",
      localToken: GARBAGE_TOKEN,
      expectedReason: "effective_paddle_token_invalid",
    },
  ])(
    "rejects a $name without logging credential bytes",
    ({ localToken, expectedReason, canonical = TEST_SANDBOX_TOKEN }) => {
      const root = createEnvRoot([`${TOKEN_NAME}=${canonical}`], [`${TOKEN_NAME}=${localToken}`]);
      const result = runGuard(root, undefined, "vite:env");

      expect(result.status).toBe(1);
      expect(result.stderr).toBe(`[paddle-production-policy] ${expectedReason}\n`);
      expect(result.stdout).toBe("");
      expect(combinedOutput(result)).not.toContain(canonical);
      expect(combinedOutput(result)).not.toContain(localToken);
    },
  );

  it.each([
    { name: "live", token: TEST_LIVE_TOKEN, reason: "effective_paddle_token_mismatch" },
    { name: "empty", token: "", reason: "effective_paddle_token_invalid" },
    {
      name: "different sandbox",
      token: OTHER_SANDBOX_TOKEN,
      reason: "effective_paddle_token_mismatch",
    },
    { name: "garbage", token: GARBAGE_TOKEN, reason: "effective_paddle_token_invalid" },
  ])("rejects a $name ambient build override", ({ token, reason }) => {
    const root = createEnvRoot([`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`]);
    const result = runGuard(root, token);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe(`[paddle-production-policy] ${reason}\n`);
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
    if (token) expect(combinedOutput(result)).not.toContain(token);
  });

  it("suppresses cached Vite debug output during effective resolution", () => {
    const root = createEnvRoot([`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`]);
    const result = runGuard(root, undefined, "vite:env", true);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("[paddle-production-policy] production client token verified.\n");
    expect(result.stderr).toBe("");
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
  });

  it("keeps both canonical and override bytes private with cached Vite", () => {
    const root = createEnvRoot(
      [`${TOKEN_NAME}=${TEST_SANDBOX_TOKEN}`],
      [`${TOKEN_NAME}=${OTHER_SANDBOX_TOKEN}`],
    );
    const result = runGuard(root, undefined, "vite:env", true);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("[paddle-production-policy] effective_paddle_token_mismatch\n");
    expect(combinedOutput(result)).not.toContain(TEST_SANDBOX_TOKEN);
    expect(combinedOutput(result)).not.toContain(OTHER_SANDBOX_TOKEN);
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
