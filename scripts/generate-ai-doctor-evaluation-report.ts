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
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
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
  /** Expected codes that the evaluator did NOT emit. */
  missingExpectedCodes: string[];
  /** Forbidden codes that the evaluator DID emit. */
  presentForbiddenCodes: string[];
  codesMatch: boolean;
  /** A case only matches when BOTH status and code expectations hold. */
  match: boolean;
  findings: Array<{ code: string; severity: string; field: string | null; message: string }>;
}

const perCase: PerCase[] = ALL_OUTPUT_EVALUATION_CASES.map((c) => {
  const evaluation = evaluateAiDoctorOutput({
    result: c.result,
    context: c.context,
    readiness: c.readiness,
    automatedConfidence: c.automatedConfidence,
  });
  const codes = evaluation.findings.map((f) => f.code as string);
  // Verify code expectations too. Comparing status alone would let a case that
  // fails for the WRONG reason (e.g. a device-control case failing on some other
  // error code) still be reported GREEN while the CI test goes red.
  const missingExpectedCodes = (c.expectedCodes as string[]).filter((x) => !codes.includes(x));
  const presentForbiddenCodes = ((c.forbiddenCodes ?? []) as string[]).filter((x) =>
    codes.includes(x),
  );
  const statusMatch = evaluation.status === c.expectedStatus;
  const codesMatch = missingExpectedCodes.length === 0 && presentForbiddenCodes.length === 0;
  return {
    id: c.id,
    description: c.description,
    expectedStatus: c.expectedStatus,
    actualStatus: evaluation.status,
    statusMatch,
    missingExpectedCodes,
    presentForbiddenCodes,
    codesMatch,
    match: statusMatch && codesMatch,
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
  if (!c.match) mismatches.push(c);
  for (const f of c.findings) {
    findingCountsByCode[f.code] = (findingCountsByCode[f.code] ?? 0) + 1;
    findingCountsBySeverity[f.severity] = (findingCountsBySeverity[f.severity] ?? 0) + 1;
  }
}

const sortedCodeCounts = Object.entries(findingCountsByCode).sort(
  (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
);

// GREEN requires status AND expected/forbidden code expectations to hold.
const expectedMatchCount = perCase.filter((c) => c.match).length;
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
  lines.push("| Case | Expected | Actual | Status | Codes | Findings |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const c of perCase) {
    lines.push(
      `| ${c.id} | ${c.expectedStatus} | ${c.actualStatus} | ${c.statusMatch ? "✓" : "✗"} | ${c.codesMatch ? "✓" : "✗"} | ${c.findings.length} |`,
    );
  }
  lines.push("");
  lines.push("## Failure summary");
  lines.push("");
  if (mismatches.length === 0) {
    lines.push("No status or finding-code mismatches.");
  } else {
    for (const m of mismatches) {
      const parts: string[] = [];
      if (!m.statusMatch) parts.push(`expected status ${m.expectedStatus}, got ${m.actualStatus}`);
      if (m.missingExpectedCodes.length > 0) {
        parts.push(`missing expected code(s): ${m.missingExpectedCodes.join(", ")}`);
      }
      if (m.presentForbiddenCodes.length > 0) {
        parts.push(`emitted forbidden code(s): ${m.presentForbiddenCodes.join(", ")}`);
      }
      lines.push(`- \`${m.id}\`: ${parts.join("; ")}`);
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

// Idempotent: `recursive: true` still throws EEXIST on some platforms (bun on
// Windows) when the directory already exists, so guard with existsSync.
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "summary.json"), `${JSON.stringify(json, null, 2)}\n`, "utf8");
writeFileSync(resolve(OUT_DIR, "summary.md"), buildMarkdown(), "utf8");

console.log(
  `AI Doctor evaluation report written to ${OUT_DIR} (verdict: ${verdict}, ${expectedMatchCount}/${perCase.length} match).`,
);
