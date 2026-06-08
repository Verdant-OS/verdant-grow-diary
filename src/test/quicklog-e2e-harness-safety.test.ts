/**
 * Guardrails for the Playwright Quick Log smoke harness.
 *
 * The harness must never:
 *   - bypass auth
 *   - hardcode credentials
 *   - use service_role
 *   - call functions.invoke
 *   - write to action_queue
 *   - inject fake live sensor data
 *   - rely on localStorage attach persistence
 *   - introduce mini-chart UI
 *   - ship an auto-login route visible in production
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const E2E_DIR = path.resolve(__dirname, "../../e2e");

function readAll(): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".auth" || entry.name === "test-results") continue;
        walk(p);
        continue;
      }
      if (/\.(ts|tsx|md)$/.test(entry.name)) {
        out.push({ file: p, body: fs.readFileSync(p, "utf8") });
      }
    }
  };
  if (fs.existsSync(E2E_DIR)) walk(E2E_DIR);
  return out;
}

describe("Quick Log Playwright harness safety", () => {
  const files = readAll();

  it("e2e directory exists with the smoke spec", () => {
    const names = files.map((f) => path.basename(f.file));
    expect(names).toContain("quicklog-smoke.spec.ts");
    expect(names).toContain("auth.setup.ts");
    expect(names).toContain("smokeChecklistReporter.ts");
  });

  it("contains no hardcoded credentials or service_role usage", () => {
    for (const { file, body } of files) {
      expect(body, `${file} must not reference service_role`).not.toMatch(
        /service_role/i,
      );
      expect(body, `${file} must not hardcode passwords`).not.toMatch(
        /password\s*[:=]\s*["'][^"']+["']/i,
      );
      expect(body, `${file} must not embed bearer tokens`).not.toMatch(
        /eyJ[A-Za-z0-9_-]{20,}\./,
      );
    }
  });

  it("does not touch action_queue, functions.invoke, or mini-charts", () => {
    for (const { file, body } of files) {
      expect(body, `${file} must not call action_queue`).not.toMatch(/action_queue/);
      expect(body, `${file} must not call functions.invoke`).not.toMatch(
        /functions\.invoke/,
      );
      expect(body, `${file} must not import mini-chart UI`).not.toMatch(
        /MiniChart|mini-chart/,
      );
    }
  });

  it("does not rely on localStorage attach persistence", () => {
    for (const { file, body } of files) {
      expect(body, `${file} must not toggle attach via localStorage`).not.toMatch(
        /localStorage[\s\S]{0,40}attach/i,
      );
    }
  });

  it("does not introduce an auth-bypass or auto-login route", () => {
    for (const { file, body } of files) {
      if (!/\.(ts|tsx)$/.test(file)) continue; // docs may discuss the rule
      expect(body, `${file} must not implement an auth bypass`).not.toMatch(
        /skipAuth\s*=\s*true|bypassAuth\(|AUTH_BYPASS\s*=/,
      );
    }
    // App source: no /dev-login or bypass route in src/
    const srcRoot = path.resolve(__dirname, "..");
    const rxFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name === "test" || e.name === "node_modules") continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name)) rxFiles.push(p);
      }
    };
    walk(srcRoot);
    for (const f of rxFiles) {
      const body = fs.readFileSync(f, "utf8");
      expect(body, `${f} must not register an auth-bypass route`).not.toMatch(
        /\/dev-login|\/auth-bypass|skipAuth\s*=\s*true/,
      );
    }
  });
});
