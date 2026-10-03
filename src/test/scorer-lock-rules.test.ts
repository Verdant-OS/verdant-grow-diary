/**
 * Contract tests for the scorer lock (docs/agents/loop-engineering.md §3).
 *
 * The scorer lock is the repository's version of the "locked checks folder" in the
 * Karpathy-loop workflow: a check that already exists on the branch (tracked at HEAD)
 * may not be edited by an agent session unless that edit was declared first with
 * `node scripts/scorer-lock.mjs --unlock <path> --reason "<why>"`. A declaration is
 * bound to the branch it was made on and expires after 24 hours.
 *
 * Three layers are pinned here:
 *   1. the pure rules module (which paths are scorers, when an edit is refused, when an
 *      unlock is still in force, how a name-status diff becomes scorer rows);
 *   2. the CLI's `--hook`, `--unlock`, `--lock` and `--report` modes, run against
 *      disposable git repositories;
 *   3. the project hook wiring in `.claude/settings.json`, asserted on the resolved
 *      JSON object rather than on source text (AGENTS.md › Contract tests).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  SCORER_PATH_RULES,
  UNLOCK_FILE,
  UNLOCK_TTL_MS,
  evaluateScorerEdit,
  hookFilePaths,
  isScorerPath,
  isUnlockEntryValid,
  isUnlocked,
  normalizeRelPath,
  scorerRowsFromNameStatus,
} from "../../scripts/lib/scorerLockRules.mjs";

const REPO_ROOT = process.cwd();
const SCRIPT = resolve(REPO_ROOT, "scripts/scorer-lock.mjs");

// Parsed, not regex-scanned: the assertions below run against the resolved object, so a
// commented-out or mis-nested hook reads as absent rather than as present.
const projectSettings: unknown = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ".claude/settings.json"), "utf8"),
);

// A fixed clock for the pure tests. Nothing here reads Date.now().
const NOW = "2026-10-02T12:00:00.000Z";
const LATER = "2026-10-03T11:00:00.000Z";
const EARLIER = "2026-10-02T11:00:00.000Z";
const BRANCH = "claude/example-task";

describe("scorerLockRules — which paths are scorers", () => {
  it("treats every file under src/test/ as a scorer, helpers, setup and snapshots included", () => {
    expect(isScorerPath("src/test/quick-log-save.test.tsx")).toBe(true);
    expect(isScorerPath("src/test/setup.ts")).toBe(true);
    expect(isScorerPath("src/test/helpers/reactRouterCompat.vitest.tsx")).toBe(true);
    expect(isScorerPath("src/test/__snapshots__/upgrade-page.test.tsx.snap")).toBe(true);
  });

  it("treats co-located *.test.* and *.spec.* files under src/ as scorers", () => {
    expect(isScorerPath("src/components/QuickLog.test.tsx")).toBe(true);
    expect(isScorerPath("src/pages/support/__tests__/support-forms.test.tsx")).toBe(true);
    expect(isScorerPath("src/lib/quickLogRules.spec.ts")).toBe(true);
  });

  it("treats both Playwright lanes, e2e/ and e2e-local/, as scorers including their fixtures", () => {
    expect(isScorerPath("e2e/quicklog-smoke.spec.ts")).toBe(true);
    expect(isScorerPath("e2e/lib/fixtureSafety.ts")).toBe(true);
    expect(isScorerPath("e2e-local/native-save-retrieve.spec.ts")).toBe(true);
    expect(isScorerPath("e2e-local/lib/nativeLocalFixtures.ts")).toBe(true);
  });

  it("treats test and spec files outside src/ as scorers wherever they live", () => {
    expect(isScorerPath("supabase/functions/ai-doctor-review/index.test.ts")).toBe(true);
    expect(isScorerPath("scripts/lib/lighthouse-url-sharding.test.cjs")).toBe(true);
    expect(isScorerPath("spikes/convex-component-sandbox/sandbox.spec.ts")).toBe(true);
    expect(isScorerPath("plugins/verdant-claude-mods/verdant-guard/hooks/rules.test.ts")).toBe(
      true,
    );
  });

  it("treats the Python testbench suites and the pgTAP SQL suites as scorers", () => {
    expect(isScorerPath("tools/ecowitt-testbench/test_delivery.py")).toBe(true);
    expect(isScorerPath("tools/ggs-ble-testbench/test_ggs_ble_frame.py")).toBe(true);
    expect(isScorerPath("tools/any/frame_test.py")).toBe(true);
    expect(isScorerPath("supabase/tests/permissions.sql")).toBe(true);
    expect(isScorerPath("supabase/tests/billing_subscriptions_rls.sql")).toBe(true);
  });

  it("treats the Deno underscore-named tests under supabase/functions as scorers", () => {
    expect(isScorerPath("supabase/functions/ecowitt-ingest/handler_e2e_test.ts")).toBe(true);
    expect(isScorerPath("supabase/functions/mint-bridge-token/handler_e2e_test.ts")).toBe(true);
    expect(isScorerPath("supabase/functions/save-founder-prefs/validate_test.ts")).toBe(true);
    expect(isScorerPath("supabase/functions/sensor-ingest-webhook/cors_e2e_test.ts")).toBe(true);
    expect(isScorerPath("supabase/functions/ecowitt-ingest/handler.ts")).toBe(false);
    expect(isScorerPath("supabase/functions/ecowitt-ingest/index.ts")).toBe(false);
  });

  it("treats every gate-script prefix CI invokes as a scorer, at any depth under scripts/", () => {
    expect(isScorerPath("scripts/check-contract-test-resolution.mjs")).toBe(true);
    expect(isScorerPath("scripts/verify-edge-shared-in-sync.mjs")).toBe(true);
    expect(isScorerPath("scripts/assert-docs-safety.mjs")).toBe(true);
    expect(isScorerPath("scripts/validate-sarif.mjs")).toBe(true);
    expect(isScorerPath("scripts/audit-required-checks.mjs")).toBe(true);
    expect(isScorerPath("scripts/scan-gamification-direct-inserts.mjs")).toBe(true);
    expect(isScorerPath("scripts/precommit-ai-doctor-preview-safety.mjs")).toBe(true);
    expect(isScorerPath("scripts/test-legal-seo.mjs")).toBe(true);
    expect(isScorerPath("scripts/knowledge/validate-governance.mjs")).toBe(true);
    expect(isScorerPath("scripts/e2e/check-pheno-live-smoke-env.mjs")).toBe(true);
    expect(isScorerPath("scripts/e2e/verify-one-tent-supabase-target.mjs")).toBe(true);
    expect(isScorerPath("config/required-status-checks.json")).toBe(true);
  });

  it("treats gate scripts whose judge verb is a later token as scorers too", () => {
    expect(isScorerPath("scripts/security/static-client-secret-scan.mjs")).toBe(true);
    expect(isScorerPath("scripts/security/bridge-sensor-ingest-evidence-checks.mjs")).toBe(true);
    expect(isScorerPath("scripts/sensor-safety-check.mjs")).toBe(true);
    expect(isScorerPath("scripts/ci-ecowitt-config-validate-contract.mjs")).toBe(true);
    expect(isScorerPath("scripts/ci/pr-file-overlap-audit.mjs")).toBe(true);
    expect(isScorerPath("scripts/run-billing-rls-harness.ts")).toBe(true);
    expect(isScorerPath("scripts/security/run-profiles-db-security.mjs")).toBe(true);
    expect(isScorerPath("scripts/run-privilege-matrix-preflight.ts")).toBe(true);
    expect(isScorerPath("scripts/p3-preservation/preflight.mjs")).toBe(true);
  });

  it("keeps test- as a prefix verb and does not match a verb embedded in a longer word", () => {
    expect(isScorerPath("scripts/measure-test-estate.mjs")).toBe(false);
    expect(isScorerPath("scripts/send-ecowitt-test-payload.ts")).toBe(false);
    expect(isScorerPath("scripts/upload-per-test-artifacts.mjs")).toBe(false);
    expect(isScorerPath("scripts/dev/print-ecowitt-pc-checklist.ts")).toBe(false);
    expect(isScorerPath("scripts/clean-scanner-guardrail-artifacts.mjs")).toBe(false);
    expect(isScorerPath("scripts/run-scanner-guardrails-ci.mjs")).toBe(false);
    expect(isScorerPath("scripts/e2e/create-pheno-paid-smoke-sessions.mjs")).toBe(false);
  });

  it("treats the test-runner configs as scorers, because they decide which checks execute", () => {
    expect(isScorerPath("vitest.config.ts")).toBe(true);
    expect(isScorerPath("playwright.config.ts")).toBe(true);
    expect(isScorerPath("playwright.manual-correction-local.config.ts")).toBe(true);
    expect(isScorerPath("playwright.native-local.config.ts")).toBe(true);
    expect(isScorerPath("playwright.native-sensor-idle.config.ts")).toBe(true);
    expect(isScorerPath("spikes/cursor-sdk-local-orchestration/vitest.config.ts")).toBe(true);
    expect(isScorerPath("vitest.workspace.ts")).toBe(true);
    expect(isScorerPath("vite.config.ts")).toBe(false);
    expect(isScorerPath("eslint.config.js")).toBe(false);
    expect(isScorerPath("tailwind.config.ts")).toBe(false);
  });

  it("treats invoked gates without a verb token, and the migration manifests they judge against, as scorers", () => {
    expect(isScorerPath("scripts/diff-money-migration-prefixes.mjs")).toBe(true);
    expect(isScorerPath("scripts/probe-migration-drift.mjs")).toBe(true);
    expect(isScorerPath("scripts/annotate-edge-shared-drift.mjs")).toBe(true);
    expect(isScorerPath("scripts/required-money-migrations.mjs")).toBe(true);
    expect(isScorerPath("scripts/required-core-migrations.mjs")).toBe(true);
    // Report and notify wrappers around the same checkers are not judges.
    expect(isScorerPath("scripts/report-edge-shared-drift.mjs")).toBe(false);
    expect(isScorerPath("scripts/notify-edge-shared-drift.mjs")).toBe(false);
    expect(isScorerPath("scripts/summarize-prefix-diff-json.mjs")).toBe(false);
  });

  it("treats the lock's own control files as scorers, so the guard cannot be quietly weakened", () => {
    expect(isScorerPath("scripts/scorer-lock.mjs")).toBe(true);
    expect(isScorerPath("scripts/lib/scorerLockRules.mjs")).toBe(true);
    expect(isScorerPath(".claude/settings.json")).toBe(true);
    // The unlock record and the habits skill are not checks.
    expect(isScorerPath(".claude/scorer-unlock.json")).toBe(false);
    expect(isScorerPath(".claude/skills/verdant-loop-habits/SKILL.md")).toBe(false);
  });

  it("does not treat production code, docs, migrations, runners or other scripts as scorers", () => {
    expect(isScorerPath("src/lib/quickLogRules.ts")).toBe(false);
    expect(isScorerPath("src/components/QuickLog.tsx")).toBe(false);
    expect(isScorerPath("docs/agents/loop-engineering.md")).toBe(false);
    expect(isScorerPath("scripts/stamp-version.mjs")).toBe(false);
    expect(isScorerPath("scripts/run-vitest-batches.mjs")).toBe(false);
    expect(isScorerPath("scripts/sync-edge-shared.mjs")).toBe(false);
    expect(isScorerPath("scripts/ci/compose-release-receipt-inputs.mjs")).toBe(false);
    expect(isScorerPath("supabase/functions/_shared/lib/x.ts")).toBe(false);
    expect(isScorerPath("supabase/migrations/20261001160000_x.sql")).toBe(false);
    expect(isScorerPath("tools/ecowitt-testbench/ecowitt_delivery.py")).toBe(false);
    expect(isScorerPath("tools/ecowitt-testbench/fixtures/golden_forwarded_payload.json")).toBe(
      false,
    );
    expect(isScorerPath("src/lib/testimonialsRules.ts")).toBe(false);
    expect(isScorerPath("src/lib/spectrumRules.ts")).toBe(false);
  });

  it("normalises Windows separators and leading ./ before matching", () => {
    expect(normalizeRelPath("src\\test\\a.test.ts")).toBe("src/test/a.test.ts");
    expect(normalizeRelPath("./src/test/a.test.ts")).toBe("src/test/a.test.ts");
    expect(isScorerPath("src\\test\\a.test.ts")).toBe(true);
    expect(isScorerPath("e2e-local\\native-save-retrieve.spec.ts")).toBe(true);
  });

  it("canonicalises traversal-shaped paths so an unlock cannot pass the prefix check and match nothing", () => {
    expect(normalizeRelPath("src/test/../../src/test/a.test.ts")).toBe("src/test/a.test.ts");
    expect(normalizeRelPath("src/test/./a.test.ts")).toBe("src/test/a.test.ts");
    expect(normalizeRelPath("src/test/../../")).toBe("");
    expect(normalizeRelPath("../outside/src/test/a.test.ts")).toBe("");
    expect(normalizeRelPath("src/test/helpers/../")).toBe("src/test/");
    expect(isScorerPath("src/test/../../")).toBe(false);
    expect(isScorerPath("src/test/../lib/rules.ts")).toBe(false);
    expect(isScorerPath("src/lib/../test/a.test.ts")).toBe(true);
  });

  it("exposes the rule table as frozen data so a test can pin it", () => {
    expect(Object.isFrozen(SCORER_PATH_RULES)).toBe(true);
    expect(SCORER_PATH_RULES.length).toBeGreaterThanOrEqual(8);
    const prefixes = SCORER_PATH_RULES.filter((r) => r.kind === "prefix").map((r) => r.value);
    expect(prefixes).toEqual(
      expect.arrayContaining(["src/test/", "e2e/", "e2e-local/", "supabase/tests/"]),
    );
  });
});

describe("scorerLockRules — unlock validity", () => {
  const context = { now: NOW, branch: BRANCH };

  it("is valid before its expiry on the branch it was declared on", () => {
    expect(
      isUnlockEntryValid(
        { path: "src/test/a.test.ts", expires_at: LATER, branch: BRANCH },
        context,
      ),
    ).toBe(true);
  });

  it("is invalid once expired", () => {
    expect(
      isUnlockEntryValid(
        { path: "src/test/a.test.ts", expires_at: EARLIER, branch: BRANCH },
        context,
      ),
    ).toBe(false);
    expect(
      isUnlockEntryValid({ path: "src/test/a.test.ts", expires_at: NOW, branch: BRANCH }, context),
    ).toBe(false);
  });

  it("is invalid on a different branch", () => {
    expect(
      isUnlockEntryValid(
        { path: "src/test/a.test.ts", expires_at: LATER, branch: "codex/other-task" },
        context,
      ),
    ).toBe(false);
  });

  it("is never valid without an expiry, and never without a context", () => {
    expect(isUnlockEntryValid({ path: "src/test/a.test.ts", branch: BRANCH }, context)).toBe(false);
    expect(
      isUnlockEntryValid({ path: "src/test/a.test.ts", expires_at: LATER, branch: BRANCH }),
    ).toBe(false);
    expect(isUnlockEntryValid(null, context)).toBe(false);
  });

  it("pins the TTL at 24 hours, the handoff log's claim window", () => {
    expect(UNLOCK_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("scorerLockRules — unlock matching", () => {
  const context = { now: NOW, branch: BRANCH };
  const entries = [
    {
      path: "src/test/a.test.ts",
      reason: "pin renegotiated with the behaviour change",
      expires_at: LATER,
      branch: BRANCH,
    },
    {
      path: "src/test/helpers/",
      reason: "helper refactor approved in the task",
      expires_at: LATER,
      branch: BRANCH,
    },
    {
      path: "src/test/stale.test.ts",
      reason: "left behind by a session that was cut off",
      expires_at: EARLIER,
      branch: BRANCH,
    },
  ];

  it("matches an exact unlocked path", () => {
    expect(isUnlocked("src/test/a.test.ts", entries, context)).toBe(true);
  });

  it("matches a directory unlock only when the entry ends with a slash", () => {
    expect(isUnlocked("src/test/helpers/x.ts", entries, context)).toBe(true);
    expect(isUnlocked("src/test/helpersx.ts", entries, context)).toBe(false);
  });

  it("does not match a sibling or a prefix without a slash", () => {
    expect(isUnlocked("src/test/a.test.tsx", entries, context)).toBe(false);
    expect(isUnlocked("src/test/b.test.ts", entries, context)).toBe(false);
  });

  it("matches a traversal-shaped spelling of an unlocked path once canonicalised", () => {
    expect(isUnlocked("src/lib/../test/a.test.ts", entries, context)).toBe(true);
  });

  it("ignores an expired entry even though its path matches", () => {
    expect(isUnlocked("src/test/stale.test.ts", entries, context)).toBe(false);
  });

  it("ignores every entry on another branch", () => {
    expect(isUnlocked("src/test/a.test.ts", entries, { now: NOW, branch: "codex/other" })).toBe(
      false,
    );
  });

  it("treats a missing context as expired, so forgetting the clock is never lenient", () => {
    expect(isUnlocked("src/test/a.test.ts", entries)).toBe(false);
  });

  it("is null-safe for an empty or missing unlock list", () => {
    expect(isUnlocked("src/test/a.test.ts", [], context)).toBe(false);
    expect(isUnlocked("src/test/a.test.ts", undefined, context)).toBe(false);
  });
});

describe("scorerLockRules — evaluateScorerEdit", () => {
  it("allows a new check file (not yet tracked) so write-checks can create it", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/test/new-feature.test.ts",
      trackedAtHead: false,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    });
    expect(verdict.decision).toBe("allow");
  });

  it("refuses an edit to a tracked scorer that has not been unlocked", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    });
    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toContain("src/test/existing.test.ts");
    expect(verdict.reason).toContain("--unlock");
    expect(verdict.reason).toContain("loop-engineering.md");
  });

  it("allows an edit to a tracked scorer once it is unlocked, and refuses again once expired", () => {
    const entry = {
      path: "src/test/existing.test.ts",
      reason: "renegotiating the pin",
      expires_at: LATER,
      branch: BRANCH,
    };
    const live = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [entry],
      now: NOW,
      branch: BRANCH,
    });
    expect(live.decision).toBe("allow");
    const expired = evaluateScorerEdit({
      relPath: "src/test/existing.test.ts",
      trackedAtHead: true,
      unlockedEntries: [entry],
      now: "2026-10-04T00:00:00.000Z",
      branch: BRANCH,
    });
    expect(expired.decision).toBe("deny");
  });

  it("allows production code regardless of tracking or unlock state", () => {
    const verdict = evaluateScorerEdit({
      relPath: "src/lib/quickLogRules.ts",
      trackedAtHead: true,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    });
    expect(verdict.decision).toBe("allow");
  });

  it("is deterministic: the same input yields the same verdict", () => {
    const input = {
      relPath: "src/test/x.test.ts",
      trackedAtHead: true,
      unlockedEntries: [],
      now: NOW,
      branch: BRANCH,
    };
    expect(evaluateScorerEdit(input)).toEqual(evaluateScorerEdit(input));
  });
});

describe("scorerLockRules — hookFilePaths", () => {
  it("reads file_path for Edit and Write, notebook_path for NotebookEdit", () => {
    expect(hookFilePaths({ tool_name: "Edit", tool_input: { file_path: "/r/a.ts" } })).toEqual([
      "/r/a.ts",
    ]);
    expect(
      hookFilePaths({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/r/n.ipynb" } }),
    ).toEqual(["/r/n.ipynb"]);
  });

  it("returns an empty list for malformed or unrelated input", () => {
    expect(hookFilePaths(null)).toEqual([]);
    expect(hookFilePaths({})).toEqual([]);
    expect(hookFilePaths({ tool_name: "Bash", tool_input: { command: "ls" } })).toEqual([]);
  });
});

describe("scorerLockRules — scorerRowsFromNameStatus", () => {
  it("keeps modified, deleted, renamed and retyped scorers and drops everything else", () => {
    const rows = scorerRowsFromNameStatus(
      [
        "M\tsrc/test/a.test.ts",
        "T\tsrc/test/symlinked.test.ts",
        "T\tsrc/lib/symlinked.ts",
        "M\tsrc/lib/rules.ts",
        "D\te2e/old.spec.ts",
        "D\tdocs/x.md",
        "R100\tsrc/test/b.test.ts\tsrc/test/renamed.test.ts",
        "R087\tsrc/lib/one.ts\tsrc/lib/two.ts",
        "A\tsrc/test/new.test.ts",
        "D\tsupabase/tests/permissions.sql",
        "M\ttools/ggs-ble-testbench/test_ggs_ble_frame.py",
        "M\tscripts/knowledge/validate-governance.mjs",
      ].join("\n"),
    );
    expect(rows).toEqual([
      { change: "modified", path: "src/test/a.test.ts" },
      { change: "retyped", path: "src/test/symlinked.test.ts" },
      { change: "deleted", path: "e2e/old.spec.ts" },
      { change: "renamed", path: "src/test/renamed.test.ts", from: "src/test/b.test.ts" },
      { change: "deleted", path: "supabase/tests/permissions.sql" },
      { change: "modified", path: "tools/ggs-ble-testbench/test_ggs_ble_frame.py" },
      { change: "modified", path: "scripts/knowledge/validate-governance.mjs" },
    ]);
  });

  it("reports a rename that moves a check out of the scorer set, judged on the old path", () => {
    const rows = scorerRowsFromNameStatus("R095\tsrc/test/c.test.ts\tsrc/lib/c.ts");
    expect(rows).toEqual([{ change: "renamed", path: "src/lib/c.ts", from: "src/test/c.test.ts" }]);
  });

  it("does not report a rename from a non-scorer into a scorer path: that is a new check", () => {
    const rows = scorerRowsFromNameStatus("R090\tsrc/lib/helper.ts\tsrc/test/helper.test.ts");
    expect(rows).toEqual([]);
  });

  it("is null-safe", () => {
    expect(scorerRowsFromNameStatus("")).toEqual([]);
    expect(scorerRowsFromNameStatus(undefined as unknown as string)).toEqual([]);
  });
});

/**
 * A disposable repository with a `verdant-grow-diary` branch at the approving commit and a
 * task branch checked out on top of it, mirroring how a slice branch sits on the deploy
 * branch; `--report` resolves its default base from that ref.
 */
function makeRepo(prefix: string): string {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  execFileSync("git", ["init", "-q", "-b", "verdant-grow-diary", repo]);
  execFileSync("git", ["-C", repo, "config", "user.email", "scorer-lock@test.invalid"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "scorer lock test"]);
  mkdirSync(join(repo, "src/test"), { recursive: true });
  mkdirSync(join(repo, "src/lib"), { recursive: true });
  mkdirSync(join(repo, "e2e-local"), { recursive: true });
  mkdirSync(join(repo, "tools/testbench"), { recursive: true });
  mkdirSync(join(repo, "supabase/tests"), { recursive: true });
  mkdirSync(join(repo, "scripts/lib"), { recursive: true });
  mkdirSync(join(repo, ".claude"), { recursive: true });
  // Distinct contents, so git's rename detection pairs moving -> moved and nothing else.
  writeFileSync(join(repo, "src/test/tracked.test.ts"), "export const tracked = 1;\n");
  writeFileSync(join(repo, "src/test/doomed.test.ts"), "export const doomed = 2;\n");
  writeFileSync(join(repo, "src/test/moving.test.ts"), "export const moving = 3;\n");
  writeFileSync(join(repo, "src/test/typed.test.ts"), "export const typed = 7;\n");
  writeFileSync(join(repo, "e2e-local/native.spec.ts"), "export const native = 4;\n");
  writeFileSync(join(repo, "tools/testbench/test_frame.py"), "def test_frame():\n    pass\n");
  writeFileSync(join(repo, "supabase/tests/permissions.sql"), "select plan(1);\n");
  writeFileSync(join(repo, "src/lib/rules.ts"), "export const rules = 5;\n");
  writeFileSync(join(repo, "src/lib/helper.ts"), "export const helper = 6;\n");
  writeFileSync(join(repo, "scripts/lib/scorerLockRules.mjs"), "export const rules = [];\n");
  writeFileSync(join(repo, ".claude/settings.json"), '{ "hooks": {} }\n');
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "approve checks"]);
  execFileSync("git", ["-C", repo, "switch", "-q", "-c", "task/example"]);
  return repo;
}

describe("scripts/scorer-lock.mjs --hook and --unlock against a disposable repository", () => {
  let repo = "";

  const run = (args: string[], stdin = "") =>
    spawnSync("node", [SCRIPT, ...args], { cwd: repo, input: stdin, encoding: "utf8" });

  const hookInput = (relPath: string) =>
    JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(repo, relPath) } });

  beforeAll(() => {
    repo = makeRepo("scorer-lock-hook-");
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it("exit 2 with the refusal on stderr for a tracked, locked check", () => {
    const result = run(["--hook"], hookInput("src/test/tracked.test.ts"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("src/test/tracked.test.ts");
    expect(result.stderr).toContain("--unlock");
  });

  it("exit 2 for a tracked e2e-local spec, a Python testbench test and a pgTAP suite", () => {
    expect(run(["--hook"], hookInput("e2e-local/native.spec.ts")).status).toBe(2);
    expect(run(["--hook"], hookInput("tools/testbench/test_frame.py")).status).toBe(2);
    expect(run(["--hook"], hookInput("supabase/tests/permissions.sql")).status).toBe(2);
  });

  it("exit 2 for the lock's own tracked control files", () => {
    expect(run(["--hook"], hookInput("scripts/lib/scorerLockRules.mjs")).status).toBe(2);
    expect(run(["--hook"], hookInput(".claude/settings.json")).status).toBe(2);
  });

  it("exit 0 for a new check file that is not tracked yet", () => {
    const result = run(["--hook"], hookInput("src/test/brand-new.test.ts"));
    expect(result.status).toBe(0);
  });

  it("exit 0 for production code", () => {
    const result = run(["--hook"], hookInput("src/lib/rules.ts"));
    expect(result.status).toBe(0);
  });

  it("exit 0 for a path outside the repository", () => {
    const outside = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: join(tmpdir(), "elsewhere", "src/test/x.test.ts") },
    });
    const result = run(["--hook"], outside);
    expect(result.status).toBe(0);
  });

  it("still decides correctly when invoked from a subdirectory, as the hook does after a cd", () => {
    const fromSubdir = spawnSync("node", [SCRIPT, "--hook"], {
      cwd: join(repo, "src"),
      input: hookInput("src/test/tracked.test.ts"),
      encoding: "utf8",
    });
    expect(fromSubdir.status).toBe(2);
  });

  it("--unlock records path, reason, branch and a 24-hour expiry, after which the hook allows the edit", () => {
    const unlock = run([
      "--unlock",
      "src/test/tracked.test.ts",
      "--reason",
      "pin renegotiated in the same commit as the behaviour change",
    ]);
    expect(unlock.status).toBe(0);
    const stored = JSON.parse(readFileSync(join(repo, UNLOCK_FILE), "utf8"));
    const entry = stored.unlocked[0];
    expect(entry.path).toBe("src/test/tracked.test.ts");
    expect(entry.reason).toContain("renegotiated");
    expect(entry.branch).toBe("task/example");
    expect(Date.parse(entry.expires_at) - Date.parse(entry.at)).toBe(UNLOCK_TTL_MS);

    const result = run(["--hook"], hookInput("src/test/tracked.test.ts"));
    expect(result.status).toBe(0);
  });

  it("--unlock without --reason is refused, so every unlock is explained", () => {
    const result = run(["--unlock", "src/test/tracked.test.ts"]);
    expect(result.status).not.toBe(0);
  });

  it("--unlock with a flag token where the reason should be is refused, not recorded", () => {
    run(["--lock"]);
    const result = run(["--unlock", "src/test/tracked.test.ts", "--reason", "--strict"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--reason");
    expect(existsSync(join(repo, UNLOCK_FILE))).toBe(false);
  });

  it("--unlock with a traversal-shaped path is canonicalised before it is stored", () => {
    const unlock = run([
      "--unlock",
      "src/lib/../test/tracked.test.ts",
      "--reason",
      "pin renegotiated; path spelled through a sibling directory",
    ]);
    expect(unlock.status).toBe(0);
    const stored = JSON.parse(readFileSync(join(repo, UNLOCK_FILE), "utf8"));
    expect(stored.unlocked.map((e: { path: string }) => e.path)).toEqual([
      "src/test/tracked.test.ts",
    ]);
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(0);
    run(["--lock"]);
    const escape = run(["--unlock", "src/test/../../", "--reason", "trying to unlock the world"]);
    expect(escape.stderr).toContain("not a scorer path");
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
  });

  it("an expired unlock no longer allows the edit, and --status marks it EXPIRED", () => {
    writeFileSync(
      join(repo, UNLOCK_FILE),
      JSON.stringify({
        unlocked: [
          {
            path: "src/test/tracked.test.ts",
            reason: "left behind by a session that was cut off",
            at: "2026-01-01T00:00:00.000Z",
            expires_at: "2026-01-02T00:00:00.000Z",
            branch: "task/example",
          },
        ],
      }),
    );
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
    expect(run(["--status"]).stdout).toContain("EXPIRED");
  });

  it("an unlock declared on another branch does not carry over", () => {
    writeFileSync(
      join(repo, UNLOCK_FILE),
      JSON.stringify({
        unlocked: [
          {
            path: "src/test/tracked.test.ts",
            reason: "declared on a different task branch",
            at: new Date().toISOString(),
            expires_at: new Date(Date.now() + UNLOCK_TTL_MS).toISOString(),
            branch: "codex/other-task",
          },
        ],
      }),
    );
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
  });

  it("--lock clears the unlock file and the refusal returns", () => {
    expect(run(["--lock"]).status).toBe(0);
    expect(existsSync(join(repo, UNLOCK_FILE))).toBe(false);
    expect(run(["--hook"], hookInput("src/test/tracked.test.ts")).status).toBe(2);
  });

  it("fails open with a note when the input is not JSON", () => {
    const result = run(["--hook"], "not json");
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("scorer-lock");
  });
});

describe("scripts/scorer-lock.mjs --report against a disposable repository", () => {
  let repo = "";

  const run = (args: string[]) =>
    spawnSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" });

  beforeAll(() => {
    repo = makeRepo("scorer-lock-report-");
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it("reports nothing when no tracked scorer changed, and names the deploy-branch merge-base it used", () => {
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("no tracked scorer");
    expect(report.stdout).toContain("merge-base with verdant-grow-diary");
  });

  it("lists a modified scorer as LOCKED and --strict exits 2", () => {
    writeFileSync(join(repo, "src/test/tracked.test.ts"), "export const changed = 1;\n");
    const report = run(["--report"]);
    expect(report.status).toBe(0);
    expect(report.stdout).toContain("LOCKED   modified src/test/tracked.test.ts");
    expect(run(["--report", "--strict"]).status).toBe(2);
  });

  it("lists a deleted scorer, which --diff-filter=M alone would have hidden", () => {
    rmSync(join(repo, "src/test/doomed.test.ts"));
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(2);
    expect(report.stdout).toContain("LOCKED   deleted  src/test/doomed.test.ts");
  });

  it("lists a deleted pgTAP suite, the non-JavaScript case Codex found uncovered", () => {
    rmSync(join(repo, "supabase/tests/permissions.sql"));
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(2);
    expect(report.stdout).toContain("LOCKED   deleted  supabase/tests/permissions.sql");
  });

  it("lists a staged rename with both paths, judged on the old one", () => {
    execFileSync("git", ["-C", repo, "mv", "src/test/moving.test.ts", "src/test/moved.test.ts"]);
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(2);
    expect(report.stdout).toContain(
      "LOCKED   renamed  src/test/moving.test.ts -> src/test/moved.test.ts",
    );
  });

  it.skipIf(process.platform === "win32")(
    "lists a check replaced by a symlink as retyped, which --diff-filter=MDR alone would have hidden",
    () => {
      rmSync(join(repo, "src/test/typed.test.ts"));
      symlinkSync("../lib/rules.ts", join(repo, "src/test/typed.test.ts"));
      execFileSync("git", ["-C", repo, "add", "src/test/typed.test.ts"]);
      const report = run(["--report", "--strict"]);
      expect(report.status).toBe(2);
      expect(report.stdout).toContain("LOCKED   retyped  src/test/typed.test.ts");
    },
  );

  it("does not list a rename from a non-scorer into a scorer path: a new check needs no unlock", () => {
    execFileSync("git", ["-C", repo, "mv", "src/lib/helper.ts", "src/test/helper.test.ts"]);
    const report = run(["--report"]);
    expect(report.stdout).not.toContain("helper");
  });

  it("shows UNLOCKED once each changed scorer is declared, and --strict exits 0", () => {
    const unlock = run([
      "--unlock",
      "src/test/tracked.test.ts",
      "src/test/doomed.test.ts",
      "src/test/moving.test.ts",
      "src/test/typed.test.ts",
      "supabase/tests/permissions.sql",
      "--reason",
      "pins renegotiated, two obsolete checks removed, one moved with its module, one symlinked",
    ]);
    expect(unlock.status).toBe(0);
    const report = run(["--report", "--strict"]);
    expect(report.status).toBe(0);
    expect(report.stdout).not.toContain("LOCKED  ");
    expect(report.stdout).toContain("UNLOCKED modified src/test/tracked.test.ts");
    if (process.platform !== "win32") {
      expect(report.stdout).toContain("UNLOCKED retyped  src/test/typed.test.ts");
    }
    expect(report.stdout).toContain("UNLOCKED deleted  src/test/doomed.test.ts");
    expect(report.stdout).toContain("UNLOCKED deleted  supabase/tests/permissions.sql");
    expect(report.stdout).toContain("UNLOCKED renamed  src/test/moving.test.ts");
  });

  it("still reports the changes after they are committed, because the base is the deploy-branch merge-base, not HEAD", () => {
    execFileSync("git", ["-C", repo, "add", "-A"]);
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "task commit"]);
    const declared = run(["--report", "--strict"]);
    expect(declared.status).toBe(0);
    expect(declared.stdout).toContain("UNLOCKED modified src/test/tracked.test.ts");
    expect(declared.stdout).toContain("UNLOCKED renamed  src/test/moving.test.ts");
    run(["--lock"]);
    const undeclared = run(["--report", "--strict"]);
    expect(undeclared.status).toBe(2);
    expect(undeclared.stdout).toContain("LOCKED   modified src/test/tracked.test.ts");
    const headOnly = run(["--report", "--strict", "--base", "HEAD"]);
    expect(headOnly.status).toBe(0);
    expect(headOnly.stdout).toContain("no tracked scorer");
  });
});

describe("scripts/scorer-lock.mjs --report when no deploy-branch ref exists", () => {
  let repo = "";

  const run = (args: string[]) =>
    spawnSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" });

  beforeAll(() => {
    // A fresh or shallow checkout: a `main` branch only, with a scorer change already committed.
    repo = mkdtempSync(join(tmpdir(), "scorer-lock-nobase-"));
    execFileSync("git", ["init", "-q", "-b", "main", repo]);
    execFileSync("git", ["-C", repo, "config", "user.email", "scorer-lock@test.invalid"]);
    execFileSync("git", ["-C", repo, "config", "user.name", "scorer lock test"]);
    mkdirSync(join(repo, "src/test"), { recursive: true });
    writeFileSync(join(repo, "src/test/a.test.ts"), "export const a = 1;\n");
    execFileSync("git", ["-C", repo, "add", "."]);
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "approve checks"]);
    writeFileSync(join(repo, "src/test/a.test.ts"), "export const a = 2;\n");
    execFileSync("git", ["-C", repo, "add", "."]);
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "weaken a check"]);
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it("--strict refuses with exit 1 instead of certifying a HEAD-only comparison", () => {
    const strict = run(["--report", "--strict"]);
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain("--strict needs a deploy-branch merge-base");
    expect(strict.stderr).toContain("--base <ref>");
    expect(strict.stdout).not.toContain("no tracked scorer");
  });

  it("a plain report still runs against HEAD and says committed changes are not covered", () => {
    const plain = run(["--report"]);
    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain(
      "HEAD (no deploy-branch ref found; committed changes are not covered)",
    );
  });

  it("--strict with an explicit --base sees the committed change and exits 2", () => {
    const based = run(["--report", "--strict", "--base", "HEAD^"]);
    expect(based.status).toBe(2);
    expect(based.stdout).toContain("LOCKED   modified src/test/a.test.ts");
  });
});

describe(".claude/settings.json — the hook is wired on the resolved object", () => {
  const preToolUse = (projectSettings as { hooks?: { PreToolUse?: unknown[] } }).hooks?.PreToolUse;

  const commands = () =>
    ((preToolUse ?? []) as Array<{ hooks?: Array<{ type?: string; command?: string }> }>)
      .flatMap((g) => g.hooks ?? [])
      .filter((h) => h.type === "command")
      .map((h) => h.command ?? "");

  it("declares a PreToolUse group for the file-writing tools", () => {
    expect(Array.isArray(preToolUse)).toBe(true);
    const group = (preToolUse as Array<{ matcher?: string; hooks?: unknown[] }>).find((g) =>
      (g.matcher ?? "").split("|").includes("Edit"),
    );
    expect(group).toBeDefined();
    const matcher = (group?.matcher ?? "").split("|");
    for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) {
      expect(matcher).toContain(tool);
    }
  });

  it("runs scripts/scorer-lock.mjs --hook as a command hook", () => {
    expect(
      commands().some((c) => c.includes("scripts/scorer-lock.mjs") && c.includes("--hook")),
    ).toBe(true);
  });

  it("anchors the command to CLAUDE_PROJECT_DIR so a cd in the session cannot unresolve the script", () => {
    const hook = commands().find((c) => c.includes("scripts/scorer-lock.mjs"));
    expect(hook).toBeDefined();
    expect(hook).toContain("CLAUDE_PROJECT_DIR");
    expect(hook!.indexOf("CLAUDE_PROJECT_DIR")).toBeLessThan(
      hook!.indexOf("scripts/scorer-lock.mjs"),
    );
  });

  it("the unlock file is ignored by git so an unlock never ships", () => {
    const gitignore = readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8");
    expect(gitignore.split(/\r?\n/)).toContain(UNLOCK_FILE);
  });
});
