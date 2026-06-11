/**
 * Static safety scanner for Quick Log RPC runtime harnesses and orchestrator.
 *
 * The runtime harnesses use service_role for seed/verification/teardown only.
 * This scanner protects against drift: no hardcoded secrets, no real tokens,
 * no service_role usage outside scripts/, no device-control commands, no
 * alerts / action_queue / ai_doctor writes initiated from Quick Log RPCs,
 * no automation vocabulary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const FILES = [
  "scripts/run-quicklog-save-event-rls-harness.ts",
  "scripts/run-quicklog-save-manual-rls-harness.ts",
  "scripts/run-quicklog-rpc-rls-harnesses.ts",
];

const sources = FILES.map((rel) => {
  const p = resolve(ROOT, rel);
  return { rel, exists: existsSync(p), src: existsSync(p) ? readFileSync(p, "utf8") : "" };
});

describe("Quick Log RPC harness — files exist", () => {
  for (const f of FILES) {
    it(`${f} exists`, () => {
      expect(sources.find((s) => s.rel === f)?.exists).toBe(true);
    });
  }
});

describe("Quick Log RPC harness — no leaked secrets or tokens", () => {
  // Recognizable secret-shaped tokens that must never appear inline.
  const FORBIDDEN_PATTERNS: { name: string; re: RegExp }[] = [
    { name: "JWT-shaped literal", re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
    { name: "supabase service_role literal label", re: /service_role['"]?\s*:\s*['"][A-Za-z0-9._-]{20,}['"]/i },
    { name: "supabase URL literal", re: /https?:\/\/[a-z0-9-]+\.supabase\.co/i },
    { name: "Bearer token literal", re: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
    { name: "AWS-style key", re: /AKIA[0-9A-Z]{16}/ },
  ];
  for (const { rel, src } of sources) {
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      it(`${rel} contains no ${name}`, () => {
        expect(src).not.toMatch(re);
      });
    }
  }
});

describe("Quick Log RPC harness — service_role boundary", () => {
  it("service_role is only sourced from env (never literal token)", () => {
    for (const { rel, src } of sources) {
      // Strip comments and the env var name itself; anything remaining that
      // mentions service_role would be a literal usage.
      const noComments = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\n)\s*\/\/.*/g, "$1")
        .replace(/(^|\n)\s*\*.*/g, "$1");
      const stripped = noComments.replace(/SUPABASE_SERVICE_ROLE_KEY/g, "");
      expect(
        stripped,
        `${rel} mentions service_role outside env reads`,
      ).not.toMatch(/service[_-]?role/i);
    }
  });
});

describe("Quick Log RPC harness — no device-control / automation / forbidden writes", () => {
  const DEVICE = /\b(actuator|relay|fan_on|light_on_cmd|pump|dose|valve|switch_on|switch_off|device_control|mqtt_publish|home_assistant|pi_bridge)\b/i;
  const AUTOMATION = /\b(autopilot|auto_execute|cron\.schedule|setInterval\s*\(\s*\(\s*\)\s*=>\s*rpc)/i;
  for (const { rel, src } of sources) {
    it(`${rel} contains no device-control vocabulary`, () => {
      expect(src).not.toMatch(DEVICE);
    });
    it(`${rel} contains no automation vocabulary`, () => {
      expect(src).not.toMatch(AUTOMATION);
    });
    it(`${rel} does not write to alerts / action_queue / ai_doctor_sessions`, () => {
      expect(src).not.toMatch(/\.from\(\s*['"]alerts['"]\s*\)\s*\.insert/i);
      expect(src).not.toMatch(
        /\.from\(\s*['"]action_queue['"]\s*\)\s*\.(insert|update|upsert)/i,
      );
      expect(src).not.toMatch(
        /\.from\(\s*['"]ai_doctor_sessions['"]\s*\)\s*\.(insert|update|upsert)/i,
      );
    });
  }
});

describe("Quick Log RPC harness — teardown runs in finally", () => {
  for (const { rel, src } of sources.filter((s) =>
    s.rel.endsWith("rls-harness.ts"),
  )) {
    it(`${rel} wraps teardown in a finally block`, () => {
      expect(src).toMatch(/finally\s*\{\s*[\s\S]{0,200}teardown\s*\(/);
    });
  }
});

describe("Quick Log RPC orchestrator — CI-safe skip behavior", () => {
  const orch = sources.find((s) =>
    s.rel.endsWith("run-quicklog-rpc-rls-harnesses.ts"),
  )!;
  it("checks for required env before running", () => {
    expect(orch.src).toMatch(/SUPABASE_URL/);
    expect(orch.src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(orch.src).toMatch(
      /SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY|VITE_SUPABASE_ANON_KEY/,
    );
  });
  it("prints SKIP and exits 0 when env missing", () => {
    expect(orch.src).toMatch(/SKIP[\s\S]{0,200}process\.exit\(0\)/);
  });
  it("fails non-zero when a harness fails", () => {
    expect(orch.src).toMatch(/process\.exit\(failed\s*\?\s*1\s*:\s*0\)/);
  });
});

describe("Quick Log RPC scripts — wired into package.json", () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  it("exposes test:db:quicklog-rpc-static", () => {
    expect(pkg.scripts?.["test:db:quicklog-rpc-static"]).toBeTruthy();
  });
  it("exposes test:db:quicklog-rpc-runtime", () => {
    expect(pkg.scripts?.["test:db:quicklog-rpc-runtime"]).toBeTruthy();
  });
  it("exposes test:db:quicklog-rpc combining both", () => {
    const cmd = pkg.scripts?.["test:db:quicklog-rpc"] ?? "";
    expect(cmd).toContain("test:db:quicklog-rpc-static");
    expect(cmd).toContain("test:db:quicklog-rpc-runtime");
  });
});
