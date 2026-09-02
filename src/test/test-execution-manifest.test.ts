/**
 * The test-execution manifest: every committed test is either RUN or DECLARED.
 *
 * The 2026-08-29 coverage audit (docs/audits/test-coverage-audit-2026-08-29.md,
 * finding F3) measured four lanes of tests that CI invoked nowhere — 21 of 31
 * colocated Deno edge tests, 25 of 60 Playwright specs, 18 of 41 runtime
 * harnesses, 7 of 9 pgTAP suites. They were committed, reviewed and merged, and
 * every one of them read as coverage while supplying none.
 *
 * That state was invisible for as long as it existed, because nothing in the
 * repository asked the question. Wiring the lanes (P2a/P2b) fixes today; this
 * file is what stops it recurring. A new spec that nothing runs now fails here,
 * on the PR that adds it, instead of in an audit a year later.
 *
 * THIS IS NOT A PASS/FAIL GATE FOR THOSE TESTS. It asserts only that something
 * executes each file, or that a human declared why not. "Wired" and "green" are
 * different properties and this file never conflates them: the specs below that
 * fail when run are recorded as `red-when-run` WITH their failing assertion, and
 * are neither skipped, disabled, nor quarantined. Silence is the failure mode
 * this guards against, so an exemption is a written claim, not an off switch.
 *
 * Adding an exemption is deliberately a visible diff that names a class and a
 * reason. Removing one is free. The ratchet only turns one way.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  EXEMPTION_CLASS,
  FINDING,
  auditExecutionManifest,
  buildExecutionCorpus,
  isRuntimeHarness,
  namedPathsIn,
  resolveBareBasenames,
  scriptNamesIn,
  stripTriggerBlock,
  // Pure logic lives beside requiredCheckAuditRules.mjs; the test supplies all the I/O.
  // The resolver itself is the audit's (scripts/lib/testEstateRules.mjs), re-exported —
  // one definition of "executed" and of "harness", not a fork that drifts.
} from "../../scripts/lib/testExecutionManifestRules.mjs";

const root = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/** Recursive walk returning repo-relative paths. Mirrors what a clean CI checkout contains. */
function walk(rel: string, out: string[] = []): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs).sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const childRel = `${rel}/${entry}`;
    if (statSync(join(root, childRel)).isDirectory()) walk(childRel, out);
    else out.push(childRel);
  }
  return out;
}

const denoTests = walk("supabase/functions").filter((f) => /(\.test\.ts|_test\.ts)$/.test(f));
const e2eSpecs = walk("e2e").filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f));
// Recursive, and `harness|db-security`, not root-level `*harness*`: the latter is the
// rule the audit retired as defect 31 — it missed five harnesses under scripts/security/
// and three root files named *-db-security.ts, all of which security-db-local.yml runs.
const harnesses = walk("scripts").filter(isRuntimeHarness);
const pgTapSuites = walk("supabase/tests").filter((f) => f.endsWith(".sql"));

const LANES = [
  { label: "deno edge tests", files: denoTests },
  { label: "playwright specs", files: e2eSpecs },
  { label: "runtime harnesses", files: harnesses },
  { label: "pgTAP suites", files: pgTapSuites },
];

const scripts = JSON.parse(read("package.json")).scripts ?? {};
const workflowTexts = readdirSync(join(root, ".github/workflows"))
  .sort()
  .map((f) => read(`.github/workflows/${f}`));

const corpus = buildExecutionCorpus({
  workflowTexts,
  scripts,
  readRunner: (rel: string) => (existsSync(join(root, rel)) ? read(rel) : null),
});
// A runner resolves a bare basename against its own root — `bunx playwright test
// agent-integrations-smoke.spec.ts` runs e2e/agent-integrations-smoke.spec.ts via
// playwright.config's testDir. Safe only because the corpus is command lines: a bare
// name there is a runner argument, not prose. Ambiguous basenames stay unresolved.
const namedPaths = resolveBareBasenames({
  laneFiles: LANES.flatMap((l) => l.files),
  namedPaths: namedPathsIn(corpus),
});

/**
 * Every lane file nothing runs, and the checkable claim that justifies it.
 *
 * Each `reason` states what was measured, not what is hoped. Where a spec fails,
 * the failing assertion is quoted so the next reader does not have to re-run it
 * to learn what is wrong.
 */
const EXEMPTIONS: Record<string, { class: string; reason: string }> = {
  /* ---------------- Deno edge lane ---------------- */
  "supabase/functions/pi-ingest-readings/bridgeCredentialLookupContract.test.ts": {
    class: EXEMPTION_CLASS.AWAITING_DECISION,
    reason:
      'Its case "no SUPABASE_SERVICE_ROLE_KEY runtime read exists anywhere in src/" FAILS, reproduced in 4 of 4 invocations. src/integrations/supabase/client.server.ts performs a genuine runtime process.env read feeding createClient. Narrowing the invariant to exempt *.server.ts, or moving that read, is a security-boundary call needing one owner and a different peer as reviewer (AGENTS.md). Wiring it would turn the required gate red on day one and block every PR.',
  },
  "supabase/functions/rls-selftest/index.test.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason:
      "POSTs to a DEPLOYED edge function and requires RLS_TEST_SECRET. Same category as pi-ingest-readings/smoke.test.ts; cannot run in a hermetic lane.",
  },

  /* ---------------- Playwright lane: not hermetic ---------------- */
  "e2e/evidence-tile-mismatch-smoke.spec.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason:
      "Installs ZERO page.route mocks and test.skip()s unless E2E_EVIDENCE_TILE_PLANT_URL / E2E_GROW_1_PLANT_URL are set, then navigates that real URL unmocked. Wiring it would record a vacuous skip that reads as coverage.",
  },
  "e2e/manual-sensor-snapshot-edit-smoke.spec.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason:
      "Zero page.route mocks; gated on E2E_MANUAL_SNAPSHOT_STRIP_URL / E2E_QUICK_LOG_STRIP_URL, then navigates that real URL unmocked.",
  },
  "e2e/quick-log-target-panel-smoke.spec.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason: "Zero page.route mocks; gated on E2E_GROW_1_PLANT_URL, then navigates it unmocked.",
  },
  "e2e/pheno-comparison-visual-regression.spec.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason: "Zero page.route mocks; gated on E2E_PHENO_HUNT_ID against a real seeded hunt.",
  },
  "e2e/pheno-workspace-missing-evidence-anchors.spec.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason:
      "Zero page.route mocks; gated on E2E_PHENO_HUNT_ID_MISSING_EVIDENCE / E2E_PHENO_HUNT_ID_REPLICATION_PENDING against real seeded data.",
  },
  "e2e/pheno-workspace-state-integrity.spec.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason:
      "Zero page.route mocks; gated on E2E_PHENO_PHASE / E2E_PHENO_REMOUNT_GUARD against a real deployment.",
  },
  "e2e/pheno-comparison-reload.spec.ts": {
    class: EXEMPTION_CLASS.NOT_HERMETIC,
    reason:
      'Zero page.route mocks. Fails "console errors during /pheno-comparison reload" with 3x net::ERR_CONNECTION_RESET because it fetches fonts.googleapis.com, unreachable from the audit container. Whether it passes on a GitHub runner is NOT_MEASURED, so it is left out rather than wired on a guess.',
  },

  /* ---------------- Playwright lane: hermetic but red ---------------- */
  "e2e/quick-log-activation-handoff.spec.ts": {
    class: EXEMPTION_CLASS.RED_WHEN_RUN,
    reason:
      'Credential-free and fully mocked (9 page.route), so this is real signal. 1 of its tests fails deterministically (2 of 2 runs): expect(page).toHaveURL() received "" at the post-signup Timeline assertion. Needs its own triage slice — product defect vs stale expectation is not yet established.',
  },
  "e2e/timeline-local-day-date-filter.spec.ts": {
    class: EXEMPTION_CLASS.RED_WHEN_RUN,
    reason:
      'Credential-free and mocked (8 page.route). Both tests fail deterministically (2 of 2 runs). (a) "diary_entries lower bound" expected the America/Chicago local-day start, received null. (b) "read-only load must never write" observed POST /rest/v1/rpc/has_role — but a Supabase RPC is POST even for a pure read, so that fence conflates HTTP method with mutation and is likely a test-contract defect, not a product write. Both need triage before wiring.',
  },
  "e2e/ui-overhaul-responsive.spec.ts": {
    class: EXEMPTION_CLASS.RED_WHEN_RUN,
    reason:
      'Credential-free and mocked (7 page.route). 2 of 9 tests fail deterministically at 320px and 1440px: "/daily-check must not conceal intrinsic horizontal overflow", 11 violations. The other 7 pass. Wiring the file red would block every PR.',
  },

  /* ---------------- pgTAP lane ---------------- */
  ...pgTapExemptions(),

  /* ---------------- Runtime-harness lane ---------------- */
  ...harnessExemptions(),
};

/**
 * pgTAP suites. P2(c) is BLOCKED, established rather than assumed: `bunx supabase`
 * resolves the CLI at 2.116.0, but `supabase start` requires Docker and
 * `docker info` finds no daemon in this environment.
 */
function pgTapExemptions(): Record<string, { class: string; reason: string }> {
  const blocked =
    "pgTAP suite with no lane. Running it needs a local Supabase (`supabase start`), which needs a Docker daemon that is not available here — P2(c) is BLOCKED, not skipped.";
  const out: Record<string, { class: string; reason: string }> = {};
  for (const file of [
    "supabase/tests/paddle_subscription_update_rpc_harness.sql",
    "supabase/tests/permissions.sql",
    "supabase/tests/pheno_candidate_number_contract.sql",
    "supabase/tests/pheno_candidate_number_maintenance_paths.sql",
    "supabase/tests/vpd_targets.sql",
    "supabase/tests/vpd_targets_global_defaults.sql",
  ]) {
    out[file] = { class: EXEMPTION_CLASS.NEEDS_LIVE_DATABASE, reason: blocked };
  }
  out["supabase/tests/billing_subscriptions_rls.sql"] = {
    class: EXEMPTION_CLASS.NEEDS_LIVE_DATABASE,
    reason: `${blocked} ADDITIONALLY BROKEN: line 59 calls max(user_id) on a uuid column, and max(uuid) does not exist in PostgreSQL — proven on a throwaway PG 16.13 cluster (0 rows in pg_aggregate; "ERROR: function max(uuid) does not exist", with max(text) as a passing control). Note it is not necessarily the FIRST error: without psql variables the file dies earlier at "syntax error at or near \\":\\"". Wiring this lane will not make this suite pass.`,
  };
  return out;
}

/**
 * Runtime RLS/security harnesses that `test:security-db-local` does not invoke.
 * These are P5's slice, and P5 is not a matter of appending all of them:
 * src/test/genetics-propagation-rls-harness-static.test.ts pins that
 * test:security-db-local must NOT contain the genetics harness, so a naive
 * append turns that guard red.
 */
function harnessExemptions(): Record<string, { class: string; reason: string }> {
  const reason =
    "Runtime harness needing a live database and a service-role key; no workflow invokes it. Deferred to P5, which cannot simply append all of them — src/test/genetics-propagation-rls-harness-static.test.ts pins that test:security-db-local must NOT list the genetics harness.";
  const out: Record<string, { class: string; reason: string }> = {};
  for (const file of [
    "scripts/run-action-queue-rls-harness.ts",
    "scripts/run-ai-credit-grow-scope-integrity-harness.ts",
    "scripts/run-ai-credit-pack-portability-harness.ts",
    "scripts/run-ai-credits-rls-harness.ts",
    "scripts/run-ai-doctor-review-completion-rls-harness.ts",
    "scripts/run-ai-doctor-review-evidence-receipt-rls-harness.ts",
    "scripts/run-billing-rls-harness.ts",
    "scripts/run-free-creation-caps-rls-harness.ts",
    "scripts/run-genetics-propagation-rls-harness.ts",
    "scripts/run-paid-launch-proof-harness.ts",
    "scripts/run-pheno-candidate-number-rls-harness.ts",
    "scripts/run-quicklog-revisions-rls-harness.ts",
    "scripts/run-sensor-history-read-cap-rls-harness.ts",
    "scripts/run-staff-grant-trigger-harness.ts",
    "scripts/run-staff-role-rls-harness.ts",
    "scripts/run-verdant-storage-rls-harness.ts",
  ]) {
    out[file] = { class: EXEMPTION_CLASS.NEEDS_LIVE_DATABASE, reason };
  }
  // Named by irrigation-pgtap-rls-gate.yml ONLY in a trigger `paths:` filter and a shell
  // dry-run allowlist — never on a command line. The forked resolver this file once used
  // read those mentions as execution and reported both as RUN; the audit's resolver does
  // not, and neither does any workflow. Envelope, grepped per file on this head: no opt-in
  // gate, no production refusal, no loopback requirement. (run-quicklog-typed-payloads has a
  // SKIP for MISSING credentials — with credentials present it runs unasked, which is the
  // opposite of an opt-in gate.) Same P5 slice, same class.
  const onlyMentioned =
    "Runtime harness needing a live database and a service-role key. Named by irrigation-pgtap-rls-gate.yml only in a paths: filter and a dry-run allowlist, never executed; audit defect 31 corrected the inventory that missed it. No opt-in gate, no production refusal, no loopback check (measured). Deferred to P5 with the others.";
  for (const file of [
    "scripts/run-create-feeding-event-rls-harness.ts",
    "scripts/run-quicklog-typed-payloads-harness.ts",
  ]) {
    out[file] = { class: EXEMPTION_CLASS.NEEDS_LIVE_DATABASE, reason: onlyMentioned };
  }
  return out;
}

const audit = auditExecutionManifest({ lanes: LANES, namedPaths, exemptions: EXEMPTIONS });

describe("test execution manifest — every committed test runs, or says why not", () => {
  it("finds no lane file that nothing executes and nobody declared", () => {
    const dead = audit.findings.filter((f: { kind: string }) => f.kind === FINDING.UNEXEMPT_DEAD);
    expect(
      dead,
      `These test files are committed but NOTHING runs them. Wire them into a workflow, or add an\n` +
        `EXEMPTIONS entry naming the class and a checkable reason:\n` +
        dead.map((f: { lane: string; file: string }) => `  [${f.lane}] ${f.file}`).join("\n"),
    ).toEqual([]);
  });

  it("carries no stale exemption — every entry names a real, still-unrun file", () => {
    const stale = audit.findings.filter(
      (f: { kind: string }) =>
        f.kind === FINDING.EXEMPTION_NOW_EXECUTED || f.kind === FINDING.EXEMPTION_FILE_MISSING,
    );
    expect(
      stale,
      `Stale exemptions. The ratchet only keeps its meaning if entries are deleted once they stop\n` +
        `applying:\n` +
        stale
          .map((f: { kind: string; file: string; detail: string }) => `  ${f.file} — ${f.detail}`)
          .join("\n"),
    ).toEqual([]);
  });

  it("gives every exemption a known class and a non-empty reason", () => {
    expect(
      audit.findings.filter((f: { kind: string }) => f.kind === FINDING.EXEMPTION_MALFORMED),
    ).toEqual([]);
  });

  it("keeps the four lanes at or above their audited execution counts", () => {
    // Ratchet floors, not targets. The audit measured 10/31 deno, 35/60 playwright,
    // 23/41 harness and 2/9 pgTAP as executed at its pinned rev; P2(a)/P2(b) then wired
    // 19 deno files and 14 specs. Regressing below today's counts fails.
    const byLabel = Object.fromEntries(audit.lanes.map((l: { label: string }) => [l.label, l]));
    expect(byLabel["deno edge tests"].executed).toBeGreaterThanOrEqual(29);
    expect(byLabel["playwright specs"].executed).toBeGreaterThanOrEqual(49);
    expect(byLabel["runtime harnesses"].executed).toBeGreaterThanOrEqual(23);
    expect(byLabel["pgTAP suites"].executed).toBeGreaterThanOrEqual(2);
  });

  it("caps each exemption class at today's count, so the list can only shrink", () => {
    const byClass: Record<string, number> = {};
    for (const entry of Object.values(EXEMPTIONS)) {
      byClass[entry.class] = (byClass[entry.class] ?? 0) + 1;
    }
    expect(byClass[EXEMPTION_CLASS.NOT_HERMETIC] ?? 0).toBeLessThanOrEqual(8);
    expect(byClass[EXEMPTION_CLASS.RED_WHEN_RUN] ?? 0).toBeLessThanOrEqual(3);
    expect(byClass[EXEMPTION_CLASS.AWAITING_DECISION] ?? 0).toBeLessThanOrEqual(1);
    expect(byClass[EXEMPTION_CLASS.NEEDS_LIVE_DATABASE] ?? 0).toBeLessThanOrEqual(25);
    expect(byClass[EXEMPTION_CLASS.FLAKY] ?? 0).toBeLessThanOrEqual(1);
  });

  it("actually discovers all four lanes (a guard over an empty set proves nothing)", () => {
    expect(denoTests.length).toBeGreaterThan(25);
    expect(e2eSpecs.length).toBeGreaterThan(50);
    expect(harnesses.length).toBeGreaterThanOrEqual(41);
    expect(pgTapSuites.length).toBeGreaterThan(5);
  });
});

describe("manifest resolver — the ways this guard could silently stop working", () => {
  it("does not read a trigger `paths:` filter as execution", () => {
    // The seductive error: `on: pull_request: paths: - 'e2e/**'` decides WHETHER a
    // workflow runs, never WHAT it executes. A prototype that counted it reported
    // 32 unrun Playwright specs when the true figure was 25.
    const wf = [
      "name: x",
      "on:",
      "  pull_request:",
      "    paths:",
      '      - "e2e/dead.spec.ts"',
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: echo hi",
      "",
    ].join("\n");
    const paths = namedPathsIn(buildExecutionCorpus({ workflowTexts: [wf] }));
    expect(paths.has("e2e/dead.spec.ts")).toBe(false);
  });

  it("does not read a commented-out command as execution", () => {
    // The defeat AGENTS.md documents for playwright-action-timeout-fence, applied to
    // this guard: disabling a lane by commenting out its command must NOT leave the
    // guard green. A forked resolver that took every workflow line as evidence did.
    const wf = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: echo hi",
      "      # playwright test e2e/dead.spec.ts",
      "",
    ].join("\n");
    const paths = namedPathsIn(buildExecutionCorpus({ workflowTexts: [wf] }));
    expect(paths.has("e2e/dead.spec.ts")).toBe(false);
  });

  it("does not read a path inside a shell allowlist array as execution", () => {
    // The real case: irrigation-pgtap-rls-gate.yml holds
    //   ALLOWLIST=( "scripts/run-create-feeding-event-rls-harness.ts" ... )
    // inside a `run: |` block. It is data the step consults, not a command it runs.
    // Reading it as execution reported two never-run harnesses as RUN.
    const wf = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: |",
      "          ALLOWLIST=(",
      '            "scripts/run-dead-harness.ts"',
      "          )",
      "          bun run test:live",
      "",
    ].join("\n");
    const corpus = buildExecutionCorpus({
      workflowTexts: [wf],
      scripts: { "test:live": "node scripts/run-live-harness.ts" },
    });
    const paths = namedPathsIn(corpus);
    expect(paths.has("scripts/run-dead-harness.ts")).toBe(false);
    expect(paths.has("scripts/run-live-harness.ts")).toBe(true);
  });

  it("discovers nested and *-db-security harnesses, not only root-level *harness* files", () => {
    // Defect 31 in the audit: the root-level, `harness`-in-name rule missed eight real
    // harnesses that security-db-local.yml runs. The inventory here must not repeat it.
    expect(harnesses).toContain("scripts/security/run-bridge-tokens-db-security.mjs");
    expect(harnesses).toContain("scripts/run-pgmq-email-wrapper-grants-db-security.ts");
    expect(isRuntimeHarness("scripts/security/run-profiles-db-security.mjs")).toBe(true);
    expect(isRuntimeHarness("scripts/run-billing-rls-harness.ts")).toBe(true);
    expect(isRuntimeHarness("scripts/lib/testEstateRules.mjs")).toBe(false);
  });

  it("resolves a bare basename on a command line to the one lane file it names", () => {
    // `bunx playwright test agent-integrations-smoke.spec.ts` — Playwright resolves the
    // bare name against testDir. The forked resolver reported that spec as RUN only
    // because a job-summary `echo` mentioned its full path: right answer, wrong reason.
    const wf = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: bunx playwright test dead.spec.ts --project=chromium-mocked",
      "",
    ].join("\n");
    const named = namedPathsIn(buildExecutionCorpus({ workflowTexts: [wf] }));
    expect(named.has("e2e/dead.spec.ts")).toBe(false); // exact-path matching alone misses it
    const resolved = resolveBareBasenames({
      laneFiles: ["e2e/dead.spec.ts", "e2e/other.spec.ts"],
      namedPaths: named,
    });
    expect(resolved.has("e2e/dead.spec.ts")).toBe(true);
    expect(resolved.has("e2e/other.spec.ts")).toBe(false);
    // Ambiguous: two lane files share the basename, so a bare token cannot say which ran.
    const ambiguous = resolveBareBasenames({
      laneFiles: ["supabase/functions/a/contract.test.ts", "supabase/functions/b/contract.test.ts"],
      namedPaths: new Set(["contract.test.ts"]),
    });
    expect(ambiguous.has("supabase/functions/a/contract.test.ts")).toBe(false);
    expect(ambiguous.has("supabase/functions/b/contract.test.ts")).toBe(false);
  });

  it("keeps a path the job body genuinely runs", () => {
    const wf = [
      "name: x",
      "on:",
      "  push:",
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: playwright test e2e/live.spec.ts",
      "",
    ].join("\n");
    const paths = namedPathsIn(buildExecutionCorpus({ workflowTexts: [wf] }));
    expect(paths.has("e2e/live.spec.ts")).toBe(true);
  });

  it("matches exact paths only — never a directory prefix or glob", () => {
    // An early prototype accepted prefixes and reported all 100 lane files as
    // reached, because a bare `**` appears somewhere in the corpus.
    const paths = namedPathsIn("we run e2e/one.spec.ts and also e2e/**");
    expect(paths.has("e2e/one.spec.ts")).toBe(true);
    expect(paths.has("e2e/two.spec.ts")).toBe(false);
  });

  it("resolves `bun run x` through package scripts, including flags before `run`", () => {
    const scriptsFixture = { x: "playwright test e2e/via-script.spec.ts" };
    const corpusA = buildExecutionCorpus({
      workflowTexts: ["jobs:\n  a:\n    steps:\n      - run: bun run x\n"],
      scripts: scriptsFixture,
    });
    const corpusB = buildExecutionCorpus({
      workflowTexts: ["jobs:\n  a:\n    steps:\n      - run: bun --env-file=.env run x\n"],
      scripts: scriptsFixture,
    });
    expect(namedPathsIn(corpusA).has("e2e/via-script.spec.ts")).toBe(true);
    expect(namedPathsIn(corpusB).has("e2e/via-script.spec.ts")).toBe(true);
  });

  it("does not mistake `bunx vitest run <file>` for a package script named <file>", () => {
    expect(scriptNamesIn("bunx vitest run src/test/a.test.ts", ["a"])).toEqual([]);
  });

  it("expands a matrix-interpolated script name to every script sharing the prefix", () => {
    // `bun run e2e:ga:${{ matrix.browser }}` — missing this chain is what made
    // four google-analytics specs read as never-run during the audit.
    const names = scriptNamesIn("bun run e2e:ga:${{ matrix.browser }}", [
      "e2e:ga:chromium",
      "e2e:ga:webkit",
      "unrelated",
    ]);
    expect(names).toEqual(["e2e:ga:chromium", "e2e:ga:webkit"]);
  });

  it("follows one hop into a runner script but never into a test file", () => {
    const corpus = buildExecutionCorpus({
      workflowTexts: ["jobs:\n  a:\n    steps:\n      - run: node scripts/run-x.mjs\n"],
      readRunner: (rel: string) =>
        rel === "scripts/run-x.mjs" ? "spawn('playwright', ['e2e/hopped.spec.ts'])" : null,
    });
    expect(namedPathsIn(corpus).has("e2e/hopped.spec.ts")).toBe(true);
  });

  it("reports an undeclared unreached file, and stops once it is declared", () => {
    const lanes = [{ label: "l", files: ["e2e/ghost.spec.ts"] }];
    const bare = auditExecutionManifest({ lanes, namedPaths: new Set(), exemptions: {} });
    expect(bare.findings.map((f: { kind: string }) => f.kind)).toEqual([FINDING.UNEXEMPT_DEAD]);

    const declared = auditExecutionManifest({
      lanes,
      namedPaths: new Set(),
      exemptions: {
        "e2e/ghost.spec.ts": { class: EXEMPTION_CLASS.NOT_HERMETIC, reason: "needs a fixture URL" },
      },
    });
    expect(declared.findings).toEqual([]);
  });

  it("rejects an exemption with an unknown class or an empty reason", () => {
    const lanes = [{ label: "l", files: ["e2e/ghost.spec.ts"] }];
    for (const bad of [
      { class: "because-i-said-so", reason: "x" },
      { class: EXEMPTION_CLASS.NOT_HERMETIC, reason: "   " },
    ]) {
      const out = auditExecutionManifest({
        lanes,
        namedPaths: new Set(),
        exemptions: { "e2e/ghost.spec.ts": bad },
      });
      expect(out.findings.map((f: { kind: string }) => f.kind)).toEqual([
        FINDING.EXEMPTION_MALFORMED,
      ]);
    }
  });

  it("flags an exemption whose file now runs, and one whose file is gone", () => {
    const nowRun = auditExecutionManifest({
      lanes: [{ label: "l", files: ["e2e/a.spec.ts"] }],
      namedPaths: new Set(["e2e/a.spec.ts"]),
      exemptions: { "e2e/a.spec.ts": { class: EXEMPTION_CLASS.FLAKY, reason: "was flaky" } },
    });
    expect(nowRun.findings.map((f: { kind: string }) => f.kind)).toEqual([
      FINDING.EXEMPTION_NOW_EXECUTED,
    ]);

    const gone = auditExecutionManifest({
      lanes: [{ label: "l", files: [] }],
      namedPaths: new Set(),
      exemptions: { "e2e/deleted.spec.ts": { class: EXEMPTION_CLASS.FLAKY, reason: "was flaky" } },
    });
    expect(gone.findings.map((f: { kind: string }) => f.kind)).toEqual([
      FINDING.EXEMPTION_FILE_MISSING,
    ]);
  });

  it("is deterministic — identical evidence yields byte-identical findings", () => {
    const args = {
      lanes: [{ label: "l", files: ["e2e/b.spec.ts", "e2e/a.spec.ts"] }],
      namedPaths: new Set<string>(),
      exemptions: {},
    };
    expect(JSON.stringify(auditExecutionManifest(args))).toEqual(
      JSON.stringify(auditExecutionManifest(args)),
    );
  });

  it("tolerates a workflow that names a runner script which does not exist", () => {
    expect(() =>
      buildExecutionCorpus({
        workflowTexts: ["jobs:\n  a:\n    steps:\n      - run: node scripts/absent.mjs\n"],
        readRunner: () => null,
      }),
    ).not.toThrow();
  });

  it("strips only the top-level trigger block, keeping job bodies intact", () => {
    const stripped = stripTriggerBlock(
      "on:\n  push:\n    paths: [x]\njobs:\n  a:\n    steps: []\n",
    );
    expect(stripped).not.toContain("paths");
    expect(stripped).toContain("jobs:");
  });
});
