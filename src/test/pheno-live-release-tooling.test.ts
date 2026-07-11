/**
 * Release-gate tooling tests for the Pheno Tracker production release:
 * preflight, deployed-build fingerprint helpers, live-smoke report module,
 * receipt writer decision logic, and runner wiring.
 *
 * These tests NEVER contact production. CLI-level tests only exercise paths
 * that exit before any network request (preflight BLOCKED/FAIL) or that read
 * local fixture files (receipt writer).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PHENO_LIVE_URL,
  PHENO_LIVE_CONFIRM_VALUE,
  PHENO_LIVE_REQUIRED_ENV,
  evaluatePhenoLiveSmokeEnv,
  printPhenoLiveSmokeChecklist,
} from "../../scripts/e2e/check-pheno-live-smoke-env.mjs";
import {
  SITE_URL,
  extractTitle,
  extractMainBundle,
  resolveSameOriginBundleUrl,
  expectedMatches,
  sha256Hex,
} from "../../scripts/releases/fetch-pheno-live-build-id.mjs";
import {
  CHECKPOINT_TEST_MAP,
  collectTestOutcomes,
  statsFromReport,
  evaluateStats,
  deriveCheckpoints,
} from "../../scripts/e2e/pheno-live-smoke-report.mjs";
import {
  parseArgs,
  schemaResult,
  expectedBuildMatches,
  renderReceipt,
} from "../../scripts/releases/write-pheno-release-receipt.mjs";

const ROOT = process.cwd();
const PREFLIGHT_SCRIPT = path.join(ROOT, "scripts/e2e/check-pheno-live-smoke-env.mjs");
const RECEIPT_SCRIPT = path.join(ROOT, "scripts/releases/write-pheno-release-receipt.mjs");
const RUNNER_SCRIPT = path.join(ROOT, "scripts/e2e/run-pheno-live-release-smoke.mjs");

const SECRET_PASSWORD = "hunter2-super-secret-value";
const SECRET_EMAIL = "pheno-live-test@example.com";

/** Parent env minus anything live-smoke related, so tests are hermetic. */
function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(E2E_|PHENO_|SUPABASE_)/i.test(key),
    ),
  );
}

function fullLiveEnv(): NodeJS.ProcessEnv {
  const env = cleanEnv();
  for (const name of PHENO_LIVE_REQUIRED_ENV) {
    env[name] = name.endsWith("_EMAIL")
      ? SECRET_EMAIL
      : name.endsWith("_PASSWORD")
        ? SECRET_PASSWORD
        : name === "E2E_PHENO_LIVE_SMOKE_CONFIRM"
          ? PHENO_LIVE_CONFIRM_VALUE
          : "00000000-0000-4000-8000-000000000000";
  }
  return env;
}

function runNode(script: string, args: string[], env: NodeJS.ProcessEnv, cwd?: string) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env,
    cwd: cwd ?? ROOT,
    timeout: 60_000,
  });
}

describe("live-smoke preflight (check-pheno-live-smoke-env.mjs)", () => {
  it("pins the fixed production target and confirmation phrase", () => {
    expect(PHENO_LIVE_URL).toBe("https://verdantgrowdiary.com");
    expect(PHENO_LIVE_CONFIRM_VALUE).toBe("RUN_LIVE_PHENO_SMOKE");
    expect(PHENO_LIVE_REQUIRED_ENV).toHaveLength(11);
  });

  it("returns BLOCKED with exit 2 when every required input is missing", () => {
    const result = evaluatePhenoLiveSmokeEnv({});
    expect(result.status).toBe("BLOCKED");
    expect(result.exitCode).toBe(2);
    expect(result.missing).toEqual(PHENO_LIVE_REQUIRED_ENV);
  });

  it("treats whitespace-only values as missing", () => {
    const env = fullLiveEnv();
    env.E2E_PHENO_FREE_PASSWORD = "   ";
    const result = evaluatePhenoLiveSmokeEnv(env);
    expect(result.status).toBe("BLOCKED");
    expect(result.missing).toEqual(["E2E_PHENO_FREE_PASSWORD"]);
  });

  it("returns READY with exit 0 when all inputs are present and valid", () => {
    const result = evaluatePhenoLiveSmokeEnv(fullLiveEnv());
    expect(result.status).toBe("READY");
    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("FAILs with exit 1 on a wrong confirmation value even when everything else is set", () => {
    const env = fullLiveEnv();
    env.E2E_PHENO_LIVE_SMOKE_CONFIRM = "yes please";
    const result = evaluatePhenoLiveSmokeEnv(env);
    expect(result.status).toBe("FAIL");
    expect(result.exitCode).toBe(1);
  });

  it("FAILs when E2E_BASE_URL conflicts with the fixed production target", () => {
    const env = fullLiveEnv();
    env.E2E_BASE_URL = "http://127.0.0.1:8080";
    const result = evaluatePhenoLiveSmokeEnv(env);
    expect(result.status).toBe("FAIL");
    expect(result.errors.join(" ")).toContain("conflicts");
  });

  it("accepts E2E_BASE_URL when it matches the production origin", () => {
    const env = fullLiveEnv();
    env.E2E_BASE_URL = "https://verdantgrowdiary.com/";
    expect(evaluatePhenoLiveSmokeEnv(env).status).toBe("READY");
  });

  it("warns (does not fail) when SUPABASE_SERVICE_ROLE_KEY is present", () => {
    const env = fullLiveEnv();
    env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
    const result = evaluatePhenoLiveSmokeEnv(env);
    expect(result.status).toBe("READY");
    expect(result.warnings.join(" ")).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("checklist output prints variable NAMES only — never values", () => {
    const env = fullLiveEnv();
    env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
    const lines: string[] = [];
    printPhenoLiveSmokeChecklist(evaluatePhenoLiveSmokeEnv(env), (msg: string) => lines.push(msg));
    const output = lines.join("\n");
    expect(output).not.toContain(SECRET_PASSWORD);
    expect(output).not.toContain(SECRET_EMAIL);
    expect(output).not.toContain("fake-service-role-key");
    expect(output).toContain("E2E_PHENO_PRO_PASSWORD");
  });

  it("CLI exits 2 on an empty environment without touching the network", () => {
    const result = runNode(PREFLIGHT_SCRIPT, [], cleanEnv());
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("Preflight status: BLOCKED");
    expect(result.stdout).not.toContain(SECRET_PASSWORD);
  });

  it("CLI exits 1 on an invalid confirmation value", () => {
    const env = fullLiveEnv();
    env.E2E_PHENO_LIVE_SMOKE_CONFIRM = "wrong";
    const result = runNode(PREFLIGHT_SCRIPT, [], env);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Preflight status: FAIL");
  });
});

describe("deployed-build fingerprint helpers (fetch-pheno-live-build-id.mjs)", () => {
  it("targets the fixed production origin", () => {
    expect(SITE_URL).toBe("https://verdantgrowdiary.com");
  });

  it("extracts the page title", () => {
    expect(extractTitle("<html><title>  Verdant\n Grow </title></html>")).toBe("Verdant Grow");
    expect(extractTitle("<html></html>")).toBeNull();
  });

  it("prefers the hashed /assets/index-*.js bundle over other scripts", () => {
    const html = `
      <script src="/vendor/analytics.js"></script>
      <script type="module" crossorigin src="/assets/index-DFkEvjho.js"></script>
      <script src="/assets/polyfill-abc.js"></script>
    `;
    expect(extractMainBundle(html)).toBe("/assets/index-DFkEvjho.js");
  });

  it("falls back to any /assets/ script, then any script, then null", () => {
    expect(extractMainBundle('<script src="/assets/app-xyz.mjs"></script>')).toBe("/assets/app-xyz.mjs");
    expect(extractMainBundle('<script src="/main.js"></script>')).toBe("/main.js");
    expect(extractMainBundle("<p>no scripts</p>")).toBeNull();
  });

  it("resolves relative bundle URLs against the production origin", () => {
    expect(resolveSameOriginBundleUrl("/assets/index-abc.js")).toBe(
      "https://verdantgrowdiary.com/assets/index-abc.js",
    );
  });

  it("rejects absolute and protocol-relative bundle URLs on foreign origins", () => {
    expect(() => resolveSameOriginBundleUrl("https://evil.example.com/assets/index-abc.js")).toThrow(
      /unexpected origin/,
    );
    expect(() => resolveSameOriginBundleUrl("//evil.example.com/assets/index-abc.js")).toThrow(
      /unexpected origin/,
    );
  });

  it("expectedMatches: null when unset, exact id/file, sha256 prefix >= 8 hex chars", () => {
    const observed = {
      bundleId: "index-DFkEvjho",
      bundleFile: "index-DFkEvjho.js",
      bundleSha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    };
    expect(expectedMatches(null, observed)).toBeNull();
    expect(expectedMatches("", observed)).toBeNull();
    expect(expectedMatches("index-DFkEvjho", observed)).toBe(true);
    expect(expectedMatches("index-DFkEvjho.js", observed)).toBe(true);
    expect(expectedMatches("a1b2c3d4", observed)).toBe(true);
    expect(expectedMatches("A1B2C3D4E5", observed)).toBe(true);
    // A prefix of the bundle id must NOT match.
    expect(expectedMatches("index-", observed)).toBe(false);
    // A short sha prefix must NOT match (trivial-collision guard).
    expect(expectedMatches("a1b2c3", observed)).toBe(false);
    expect(expectedMatches("completely-wrong", observed)).toBe(false);
  });

  it("sha256Hex produces the known digest for a fixed input", () => {
    expect(sha256Hex(Buffer.from("verdant"))).toBe(
      sha256Hex(Buffer.from("verdant")),
    );
    expect(sha256Hex(Buffer.from(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("live-smoke report module (pheno-live-smoke-report.mjs)", () => {
  const passingReport = {
    stats: { expected: 9, unexpected: 0, skipped: 0, flaky: 0 },
    suites: [
      {
        specs: CHECKPOINT_TEST_MAP.flatMap((checkpoint: { titles: string[] }) =>
          checkpoint.titles.map((title: string) => ({
            title,
            tests: [{ status: "expected" }],
          })),
        ),
      },
    ],
  };

  it("statsFromReport parses Playwright aggregate stats", () => {
    expect(statsFromReport(passingReport)).toEqual({
      passed: 9,
      failed: 0,
      skipped: 0,
      flaky: 0,
      total: 9,
    });
    expect(statsFromReport(null)).toBeNull();
    expect(statsFromReport({})).toBeNull();
  });

  it("evaluateStats fails on missing report, failures, skips, or zero passes", () => {
    expect(evaluateStats(null).ok).toBe(false);
    expect(evaluateStats({ passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0 }).ok).toBe(false);
    expect(evaluateStats({ passed: 5, failed: 1, skipped: 0, flaky: 0, total: 6 }).ok).toBe(false);
    expect(evaluateStats({ passed: 5, failed: 0, skipped: 1, flaky: 0, total: 6 }).ok).toBe(false);
    expect(evaluateStats({ passed: 9, failed: 0, skipped: 0, flaky: 0, total: 9 }).ok).toBe(true);
  });

  it("collectTestOutcomes walks nested suites", () => {
    const report = {
      suites: [
        {
          suites: [
            { specs: [{ title: "inner test", tests: [{ status: "expected" }] }] },
          ],
          specs: [{ title: "outer test", tests: [{ status: "unexpected" }] }],
        },
      ],
    };
    expect(collectTestOutcomes(report)).toEqual([
      { title: "inner test", outcome: "expected" },
      { title: "outer test", outcome: "unexpected" },
    ]);
  });

  it("derives PASS only for checkpoints whose mapped tests all passed", () => {
    const checkpoints = deriveCheckpoints(passingReport);
    expect(checkpoints).toHaveLength(12);
    for (const checkpoint of checkpoints) {
      if (checkpoint.id === 6) {
        // No automated proof exists for hunt-setup persistence — it must
        // stay PENDING. (Checkpoint 9 gained automated anchor proof; its
        // separate manual release requirement is receipt policy, not mapping.)
        expect(checkpoint.status).toBe("PENDING");
      } else {
        expect(checkpoint.status).toBe("PASS");
      }
    }
  });

  it("a failed mapped test marks its checkpoint FAIL; a skipped one SKIPPED; absent stays PENDING", () => {
    const report = {
      suites: [
        {
          specs: [
            {
              title:
                "Free user sees the upgrade gate on /pheno-hunts/new and the CTA returnTo round-trips to /pricing",
              tests: [{ status: "unexpected" }],
            },
            { title: "Pro user can load /pheno-hunts/new", tests: [{ status: "skipped" }] },
          ],
        },
      ],
    };
    const byId = new Map(deriveCheckpoints(report).map((c: { id: number }) => [c.id, c]));
    expect((byId.get(1) as { status: string }).status).toBe("FAIL");
    expect((byId.get(3) as { status: string }).status).toBe("SKIPPED");
    expect((byId.get(4) as { status: string }).status).toBe("PENDING");
    expect((byId.get(12) as { status: string }).status).toBe("PENDING");
  });

  it("an absent report leaves every checkpoint PENDING — silence never reads as PASS", () => {
    for (const checkpoint of deriveCheckpoints(null)) {
      expect(checkpoint.status).toBe("PENDING");
    }
  });

  it("sanitizes emails, UUIDs, and query strings out of checkpoint evidence", () => {
    const report = {
      suites: [
        {
          specs: [
            {
              title:
                "Free user sees the upgrade gate on /pheno-hunts/new as leak@example.com id 12345678-abcd-4bcd-8bcd-1234567890ab ?token=oops",
              tests: [{ status: "expected" }],
            },
          ],
        },
      ],
    };
    const first = deriveCheckpoints(report)[0];
    expect(first.status).toBe("PASS");
    expect(first.evidence).not.toContain("leak@example.com");
    expect(first.evidence).not.toContain("12345678-abcd");
    expect(first.evidence).not.toContain("token=oops");
  });
});

describe("release receipt writer (write-pheno-release-receipt.mjs)", () => {
  function goFixtures() {
    const sha = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const smokeCheckpoints = CHECKPOINT_TEST_MAP.map((c: { id: number; label: string; titles: string[] }) => ({
      id: c.id,
      label: c.label,
      status: c.titles.length > 0 ? "PASS" : "PENDING",
      evidence: c.titles.length > 0 ? "automated smoke" : "no automated proof in the live smoke",
    }));
    return {
      smoke: {
        generatedAt: "2026-07-10T00:00:00.000Z",
        target: "https://verdantgrowdiary.com",
        deployment: "PASS",
        preflight: "PASS",
        sessions: "PASS",
        playwright: "PASS",
        final: "PASS",
        tests: { passed: 9, failed: 0, skipped: 0, flaky: 0, total: 9 },
        checkpoints: smokeCheckpoints,
      },
      schema: {
        columns: ["evidence_goals", "notes", "setup_completed_at"],
        entitlementFunctionCount: 1,
        restrictivePolicyTableCount: 13,
        allProPoliciesRestrictive: true,
        ownerSelectVerified: true,
      },
      build: {
        status: "PASS",
        observedAt: "2026-07-10T00:00:00.000Z",
        siteUrl: "https://verdantgrowdiary.com",
        bundleFile: "index-DFkEvjho.js",
        bundleId: "index-DFkEvjho",
        bundleSha256: sha,
      },
      manual: {
        expectedBuildId: "index-DFkEvjho",
        publishedAt: "2026-07-10",
        operator: "release-operator",
        deployment: {
          noWhiteScreen: "PASS",
          consoleErrors: "PASS",
          evidence: "manual browser check",
          consoleEvidence: "manual DevTools check",
        },
        billing: { required: false, status: "NOT_REQUIRED", evidence: "no billing change" },
        rollback: {
          priorVersionIdentified: "PASS",
          migrationPosture: {
            status: "PASS",
            classification: "ADDITIVE",
            exceptions: [],
          },
          entryPointDisable: "PASS",
          ownerReadPreserved: "PASS",
        },
        // Checkpoints 6 and 9 have no automated proof; manual evidence covers them.
        checkpoints: {
          6: { status: "PASS", evidence: "manual persistence check" },
          9: { status: "PASS", evidence: "manual navigation check" },
        },
      },
    };
  }

  it("parseArgs: defaults, --allow-partial, custom paths, missing value throws", () => {
    const defaults = parseArgs([]);
    expect(defaults.allowPartial).toBe(false);
    expect(defaults.out.replace(/\\/g, "/")).toContain("docs/releases/pheno-tracker-pro-release-receipt.md");
    const custom = parseArgs(["--allow-partial", "--build", "some/build.json"]);
    expect(custom.allowPartial).toBe(true);
    expect(custom.build.replace(/\\/g, "/")).toContain("some/build.json");
    expect(() => parseArgs(["--smoke"])).toThrow(/requires a path/);
  });

  it("schemaResult requires 3 columns, exactly 1 entitlement function, 13 restrictive tables, owner SELECT", () => {
    expect(schemaResult(goFixtures().schema).pass).toBe(true);
    expect(schemaResult({ ...goFixtures().schema, entitlementFunctionCount: 2 }).pass).toBe(false);
    expect(schemaResult({ ...goFixtures().schema, restrictivePolicyTableCount: 12 }).pass).toBe(false);
    expect(schemaResult({ ...goFixtures().schema, columns: ["notes"] }).pass).toBe(false);
    expect(schemaResult({ ...goFixtures().schema, ownerSelectVerified: false }).pass).toBe(false);
    expect(schemaResult(null).pass).toBe(false);
  });

  it("expectedBuildMatches mirrors the fingerprint semantics (exact id/file, sha prefix >= 8)", () => {
    const { build } = goFixtures();
    expect(expectedBuildMatches(build, {})).toBeNull();
    expect(expectedBuildMatches(build, { expectedBuildId: "index-DFkEvjho" })).toBe(true);
    expect(expectedBuildMatches(build, { expectedBuildId: "index-DFkEvjho.js" })).toBe(true);
    expect(expectedBuildMatches(build, { expectedBuildId: "a1b2c3d4e5" })).toBe(true);
    // Loose prefixes must not fake a match.
    expect(expectedBuildMatches(build, { expectedBuildId: "index-" })).toBe(false);
    expect(expectedBuildMatches(build, { expectedBuildId: "a1b2c3" })).toBe(false);
    expect(expectedBuildMatches(build, { expectedBuildId: "other-bundle" })).toBe(false);
  });

  it("renders GO when every gate passes", () => {
    const result = renderReceipt(goFixtures());
    expect(result.decision).toBe("GO");
    expect(result.markdown).toContain("**Release status:** GO");
  });

  it.each([
    ["a failed test", (f: ReturnType<typeof goFixtures>) => { f.smoke.tests.failed = 1; }],
    ["a skipped test", (f: ReturnType<typeof goFixtures>) => { f.smoke.tests.skipped = 1; }],
    ["zero passed tests", (f: ReturnType<typeof goFixtures>) => { f.smoke.tests.passed = 0; }],
    ["smoke final not PASS", (f: ReturnType<typeof goFixtures>) => { f.smoke.final = "HOLD"; }],
    ["deployment unreachable", (f: ReturnType<typeof goFixtures>) => { f.smoke.deployment = "FAIL"; }],
    ["fingerprint artifact FAIL", (f: ReturnType<typeof goFixtures>) => { f.build.status = "FAIL"; }],
    ["expected build mismatch", (f: ReturnType<typeof goFixtures>) => { f.manual.expectedBuildId = "other"; }],
    ["expected build not set", (f: ReturnType<typeof goFixtures>) => { f.manual.expectedBuildId = ""; }],
    ["white-screen check missing", (f: ReturnType<typeof goFixtures>) => { f.manual.deployment.noWhiteScreen = "PENDING"; }],
    ["console errors present", (f: ReturnType<typeof goFixtures>) => { f.manual.deployment.consoleErrors = "FAIL"; }],
    ["schema check failing", (f: ReturnType<typeof goFixtures>) => { f.schema.restrictivePolicyTableCount = 12; }],
    ["a PENDING checkpoint", (f: ReturnType<typeof goFixtures>) => { delete (f.manual.checkpoints as Record<string, unknown>)[6]; }],
    ["billing unresolved", (f: ReturnType<typeof goFixtures>) => { f.manual.billing = { required: true, status: "PENDING", evidence: "" }; }],
    ["incomplete rollback readiness", (f: ReturnType<typeof goFixtures>) => { f.manual.rollback.entryPointDisable = "PENDING"; }],
  ])("HOLDs on %s", (_label, mutate) => {
    const fixtures = goFixtures();
    mutate(fixtures);
    expect(renderReceipt(fixtures).decision).toBe("HOLD");
  });

  it("--allow-partial can refresh a receipt but never mint GO", () => {
    const result = renderReceipt({ ...goFixtures(), allowPartial: true });
    expect(result.decision).toBe("HOLD");
  });

  it("manual checkpoint overrides beat smoke-derived statuses", () => {
    const fixtures = goFixtures();
    (fixtures.manual.checkpoints as Record<string, unknown>)[1] = { status: "FAIL", evidence: "manual regression" };
    expect(renderReceipt(fixtures).decision).toBe("HOLD");
  });

  it("escapes pipes and newlines in evidence cells", () => {
    const fixtures = goFixtures();
    fixtures.manual.deployment.evidence = "before | after\nsecond line";
    const { markdown } = renderReceipt(fixtures);
    expect(markdown).toContain("before \\| after second line");
  });

  describe("CLI exit codes", () => {
    let dir: string;

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "pheno-receipt-"));
    });

    afterAll(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    function writeFixtures(fixtures: ReturnType<typeof goFixtures>) {
      const paths = {
        smoke: path.join(dir, "live-smoke-summary.json"),
        schema: path.join(dir, "schema-spot-check.json"),
        build: path.join(dir, "deployed-build.json"),
        manual: path.join(dir, "manual-release-checks.json"),
        out: path.join(dir, "receipt.md"),
      };
      fs.writeFileSync(paths.smoke, JSON.stringify(fixtures.smoke));
      fs.writeFileSync(paths.schema, JSON.stringify(fixtures.schema));
      fs.writeFileSync(paths.build, JSON.stringify(fixtures.build));
      fs.writeFileSync(paths.manual, JSON.stringify(fixtures.manual));
      return paths;
    }

    function receiptArgs(paths: ReturnType<typeof writeFixtures>, extra: string[] = []) {
      return [
        "--smoke", paths.smoke,
        "--schema", paths.schema,
        "--build", paths.build,
        "--manual", paths.manual,
        "--out", paths.out,
        ...extra,
      ];
    }

    it("exits 2 (BLOCKED) when required artifacts are missing and --allow-partial is absent", () => {
      const missing = path.join(dir, "does-not-exist.json");
      const out = path.join(dir, "blocked-receipt.md");
      const result = runNode(
        RECEIPT_SCRIPT,
        ["--smoke", missing, "--schema", missing, "--build", missing, "--out", out],
        cleanEnv(),
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("BLOCKED");
      expect(fs.existsSync(out)).toBe(false);
    });

    it("exits 2 (HOLD) with --allow-partial on missing artifacts but still writes the receipt", () => {
      const missing = path.join(dir, "does-not-exist.json");
      const out = path.join(dir, "partial-receipt.md");
      const result = runNode(
        RECEIPT_SCRIPT,
        ["--smoke", missing, "--schema", missing, "--build", missing, "--out", out, "--allow-partial"],
        cleanEnv(),
      );
      expect(result.status).toBe(2);
      expect(result.stdout).toContain("decision    HOLD");
      expect(fs.readFileSync(out, "utf8")).toContain("**Release status:** HOLD");
    });

    it("exits 0 (GO) on a complete passing evidence set", () => {
      const paths = writeFixtures(goFixtures());
      const result = runNode(RECEIPT_SCRIPT, receiptArgs(paths), cleanEnv());
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("decision    GO");
      expect(fs.readFileSync(paths.out, "utf8")).toContain("**Release status:** GO");
    });

    it("exits 2 (HOLD) on the same passing evidence when --allow-partial is set", () => {
      const paths = writeFixtures(goFixtures());
      const result = runNode(RECEIPT_SCRIPT, receiptArgs(paths, ["--allow-partial"]), cleanEnv());
      expect(result.status).toBe(2);
      expect(result.stdout).toContain("decision    HOLD");
    });

    it("exits 1 on malformed input JSON", () => {
      const paths = writeFixtures(goFixtures());
      fs.writeFileSync(paths.smoke, "{not json");
      const result = runNode(RECEIPT_SCRIPT, receiptArgs(paths), cleanEnv());
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("FAIL:");
    });
  });
});

describe("live release smoke runner (run-pheno-live-release-smoke.mjs)", () => {
  const source = fs.readFileSync(RUNNER_SCRIPT, "utf8");

  it("reuses the shared preflight and report modules", () => {
    expect(source).toContain('from "./check-pheno-live-smoke-env.mjs"');
    expect(source).toContain('from "./pheno-live-smoke-report.mjs"');
    expect(source).toContain("evaluatePhenoLiveSmokeEnv(process.env)");
    expect(source).toContain("deriveCheckpoints(report)");
  });

  it("orders stages preflight → deployment → fingerprint → sessions → Playwright", () => {
    const preflight = source.indexOf("Stage 1 — local-only preflight");
    const deployment = source.indexOf("Stage 2 — deployment reachability");
    const fingerprint = source.indexOf("Stage 3 — deployed-build fingerprint");
    const sessions = source.indexOf("Stage 4 — mint dedicated role sessions");
    const playwright = source.indexOf("Stage 5 — Playwright live paid-user smoke");
    expect(preflight).toBeGreaterThan(-1);
    expect(deployment).toBeGreaterThan(preflight);
    expect(fingerprint).toBeGreaterThan(deployment);
    expect(sessions).toBeGreaterThan(fingerprint);
    expect(playwright).toBeGreaterThan(sessions);
  });

  it("runs the live smoke with the authed project — never the mocked one", () => {
    expect(source).toContain("--project=chromium-authed");
    expect(source).not.toContain("chromium-mocked");
  });

  it("pins the production target and never seeds production", () => {
    expect(source).toContain('const LIVE_URL = "https://verdantgrowdiary.com"');
    expect(source).not.toMatch(/seed-pheno-paid-smoke-fixtures/);
  });

  it("CLI exits 2 (BLOCKED) with an empty env, writes the summary, and makes no network calls", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pheno-runner-"));
    try {
      const result = runNode(RUNNER_SCRIPT, [], cleanEnv(), dir);
      expect(result.status).toBe(2);
      const summaryPath = path.join(
        dir,
        "artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.json",
      );
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      expect(summary.preflight).toContain("BLOCKED");
      expect(summary.final).toBe("BLOCKED");
      expect(summary.deployment).toBe("PENDING");
      expect(summary.fingerprint).toBe("PENDING");
      expect(summary.sessions).toBe("PENDING");
      expect(Array.isArray(summary.checkpoints)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CLI exits 1 (FAIL) on an invalid confirmation before any deployment check", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pheno-runner-"));
    try {
      const env = fullLiveEnv();
      env.E2E_PHENO_LIVE_SMOKE_CONFIRM = "not-the-phrase";
      const result = runNode(RUNNER_SCRIPT, [], env, dir);
      expect(result.status).toBe(1);
      const summary = JSON.parse(
        fs.readFileSync(
          path.join(dir, "artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.json"),
          "utf8",
        ),
      );
      expect(summary.preflight).toContain("FAIL");
      expect(summary.deployment).toBe("PENDING");
      const output = `${result.stdout}${result.stderr}`;
      expect(output).not.toContain(SECRET_PASSWORD);
      expect(output).not.toContain(SECRET_EMAIL);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
