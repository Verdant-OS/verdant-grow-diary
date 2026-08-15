/**
 * Production isolation fence for VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE.
 *
 * Absence proofs (SDK import, spike mount, cloud-agent config, deploy steps)
 * scan source. Effective configuration is asserted from parsed manifests and
 * the imported root vitest include is intentionally not used here: importing
 * vitest.config under the shared jsdom setup trips esbuild's TextEncoder
 * invariant.
 *
 * @source-scan-justified: this fence guards package.json, bun.lock, workflow
 * YAML, and production source trees for forbidden SDK presence. Those are
 * absence/forbidden-surface proofs, not effective Playwright/Vitest runtime
 * settings. Nested spike vitest environment is asserted in the nested package
 * by importing vitest.config.ts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SPIKE_DIR = ["spikes", "cursor-sdk-local-orchestration"].join("/");
const SDK_NAME = ["@", "cursor", "/", "sdk"].join("");
const FENCE_FILE = join("src", "test", "cursor-sdk-production-isolation-fence.test.ts");
const WORKFLOW_FILE = join(
  ".github",
  "workflows",
  "cursor-sdk-local-orchestration.yml",
);
const EXAMPLE_RECEIPT = join(
  SPIKE_DIR,
  "artifacts",
  "local-orchestration-proof.example.json",
);

const PRODUCTION_ROOTS = ["src", "scripts", "supabase/functions"] as const;
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts"]);
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "coverage", ".git"]);

const FORBIDDEN_RECEIPT_KEYS = [
  "key",
  "token",
  "prompt",
  "checkpoint",
  "agentId",
  "runId",
  "requestId",
  "apiKey",
  "CURSOR_API_KEY",
] as const;

const DEPLOY_COMMANDS = [
  "vercel deploy",
  "supabase functions deploy",
  "netlify deploy",
  "wrangler deploy",
  "gh pr create",
  "gh pr merge",
  "cursor agent",
] as const;

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  scripts?: Record<string, string>;
};

function readText(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function readJson<T>(relPath: string): T {
  return JSON.parse(readText(relPath)) as T;
}

function walkFiles(relDir: string): string[] {
  const abs = join(ROOT, relDir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const stack = [abs];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR_NAMES.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (CODE_EXTENSIONS.has(extname(name))) out.push(full);
    }
  }
  return out.sort();
}

function stripSourceComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function dependencyGroups(manifest: Manifest): Record<string, string> {
  return {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  };
}

function aliasHidesSdk(spec: string): boolean {
  return (
    spec.includes(SDK_NAME) ||
    spec.startsWith("npm:@cursor/") ||
    /npm:@cursor\/sdk/.test(spec)
  );
}

function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      acc.push(key);
      collectKeys(nested, acc);
    }
  }
  return acc;
}

describe("cursor SDK production isolation fence", () => {
  const manifest = readJson<Manifest>("package.json");

  it("keeps the SDK out of every root dependency group", () => {
    const deps = dependencyGroups(manifest);
    expect(Object.keys(deps)).not.toContain(SDK_NAME);
    for (const [name, spec] of Object.entries(deps)) {
      expect(aliasHidesSdk(spec), `${name}=${spec}`).toBe(false);
    }
    const overrides = manifest.overrides ?? {};
    expect(Object.keys(overrides)).not.toContain(SDK_NAME);
    for (const [name, spec] of Object.entries(overrides)) {
      if (typeof spec === "string") {
        expect(aliasHidesSdk(spec), `override ${name}`).toBe(false);
      }
    }
  });

  it("does not hide the SDK in the root bun.lock", () => {
    const lock = readText("bun.lock");
    expect(lock).not.toContain(`"${SDK_NAME}"`);
    expect(lock).not.toContain(`${SDK_NAME}@`);
  });

  it("exposes only a nested validate script and never a live Cursor API script", () => {
    const script = manifest.scripts?.["test:cursor-sdk-local-orchestration"];
    expect(script).toBe(`bun run --cwd=${SPIKE_DIR} validate`);
    const allScripts = Object.values(manifest.scripts ?? {}).join("\n");
    expect(allScripts).not.toContain("proof:manual");
    expect(allScripts).not.toContain("CURSOR_API_KEY");
  });

  it("forbids production source from importing the SDK, URL SDK, or the spike", () => {
    const sdkFrom = new RegExp(
      String.raw`(?:from|import\()\s*['"][^'"\n]*${SDK_NAME.replace("/", "\\/")}[^'"\n]*['"]`,
    );
    const urlSdk = /['"]https?:\/\/[^'"\n]*cursor\/sdk[^'"\n]*['"]/;
    const spikeImport = new RegExp(
      String.raw`(?:from|import\()\s*['"][^'"\n]*${SPIKE_DIR}[^'"\n]*['"]`,
    );
    const resumeCall = ["Agent", "resume("].join(".");
    const loginCall = ["Cursor", "auth", "login("].join(".");
    for (const root of PRODUCTION_ROOTS) {
      for (const file of walkFiles(root)) {
        const rel = relative(ROOT, file).replaceAll("\\", "/");
        if (rel === FENCE_FILE.replaceAll("\\", "/")) continue;
        const stripped = stripSourceComments(readFileSync(file, "utf8"));
        expect(stripped, rel).not.toMatch(sdkFrom);
        expect(stripped, rel).not.toMatch(urlSdk);
        expect(stripped, rel).not.toMatch(spikeImport);
        expect(stripped, rel).not.toContain(resumeCall);
        expect(stripped, rel).not.toContain(loginCall);
        expect(stripped, rel).not.toContain("autoCreatePR");
        expect(stripped, rel).not.toContain("workOnCurrentBranch");
      }
    }
  });

  it("does not mount the spike as an application route", () => {
    const routerFiles = ["src/router.tsx", "src/routeTree.gen.ts"].filter((rel) =>
      existsSync(join(ROOT, rel)),
    );
    expect(routerFiles.length).toBeGreaterThan(0);
    for (const rel of routerFiles) {
      const source = readText(rel);
      expect(source).not.toContain(SPIKE_DIR);
      expect(source).not.toContain("cursor-sdk-local-orchestration");
    }
  });

  it("keeps the dedicated workflow static, secretless, and undeploying", () => {
    expect(existsSync(join(ROOT, WORKFLOW_FILE))).toBe(true);
    const workflow = readText(WORKFLOW_FILE);
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("CURSOR_API_KEY");
    expect(workflow).not.toContain("secrets.");
    expect(workflow).not.toContain("proof:manual");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain(SPIKE_DIR);
    expect(workflow).toContain("src/**");
    expect(workflow).toContain("scripts/**");
    expect(workflow).toContain("supabase/functions/**");
    expect(workflow).toContain("package.json");
    expect(workflow).toContain("bun.lock");
    expect(workflow).toContain(FENCE_FILE);
    for (const command of DEPLOY_COMMANDS) {
      expect(workflow, command).not.toContain(command);
    }
  });

  it("keeps the committed example receipt free of raw secrets and identifiers", () => {
    const receipt = readJson<Record<string, unknown>>(EXAMPLE_RECEIPT);
    const keys = collectKeys(receipt);
    for (const forbidden of FORBIDDEN_RECEIPT_KEYS) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain("sk_test_");
    expect(serialized).not.toMatch(/CURSOR_API_KEY\s*=/);
    expect(receipt.liveProofStatus).toBe("BLOCKED");
    expect(receipt.preRunSpendControl).toBe("BLOCKED");
    expect(String(receipt.syntheticDataDeclaration).toLowerCase()).toContain("synthetic");
  });
});
