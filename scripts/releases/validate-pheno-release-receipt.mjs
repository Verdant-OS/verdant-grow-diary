#!/usr/bin/env node
/**
 * Validates the Pheno Tracker Pro release receipt: decides whether GO is
 * ALLOWED, independently of the writer that rendered it.
 *
 * The writer (write-pheno-release-receipt.mjs) renders evidence into the
 * receipt; this validator re-derives the decision from the same redacted
 * artifacts, confirms the written receipt matches it, and enforces the
 * release-policy gates that sit above the writer:
 *   - checkpoint 9 (missing-evidence navigation) must ALSO have manual live
 *     evidence recorded in manual-release-checks.json — automated anchor
 *     proof alone does not satisfy current receipt policy;
 *   - operator and publish timestamp must be recorded.
 *
 * GO is never inferred from aggregate Playwright totals — the decision comes
 * from the per-checkpoint matrix via the writer's own renderReceipt.
 *
 * Exit codes:
 *   0 = GO validated
 *   1 = malformed input or receipt/decision mismatch
 *   2 = HOLD — required evidence missing or decision is not GO
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluateMigrationPosture,
  parseArgs,
  renderReceipt,
} from "./write-pheno-release-receipt.mjs";

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isPass(value) {
  return String(value ?? "").toUpperCase() === "PASS";
}

/**
 * Pure validation over the four artifacts plus the written receipt text.
 * Returns { decision: "GO"|"HOLD"|"FAIL", exitCode, problems: string[] }.
 *
 * Exit codes:
 *   0 = GO validated
 *   1 = malformed, contradictory, or stale evidence
 *   2 = HOLD — structured evidence missing or decision is not GO
 */
export function validateReceipt({ smoke, schema, build, manual, receiptText }) {
  const problems = [];
  for (const [name, value] of [
    ["live-smoke-summary.json", smoke],
    ["schema-spot-check.json", schema],
    ["deployed-build.json", build],
    ["manual-release-checks.json", manual],
  ]) {
    if (!value) problems.push(`missing artifact: ${name}`);
  }
  if (typeof receiptText !== "string" || receiptText.length === 0) {
    problems.push("receipt file missing or empty");
  }
  if (problems.length > 0) return { decision: "HOLD", exitCode: 2, problems };

  const posture = evaluateMigrationPosture(manual?.rollback);
  const legacyOnly = posture.classification === "LEGACY_ADDITIVE_FIELD";

  // Structured contract must exist before anything else. Legacy-only → HOLD (2).
  if (legacyOnly) {
    return {
      decision: "HOLD",
      exitCode: 2,
      problems: [
        "structured migration posture evidence required (legacy rollback.additiveMigrations cannot authorize GO)",
      ],
    };
  }

  // A malformed structured posture (contradictions, missing exception fields,
  // unknown classification) is a hard FAIL, not a HOLD — the evidence is
  // internally broken and must be corrected, not just waited on.
  if (!posture.pass && posture.problems.length > 0 && manual?.rollback?.migrationPosture) {
    return {
      decision: "FAIL",
      exitCode: 1,
      problems: posture.problems.map((p) => `migrationPosture: ${p}`),
    };
  }

  const rendered = renderReceipt({ smoke, schema, build, manual });

  // The written receipt must reflect the same decision the evidence produces.
  if (!receiptText.includes(`**Release status:** ${rendered.decision}`)) {
    return {
      decision: rendered.decision,
      exitCode: 1,
      problems: [
        `receipt file is stale: it does not record the evidence-derived decision (${rendered.decision}) — re-run the receipt writer`,
      ],
    };
  }

  // A written receipt must not carry the legacy unqualified additive claim
  // once we've moved to structured posture — that wording is factually
  // incorrect for non-additive releases.
  if (receiptText.includes("Additive migrations confirmed backward-compatible")) {
    return {
      decision: "FAIL",
      exitCode: 1,
      problems: [
        "receipt contains stale unqualified additive-migrations claim; re-run writer to render structured migration posture",
      ],
    };
  }

  // If the receipt claims a classification, it must match the artifact.
  const artifactClassification = posture.classification;
  const receiptClassificationMatch = receiptText.match(/Migration classification: ([A-Z_]+)/);
  if (receiptClassificationMatch && receiptClassificationMatch[1] !== artifactClassification) {
    return {
      decision: "FAIL",
      exitCode: 1,
      problems: [
        `receipt/evidence contradiction: receipt classification ${receiptClassificationMatch[1]} vs artifact ${artifactClassification}`,
      ],
    };
  }

  // Policy gates above the writer.
  const checkpoint9Manual = manual?.checkpoints?.["9"] ?? manual?.checkpoints?.[9];
  const checkpoint9Status =
    typeof checkpoint9Manual === "string" ? checkpoint9Manual : checkpoint9Manual?.status;
  if (!isPass(checkpoint9Status)) {
    problems.push(
      "checkpoint 9 manual live evidence missing in manual-release-checks.json (required by current receipt policy in addition to automated anchor proof)",
    );
  }
  if (!String(manual?.operator ?? "").trim()) problems.push("operator not recorded");
  if (!String(manual?.publishedAt ?? "").trim()) problems.push("publish timestamp not recorded");

  if (rendered.decision !== "GO") {
    problems.push("evidence-derived decision is HOLD");
  }

  if (problems.length > 0) return { decision: "HOLD", exitCode: 2, problems };
  return { decision: "GO", exitCode: 0, problems: [] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = validateReceipt({
    smoke: readJson(args.smoke),
    schema: readJson(args.schema),
    build: readJson(args.build),
    manual: readJson(args.manual),
    receiptText: fs.existsSync(args.out) ? fs.readFileSync(args.out, "utf8") : "",
  });
  console.log(`receipt     ${path.relative(process.cwd(), args.out)}`);
  console.log(`validation  ${result.decision}`);
  for (const problem of result.problems) console.log(`  pending   ${problem}`);
  process.exit(result.exitCode);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: ${String(error?.message ?? error).split("\n")[0]}`);
    process.exit(1);
  }
}
