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
import { SKILL_POLICY_OUTCOMES } from "@/lib/verdantSkillPolicyGovernor";
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
    expectedApplicability: z.string().trim().min(1).max(64).nullable(),
    evidenceInputs: z.record(z.unknown()).nullable(),
    expectedSelectedEvidenceIds: z.array(idTokenSchema).max(64),
    modelDraft: z.record(z.unknown()).nullable(),
    modelAdapterFixtureId: idTokenSchema.nullable(),
    expectedPolicyOutcome: z.enum(SKILL_POLICY_OUTCOMES).nullable(),
    expectedAbstention: z.enum(EVALUATION_ABSTENTION_EXPECTATIONS),
    expectedMissingInformationKeys: z.array(z.string().trim().min(1).max(64)).max(32),
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
    const categories = detectProductionDataCategories(JSON.stringify(f));
    for (const category of categories) {
      add(`fixture_contains_production_data:${category}`, ["context"]);
    }
  });

export type FixtureParse =
  | { ok: true; fixture: VerdantSkillEvaluationFixture }
  | { ok: false; issues: string[] };

/** Wrapped rather than thrown, matching the Build 1–6 parse convention. */
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
