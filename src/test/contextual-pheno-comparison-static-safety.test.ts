/**
 * contextual-pheno-comparison-static-safety.test
 *
 * Real-repo static safety scan. Uses the shared utility in
 * `@/test/utils/contextualPhenoComparisonStaticSafety` so phrase rules
 * + formatters stay in one place.
 *
 * When run in GitHub Actions, also emits ::error annotations before
 * failing so PR diffs show inline findings.
 */
import { describe, expect, it } from "vitest";
import {
  CONTEXTUAL_PHENO_COMPARISON_SAFETY_FILES,
  formatGithubAnnotations,
  formatLocalReport,
  scanFile,
} from "@/test/utils/contextualPhenoComparisonStaticSafety";

describe("contextual-pheno-comparison static safety", () => {
  for (const file of CONTEXTUAL_PHENO_COMPARISON_SAFETY_FILES) {
    it(`${file}: no unsafe ops or wording`, () => {
      const findings = scanFile(file);
      if (findings.length > 0) {
        if (process.env.GITHUB_ACTIONS === "true") {
          // eslint-disable-next-line no-console
          console.log(formatGithubAnnotations(findings));
        }
        throw new Error(formatLocalReport(findings));
      }
      expect(findings).toEqual([]);
    });
  }
});
