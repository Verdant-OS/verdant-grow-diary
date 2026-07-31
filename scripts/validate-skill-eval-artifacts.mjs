#!/usr/bin/env bun
/**
 * validate-skill-eval-artifacts — checks what the harness actually wrote.
 *
 * Running the harness green proves the harness ran. It does not prove the
 * files on disk are parseable, internally consistent, or safe to upload — and
 * CI uploads them, after which a reader will trust them. So this validates the
 * artifact, not the run.
 *
 * Exit codes follow the repository convention:
 *   0  artifacts valid
 *   1  artifact violation
 *   2  usage or I/O error
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Run under bun, not node, so the real verifier can be IMPORTED rather than
// reimplemented here. A second copy of the binding rules in the validator
// would be a second thing to keep in sync, and the one that drifts is the one
// nobody runs locally.
import { verifyReportBinding } from "../src/lib/verdantSkillEvaluationReport.ts";
import { sha256Digest } from "./lib/verdantSkillEvaluationDigest.ts";
import { computeBoundDigest } from "../src/lib/verdantSkillEvaluationBindings.ts";
import { PROGRESSION_TO_MANIFEST_LIFECYCLE } from "../src/lib/verdantSkillEvaluationTypes.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const ARTIFACT_ROOT = resolve(ROOT, process.argv[2] ?? "artifacts/skills");

/** Shapes that must never reach an uploaded artifact. */
const DISCLOSURE_PATTERNS = [
  { code: "email_address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { code: "jwt", re: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}/ },
  { code: "vendor_secret_key", re: /(?<![A-Za-z0-9_-])(sk|pk|rk)_(live|test)_/ },
  { code: "bearer_token", re: /bearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  { code: "service_role", re: /service_role/i },
];

const violations = [];
const note = (rule, message) => violations.push({ rule, message });

function walkVersionDirs(root) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const skill of readdirSync(root)) {
    const skillDir = join(root, skill);
    if (!statSync(skillDir).isDirectory()) continue;
    for (const version of readdirSync(skillDir)) {
      const versionDir = join(skillDir, version);
      if (statSync(versionDir).isDirectory()) out.push(versionDir);
    }
  }
  return out;
}

const dirs = walkVersionDirs(ARTIFACT_ROOT);
if (dirs.length === 0) {
  console.error(`✗ skill evaluation artifacts: none found under ${ARTIFACT_ROOT}`);
  process.exit(2);
}

for (const dir of dirs) {
  const evalJsonPath = join(dir, "evaluation.json");
  const evalMdPath = join(dir, "evaluation.md");
  const promoJsonPath = join(dir, "promotion-decision.json");

  for (const required of [evalJsonPath, evalMdPath, promoJsonPath]) {
    if (!existsSync(required)) note("missing_artifact", required);
  }
  // A leftover temp file means a write was interrupted; the sibling artifact
  // cannot be trusted even if it parses.
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".tmp")) note("stray_temp_file", join(dir, name));
  }
  if (!existsSync(evalJsonPath)) continue;

  let report;
  const rawJson = readFileSync(evalJsonPath, "utf8");
  try {
    report = JSON.parse(rawJson);
  } catch {
    note("unparseable_json", evalJsonPath);
    continue;
  }

  if (typeof report.reportVersion !== "string") note("missing_report_version", evalJsonPath);
  if (report.reportBinding === null || report.reportBinding === undefined) {
    note("report_not_self_bound", evalJsonPath);
  } else if (!verifyReportBinding(report, sha256Digest)) {
    // RECOMPUTED, not merely present. Checking that a self-binding exists
    // proves an artifact was signed, never that it still says what it said
    // when it was: an artifact edited after writing — overallStatus flipped to
    // pass, a failing case removed — kept its untouched binding and validated
    // clean. The binding is only worth having if something recomputes it.
    note("report_binding_does_not_verify", evalJsonPath);
  }
  if (!Array.isArray(report.limitations) || report.limitations.length === 0) {
    note("artifact_states_no_limitations", evalJsonPath);
  }

  // A zero-denominator rate must never render as a number.
  for (const [key, value] of Object.entries(report.metrics ?? {})) {
    if (value === null || typeof value !== "object" || !("status" in value)) continue;
    if (value.status === "not_measured" && value.value !== null) {
      note("not_measured_rate_carries_a_value", `${evalJsonPath}: ${key}`);
    }
    if (value.status === "measured" && value.denominator === 0) {
      note("measured_rate_with_zero_denominator", `${evalJsonPath}: ${key}`);
    }
  }

  if (existsSync(evalMdPath)) {
    const md = readFileSync(evalMdPath, "utf8");
    // JSON and Markdown must agree, or one of them is lying.
    if (!md.includes(`Cases: ${report.metrics?.totalCases}`)) {
      note("markdown_case_count_disagrees_with_json", evalMdPath);
    }
    if (
      !md.includes(`${report.metrics?.passedCases} passed, ${report.metrics?.failedCases} failed`)
    ) {
      note("markdown_pass_fail_disagrees_with_json", evalMdPath);
    }
  }

  // The promotion decision, PARSED — not merely scanned as text.
  //
  // It was read only for disclosure patterns, so a truncated or otherwise
  // invalid decision artifact passed validation and CI uploaded it. A
  // validator that claims to check parseability has to actually parse
  // everything it green-lights.
  if (existsSync(promoJsonPath)) {
    let decision;
    try {
      decision = JSON.parse(readFileSync(promoJsonPath, "utf8"));
    } catch {
      note("unparseable_json", promoJsonPath);
      decision = null;
    }
    if (decision !== null) {
      if (typeof decision.decisionVersion !== "string") {
        note("missing_decision_version", promoJsonPath);
      }
      if (typeof decision.eligible !== "boolean") {
        note("decision_states_no_verdict", promoJsonPath);
      }
      if (!Array.isArray(decision.blockingReasons)) {
        note("decision_states_no_blocking_reasons", promoJsonPath);
      }
      // The decision is self-bound the same way the report is, and recomputing
      // one while trusting the other leaves the authorization artifact — the
      // one that says YES — as the unchecked half. Editing it to set
      // eligible:true, add a lifecycle and clear the blocking reasons passed
      // every shape and agreement check above, because nothing recomputed
      // this.
      if (typeof decision.decisionDigest !== "string" || decision.decisionDigest === "") {
        note("decision_not_self_bound", promoJsonPath);
      } else {
        const recomputed = computeBoundDigest(
          "promotion_decision",
          { ...decision, decisionDigest: "" },
          sha256Digest,
        );
        if (recomputed.value !== decision.decisionDigest) {
          note("decision_digest_does_not_verify", promoJsonPath);
        }
      }
      // Deliberately NOT "every eligible decision must name a lifecycle".
      //
      // That rule, as I first wrote it, was wrong: the evidence-only targets
      // (`schema_valid`, `golden_cases_passed`, …) and the withdrawal states
      // map to null BY DESIGN, because they authorize no manifest mutation.
      // The unconditional form would have failed CI on a legitimate artifact —
      // a validator rule that rejects correct output is worse than the gap it
      // was meant to close. The honest check is agreement between the decision
      // and the progression model it claims to follow.
      const mapped = PROGRESSION_TO_MANIFEST_LIFECYCLE[decision.requestedState];
      if (decision.eligible === true && mapped !== undefined) {
        if (decision.authorizedManifestLifecycle !== mapped) {
          note("decision_lifecycle_disagrees_with_progression_model", promoJsonPath);
        }
      }
      // The two artifacts describe one decision and must agree.
      if (decision.eligible === true && report?.promotionEligible === false) {
        note("decision_disagrees_with_report", promoJsonPath);
      }
    }
  }

  for (const path of [evalJsonPath, evalMdPath, promoJsonPath]) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const { code, re } of DISCLOSURE_PATTERNS) {
      // Report the CATEGORY only — echoing the match would re-leak it.
      if (re.test(text)) note("artifact_disclosure", `${path}: ${code}`);
    }
  }
}

if (violations.length > 0) {
  console.error(`✗ skill evaluation artifacts: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  - [${v.rule}] ${v.message}`);
  process.exit(1);
}

console.log(`✓ skill evaluation artifacts: 0 violations (${dirs.length} version dir(s))`);
process.exit(0);
