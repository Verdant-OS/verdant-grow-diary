/**
 * Static safety scanner for the irrigation evidence runtime RLS harness.
 *
 * The harness uses service_role for seed/verification/teardown only. This
 * scanner protects against drift: the harness must refuse the Verdant
 * production project ref, gate behind an explicit opt-in, guard the local lane
 * to loopback, tear down in a finally block, and carry no device-control /
 * automation / forbidden-write surface or leaked secrets. It must be wired as a
 * dedicated opt-in package command and must NOT be folded into the documented
 * test:security-db-local lane (that lane stays a baseline, not a blocker).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const HARNESS = "scripts/run-irrigation-evidence-rls-harness.ts";
const harnessPath = resolve(ROOT, HARNESS);
const src = existsSync(harnessPath) ? readFileSync(harnessPath, "utf8") : "";
const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

describe("irrigation evidence RLS harness — file exists", () => {
  it(`${HARNESS} exists`, () => {
    expect(existsSync(harnessPath)).toBe(true);
  });
});

describe("irrigation evidence RLS harness — production is always refused", () => {
  it("pins the Verdant production project ref as a refused constant", () => {
    expect(src).toContain(PRODUCTION_PROJECT_REF);
    expect(src).toMatch(/refusing Verdant production database/i);
    // The refusal covers the bare ref and any subdomain of it.
    expect(src).toMatch(/hostname === PRODUCTION_PROJECT_REF/);
    expect(src).toMatch(/startsWith\(`\$\{PRODUCTION_PROJECT_REF\}\./);
  });

  it("only reaches a remote database with an explicit, ref-matched acknowledgement", () => {
    expect(src).toMatch(/ALLOW_REMOTE/);
    expect(src).toMatch(/EXPECTED_PROJECT_REF/);
    expect(src).toMatch(/refusing unverified remote database/i);
    // A remote ref that equals production can never be confirmed.
    expect(src).toMatch(/expectedRemoteRef !== PRODUCTION_PROJECT_REF/);
  });

  it("guards the local security lane to loopback only", () => {
    expect(src).toMatch(/localHost/);
    expect(src).toMatch(/127\.0\.0\.1/);
    expect(src).toMatch(/local security lane requires a loopback database/i);
  });
});

describe("irrigation evidence RLS harness — opt-in, no-op by default", () => {
  it("defaults to SKIP + exit 0 unless explicitly enabled", () => {
    expect(src).toMatch(/IRRIGATION_EVIDENCE_RLS_HARNESS/);
    expect(src).toMatch(/--confirm-local-security-lane/);
    expect(src).toMatch(/SKIP[\s\S]{0,200}process\.exit\(0\)/);
  });

  it("requires the full disposable-database env before running", () => {
    expect(src).toMatch(/SUPABASE_URL/);
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).toMatch(/SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY|VITE_SUPABASE_ANON_KEY/);
  });
});

describe("irrigation evidence RLS harness — no leaked secrets or tokens", () => {
  const FORBIDDEN_PATTERNS: { name: string; re: RegExp }[] = [
    {
      name: "JWT-shaped literal",
      re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
    },
    {
      name: "supabase service_role literal label",
      re: /service_role['"]?\s*:\s*['"][A-Za-z0-9._-]{20,}['"]/i,
    },
    { name: "supabase URL literal", re: /https?:\/\/[a-z0-9-]+\.supabase\.co/i },
    { name: "Bearer token literal", re: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
    { name: "AWS-style key", re: /AKIA[0-9A-Z]{16}/ },
  ];
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    it(`contains no ${name}`, () => {
      expect(src).not.toMatch(re);
    });
  }
});

describe("irrigation evidence RLS harness — service_role boundary", () => {
  it("service_role is only sourced from env (never a literal token)", () => {
    const noComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/.*/g, "$1")
      .replace(/(^|\n)\s*\*.*/g, "$1");
    const stripped = noComments.replace(/SUPABASE_SERVICE_ROLE_KEY/g, "");
    expect(stripped).not.toMatch(/service[_-]?role/i);
  });
});

describe("irrigation evidence RLS harness — no device-control / automation / forbidden writes", () => {
  const DEVICE =
    /\b(actuator|relay|fan_on|light_on_cmd|pump|dose|valve|switch_on|switch_off|device_control|mqtt_publish|home_assistant|pi_bridge)\b/i;
  const AUTOMATION =
    /\b(autopilot|auto_execute|cron\.schedule|setInterval\s*\(\s*\(\s*\)\s*=>\s*rpc)/i;
  it("contains no device-control vocabulary", () => {
    expect(src).not.toMatch(DEVICE);
  });
  it("contains no automation vocabulary", () => {
    expect(src).not.toMatch(AUTOMATION);
  });
  it("does not write to alerts / action_queue / ai_doctor_sessions", () => {
    expect(src).not.toMatch(/\.from\(\s*['"]alerts['"]\s*\)\s*\.insert/i);
    expect(src).not.toMatch(/\.from\(\s*['"]action_queue['"]\s*\)\s*\.(insert|update|upsert)/i);
    expect(src).not.toMatch(
      /\.from\(\s*['"]ai_doctor_sessions['"]\s*\)\s*\.(insert|update|upsert)/i,
    );
  });
  it("only writes through the canonical quicklog_save_event RPC (no second write path)", () => {
    // Every authz assertion drives the RPC; direct spine inserts would be a
    // competing writer. service_role seeds fixtures (grows/tents/plants) only.
    expect(src).toMatch(/rpc\("quicklog_save_event"/);
    expect(src).not.toMatch(
      /\.from\(\s*['"](grow_events|watering_events|feeding_events)['"]\s*\)\s*\.insert/i,
    );
  });
});

describe("irrigation evidence RLS harness — disposable + self-cleaning", () => {
  it("only ever creates @verdant.test users", () => {
    const emails = Array.from(src.matchAll(/`[^`]*@[^`]+`/g)).map((m) => m[0]);
    for (const e of emails) {
      expect(e, `non-disposable email literal ${e}`).toMatch(/@verdant\.test`$/);
    }
  });
  it("tears down disposable rows in a finally block", () => {
    expect(src).toMatch(/finally\s*\(?[\s\S]{0,120}teardown\s*\(/);
  });
  it("verifies zero leftovers after teardown", () => {
    expect(src).toMatch(/zero leftovers/i);
  });
});

describe("irrigation evidence RLS harness — proves the trust boundary matrix", () => {
  const REQUIRED_REASONS = [
    "grow_not_owned",
    "tent_not_in_grow",
    "plant_not_in_grow",
    "plant_not_in_tent",
    "invalid_typed_payload",
    "idempotency_key_conflict",
  ];
  for (const reason of REQUIRED_REASONS) {
    it(`asserts the ${reason} reason code`, () => {
      expect(src).toContain(reason);
    });
  }
  it("proves the untented-plant + non-null-tent defect is fixed", () => {
    expect(src).toMatch(/untented plant \+ non-null tent/i);
  });
  it("proves replay reuses the original event exactly once", () => {
    expect(src).toMatch(/reused/);
    expect(src).toMatch(/exactly one/i);
  });
});

describe("irrigation evidence RLS harness — package wiring", () => {
  it("exposes test:irrigation-evidence-rls (opt-in)", () => {
    const cmd = pkg.scripts?.["test:irrigation-evidence-rls"] ?? "";
    expect(cmd).toContain("scripts/run-irrigation-evidence-rls-harness.ts");
  });
  it("exposes test:irrigation-evidence-rls:local-lane", () => {
    const cmd = pkg.scripts?.["test:irrigation-evidence-rls:local-lane"] ?? "";
    expect(cmd).toContain("scripts/run-irrigation-evidence-rls-harness.ts");
    expect(cmd).toContain("--confirm-local-security-lane");
  });
  it("is NOT folded into the documented test:security-db-local lane", () => {
    // The mission keeps this a dedicated opt-in command, not a baseline blocker.
    const baseline = pkg.scripts?.["test:security-db-local"] ?? "";
    expect(baseline).not.toContain("irrigation-evidence-rls");
  });
});
