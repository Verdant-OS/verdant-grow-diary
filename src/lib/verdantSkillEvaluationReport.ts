/**
 * verdantSkillEvaluationReport — the artifact, and its own proof.
 *
 * Build 7 of Verdant Skill Runtime v1. Pure: no I/O, no clock. The caller
 * writes files; this module only builds the values.
 *
 * A REPORT IS BOUND TOO. The report carries a digest of itself, so a stored
 * artifact can be re-verified later without trusting the filename or the
 * directory it was found in. Everything upstream is referenced by binding,
 * not by label — a report that says "manifest 1.0.0" proves nothing, while a
 * report carrying the manifest's digest proves exactly which bytes it judged.
 *
 * NO PRIVATE CONTEXT. Artifacts are uploaded by CI and read by reviewers.
 * They carry ids, digests, verdicts and counts — never the compiled plant
 * context, never model prose, never grower data. The redaction is structural:
 * the fields simply are not copied in.
 */

import {
  computeBoundDigest,
  verifyBoundDigest,
  type BoundDigest,
  type DigestFn,
} from "@/lib/verdantSkillEvaluationBindings";
import type { EvaluationRate, SkillEvaluationMetrics } from "@/lib/verdantSkillEvaluationMetrics";
import { calculateEvaluationMetrics } from "@/lib/verdantSkillEvaluationMetrics";
import {
  SKILL_EVALUATION_REPORT_VERSION,
  SKILL_EVALUATOR_VERSION,
  SKILL_SCORING_POLICY_VERSION,
  type SkillEvaluationCaseResult,
} from "@/lib/verdantSkillEvaluationTypes";
import { detectProductionDataCategories } from "@/lib/verdantSkillEvaluationSchemas";
import { serializeSkillContract } from "@/lib/verdantSkillSchemas";

export const EVALUATION_OVERALL_STATUSES = ["pass", "fail", "safety_fail", "blocked"] as const;
export type EvaluationOverallStatus = (typeof EVALUATION_OVERALL_STATUSES)[number];

/**
 * Stated in the artifact itself so a reader cannot miss them. A report that
 * lists its own limits is harder to over-read than one that does not.
 */
export const EVALUATION_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "Model behaviour is supplied by deterministic fixtures. No provider was called, so nothing here measures a live model.",
  "Confidence checks are conformance to fixture-authored bands, not calibration against real-world outcome frequencies.",
  "Unsupported-claim detection is deterministic substring matching over fixture-authored strings. It proves the absence of stated phrases, not semantic factuality.",
  "Fixtures are synthetic. Results describe runtime behaviour on constructed input, not field performance.",
  "A rate reported as not_measured had no applicable cases. It is not a score of any kind.",
  "Recorded policy decisions are checked for internal consistency against the governor's own tables and vocabularies, but they are NOT regenerated. Gates needing a real plant-context compilation — stage ceilings, evidence trustworthiness — are not reconstructed, so a fixture can encode a decision the live governor would refuse. Regenerating requires the compilation and belongs to Build 8.",
]);

export const POLICY_DECISION_VERIFICATION_LEVELS = ["consistency_only", "regenerated"] as const;
export type PolicyDecisionVerification = (typeof POLICY_DECISION_VERIFICATION_LEVELS)[number];

export interface SkillEvaluationReport {
  reportVersion: string;
  skillId: string;
  skillVersion: string;
  evaluatorVersion: string;
  /** Whether decisions were merely checked or independently regenerated. */
  policyDecisionVerification: PolicyDecisionVerification;
  scoringPolicyVersion: string;
  /** From the injected clock, so identical inputs produce identical bytes. */
  generatedAt: string;
  sourceRevision: string | null;
  manifestBinding: BoundDigest | null;
  policyBinding: BoundDigest | null;
  evidenceRegistryBinding: { registryVersion: string; corpus: BoundDigest | null };
  fixtureSetBinding: { fixtureCount: number; goldenCaseSet: BoundDigest | null };
  metrics: SkillEvaluationMetrics;
  hardSafetyStatus: "clean" | "failed";
  overallStatus: EvaluationOverallStatus;
  /** Never true for a self-test; see the promotion engine for the real gate. */
  promotionEligible: boolean;
  caseResults: SkillEvaluationCaseResult[];
  failedFixtureIds: string[];
  safetyFailedFixtureIds: string[];
  warnings: string[];
  limitations: string[];
  artifactPaths: string[];
  /** Digest of everything above. Lets a stored artifact prove itself. */
  reportBinding: BoundDigest | null;
}

export interface BuildReportInput {
  skillId: string;
  skillVersion: string;
  generatedAt: string;
  sourceRevision: string | null;
  caseResults: readonly SkillEvaluationCaseResult[];
  /**
   * Tags for the metric breakdown. NOT the metrics themselves.
   *
   * Accepting a precomputed `metrics` meant a report could carry numbers
   * calculated from a different case collection: schema-invalid cases beside a
   * compliance rate of 1, self-binding and internally consistent, sufficient
   * for a `draft → schema_valid` decision. A report's summary has to be a
   * summary OF the report.
   */
  tagsByFixtureId?: Readonly<Record<string, readonly string[]>>;
  digest: DigestFn;
  artifactPaths?: readonly string[];
  warnings?: readonly string[];
}

function compareTokens(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Build the report value.
 *
 * `promotionEligible` here is a NECESSARY condition only — a green report.
 * It is never sufficient: the promotion engine owns the actual decision and
 * requires attestations and current bindings this module cannot see.
 */
export function buildEvaluationReport(input: BuildReportInput): SkillEvaluationReport {
  const cases = [...input.caseResults].sort((a, b) => compareTokens(a.fixtureId, b.fixtureId));
  const safetyFailed = cases.filter((c) => c.status === "safety_fail");
  const failed = cases.filter((c) => c.status !== "pass");
  const first = cases[0] ?? null;

  const hardSafetyStatus: "clean" | "failed" = safetyFailed.length > 0 ? "failed" : "clean";
  const anyBindingInvalid = cases.some((c) => !c.bindingValid);

  // Every case must have been evaluated against the SAME manifest, policy and
  // corpus. Each case can be individually binding-valid while describing a
  // different upstream, and the report would then adopt only the FIRST case's
  // digests — letting a stale case ride inside an otherwise green report that
  // promotion only ever checks at the top level.
  const distinct = (pick: (c: SkillEvaluationCaseResult) => string | undefined): number =>
    new Set(cases.map((c) => pick(c) ?? "")).size;
  const mixedBindings =
    cases.length > 1 &&
    (distinct((c) => c.bindings?.manifest?.value) > 1 ||
      // NOT the per-case policy DECISION: every case is a different
      // scenario, so their decisions differ by design. The shared upstream
      // is the policy VERSION those decisions were made under.
      distinct((c) => c.bindings?.policyVersion) > 1 ||
      distinct((c) => c.bindings?.evidence?.corpus?.value) > 1 ||
      distinct((c) => c.bindings?.goldenCaseSet?.value) > 1);

  // A run whose bindings did not verify is BLOCKED, not merely failed: we
  // cannot say what it measured, so "fail" would overstate our knowledge.
  //
  // An evaluation that judged NOTHING is blocked for the same reason. With no
  // cases there is no case to be invalid, no case to fail, and no case to
  // carry a binding, so every severity branch fell through to "pass" and the
  // report said PASS beside four null bindings. Nothing downstream acted on
  // it — the promotion engine blocks a zero-fixture report three separate ways
  // — but "pass" is still the wrong word for "we measured nothing", and this
  // artifact is read by humans and uploaded by CI.
  // Computed here, from `cases`, so the numbers and the cases they describe
  // cannot disagree.
  const metrics = calculateEvaluationMetrics(cases, input.tagsByFixtureId ?? {});

  // A report adopts an identity from its INPUT, so nothing stopped skill B's
  // report being assembled from skill A's cases: it self-verified, and
  // promotion's wrong-skill check compares only this copied top-level
  // identity. Blocked rather than silently relabelled — a report whose cases
  // are about something else cannot say what it measured.
  const foreignCaseIds = cases
    .filter((c) => c.skillId !== input.skillId || c.skillVersion !== input.skillVersion)
    .map((c) => c.fixtureId)
    .sort(compareTokens);

  const overallStatus: EvaluationOverallStatus =
    safetyFailed.length > 0
      ? "safety_fail"
      : anyBindingInvalid || mixedBindings || foreignCaseIds.length > 0 || cases.length === 0
        ? "blocked"
        : failed.length > 0
          ? "fail"
          : "pass";

  const containsSelfTest = cases.some((c) => c.fixtureKind === "harness_self_test");

  const report: SkillEvaluationReport = {
    reportVersion: SKILL_EVALUATION_REPORT_VERSION,
    skillId: input.skillId,
    skillVersion: input.skillVersion,
    evaluatorVersion: SKILL_EVALUATOR_VERSION,
    // Build 7 validates the recorded decision's shape and internal
    // consistency. It does not possess the full PlantContextCompilation
    // needed to rerun the governor, so it must never claim regeneration.
    policyDecisionVerification: "consistency_only",
    scoringPolicyVersion: SKILL_SCORING_POLICY_VERSION,
    generatedAt: input.generatedAt,
    sourceRevision: input.sourceRevision,
    manifestBinding: first?.bindings?.manifest ?? null,
    // The policy VERSION in force, not one case's decision. Promotion
    // compares this against what is current, and a per-case decision digest
    // would make that comparison meaningless.
    policyBinding:
      first === null
        ? null
        : computeBoundDigest(
            "policy_decision",
            // The version AND the decision it labels, together.
            //
            // Hashing the free-standing label meant a decision produced by an
            // old governor, relabelled with the current policyVersion, still
            // bound cleanly — case verification checks the decision object and
            // this checked only the string, so neither noticed the mismatch. A
            // later caller supplying the matching current-policy digest then
            // satisfied `current_bindings`, and stale policy behaviour could
            // authorize a release. A version label is a claim ABOUT an
            // artifact; binding it apart from that artifact binds nothing.
            {
              policyVersion: first.bindings?.policyVersion ?? "",
              // EVERY case's decision, not the first one's.
              //
              // Round 14 tied the version to a decision, which was right, but
              // to `first`'s alone. Cases 2..N could then carry stale or
              // fabricated decisions relabelled with the same version and the
              // report binding would not change — and `mixedBindings`
              // deliberately compares the policy VERSION rather than the
              // per-case decisions, because different scenarios legitimately
              // produce different decisions, so it does not catch this either.
              // Each check was looking past the other.
              //
              // Sorted so the set is order-independent: two reports over the
              // same evidence bind identically however their cases were
              // ordered.
              policyDecisions: cases
                .map((c) => c.bindings?.policy?.value ?? "")
                .sort(compareTokens),
            },
            input.digest,
          ),
    evidenceRegistryBinding: {
      registryVersion: first?.bindings?.evidence?.registryVersion ?? "",
      corpus: first?.bindings?.evidence?.corpus ?? null,
    },
    fixtureSetBinding: {
      fixtureCount: cases.length,
      goldenCaseSet: first?.bindings?.goldenCaseSet ?? null,
    },
    metrics,
    hardSafetyStatus,
    overallStatus,
    // A harness self-test can never be the basis of a promotion, whatever
    // its score. It exercises the harness; it is not evidence about a skill.
    //
    // Nor can a suite its own author marked unsuitable. `promotionEligible` is
    // a first-class fixture field, schema-valid and reviewable, and it was
    // read by nothing — an author could write "this case must not carry a
    // promotion" and be silently overruled by a green overall status. A field
    // that only ever RESTRICTS is still a claim the harness has to honour.
    promotionEligible:
      overallStatus === "pass" &&
      !containsSelfTest &&
      cases.every((c) => c.fixturePromotionEligible !== false),
    caseResults: cases,
    failedFixtureIds: failed.map((c) => c.fixtureId).sort(compareTokens),
    safetyFailedFixtureIds: safetyFailed.map((c) => c.fixtureId).sort(compareTokens),
    warnings: [
      ...(input.warnings ?? []),
      ...(foreignCaseIds.length > 0
        ? [`Cases belong to a different skill than the report: ${foreignCaseIds.join(", ")}.`]
        : []),
      ...(mixedBindings
        ? ["Cases were evaluated against differing manifests, policies, or evidence corpora."]
        : []),
    ].sort(compareTokens),
    limitations: [...EVALUATION_REPORT_LIMITATIONS],
    artifactPaths: [...(input.artifactPaths ?? [])].sort(compareTokens),
    reportBinding: null,
  };

  // Self-digest last, over everything else. Computed with the binding field
  // still null so the value is reproducible from the stored artifact.
  report.reportBinding = computeBoundDigest("evaluation_report", report, input.digest);
  return report;
}

/** Recompute a stored report's own digest. Null binding never verifies. */
export function verifyReportBinding(report: SkillEvaluationReport, digest: DigestFn): boolean {
  const claimed = report.reportBinding;
  if (claimed === null || claimed === undefined) return false;
  // The WHOLE envelope, not just the digest value: algorithm, envelope
  // version, serializer version, artifact type and hex shape all matter. A
  // report whose binding metadata was relabelled to an unsupported algorithm
  // would otherwise still verify, defeating the fail-closed contract.
  return verifyBoundDigest(claimed, "evaluation_report", { ...report, reportBinding: null }, digest)
    .valid;
}

/**
 * Scan a finished artifact for anything that must not ship.
 *
 * Returns CATEGORY names only — echoing the matched value into a log or a
 * CI annotation would re-leak the thing being reported.
 */
export function scanArtifactForDisclosure(report: SkillEvaluationReport): string[] {
  return detectProductionDataCategories(serializeSkillContract(report));
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** `not_measured` renders as a word, never as a number a reader could trust. */
function renderRate(rate: EvaluationRate): string {
  if (rate.status === "not_measured") return "not_measured (0/0)";
  const pct = ((rate.value ?? 0) * 100).toFixed(1);
  return `${pct}% (${rate.numerator}/${rate.denominator})`;
}

const METRIC_ROWS: readonly {
  readonly label: string;
  readonly key: keyof SkillEvaluationMetrics;
}[] = Object.freeze([
  { label: "Schema compliance", key: "schemaComplianceRate" },
  { label: "Binding integrity", key: "bindingIntegrityRate" },
  { label: "Applicability match", key: "applicabilityMatchRate" },
  { label: "Correct abstention", key: "correctAbstentionRate" },
  { label: "Missing-context detection", key: "missingContextDetectionRate" },
  { label: "Evidence-reference integrity", key: "evidenceReferenceIntegrityRate" },
  { label: "Expected-evidence coverage", key: "expectedEvidenceCoverageRate" },
  { label: "Action-eligibility match", key: "actionEligibilityMatchRate" },
  { label: "Execution-capability match", key: "executionCapabilityMatchRate" },
  { label: "Deterministic repeatability", key: "deterministicRepeatabilityRate" },
  { label: "Confidence expectation conformance", key: "confidenceExpectationConformanceRate" },
]);

function shortDigest(d: BoundDigest | null): string {
  return d === null || d === undefined ? "—" : `\`${d.value.slice(0, 16)}…\``;
}

/** Human-readable twin of the JSON. Same facts, same order, no extra claims. */
export function renderEvaluationMarkdown(report: SkillEvaluationReport): string {
  const lines: string[] = [];
  const m = report.metrics;

  lines.push(`# Skill evaluation — ${report.skillId}@${report.skillVersion}`);
  lines.push("");
  lines.push(`- Overall: **${report.overallStatus.toUpperCase()}**`);
  lines.push(`- Hard safety: **${report.hardSafetyStatus}**`);
  lines.push(`- Cases: ${m.totalCases} (${m.passedCases} passed, ${m.failedCases} failed)`);
  lines.push(`- Safety-critical failures: ${m.safetyCriticalFailures}`);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Source revision: ${report.sourceRevision ?? "—"}`);
  lines.push(`- Policy decision verification: ${report.policyDecisionVerification}`);
  lines.push("");

  lines.push("## Bound versions");
  lines.push("");
  lines.push("| Artifact | Version | Digest |");
  lines.push("| --- | --- | --- |");
  lines.push(`| Evaluator | ${report.evaluatorVersion} | — |`);
  lines.push(`| Scoring policy | ${report.scoringPolicyVersion} | — |`);
  lines.push(
    `| Manifest | ${report.manifestBinding?.serializerVersion ?? "—"} | ${shortDigest(report.manifestBinding)} |`,
  );
  lines.push(`| Policy decision | — | ${shortDigest(report.policyBinding)} |`);
  lines.push(
    `| Evidence corpus | ${report.evidenceRegistryBinding.registryVersion || "—"} | ${shortDigest(report.evidenceRegistryBinding.corpus)} |`,
  );
  lines.push(
    `| Golden-case set | ${report.fixtureSetBinding.fixtureCount} fixtures | ${shortDigest(report.fixtureSetBinding.goldenCaseSet)} |`,
  );
  lines.push(`| This report | ${report.reportVersion} | ${shortDigest(report.reportBinding)} |`);
  lines.push("");

  lines.push("## Metrics");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("| --- | --- |");
  for (const row of METRIC_ROWS) {
    lines.push(`| ${row.label} | ${renderRate(m[row.key] as EvaluationRate)} |`);
  }
  lines.push(`| Incorrect abstentions | ${m.incorrectAbstentionCount} |`);
  lines.push(`| Unsupported claims | ${m.unsupportedClaimCount} |`);
  lines.push(`| Policy violations | ${m.policyViolationCount} |`);
  lines.push(`| Equipment-control findings | ${m.deviceCommandCount} |`);
  lines.push("");

  if (report.safetyFailedFixtureIds.length > 0) {
    lines.push("## Safety failures");
    lines.push("");
    for (const c of report.caseResults.filter((x) => x.status === "safety_fail")) {
      lines.push(`- **${c.fixtureId}** — ${c.safetyFailures.join(", ")}`);
      for (const reason of c.failureReasons) lines.push(`  - ${reason}`);
    }
    lines.push("");
  }

  if (report.failedFixtureIds.length > 0) {
    lines.push("## Failed cases");
    lines.push("");
    lines.push("| Fixture | Class | Reasons |");
    lines.push("| --- | --- | --- |");
    for (const c of report.caseResults.filter((x) => x.status !== "pass")) {
      lines.push(`| ${c.fixtureId} | ${c.failureClass} | ${c.failureReasons.length} |`);
    }
    lines.push("");
  }

  lines.push("## Cases");
  lines.push("");
  lines.push("| Fixture | Kind | Status | Bound |");
  lines.push("| --- | --- | --- | --- |");
  for (const c of report.caseResults) {
    lines.push(
      `| ${c.fixtureId} | ${c.fixtureKind} | ${c.status} | ${c.bindingValid ? "yes" : "**no**"} |`,
    );
  }
  lines.push("");

  lines.push("## Limitations");
  lines.push("");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push("");

  lines.push("## Promotion");
  lines.push("");
  lines.push(
    report.promotionEligible
      ? "This report satisfies the evaluation precondition for promotion. It is NOT a promotion decision — see the promotion-decision artifact, which additionally requires current bindings, attestations and a rollback target."
      : "This report does not satisfy the evaluation precondition for promotion.",
  );
  lines.push("");

  return lines.join("\n");
}
