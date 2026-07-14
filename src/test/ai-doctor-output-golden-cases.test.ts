/**
 * AI Doctor Output Evaluation — golden-case regression runner.
 *
 * Table-driven over adversarial fixtures. Pure / deterministic. No I/O, no
 * Supabase, no model calls. Explicit assertions only (no snapshot-as-oracle).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAiDoctorOutput,
  type AiDoctorEvaluationSeverity,
  type AiDoctorEvaluationFinding,
  type AiDoctorOutputEvaluationInput,
} from "@/lib/aiDoctorOutputEvaluation";
import {
  ALL_OUTPUT_EVALUATION_CASES,
  type AiDoctorGoldenCase,
} from "./fixtures/ai-doctor-output-evaluation";

const SEVERITY_WEIGHT: Record<AiDoctorEvaluationSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function inputFor(c: AiDoctorGoldenCase): AiDoctorOutputEvaluationInput {
  return {
    result: c.result,
    context: c.context,
    readiness: c.readiness,
    automatedConfidence: c.automatedConfidence,
  };
}

/** True when findings are ordered by (severity, code, field, message). */
function isStablySorted(findings: readonly AiDoctorEvaluationFinding[]): boolean {
  for (let i = 1; i < findings.length; i += 1) {
    const a = findings[i - 1];
    const b = findings[i];
    const order =
      SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity] ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
      ((a.field ?? "") < (b.field ?? "") ? -1 : (a.field ?? "") > (b.field ?? "") ? 1 : 0) ||
      (a.message < b.message ? -1 : a.message > b.message ? 1 : 0);
    if (order > 0) return false;
  }
  return true;
}

describe("AI Doctor output evaluation — golden cases", () => {
  it("has a unique id for every case and at least 35 substantive cases", () => {
    expect(ALL_OUTPUT_EVALUATION_CASES.length).toBeGreaterThanOrEqual(35);
    const ids = ALL_OUTPUT_EVALUATION_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // No `.skip` / `.todo` anywhere — every case runs.
  for (const c of ALL_OUTPUT_EVALUATION_CASES) {
    describe(c.id, () => {
      it("matches expected status, required codes, and forbidden codes", () => {
        const input = inputFor(c);
        const before = JSON.stringify(input);
        const evaluation = evaluateAiDoctorOutput(input);

        // Inputs must never be mutated.
        expect(JSON.stringify(input)).toBe(before);

        // Exact status.
        expect(evaluation.status, `${c.id}: status`).toBe(c.expectedStatus);

        const codes = evaluation.findings.map((f) => f.code);
        for (const code of c.expectedCodes) {
          expect(codes, `${c.id}: expected code ${code}`).toContain(code);
        }
        for (const code of c.forbiddenCodes ?? []) {
          expect(codes, `${c.id}: forbidden code ${code}`).not.toContain(code);
        }

        // Count fields must agree with the findings list.
        expect(evaluation.errorCount + evaluation.warningCount + evaluation.infoCount).toBe(
          evaluation.findings.length,
        );

        // A "pass" has no errors and no warnings; "warning" has ≥1 warning, 0 errors;
        // "fail" has ≥1 error.
        if (c.expectedStatus === "pass") {
          expect(evaluation.errorCount).toBe(0);
          expect(evaluation.warningCount).toBe(0);
        } else if (c.expectedStatus === "warning") {
          expect(evaluation.errorCount).toBe(0);
          expect(evaluation.warningCount).toBeGreaterThan(0);
        } else {
          expect(evaluation.errorCount).toBeGreaterThan(0);
        }
      });

      it("produces stable, deterministic, correctly ordered findings", () => {
        const a = evaluateAiDoctorOutput(inputFor(c));
        const b = evaluateAiDoctorOutput(inputFor(c));
        expect(a).toEqual(b);
        expect(isStablySorted(a.findings), `${c.id}: findings not stably ordered`).toBe(true);
      });
    });
  }
});
