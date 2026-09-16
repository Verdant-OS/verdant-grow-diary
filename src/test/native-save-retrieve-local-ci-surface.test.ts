/**
 * CI surface guardrails for the native save/retrieve local browser lane.
 *
 * Ensures the opt-in workflow stays on the disposable loopback stack, never
 * publishes secrets or auth artifacts, requires three executed scenarios, and
 * keeps Playwright trace capture disabled for temporary real sessions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readWorkflowYamlScalar } from "./helpers/yamlScalarText";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n?/g, "\n");

const NATIVE_ENV_KEYS = [
  "NATIVE_LOCAL_BROWSER",
  "NATIVE_LOCAL_UI_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NATIVE_LOCAL_FIXTURE_PASSWORD",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

const VALID_NATIVE_ENV = {
  NATIVE_LOCAL_BROWSER: "1",
  NATIVE_LOCAL_UI_URL: "http://127.0.0.1:5173",
  SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "native-local-anon-key-for-config-import",
  SUPABASE_SERVICE_ROLE_KEY: "native-local-service-role-key-distinct",
  NATIVE_LOCAL_FIXTURE_PASSWORD: "Native-local-fixture-password-24chars!",
  VITE_SUPABASE_PUBLISHABLE_KEY: "native-local-anon-key-for-config-import",
} as const;

let savedEnv: Partial<Record<(typeof NATIVE_ENV_KEYS)[number], string | undefined>> = {};

async function loadNativeLocalConfig() {
  vi.resetModules();
  const mod = await import("../../playwright.native-local.config");
  return mod.default as {
    testDir: string;
    testMatch: string | RegExp;
    fullyParallel: boolean;
    workers: number;
    retries: number;
    use: { trace: string; baseURL: string; serviceWorkers: string };
    webServer: { env: Record<string, string> };
  };
}

beforeEach(() => {
  savedEnv = {};
  for (const key of NATIVE_ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of NATIVE_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(VALID_NATIVE_ENV)) {
    process.env[key] = value;
  }
});

afterEach(() => {
  vi.resetModules();
  for (const key of NATIVE_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key]!;
  }
});

describe("Native save/retrieve local CI surface", () => {
  it("workflow targets verdant-grow-diary and main on pull_request only", () => {
    const wf = read(".github/workflows/native-save-retrieve-local.yml");
    expect(wf).toMatch(/pull_request:\s*\n\s*branches:\s*\[main,\s*verdant-grow-diary\]/);
    expect(wf).toMatch(/workflow_dispatch/);
    expect(wf).not.toMatch(/pull_request_target/);
    expect(wf).not.toMatch(/schedule\s*:/);
  });

  it("workflow gates on ENABLE_DB_SECURITY_LANE for pull_request contexts", () => {
    const wf = read(".github/workflows/native-save-retrieve-local.yml");
    expect(wf).toMatch(/vars\.ENABLE_DB_SECURITY_LANE\s*==\s*'true'/);
  });

  it("workflow pins the loopback boundary and masks fixture credentials", () => {
    const wf = read(".github/workflows/native-save-retrieve-local.yml");
    expect(wf).toContain("NATIVE_LOCAL_UI_URL: http://127.0.0.1:5173");
    expect(wf).toMatch(/API_URL.*127\.0\.0\.1:54321/);
    expect(wf).toMatch(/::add-mask::/);
    expect(wf).toMatch(/FIXTURE_PASSWORD=/);
    expect(wf).not.toMatch(/password\s*:\s*["'][^"'$]+["']/i);
    expect(wf).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
  });

  it("workflow uploads reduced evidence only and excludes raw Playwright reports", () => {
    const wf = read(".github/workflows/native-save-retrieve-local.yml");
    const uploadMatch = wf.match(
      /-\s*name:\s*Upload browser evidence[\s\S]*?(?=\n {6}- name:|\n*$)/,
    );
    expect(uploadMatch, "missing upload step").toBeTruthy();
    const pathBlock = readWorkflowYamlScalar(uploadMatch![0], "path");
    expect(pathBlock).toContain("native-local-proof.json");
    expect(pathBlock).toContain("native-replay-report.json");
    expect(pathBlock).not.toContain("native-local-results/report.json");
    expect(pathBlock).not.toMatch(/stdout|stderr|step-logs/);
  });

  it("workflow requires three executed passing scenarios with zero skips", () => {
    const wf = read(".github/workflows/native-save-retrieve-local.yml");
    expect(wf).toMatch(/expected\s*<\s*3/);
    expect(wf).toMatch(/unexpected\s*!==\s*0/);
    expect(wf).toMatch(/skipped\s*!==\s*0/);
    expect(wf).toMatch(/three executed passing scenarios/);
  });

  it("playwright.native-local.config stays single-worker, no retries, trace off", async () => {
    const cfg = await loadNativeLocalConfig();
    expect(cfg.testDir).toBe("./e2e-local");
    expect(String(cfg.testMatch)).toContain("native-save-retrieve.spec.ts");
    expect(cfg.fullyParallel).toBe(false);
    expect(cfg.workers).toBe(1);
    expect(cfg.retries).toBe(0);
    expect(cfg.use.trace).toBe("off");
    expect(cfg.use.baseURL).toBe("http://127.0.0.1:5173");
    expect(cfg.use.serviceWorkers).toBe("block");
  });

  it("playwright webServer env strips admin credentials from the app process", async () => {
    const cfg = await loadNativeLocalConfig();
    expect(cfg.webServer.env.SUPABASE_SERVICE_ROLE_KEY).toBe("");
    expect(cfg.webServer.env.SUPABASE_ANON_KEY).toBe("");
    expect(cfg.webServer.env.NATIVE_LOCAL_FIXTURE_PASSWORD).toBe("");
    expect(cfg.webServer.env.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(cfg.webServer.env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(
      VALID_NATIVE_ENV.SUPABASE_ANON_KEY,
    );
  });

  it("native spec avoids auth bypass; fixtures keep privileged access to setup/cleanup only", () => {
    const spec = read("e2e-local/native-save-retrieve.spec.ts");
    const fixtures = read("e2e-local/lib/nativeLocalFixtures.ts");
    expect(spec).not.toMatch(/storageState|skipAuth|bypassAuth|AUTH_BYPASS|service_role/i);
    expect(fixtures).not.toMatch(/storageState|skipAuth|bypassAuth|AUTH_BYPASS/i);
    expect(fixtures).toMatch(/Privileged access is[\s\S]*setup\/cleanup/);
    expect(fixtures).toMatch(/Authenticated anon-key\/JWT readback/);
    expect(spec).toMatch(/waitForResponse/);
    expect(spec).toMatch(/acceptedReceipt/);
    expect(fixtures).toMatch(/Blocked non-local fixture request/);
  });

  it("native spec defines exactly three acceptance scenarios", () => {
    const spec = read("e2e-local/native-save-retrieve.spec.ts");
    const titles = [...spec.matchAll(/^test\("([^"]+)"/gm)].map((match) => match[1]);
    expect(titles).toHaveLength(3);
    expect(titles.join("\n")).toMatch(/plant and tent Notes/i);
    expect(titles.join("\n")).toMatch(/lost reply/i);
    expect(titles.join("\n")).toMatch(/dated rows retain manual provenance/i);
  });
});
