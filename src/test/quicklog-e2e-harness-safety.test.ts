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
// Scanner guardrail: 30s per-file timeout + slow-test telemetry so the
// recursive e2e/ + src/ scans below do not flake under sharded
// validation load.
import { installScannerGuardrail } from "./support/scannerGuardrailHarness";
import { scrubExecutableSource } from "./utils/scrubExecutableSource";

installScannerGuardrail({ file: __filename });

const E2E_DIR = path.resolve(__dirname, "../../e2e");

type ScannedFile = { file: string; body: string; scrubbed: string };

function readAll(): ScannedFile[] {
  const out: ScannedFile[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".auth" || entry.name === "test-results" || entry.name === "results")
          continue;
        walk(p);
        continue;
      }
      if (/\.(ts|tsx|md)$/.test(entry.name)) {
        const body = fs.readFileSync(p, "utf8");
        // Only .ts/.tsx are executable; .md gets no scrub (kept verbatim
        // but never scanned by the identifier-usage checks below).
        const scrubbed = /\.(ts|tsx)$/.test(entry.name)
          ? scrubExecutableSource(body)
          : body;
        out.push({ file: p, body, scrubbed });
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
      if (!/\.(ts|tsx)$/.test(file)) continue;
      expect(body, `${file} must not reference service_role`).not.toMatch(/service_role/i);
      expect(body, `${file} must not hardcode passwords`).not.toMatch(
        /password\s*[:=]\s*["'][^"']+["']/i,
      );
      expect(body, `${file} must not embed bearer tokens`).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    }
  });

  it("does not touch action_queue, functions.invoke, or mini-charts", () => {
    for (const { file, body } of files) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      // Auth route-protection specs legitimately list action_queue as a
      // private table they guard against — exempt them from this check.
      if (/auth-route-protection/.test(file)) continue;
      // Demo Proof Walkthrough read-only guard spec enumerates action_queue
      // and functions.invoke in its FORBIDDEN list to ASSERT the walkthrough
      // page never calls them. The spec issues no such calls itself.
      if (/demo-proof-walkthrough-readonly/.test(file)) continue;
      // Same class: the never-healthy proof spec's FORBIDDEN_PATH_FRAGMENTS
      // denylist names /rest/v1/action_queue and /functions/v1/ to BLOCK any
      // such request on /one-tent-loop-proof. The spec issues no such calls.
      if (/one-tent-loop-proof-never-healthy/.test(file)) continue;
      expect(body, `${file} must not call action_queue`).not.toMatch(/action_queue/);
      expect(body, `${file} must not call functions.invoke`).not.toMatch(/functions\.invoke/);
      expect(body, `${file} must not import mini-chart UI`).not.toMatch(/MiniChart|mini-chart/);
    }
  });

  it("does not rely on localStorage attach persistence", () => {
    for (const { file, body } of files) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
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
