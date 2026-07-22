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
const WORKFLOW = ".github/workflows/irrigation-evidence-gate.yml";
const ACL_PGTAP_FILES = [
  "supabase/tests/create_watering_event.sql",
  "supabase/tests/create_feeding_event.sql",
] as const;
const harnessPath = resolve(ROOT, HARNESS);
const src = existsSync(harnessPath) ? readFileSync(harnessPath, "utf8") : "";
const workflowPath = resolve(ROOT, WORKFLOW);
const workflowSrc = existsSync(workflowPath) ? readFileSync(workflowPath, "utf8") : "";
const workflowCode = workflowSrc.replace(/^\s*#.*$/gm, "");
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
    expect(src).toMatch(/refusing unverified remote (API\/database pair|database)/i);
    // A remote ref that equals production can never be confirmed.
    expect(src).toMatch(/expectedRemoteRef !== PRODUCTION_PROJECT_REF/);
  });

  it("guards the local security lane to loopback only", () => {
    expect(src).toMatch(/localHost/);
    expect(src).toMatch(/127\.0\.0\.1/);
    expect(src).toMatch(/local security lane requires loopback API and database URLs/i);
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
    expect(src).toMatch(/SUPABASE_DB_URL/);
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

describe("irrigation evidence pgTAP — every legacy RPC overload is pinned", () => {
  for (const path of ACL_PGTAP_FILES) {
    it(`${path} requires the complete overload set to match the EXECUTE contract`, () => {
      const sql = readFileSync(resolve(ROOT, path), "utf8");

      expect(sql).toMatch(/overload_count\s+BIGINT/);
      expect(sql).toMatch(/granted_count\s+BIGINT/);
      expect(sql).toMatch(/ASSERT\s+overload_count\s*>\s*0/i);
      expect(sql).toMatch(/granted_count\s*=\s*overload_count/i);
      expect(sql).toMatch(/granted_count\s*=\s*0/i);
      expect(sql).not.toMatch(/bool_or\s*\(\s*has_function_privilege/i);
    });
  }
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
    // Every authz assertion drives the RPC. Direct spine inserts/upserts and
    // service-role admin writes into the event tables would be a competing
    // writer that hides denial regressions. service_role seeds fixtures
    // (grows/tents/plants) only — never event tables.
    expect(src).toMatch(/rpc\("quicklog_save_event"/);
    // No client of any role writes the three event tables directly.
    expect(src).not.toMatch(
      /\.from\(\s*['"](grow_events|watering_events|feeding_events)['"]\s*\)\s*\.(insert|upsert|update|delete)\s*\(/i,
    );
    // Specifically: no `admin.` (service_role) direct write into the event tables.
    expect(src).not.toMatch(
      /admin\s*\.from\(\s*['"](grow_events|watering_events|feeding_events)['"]\s*\)\s*\.(insert|upsert|update|delete)\s*\(/i,
    );
    // No runtime service-role RPC call to the legacy typed-event functions —
    // those are SECURITY INVOKER and depend on auth.uid(); a service_role JWT
    // cannot honestly prove ACL possession by successful execution. ACL
    // possession is proved in pgTAP instead.
    expect(src).not.toMatch(/admin\s*\.rpc\(\s*['"]create_(watering|feeding)_event['"]/i);
  });
  it("uses a distinct feedingArgs helper that explicitly clears p_water", () => {
    // The RPC rejects a non-null p_water when p_event_type = 'feeding'
    // (water_not_allowed_for_feeding). Inheriting baseArgs would fail closed
    // for the wrong reason and never prove the feeding path. Feeding must be
    // seeded through its own helper that pins p_water: null.
    expect(src).toMatch(/const\s+feedingArgs\s*=/);
    expect(src).toMatch(/p_event_type:\s*"feeding"/);
    expect(src).toMatch(/p_water:\s*null/);
    expect(src).toMatch(/p_feed:\s*feed/);
  });
  it("pins the closed three-table denial allowlist", () => {
    expect(src).toMatch(
      /DENIAL_ALLOWLIST\s*=\s*\[\s*"grow_events"\s*,\s*"watering_events"\s*,\s*"feeding_events"\s*\]\s*as\s+const/,
    );
    // The DML denial loop must iterate the allowlist, not an ad-hoc array.
    expect(src).toMatch(/for\s*\(\s*const\s+table\s+of\s+DENIAL_ALLOWLIST\s*\)/);
  });
  it("distinguishes genuine permission denial from missing-function errors", () => {
    // Helpers must exist and cover the PostgREST/Postgres error codes that
    // can masquerade as denial: 42883, PGRST202, PGRST203, /does not exist/,
    // /schema cache/, /no function matches/.
    expect(src).toMatch(/isGenuinePermissionDenial\s*=/);
    expect(src).toMatch(/isMissingFunction\s*=/);
    expect(src).toMatch(/42883/);
    expect(src).toMatch(/PGRST202/);
    expect(src).toMatch(/schema cache/i);
    // Every DML denial assertion must combine both helpers so a
    // missing-function error cannot satisfy an RPC/table-denial check.
    const dmlDenials = Array.from(
      src.matchAll(
        /authenticated denied (?:INSERT|UPDATE|DELETE|create_[a-z_]+_event)[^\n]*\n\s*([^\n]+)/gi,
      ),
    ).map((m) => m[1]);
    expect(dmlDenials.length, "expected denial assertions to exist").toBeGreaterThan(0);
    for (const line of dmlDenials) {
      expect(line, `denial assertion must gate on isGenuinePermissionDenial: ${line}`).toMatch(
        /isGenuinePermissionDenial\(/,
      );
      expect(line, `denial assertion must also reject missing-function: ${line}`).toMatch(
        /!isMissingFunction\(/,
      );
    }
  });
  it("seeds real DML-denial targets through the canonical RPC only", () => {
    // Watering and feeding are seeded as two independent parent events via
    // save(ownerC, ...) — never via service_role direct inserts — and each
    // returned grow_event_id is asserted. Subtype exclusivity is pinned so
    // watering rows appear only in watering_events and feeding rows only in
    // feeding_events.
    expect(src).toMatch(/dml-denial seed: canonical watering save succeeds/);
    expect(src).toMatch(/dml-denial seed: canonical feeding save succeeds/);
    expect(src).toMatch(/watering save returned a concrete grow_event_id/);
    expect(src).toMatch(/feeding save returned a concrete grow_event_id/);
    expect(src).toMatch(/watering and feeding are independent parent events/);
    expect(src).toMatch(/watering seed exists only in watering_events/);
    expect(src).toMatch(/feeding seed exists only in feeding_events/);
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
    expect(src).toMatch(/error === null && count === 0/);
    expect(src).toMatch(/auth\.admin\.getUserById/);
    expect(src).not.toMatch(/\(count \?\? 0\) === 0/);
    expect(src).not.toMatch(/deleteUser\(id\)\.catch/);
    expect(src).toMatch(/removeRaceBarrier/);
    expect(src).toMatch(/DROP SCHEMA IF EXISTS/);
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
  it("proves concurrent identical and conflicting requests instead of sequential-only replay", () => {
    expect(src).toMatch(/Promise\.all/);
    expect(src).toMatch(/parallel identical requests/i);
    expect(src).toMatch(/parallel different requests/i);
    expect(src).toMatch(/idempotency_key_conflict/);
    expect(src).toMatch(/pg_advisory_xact_lock/);
    expect(src).toMatch(/pg_catalog\.pg_locks/);
    expect(src).toMatch(/granted_count/);
    expect(src).toMatch(/waiting_count/);
    expect(src).toMatch(/overlapped at the idempotency insert/i);
  });
  it("checks atomicity across the full committed event set", () => {
    for (const table of [
      "grow_events",
      "watering_events",
      "feeding_events",
      "diary_entries",
      "quicklog_idempotency",
    ]) {
      expect(src).toContain(`"${table}"`);
    }
    expect(src).toMatch(/snapshotUserRows/);
    expect(src).toMatch(/wrote no grow\/watering\/feeding\/diary\/idempotency rows/);
  });
  it("checks cross-owner read isolation for every related history table", () => {
    expect(src).toMatch(/OWNER_READ_TABLES/);
    expect(src).toMatch(/stranger cannot read owner \$\{table\}/);
    expect(src).toContain('"quicklog_audit_events"');
    expect(src).toMatch(/recognizedReadDenial/);
    expect(src).not.toMatch(/error !== null \|\| \(Array\.isArray\(data\)/);
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

describe("irrigation evidence CI gate — authoritative and non-production", () => {
  it(`${WORKFLOW} exists`, () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("uses safe PR permissions without secrets or elevated PR execution", () => {
    expect(workflowCode).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(workflowCode).toMatch(/pull_request:/);
    expect(workflowCode).not.toMatch(/pull_request_target/);
    expect(workflowCode).not.toMatch(/\bsecrets\s*\./);
    expect(workflowCode).not.toMatch(/continue-on-error/);
  });

  it("runs the disposable RLS harness against a masked local Supabase stack", () => {
    expect(workflowCode).toMatch(/supabase start/);
    expect(workflowCode).toMatch(/supabase db reset --local/);
    expect(workflowCode).toMatch(/::add-mask::\$\{ANON_KEY\}/);
    expect(workflowCode).toMatch(/::add-mask::\$\{SERVICE_ROLE_KEY\}/);
    expect(workflowCode).toMatch(/::add-mask::\$\{DB_URL\}/);
    expect(workflowCode).toMatch(/SUPABASE_DB_URL=\$\{DB_URL\}/);
    expect(workflowCode).toContain("bun run test:irrigation-evidence-rls:local-lane");
    expect(workflowCode).toMatch(/if:\s*always\(\)[\s\S]{0,120}supabase stop --no-backup/);
    expect(workflowCode).not.toMatch(/supabase\s+(link|db push)/);
  });

  it("suppresses startup credentials before masking and never uploads the raw startup log", () => {
    const startIndex = workflowCode.indexOf("supabase start");
    const maskIndex = workflowCode.indexOf("::add-mask::${ANON_KEY}");
    expect(startIndex).toBeGreaterThan(-1);
    expect(maskIndex).toBeGreaterThan(startIndex);
    expect(workflowCode.slice(startIndex, maskIndex)).toMatch(
      />"\$\{RUNNER_TEMP\}\/irrigation-supabase-start\.log" 2>&1/,
    );
    expect(workflowCode).not.toMatch(/path:[\s\S]{0,120}irrigation-supabase-start\.log/);
    expect(workflowCode).not.toMatch(/path:[\s\S]{0,120}irrigation-supabase-reset\.log/);
  });

  it("runs the exact styled Chromium overflow proof as an independent blocking job", () => {
    expect(workflowCode).toContain("e2e/irrigation-overflow.spec.ts");
    expect(workflowCode).toContain("--project=chromium-mocked");
    expect(workflowCode).toContain("playwright install chromium --with-deps");
    expect(workflowCode).toMatch(/Irrigation overflow \(real Verdant CSS\)/);
    expect(workflowCode).toMatch(/name:\s*Write proof summary\s*\n\s*if:\s*success\(\)/);
  });

  it("reruns for all database, irrigation UI, style, and browser-proof dependencies", () => {
    for (const path of [
      '"supabase/migrations/**"',
      '"src/components/irrigation/**"',
      '"src/components/ui/**"',
      '"src/lib/irrigation/**"',
      '"src/index.css"',
      '"e2e/fixtures/irrigation-overflow*"',
      '"tailwind.config.ts"',
      '"vite.config.ts"',
    ]) {
      expect(workflowCode).toContain(path);
    }
  });
});
