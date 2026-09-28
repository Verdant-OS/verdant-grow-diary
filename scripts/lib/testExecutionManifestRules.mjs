/**
 * Pure reachability logic for the test-execution manifest.
 *
 * A committed test is not a running test. The 2026-08-29 coverage audit
 * (docs/audits/test-coverage-audit-2026-08-29.md, finding F3) measured four
 * whole lanes that CI never invoked: 21 of 31 colocated Deno edge tests, 25 of
 * 60 Playwright specs, 18 of 41 runtime harnesses and 7 of 9 pgTAP suites. Each
 * of those files reads as coverage in review and supplies none. Nothing in the
 * repository could observe that, because nothing asked the question.
 *
 * This module answers exactly one question against evidence the caller reads:
 * for each test file in a lane, does anything CI runs actually name it?
 *
 * It deliberately does NOT decide whether a test passes. "Wired" and "green"
 * are different properties, and conflating them is how a lane gets quarantined
 * to keep a gate quiet. Files that are wired-but-red stay visible here as
 * declared exemptions with their failure recorded, never as silence.
 *
 * No fs, no network, no clock, no randomness — the caller injects every input,
 * so this is unit-testable without a repository. Ordering is stable with
 * explicit tie-breakers, so the same evidence always yields the same report.
 *
 * RESOLUTION IS SHARED WITH THE AUDIT, NOT FORKED. Which workflow lines count
 * as execution, how `bun run x` chains through package.json, and which files
 * are runtime harnesses all live in ./testEstateRules.mjs — the module the
 * audit's reproducer runs — and are re-exported from here. This file once
 * carried its own copy. That copy took every line of a workflow as evidence,
 * so a command disabled by commenting it out (the defeat AGENTS.md records for
 * playwright-action-timeout-fence) left this guard green, and two irrigation
 * harnesses named only in a `paths:` filter and a dry-run allowlist were
 * reported as RUN. It also discovered harnesses by the root-level,
 * `harness`-in-name rule the audit retired as defect 31, missing eight. One
 * resolver, one definition: a fix to either now lands in both.
 */
import {
  buildExecutableCorpus,
  expandScript,
  isPlaywrightSpec,
  isRuntimeHarness,
  namedPathsIn,
  resolveBareBasenames,
  scriptNamesIn,
  stripDisabledBlocks,
  stripJsComments,
  stripTriggerBlock,
} from "./testEstateRules.mjs";

export {
  buildExecutableCorpus,
  expandScript,
  isPlaywrightSpec,
  isRuntimeHarness,
  namedPathsIn,
  resolveBareBasenames,
  scriptNamesIn,
  stripDisabledBlocks,
  stripJsComments,
  stripTriggerBlock,
};

/**
 * The name this module exported before the resolver was unified. Kept as an
 * alias so existing callers read unchanged and the rename is a diff, not a trap.
 */
export const buildExecutionCorpus = buildExecutableCorpus;

/**
 * Why a lane file is allowed to be unreached. Every exemption names one.
 *
 * These are reasons, not excuses: each one is a claim about the world that a
 * reviewer can check and that this module forces you to keep true. An exemption
 * whose file has started running, or has stopped existing, is a failure.
 */
export const EXEMPTION_CLASS = Object.freeze({
  /** Contacts a real network, deployed service, or fixture URL. Cannot run hermetically. */
  NOT_HERMETIC: "not-hermetic",
  /** Hermetic and credential-free, but fails deterministically today. Failure recorded. */
  RED_WHEN_RUN: "red-when-run",
  /** Passes in isolation, observed to fail under contention. Never wire a flake into a gate. */
  FLAKY: "flaky",
  /** Blocked on a human decision (ownership, security boundary) that is not an agent's to make. */
  AWAITING_DECISION: "awaiting-decision",
  /** Needs a live/local database the CI lane does not provision. */
  NEEDS_LIVE_DATABASE: "needs-live-database",
});

const VALID_CLASSES = new Set(Object.values(EXEMPTION_CLASS));

/** Finding kinds. All are failures — this module reports no advisory findings. */
export const FINDING = Object.freeze({
  /** A lane file nothing runs, with no declared exemption. The regression this guards. */
  UNEXEMPT_DEAD: "UNEXEMPT_DEAD",
  /** An exemption for a file that IS now executed. Stale — delete the entry. */
  EXEMPTION_NOW_EXECUTED: "EXEMPTION_NOW_EXECUTED",
  /** An exemption for a file that no longer exists. Stale — delete the entry. */
  EXEMPTION_FILE_MISSING: "EXEMPTION_FILE_MISSING",
  /** An exemption missing a class or a reason. */
  EXEMPTION_MALFORMED: "EXEMPTION_MALFORMED",
});

/**
 * Audit every lane against the corpus and the declared exemptions.
 *
 * `lanes` is `[{ label, files }]`; `exemptions` maps a repo-relative path to
 * `{ class, reason }`. Findings are sorted by kind then path so the report is
 * byte-stable across runs.
 */
export function auditExecutionManifest({ lanes, namedPaths, exemptions }) {
  const findings = [];
  const laneReports = [];
  const allFiles = new Set();

  for (const { label, files } of lanes) {
    const unreached = [];
    for (const file of [...files].sort()) {
      allFiles.add(file);
      if (namedPaths.has(file)) continue;
      unreached.push(file);
      const exemption = exemptions[file];
      if (!exemption) {
        findings.push({
          kind: FINDING.UNEXEMPT_DEAD,
          lane: label,
          file,
          detail:
            "committed but nothing executes it; wire it, or declare an exemption naming the class and the reason",
        });
      } else if (!VALID_CLASSES.has(exemption.class) || !exemption.reason?.trim()) {
        findings.push({
          kind: FINDING.EXEMPTION_MALFORMED,
          lane: label,
          file,
          detail: "an exemption needs a known class and a non-empty reason",
        });
      }
    }
    laneReports.push({
      label,
      total: files.length,
      executed: files.length - unreached.length,
      unreached,
    });
  }

  for (const file of Object.keys(exemptions).sort()) {
    if (!allFiles.has(file)) {
      findings.push({
        kind: FINDING.EXEMPTION_FILE_MISSING,
        lane: null,
        file,
        detail: "exempted file is not in any lane — delete the stale entry",
      });
    } else if (namedPaths.has(file)) {
      findings.push({
        kind: FINDING.EXEMPTION_NOW_EXECUTED,
        lane: null,
        file,
        detail: "this file now runs — delete the stale exemption so the ratchet keeps its meaning",
      });
    }
  }

  findings.sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file));
  return { findings, lanes: laneReports };
}
