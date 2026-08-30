/**
 * Pure reachability logic for the test-execution manifest.
 *
 * A committed test is not a running test. The 2026-08-29 coverage audit
 * (docs/audits/test-coverage-audit-2026-08-29.md, finding F3) measured four
 * whole lanes that CI never invoked: 21 of 31 colocated Deno edge tests, 25 of
 * 60 Playwright specs, 16 of 33 runtime harnesses and 7 of 9 pgTAP suites. Each
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
 */

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

const RUNNERS = new Set(["bun", "bunx", "npm", "yarn", "pnpm"]);
const SCRIPT_NAME = /^[A-Za-z0-9:_-]+$/;

/**
 * Package-script names a command text invokes: `bun run x`, and also
 * `bun --env-file=.env run x`, where flags sit between the runner and `run`.
 *
 * Tokenised, not matched with one regex. The regex form of this needed a nested
 * quantifier over the flag run — `(?:\s+--?[^\s]+)*` — which CodeQL correctly
 * flagged as exponential backtracking (alert 254, high) on this repository. It
 * was not theoretical: on `"bun -" + "-! -".repeat(n)` the match time grew
 * 3.8ms -> 14.8 -> 66.2 -> 262.6 as n went 18 -> 24, on a 101-character input.
 * Scanning tokens is linear and says what it means.
 *
 * Only tokens that START WITH A DASH are skipped, so `bunx vitest run <file>`
 * is correctly NOT read as a package script: `vitest` is not a flag, and that
 * `run` belongs to vitest.
 */
export function scriptNamesIn(text, scriptNames = []) {
  const names = [];
  const tokens = String(text).split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!RUNNERS.has(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith("-")) j += 1;
    if (tokens[j] !== "run") continue;
    const name = tokens[j + 1];
    if (!name) continue;
    if (SCRIPT_NAME.test(name)) {
      names.push(name);
      continue;
    }
    // A workflow may interpolate a matrix value into the script name, as in
    // `bun run e2e:ga:${{ matrix.browser }}` with browser: [chromium, webkit].
    // Resolving the matrix means parsing the workflow; taking the literal
    // prefix and reaching every script that extends it is the conservative
    // read. Conservative here means "counts as executed", which is the safe
    // direction for a guard that must never call a file dead while something
    // runs it. Missing this chain is what made four google-analytics specs
    // read as never-run during the audit.
    const prefix = name.split("${")[0];
    if (prefix.length > 0 && SCRIPT_NAME.test(prefix)) {
      for (const candidate of scriptNames) {
        if (candidate.startsWith(prefix)) names.push(candidate);
      }
    }
  }
  return names;
}

/** Recursively inline the bodies of package scripts a script chains to. */
export function expandScript(name, scripts, depth = 0, seen = new Set()) {
  if (depth > 8 || !scripts[name] || seen.has(name)) return "";
  seen.add(name);
  const scriptNames = Object.keys(scripts);
  let out = scripts[name];
  for (const called of scriptNamesIn(scripts[name], scriptNames)) {
    out += ` ${expandScript(called, scripts, depth + 1, seen)}`;
  }
  return out;
}

/**
 * Remove the top-level `on:` block from a workflow.
 *
 * A trigger's `paths:` filter names files to decide WHETHER the workflow runs;
 * it never names files the workflow EXECUTES. Counting it as execution is the
 * single most seductive error here: a prototype that skipped this step reported
 * 32 unrun Playwright specs when the true figure was 25, because path filters
 * mention `e2e/**`.
 *
 * Textual rather than a YAML parse so this stays dependency-free — js-yaml is
 * only a transitive dependency. GitHub workflow YAML puts top-level keys at
 * column 0, so the block runs until the next column-0 key.
 */
export function stripTriggerBlock(text) {
  const out = [];
  let inTrigger = false;
  for (const line of String(text).split("\n")) {
    if (/^on:/.test(line)) {
      inTrigger = true;
      continue;
    }
    if (inTrigger && /^[^\s#]/.test(line)) inTrigger = false;
    if (!inTrigger) out.push(line);
  }
  return out.join("\n");
}

/** A repo runner script a workflow may delegate to. Never followed into a test file. */
const RUNNER_PATH = /(?:^|[\s"'`])((?:scripts|e2e|tools)\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts))/g;
const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * Everything CI can be said to execute, as one text corpus.
 *
 * `readRunner(relPath)` returns that file's source, or null when absent. One
 * hop only: a workflow that delegates to `scripts/run-x.mjs` hides its file
 * list inside that runner, but following a chain of arbitrary depth turns any
 * transitive mention into "executed" and the guard stops meaning anything.
 */
export function buildExecutionCorpus({ workflowTexts, scripts = {}, readRunner = () => null }) {
  const scriptNames = Object.keys(scripts);
  let corpus = workflowTexts.map(stripTriggerBlock).join(" ");
  for (const called of scriptNamesIn(corpus, scriptNames)) {
    corpus += ` ${expandScript(called, scripts)}`;
  }
  const followed = new Set();
  for (const match of corpus.matchAll(new RegExp(RUNNER_PATH.source, "g"))) {
    const rel = match[1];
    if (followed.has(rel) || IS_TEST_FILE.test(rel)) continue;
    followed.add(rel);
    const body = readRunner(rel);
    if (typeof body === "string") corpus += ` ${body}`;
  }
  return corpus;
}

/**
 * Exact repo-relative path tokens the corpus names.
 *
 * Matching is exact path equality and nothing else. An early prototype accepted
 * directory prefixes and glob tokens, and reported all 100 lane files as
 * reached because a bare `**` appears somewhere in the corpus. A guard that
 * cannot fail is worse than no guard, because it also looks like coverage.
 */
export function namedPathsIn(corpus) {
  return new Set(
    [...String(corpus).matchAll(/[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:ts|tsx|mjs|cjs|js|sql)/g)].map(
      (m) => m[0],
    ),
  );
}

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
