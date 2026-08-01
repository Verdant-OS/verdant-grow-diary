/**
 * verdantSkillEvaluationSchemas — runtime validation for evaluation fixtures.
 *
 * Build 7 of Verdant Skill Runtime v1. A fixture is DATA: there is no field
 * here that can carry executable code, a query, a prompt, or a credential.
 *
 * `.strict()` throughout, following the manifest/registry layer rather than
 * the run-result layer. A fixture with an unrecognized key is a fixture
 * someone believes does something it does not — silently ignoring it is how
 * an expectation gets authored, reviewed, and never actually checked.
 */

import { z } from "zod";
import {
  EVALUATION_ABSTENTION_EXPECTATIONS,
  EVALUATION_FIXTURE_KINDS,
  type EvaluationAbstentionExpectation,
  type EvaluationConfidenceExpectation,
  type EvaluationFixtureKind,
} from "@/lib/verdantSkillEvaluationTypes";
import {
  SKILL_POLICY_OUTCOMES,
  SKILL_POLICY_RULE_CODES,
  isCanonicalFiredRule,
} from "@/lib/verdantSkillPolicyGovernor";
import { CONTEXT_SLOTS } from "@/lib/plantContextBundleCompiler";
import { SKILL_APPLICABILITY_VERDICTS } from "@/lib/verdantSkillApplicabilityRules";
import {
  SKILL_RISK_LEVELS,
  contractTextSchema,
  idTokenSchema,
  isoTimestampSchema,
} from "@/lib/verdantSkillSchemas";

/** Bumped when the fixture shape changes. */
export const EVALUATION_FIXTURE_SCHEMA_VERSION = "1.0.0" as const;

const semverSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "version_shape");

const skillIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{1,63}$/, "skill_id_shape");

/**
 * Shapes that betray production data in what must be synthetic input.
 *
 * A fixture is committed, shipped in artifacts, and read by reviewers. Real
 * grower data in one is a disclosure, not untidy test data. These are the
 * detectable cases; the authoring doc carries the rule that fixtures are
 * synthetic by construction, because no regex can prove the absence.
 */
const PRODUCTION_DATA_PATTERNS: readonly { readonly code: string; readonly re: RegExp }[] =
  Object.freeze([
    { code: "email_address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    {
      code: "real_uuid",
      re: /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    },
    { code: "jwt", re: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}/ },
    { code: "vendor_secret_key", re: /(?<![A-Za-z0-9_-])(sk|pk|rk)_(live|test)_/ },
    { code: "bearer_token", re: /bearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
    { code: "service_role", re: /service_role/i },
    { code: "api_key_assignment", re: /api[_-]?key\s*[:=]/i },
  ]);

/**
 * Categories that apply to a RUN RESULT rather than to authored fixture data.
 *
 * A run result legitimately carries UUIDs — runId and plantId are typed as
 * uuid by the Build 1 contract — so flagging them as production data would
 * make every valid run look like a disclosure. Authored fixtures are held to
 * the stricter list, because a UUID someone typed into a fixture probably
 * came from somewhere real.
 */
const RUN_DISCLOSURE_EXCLUDED: readonly string[] = Object.freeze(["real_uuid"]);

export function detectRunDisclosureCategories(text: string): string[] {
  return detectProductionDataCategories(text).filter((c) => !RUN_DISCLOSURE_EXCLUDED.includes(c));
}

/** Category names only — never the matched value, which would re-leak it. */
export function detectProductionDataCategories(text: string): string[] {
  if (typeof text !== "string" || text === "") return [];
  const found = new Set<string>();
  for (const { code, re } of PRODUCTION_DATA_PATTERNS) {
    if (re.test(text)) found.add(code);
  }
  return PRODUCTION_DATA_PATTERNS.filter((p) => found.has(p.code)).map((p) => p.code);
}

const confidenceExpectationSchema = z
  .object({
    min: z.number().finite().min(0).max(1).nullable(),
    max: z.number().finite().min(0).max(1).nullable(),
  })
  .strict()
  .superRefine((band, ctx) => {
    if (band.min !== null && band.max !== null && band.min > band.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "confidence_band_inverted" });
    }
  });

/**
 * Hand-declared because `z.infer` degrades object properties to optional
 * under this repository's loose strictness, which would silently weaken every
 * consumer. Builds 4 and 5 hit the same and did the same.
 */
export interface VerdantSkillEvaluationFixture {
  fixtureId: string;
  fixtureVersion: string;
  fixtureSchemaVersion: string;
  name: string;
  description: string;
  tags: string[];
  skillId: string;
  skillVersion: string;
  fixtureKind: EvaluationFixtureKind;
  /** Synthetic compiler input. Never a production row. */
  context: Record<string, unknown>;
  contextContractVersion: string;
  expectedApplicability: string | null;
  evidenceInputs: Record<string, unknown> | null;
  expectedSelectedEvidenceIds: string[];
  /** Deterministic draft, or the id of one. Never a provider call. */
  modelDraft: Record<string, unknown> | null;
  modelAdapterFixtureId: string | null;
  expectedPolicyOutcome: string | null;
  expectedAbstention: EvaluationAbstentionExpectation;
  expectedMissingInformationKeys: string[];
  expectedRiskLevel: string | null;
  expectedActionEligibility: string | null;
  expectedExecutionCapability: string | null;
  allowedEvidenceIds: string[];
  forbiddenEvidenceIds: string[];
  expectedCitedEvidenceIds: string[] | null;
  forbiddenClaims: string[];
  expectedConfidence: EvaluationConfidenceExpectation | null;
  requiredWarnings: string[];
  forbiddenWarnings: string[];
  safetyCritical: boolean;
  promotionEligible: boolean;
  /** Repetitions for the determinism check. 1 means "not checked". */
  determinismRepetitions: number;
  authoredAt: string;
}

export const verdantSkillEvaluationFixtureSchema = z
  .object({
    fixtureId: idTokenSchema,
    fixtureVersion: semverSchema,
    fixtureSchemaVersion: z.literal(EVALUATION_FIXTURE_SCHEMA_VERSION),
    name: contractTextSchema,
    description: contractTextSchema,
    tags: z.array(z.string().trim().min(1).max(64)).max(16),
    skillId: skillIdSchema,
    skillVersion: semverSchema,
    fixtureKind: z.enum(EVALUATION_FIXTURE_KINDS),
    context: z.record(z.unknown()),
    contextContractVersion: z.string().trim().min(1).max(64),
    // The same four verdicts the runtime can produce. A misspelling here
    // was unsatisfiable, so the CLI reported exit 1 as if the skill failed
    // rather than exit 2 for a malformed fixture.
    expectedApplicability: z.enum(SKILL_APPLICABILITY_VERDICTS).nullable(),
    evidenceInputs: z.record(z.unknown()).nullable(),
    expectedSelectedEvidenceIds: z.array(idTokenSchema).max(64),
    modelDraft: z.record(z.unknown()).nullable(),
    modelAdapterFixtureId: idTokenSchema.nullable(),
    expectedPolicyOutcome: z.enum(SKILL_POLICY_OUTCOMES).nullable(),
    expectedAbstention: z.enum(EVALUATION_ABSTENTION_EXPECTATIONS),
    expectedMissingInformationKeys: z.array(z.enum(CONTEXT_SLOTS)).max(32),
    expectedRiskLevel: z.enum(SKILL_RISK_LEVELS).nullable(),
    expectedActionEligibility: z.enum(["none", "low_risk_manual_only"]).nullable(),
    // The V1 ceiling. A fixture cannot expect a capability the contracts
    // cannot express, so an impossible expectation is unwritable.
    expectedExecutionCapability: z.enum(["none", "manual_only"]).nullable(),
    allowedEvidenceIds: z.array(idTokenSchema).max(64),
    forbiddenEvidenceIds: z.array(idTokenSchema).max(64),
    expectedCitedEvidenceIds: z.array(idTokenSchema).max(64).nullable(),
    forbiddenClaims: z.array(z.string().trim().min(1).max(200)).max(32),
    expectedConfidence: confidenceExpectationSchema.nullable(),
    requiredWarnings: z.array(z.string().trim().min(1).max(200)).max(32),
    forbiddenWarnings: z.array(z.string().trim().min(1).max(200)).max(32),
    safetyCritical: z.boolean(),
    promotionEligible: z.boolean(),
    determinismRepetitions: z.number().int().min(1).max(16),
    authoredAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((f, ctx) => {
    const add = (message: string, path: (string | number)[]): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };

    // The harness cannot vouch for itself.
    if (f.fixtureKind === "harness_self_test" && f.promotionEligible !== false) {
      add("harness_self_test_is_never_promotion_eligible", ["promotionEligible"]);
    }

    // A safety-critical case that expects action to be allowed is not testing
    // a safety property; it is asserting one away.
    if (f.safetyCritical && f.expectedAbstention === "must_act" && f.safetyCritical) {
      if (f.expectedActionEligibility === "low_risk_manual_only" && f.expectedRiskLevel !== "low") {
        add("safety_critical_case_expects_non_low_risk_action", ["expectedRiskLevel"]);
      }
    }

    // An id cannot be both allowed and forbidden.
    const forbidden = new Set(f.forbiddenEvidenceIds);
    for (const id of f.allowedEvidenceIds) {
      if (forbidden.has(id))
        add("evidence_id_both_allowed_and_forbidden", ["forbiddenEvidenceIds"]);
    }
    // An expected citation must be allowed, or the fixture expects a
    // violation it also forbids.
    if (f.expectedCitedEvidenceIds !== null && f.allowedEvidenceIds.length > 0) {
      const allowed = new Set(f.allowedEvidenceIds);
      for (const id of f.expectedCitedEvidenceIds) {
        if (!allowed.has(id))
          add("expected_citation_not_in_allowed_set", ["expectedCitedEvidenceIds"]);
      }
    }

    // Determinism cannot be asserted from a single sample.
    if (f.tags.includes("determinism") && f.determinismRepetitions < 2) {
      add("determinism_case_requires_repetitions", ["determinismRepetitions"]);
    }

    // Synthetic only — checked over everything the fixture carries.
    // A fixture authorising NO evidence while expecting a citation is
    // self-contradictory: any output satisfying the expectation now trips
    // `evidence_cited_outside_selection`. That is an authoring error and
    // belongs in preflight, not reported as unsafe runtime behaviour.
    if (f.allowedEvidenceIds.length === 0 && (f.expectedCitedEvidenceIds ?? []).length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedCitedEvidenceIds"],
        message: "expects_citations_while_authorising_no_evidence",
      });
    }

    // `evaluateSkillCase` defines acting as exactly `low_risk_manual_only`,
    // so these pairs describe a run that cannot exist. An authoring error
    // should be refused in preflight, not reported forever as a skill that
    // fails.
    if (f.expectedAbstention === "must_act" && f.expectedActionEligibility === "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedActionEligibility"],
        message: "must_act_requires_low_risk_manual_only",
      });
    }
    if (
      f.expectedAbstention === "must_abstain" &&
      f.expectedActionEligibility === "low_risk_manual_only"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedActionEligibility"],
        message: "must_abstain_forbids_low_risk_manual_only",
      });
    }

    const categories = detectProductionDataCategories(JSON.stringify(f));
    for (const category of categories) {
      add(`fixture_contains_production_data:${category}`, ["context"]);
    }
  });

export type FixtureParse =
  | { ok: true; fixture: VerdantSkillEvaluationFixture }
  | { ok: false; issues: string[] };

/** Wrapped rather than thrown, matching the Build 1–6 parse convention. */
/**
 * The RECORDED EXECUTION half of a fixture file.
 *
 * The fixture block has always been schema-checked; the execution block beside
 * it was not, and it is the half that carries model output. Two consequences,
 * both observed:
 *
 *  1. A wrong-typed field (`selectedEvidenceIds: 42`) reached a spread or a
 *     `.flatMap` and threw, so a malformed input surfaced as a crash with exit
 *     1 — the code reserved for "the skill failed its expectations" — instead
 *     of the documented exit 2.
 *  2. Worse, and the reason `firedRules` and `missingRequiredContext` are
 *     REQUIRED here rather than defaulted: every downstream read was
 *     `?? []`, so an ABSENT key was indistinguishable from an empty one. The
 *     only equipment-control safety check in the build reads
 *     `policy.firedRules`, which meant a policy object missing that key read
 *     as "the governor fired nothing" — unevaluated silently defaulting to
 *     safe. A missing safety-relevant collection is an error, not zero
 *     findings.
 *
 * Deliberately `.strict()`: an unrecognised key is a typo or a drifted
 * producer, and both should be loud.
 */
const executionApplicabilitySchema = z
  .object({
    // The real vocabulary, not "any non-empty string". An arbitrary verdict
    // satisfied a fixture expectation that named the same arbitrary string,
    // so both sides could agree on a value the runtime can never produce.
    verdict: z.enum(SKILL_APPLICABILITY_VERDICTS),
    // WHOSE verdict this is. Without these the record could be copied from
    // another skill: the harness computes `derivedFromManifest` from the
    // fixture's own manifest, so a borrowed result binds cleanly and looks
    // like provenance. Carrying the identity is what makes the borrowed case
    // checkable at all — the CLI compares it against the requested skill.
    skillId: z.string().min(1),
    skillVersion: z.string().min(1),
    // The CLOSED slot vocabulary, like `verdict` one field above. Fabricated
    // tokens were published as a "measured" 100% missing-context detection
    // rate for gaps the applicability engine is structurally incapable of
    // emitting — while the identical fabrication in `verdict` was rejected by
    // its enum. Two fields in one object, one closed and one open.
    missingRequiredContext: z.array(z.enum(CONTEXT_SLOTS)),
  })
  .passthrough();

/**
 * One fired governor rule.
 *
 * The elements, not just the array. Requiring `firedRules` to BE an array
 * stopped an absent collection reading as an empty one, but left every element
 * `unknown`, so `[null]` was still accepted — and the equipment-control filter
 * dereferences `r.code`, throwing on a null element instead of returning the
 * documented usage exit code. A collection is only validated when its contents
 * are.
 */
const executionFiredRuleSchema = z
  .object({
    // WHAT the rule is about. The governor always attaches a structural block
    // to a proposal, and the evaluator groups rules by proposalId — so a rule
    // omitting these was silently skipped, letting the proposal keep an allow
    // verdict that its own recorded block should have contradicted.
    subject: z.enum(["run", "proposal", "hypothesis", "follow_up", "evidence"]),
    proposalId: z.string().min(1).nullable(),
    // The governor's OWN codes. Any string was accepted, and the evaluator
    // recognises equipment-control findings by exact code — so a record could
    // replace `device_control_instruction` with a plausible typo, keep the
    // eligible manual proposal carrying the instruction, and never raise
    // `device_control_emitted`. A safety check keyed on an open vocabulary is
    // a safety check with an opt-out.
    code: z.enum(SKILL_POLICY_RULE_CODES),
  })
  .passthrough()
  .superRefine((rule, ctx) => {
    // Subject alone is not enough: a run-wide structural block parked on
    // `subject: "evidence"` is still accepted by the enum, and the evaluator
    // then ignores evidence-scoped rules when applying run-scoped blocks —
    // so `proposal_without_grant` disappears and an allow verdict survives.
    // Shapes come from the governor's own emission tables.
    if (
      !isCanonicalFiredRule({
        code: rule.code,
        subject: rule.subject,
        proposalId: rule.proposalId,
      })
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `fired_rule_shape_invalid:${rule.code}/${rule.subject}/${rule.proposalId === null ? "null" : "id"}`,
        path: ["code"],
      });
    }
  });

/**
 * One proposal verdict. Elements again, for the same reason as fired rules:
 * `proposalVerdicts: [null]` parsed, and the evaluator maps over it and
 * dereferences verdict fields, so it threw instead of returning exit 2.
 */
const executionProposalVerdictSchema = z
  .object({
    // The proposal this verdict is ABOUT. The governor emits one verdict per
    // proposal, so a verdict with no proposalId is unattached to anything —
    // and the evaluator derives action eligibility and capability from the
    // verdicts alone, so an output containing zero proposals could sit beside
    // an allowed manual_only verdict and satisfy `must_act`. Green promotion
    // evidence for a decision the governor could not have produced for the
    // output actually recorded.
    proposalId: z.string().min(1),
    // The governor produces exactly "allow" or "block". Any other string was
    // accepted and then read as not-allowed downstream, so a case could pass
    // on a policy decision the governor cannot emit.
    verdict: z.enum(["allow", "block"]),
    // Every field the evaluator READS, not just the one it switches on.
    // Validating `verdict` alone let `[{"verdict":"allow"}]` load, put
    // undefined into actualRiskLevels/actualCapabilities, and stay green
    // wherever the matching fixture expectation happened to be null — an
    // expectation silently unchecked rather than loudly unmet.
    effectiveRiskLevel: z.enum(SKILL_RISK_LEVELS),
    executionCapability: z.enum(["none", "manual_only"]),
  })
  .passthrough();

const executionPolicySchema = z
  .object({
    // Required, not defaulted. See above: absent must never read as empty.
    firedRules: z.array(executionFiredRuleSchema),
    proposalVerdicts: z.array(executionProposalVerdictSchema),
    // The contract's own vocabularies. `outcomes: ["bogus"]` and
    // `actionEligibility: "manual"` were accepted, and an unknown eligibility
    // reads as abstention downstream — so a case could pass on a value that is
    // not a valid SkillPolicyDecision at all.
    outcomes: z.array(z.enum(SKILL_POLICY_OUTCOMES)),
    actionEligibility: z.enum(["none", "low_risk_manual_only"]),
  })
  .passthrough()
  .superRefine((policy, ctx) => {
    // The governor derives eligibility FROM the verdicts:
    //   anyActionable = allowed verdicts with executionCapability manual_only
    //   actionEligibility = anyActionable ? "low_risk_manual_only" : "none"
    // so the two fields cannot disagree in anything it emits. Accepting a
    // disagreement mattered because `evaluateSkillCase` reads abstention from
    // `actionEligibility` alone: a record pairing "none" with an allowed
    // manual_only verdict let a safety-critical must_abstain fixture pass
    // while the policy it recorded still permitted a manual action.
    const anyActionable = policy.proposalVerdicts.some(
      (v) => v.verdict === "allow" && v.executionCapability === "manual_only",
    );
    // BOTH directions, for both verdict-determined outcomes.
    //
    // The governor's rule is two biconditionals — `block_action` iff some
    // verdict blocks, `allow_low_risk_manual_action` iff some verdict allows —
    // and the evaluator reads `outcomes` independently, so either direction
    // being wrong lets a decision the governor cannot emit satisfy a fixture.
    // My previous version checked one half of one of them: a record with no
    // allowed verdict could still CLAIM the allowance, which is the permissive
    // direction and the one that matters most.
    //
    // Written as an equivalence rather than as four `if`s, because the last
    // two rounds each added one more direction to a check that needed all of
    // them, and an equivalence cannot be half-written.
    // NOT constrained here: `observation_only`.
    //
    // Codex is right that the governor emits it only when no verdict allows
    // and none blocks, so listing it beside an allowance is a decision it
    // cannot produce. I wrote that as a biconditional — implied whenever there
    // are no verdicts — and it immediately failed fixtures whose outcome is
    // `monitor` or `request_more_information` with no verdicts, which the
    // governor also emits in that state. The one-directional rule (an
    // allowance forbids it) is probably right, but "probably" is not a
    // standard to add a safety invariant on, and I have not read the
    // governor's outcome derivation closely enough to state it. Left open
    // deliberately rather than guessed at.
    const verdictImplied: Record<string, boolean> = {
      block_action: policy.proposalVerdicts.some((v) => v.verdict === "block"),
      allow_low_risk_manual_action: policy.proposalVerdicts.some((v) => v.verdict === "allow"),
    };
    for (const [outcome, implied] of Object.entries(verdictImplied)) {
      if (policy.outcomes.includes(outcome as (typeof SKILL_POLICY_OUTCOMES)[number]) !== implied) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["outcomes"],
          message: implied
            ? `outcomes_omit_${outcome}_despite_verdicts`
            : `outcomes_claim_${outcome}_without_a_verdict_implying_it`,
        });
      }
    }

    const expected = anyActionable ? "low_risk_manual_only" : "none";
    if (policy.actionEligibility !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actionEligibility"],
        message: `action_eligibility_contradicts_verdicts_expected_${expected}`,
      });
    }
  });

export const verdantSkillExecutionRecordSchema = z
  .object({
    skillContract: z.record(z.unknown()),
    // WHOSE manifest this is. The canonical manifest types id/version as
    // required, and the policy governor anchors every identity check on them —
    // but here it was `z.record(z.unknown())`, so a manifest belonging to
    // another skill was digested and PUBLISHED as the report's headline
    // provenance row under the correct-looking title. `.passthrough()` rather
    // than the full manifest schema: the fixtures carry deliberate stubs, and
    // the identity is the part that has to be real.
    manifest: z.object({ id: z.string().min(1), version: z.string().min(1) }).passthrough(),
    // A context that does not say WHICH context it is cannot establish that an
    // output belongs to it: the version comparison simply skipped when this
    // was absent, so a schema-valid output could name any context at all.
    context: z.object({ contextVersion: z.string().min(1) }).passthrough(),
    applicability: executionApplicabilitySchema,
    evidenceCorpus: z.record(z.unknown()),
    evidenceRegistryVersion: z.string().min(1),
    selectedEvidenceIds: z.array(z.string()),
    // Present in authored fixtures for readability; the harness DERIVES the
    // real value from the output and never reads this one.
    citedEvidenceIds: z.array(z.string()).optional(),
    policy: executionPolicySchema,
    policyVersion: z.string().min(1),
    draft: z.record(z.unknown()),
    expectation: z.record(z.unknown()),
    // Left unconstrained on purpose: `output` is untrusted model output and is
    // validated separately by the Build 1 contract parser, whose verdict is
    // itself a measurement the harness reports.
    output: z.unknown(),
    // Authored value is ignored — schema validity is derived by parsing.
    outputSchemaValid: z.boolean().optional(),
  })
  .strict();

export type VerdantSkillExecutionRecord = z.infer<typeof verdantSkillExecutionRecordSchema>;

export type ExecutionParse =
  | { ok: true; execution: Record<string, unknown> }
  | { ok: false; issues: string[] };

/** Named-field issues, sorted, so a malformed fixture reports WHICH field. */
export function parseExecutionRecord(input: unknown): ExecutionParse {
  const parsed = verdantSkillExecutionRecordSchema.safeParse(input);
  if (parsed.success === false) {
    return {
      ok: false,
      issues: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .sort(),
    };
  }
  return { ok: true, execution: parsed.data as Record<string, unknown> };
}

export function parseEvaluationFixture(input: unknown): FixtureParse {
  const parsed = verdantSkillEvaluationFixtureSchema.safeParse(input);
  if (parsed.success === false) {
    return {
      ok: false,
      issues: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .sort(),
    };
  }
  return { ok: true, fixture: parsed.data as unknown as VerdantSkillEvaluationFixture };
}
