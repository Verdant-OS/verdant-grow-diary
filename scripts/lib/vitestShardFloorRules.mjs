// Pure rule for the required-shard test floor (audit 2026-11-05, F-04).
//
// `vitest run --shard=n/256 --passWithNoTests` exits 0 on empty discovery and
// writes a JSON report with every counter at zero. A required check that is
// green while running nothing is the quietest way a suite can stop guarding.
// This rule reads the resolved report, never the console text.

/**
 * @param {unknown} report  Parsed Vitest JSON reporter output, or null when the
 *                          file was missing or unparseable.
 * @returns {{ ok: true, suites: number, tests: number }
 *         | { ok: false, reason: "missing_report" | "no_test_files" | "no_tests" }}
 */
export function evaluateVitestShardFloor(report) {
  if (!report || typeof report !== "object") return { ok: false, reason: "missing_report" };
  const suites = report.numTotalTestSuites;
  const tests = report.numTotalTests;
  if (!Number.isInteger(suites) || !Number.isInteger(tests)) {
    return { ok: false, reason: "missing_report" };
  }
  if (suites === 0) return { ok: false, reason: "no_test_files" };
  if (tests === 0) return { ok: false, reason: "no_tests" };
  return { ok: true, suites, tests };
}
