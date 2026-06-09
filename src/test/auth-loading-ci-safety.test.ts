// CI surface guardrails for the mocked auth-loading Playwright workflow.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const WF_PATH = ".github/workflows/auth-loading-smoke.yml";
const SPEC_PATH = "e2e/auth-loading.spec.ts";
const REDIRECT_SPEC_PATH = "e2e/auth-redirect-safety.spec.ts";
const wf = fs.readFileSync(path.join(ROOT, WF_PATH), "utf8");
const spec = fs.readFileSync(path.join(ROOT, SPEC_PATH), "utf8");
const redirectSpec = fs.readFileSync(path.join(ROOT, REDIRECT_SPEC_PATH), "utf8");

describe("Auth loading smoke workflow — safety", () => {
  it("uses pull_request (NOT pull_request_target)", () => {
    expect(wf).toMatch(/^\s*pull_request\s*:/m);
    expect(wf).not.toMatch(/pull_request_target/);
  });
  it("has no schedule/cron trigger", () => {
    expect(wf).not.toMatch(/^\s*schedule\s*:/m);
    expect(wf).not.toMatch(/-\s*cron\s*:/);
  });
  it("does not reference any GitHub secrets", () => {
    expect(wf).not.toMatch(/\$\{\{\s*secrets\./);
  });
  it("does not contain service_role anywhere", () => {
    expect(wf).not.toMatch(/service_role/i);
  });
  it("targets the verdant-grow-diary branch only", () => {
    expect(wf).toMatch(/branches:\s*\[verdant-grow-diary\]/);
  });
  it("runs only the mocked auth-loading + redirect-safety + desktop specs", () => {
    expect(wf).toMatch(/playwright test e2e\/auth-loading\.spec\.ts/);
    expect(wf).toMatch(/e2e\/auth-redirect-safety\.spec\.ts/);
    expect(wf).toMatch(/e2e\/auth-desktop\.spec\.ts/);
    expect(wf).not.toMatch(/quicklog-smoke\.spec\.ts/);
    expect(wf).not.toMatch(/fixture-bootstrap\.spec\.ts/);
  });
  it("installs Chromium only", () => {
    expect(wf).toMatch(/playwright install chromium/);
    expect(wf).not.toMatch(/playwright install (?!chromium)/);
  });
  it("uploads both auth-loading artifacts", () => {
    expect(wf).toMatch(/name:\s*auth-loading-playwright-report/);
    expect(wf).toMatch(/name:\s*auth-loading-test-results/);
  });
  it("summary declares mocked/non-destructive", () => {
    expect(wf).toMatch(/mocked.*non-destructive|non-destructive.*mocked/i);
    expect(wf).toMatch(/no real accounts created/i);
    expect(wf).toMatch(/no real reset emails sent/i);
    expect(wf).toMatch(/no real grow data touched/i);
  });
});

describe("Auth loading smoke spec — safety", () => {
  it("intercepts /auth/v1/** via page.route", () => {
    expect(spec).toMatch(/page\.route\(\s*\/\\\/auth\\\/v1\\\//);
  });
  it("does not import real credentials or use process.env auth secrets", () => {
    expect(spec).not.toMatch(/process\.env\.(E2E_TEST_PASSWORD|E2E_TEST_EMAIL|SUPABASE_SERVICE_ROLE)/);
    expect(spec).not.toMatch(/service_role/i);
  });
  it("uses a .invalid email so accidental real submissions cannot resolve DNS", () => {
    expect(spec).toMatch(/@example\.invalid/);
  });
  it("never logs password/token/session/recovery/email", () => {
    expect(spec).not.toMatch(
      /console\.(log|warn|error|info|debug)\s*\([^)]*\b(password|token|session|recovery|email|hash)\b/i,
    );
  });
});

describe("Auth redirect-safety spec — safety", () => {
  it("intercepts /auth/v1/** via page.route", () => {
    expect(redirectSpec).toMatch(/page\.route\(/);
    expect(redirectSpec).toMatch(/\/auth\\\/v1\\\//);
  });
  it("uses a .invalid email so accidental real submissions cannot resolve DNS", () => {
    expect(redirectSpec).toMatch(/@example\.invalid/);
  });
  it("does not use service_role or real auth secrets", () => {
    expect(redirectSpec).not.toMatch(/service_role/i);
    expect(redirectSpec).not.toMatch(
      /process\.env\.(E2E_TEST_PASSWORD|E2E_TEST_EMAIL|SUPABASE_SERVICE_ROLE)/,
    );
  });
  it("never logs password/token/session/recovery/email", () => {
    expect(redirectSpec).not.toMatch(
      /console\.(log|warn|error|info|debug)\s*\([^)]*\b(password|token|session|recovery|email|hash)\b/i,
    );
  });
  it("asserts app origin is preserved (no open redirect)", () => {
    expect(redirectSpec).toMatch(/baseURL/);
    expect(redirectSpec).toMatch(/evil\.example/);
  });
});
