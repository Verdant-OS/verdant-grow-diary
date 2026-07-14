#!/usr/bin/env -S bun run
/**
 * Generate a machine-readable report for the AI Doctor output evaluator by
 * running every golden case through the evaluator and summarizing the results.
 *
 * Usage:
 *   bun run scripts/generate-ai-doctor-evaluation-report.ts [generatedAt]
 *
 * `generatedAt` (optional ISO string) is stamped into the report; pass a fixed
 * value when byte-for-byte determinism matters (e.g. golden diffs). When
 * omitted, the current time is used.
 *
 * Safety:
 *   - Pure: reads fixtures + runs the pure evaluator. No network, no Supabase,
 *     no model provider, no secrets, no env access.
 *   - Emits NO plant/user private data, raw photos, raw sensor payloads, or
 *     tokens — only case ids/descriptions (synthetic), statuses, and finding
 *     codes/severities/fields/messages (generic templates).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAiDoctorOutput,
  AI_DOCTOR_OUTPUT_CONTRACT_VERSION,
} from "@/lib/aiDoctorOutputEvaluation";
import { ALL_OUTPUT_EVALUATION_CASES } from "@/test/fixtures/ai-doctor-output-evaluation";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT_DIR = resolve(ROOT, "artifacts/ai-doctor-evaluation");

const generatedAt =
  process.argv[2] && process.argv[2].trim().length > 0
    ? process.argv[2].trim()
    : new Date().toISOString();

interface PerCase {
  id: string;
  description: string;
  expectedStatus: string;
  actualStatus: string;
  statusMatch: boolean;
  findings: Array<{ code: string; severity: string; field: string | null; message: string }>;
}

const perCase: PerCase[] = ALL_OUTPUT_EVALUATION_CASES.map((c) => {
  const evaluation = evaluateAiDoctorOutput({
    result: c.result,
    context: c.context,
    readiness: c.readiness,
    automatedConfidence: c.automatedConfidence,
  });
  return {
    id: c.id,
    description: c.description,
    expectedStatus: c.expectedStatus,
    actualStatus: evaluation.status,
    statusMatch: evaluation.status === c.expectedStatus,
    findings: evaluation.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      field: f.field ?? null,
      message: f.message,
    })),
  };
});

const byStatus = { pass: 0, warning: 0, fail: 0 };
const findingCountsByCode: Record<string, number> = {};
const findingCountsBySeverity: Record<string, number> = {};
const mismatches: PerCase[] = [];

for (const c of perCase) {
  byStatus[c.actualStatus as keyof typeof byStatus] += 1;
  if (!c.statusMatch) mismatches.push(c);
  for (const f of c.findings) {
    findingCountsByCode[f.code] = (findingCountsByCode[f.code] ?? 0) + 1;
    findingCountsBySeverity[f.severity] = (findingCountsBySeverity[f.severity] ?? 0) + 1;
  }
}

const sortedCodeCounts = Object.entries(findingCountsByCode).sort(
  (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
);

const expectedMatchCount = perCase.filter((c) => c.statusMatch).length;
const verdict = mismatches.length === 0 ? "green" : "red";

const json = {
  generatedAt,
  contractVersion: AI_DOCTOR_OUTPUT_CONTRACT_VERSION,
  verdict,
  totalCases: perCase.length,
  expectedMatchCount,
  byStatus,
  findingCountsBySeverity,
  findingCountsByCode: Object.fromEntries(sortedCodeCounts),
  mismatches: mismatches.map((m) => ({
    id: m.id,
    expectedStatus: m.expectedStatus,
    actualStatus: m.actualStatus,
  })),
  cases: perCase,
};

function buildMarkdown(): string {
  const lines: string[] = [];
  lines.push("# AI Doctor Output Evaluation — Report");
  lines.push("");
  lines.push(`- Generated at: ${generatedAt}`);
  lines.push(`- Contract version: \`${AI_DOCTOR_OUTPUT_CONTRACT_VERSION}\``);
  lines.push(
    `- Overall verdict: **${verdict.toUpperCase()}** (${expectedMatchCount}/${perCase.length} cases match expected status)`,
  );
  lines.push(
    `- By actual status: pass ${byStatus.pass} · warning ${byStatus.warning} · fail ${byStatus.fail}`,
  );
  lines.push("");
  lines.push("## Cases");
  lines.push("");
  lines.push("| Case | Expected | Actual | Match | Findings |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of perCase) {
    lines.push(
      `| ${c.id} | ${c.expectedStatus} | ${c.actualStatus} | ${c.statusMatch ? "✓" : "✗"} | ${c.findings.length} |`,
    );
  }
  lines.push("");
  lines.push("## Failure summary");
  lines.push("");
  if (mismatches.length === 0) {
    lines.push("No expected/actual status mismatches.");
  } else {
    for (const m of mismatches) {
      lines.push(`- \`${m.id}\`: expected ${m.expectedStatus}, got ${m.actualStatus}`);
    }
  }
  lines.push("");
  lines.push("## Most common finding codes");
  lines.push("");
  if (sortedCodeCounts.length === 0) {
    lines.push("No findings emitted across the fixture suite.");
  } else {
    for (const [code, count] of sortedCodeCounts) {
      lines.push(`- \`${code}\`: ${count}`);
    }
  }
  lines.push("");
  lines.push("## Safety notes");
  lines.push("");
  lines.push(
    "Automated semantic evaluation reduces known failure modes but does not prove horticultural correctness. This report contains no plant/user private data, raw photos, raw sensor payloads, tokens, or secrets.",
  );
  lines.push("");
  return lines.join("\n");
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "summary.json"), `${JSON.stringify(json, null, 2)}\n`, "utf8");
writeFileSync(resolve(OUT_DIR, "summary.md"), buildMarkdown(), "utf8");

 
console.log(
  `AI Doctor evaluation report written to ${OUT_DIR} (verdict: ${verdict}, ${expectedMatchCount}/${perCase.length} match).`,
);
