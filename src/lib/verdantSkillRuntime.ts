/**
 * Verdant Skill Runtime v1.
 *
 * Synchronous, deterministic, in-memory orchestration for closed first-party
 * skills. The runtime accepts unknown skill input, requires caller-injected run
 * identity and execution time, and returns an immutable versioned receipt.
 */

import {
  applicableVerdantSkill,
  inspectVerdantSkillData,
  parseVerdantSkillExecutionAt,
  validateVerdantSkillApplicabilityResult,
} from "@/lib/verdantSkillApplicabilityRules";
import {
  validateVerdantSkillManifest,
  type VerdantSkillDefinition,
  type VerdantSkillHandlerResult,
} from "@/lib/verdantSkillManifest";
import {
  createVerdantSkillRunReceipt,
  type VerdantSkillReceiptApplicability,
  type VerdantSkillRunReceipt,
} from "@/lib/verdantSkillOutcomeRules";
import {
  evaluateVerdantSkillPostExecutionPolicy,
  evaluateVerdantSkillPreExecutionPolicy,
} from "@/lib/verdantSkillPolicyRules";
import { resolveVerdantSkillDefinition } from "@/lib/verdantSkillRegistry";

export interface RunVerdantSkillRequest {
  readonly runId: string;
  readonly executionAt: string;
  readonly skillId: string;
  readonly version: string;
  readonly input: unknown;
}

const REQUEST_KEYS = Object.freeze([
  "runId",
  "executionAt",
  "skillId",
  "version",
  "input",
] as const);
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function isExactRequestRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...REQUEST_KEYS].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]) &&
    Object.values(descriptors).every((descriptor) => descriptor.enumerable && "value" in descriptor)
  );
}

function safeRunId(value: unknown): string | null {
  return typeof value === "string" && RUN_ID_PATTERN.test(value) ? value : null;
}

function safeSkillId(value: unknown): string | null {
  return typeof value === "string" && SKILL_ID_PATTERN.test(value) ? value : null;
}

function safeVersion(value: unknown): string | null {
  return typeof value === "string" && VERSION_PATTERN.test(value) ? value : null;
}

function applicabilityReceipt(
  status: VerdantSkillReceiptApplicability["status"],
  reasonCodes: readonly string[],
): VerdantSkillReceiptApplicability {
  return Object.freeze({
    status,
    reasonCodes: Object.freeze([...new Set(reasonCodes)].sort()),
  });
}

function isHandlerResult(value: unknown): value is VerdantSkillHandlerResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== 2 || keys[0] !== "outcome" || keys[1] !== "status") return false;
  if (
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    return false;
  }
  const status = descriptors.status.value;
  return status === "completed" || status === "insufficient_evidence";
}

function definitionIsExecutable(definition: VerdantSkillDefinition<unknown, unknown>): boolean {
  return (
    typeof definition.assess === "function" &&
    typeof definition.run === "function" &&
    typeof definition.validateOutcome === "function"
  );
}

/**
 * Execute one exact first-party skill version. No caller-supplied function or
 * effect request is accepted by this API.
 */
export function runVerdantSkill(request: unknown): VerdantSkillRunReceipt {
  const unknownRequest = request;
  let requestShapeIsValid = false;
  try {
    requestShapeIsValid = isExactRequestRecord(unknownRequest);
  } catch {
    requestShapeIsValid = false;
  }
  if (!requestShapeIsValid) {
    return createVerdantSkillRunReceipt({
      runId: null,
      executionAt: null,
      skillId: null,
      skillVersion: null,
      status: "skill_error",
      reasonCodes: ["runtime_request_invalid"],
    });
  }
  const requestRecord = unknownRequest as Record<string, unknown>;

  const runId = safeRunId(requestRecord.runId);
  const executionAt = parseVerdantSkillExecutionAt(requestRecord.executionAt);
  const skillId = safeSkillId(requestRecord.skillId);
  const skillVersion = safeVersion(requestRecord.version);

  if (!runId || !executionAt || !skillId || !skillVersion) {
    const reasons = [
      ...(runId ? [] : ["run_id_invalid"]),
      ...(executionAt ? [] : ["execution_time_invalid"]),
      ...(skillId ? [] : ["skill_id_invalid"]),
      ...(skillVersion ? [] : ["skill_version_invalid"]),
    ];
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: reasons,
    });
  }

  const definition = resolveVerdantSkillDefinition(skillId, skillVersion);
  if (!definition) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "unknown_skill",
      reasonCodes: ["skill_not_registered"],
    });
  }

  const manifestValidation = validateVerdantSkillManifest(definition.manifest);
  if (
    manifestValidation.ok === false ||
    !definitionIsExecutable(definition) ||
    (manifestValidation.ok &&
      (manifestValidation.manifest.id !== skillId ||
        manifestValidation.manifest.version !== skillVersion))
  ) {
    const manifestReasons =
      manifestValidation.ok === false
        ? manifestValidation.reasonCodes
        : !definitionIsExecutable(definition)
          ? ["skill_definition_invalid"]
          : ["registry_manifest_mismatch"];
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "invalid_manifest",
      reasonCodes: manifestReasons,
    });
  }

  const prePolicy = evaluateVerdantSkillPreExecutionPolicy(manifestValidation.manifest);
  if (!prePolicy.allowed) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "policy_blocked",
      reasonCodes: prePolicy.findings.map((item) => item.code),
      prePolicy,
    });
  }

  const rawInputInspection = inspectVerdantSkillData(requestRecord.input);
  if (!rawInputInspection.ok) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "not_applicable",
      reasonCodes: ["input_invalid", ...rawInputInspection.issues],
      applicability: applicabilityReceipt("invalid", rawInputInspection.issues),
      prePolicy,
    });
  }

  const reconstructedInput = applicableVerdantSkill(requestRecord.input);
  if (reconstructedInput.status !== "applicable") {
    const reconstructionIssues =
      reconstructedInput.status === "invalid"
        ? reconstructedInput.issues
        : reconstructedInput.reasonCodes;
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "not_applicable",
      reasonCodes: ["input_invalid", ...reconstructionIssues],
      applicability: applicabilityReceipt("invalid", reconstructionIssues),
      prePolicy,
    });
  }

  let rawAssessment: unknown;
  try {
    rawAssessment = definition.assess(reconstructedInput.normalizedInput, executionAt);
  } catch {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: ["skill_assessment_failed"],
      prePolicy,
    });
  }

  const assessmentValidation = validateVerdantSkillApplicabilityResult(rawAssessment);
  if (assessmentValidation.ok === false) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: ["skill_assessment_invalid", ...assessmentValidation.issues],
      prePolicy,
    });
  }

  const assessment = assessmentValidation.result;
  if (assessment.status === "invalid") {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "not_applicable",
      reasonCodes: ["input_invalid", ...assessment.issues],
      applicability: applicabilityReceipt("invalid", assessment.issues),
      prePolicy,
    });
  }
  if (assessment.status === "not_applicable") {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "not_applicable",
      reasonCodes: assessment.reasonCodes,
      applicability: applicabilityReceipt("not_applicable", assessment.reasonCodes),
      prePolicy,
    });
  }

  const applicable = applicabilityReceipt("applicable", assessment.reasonCodes);
  let handlerResult: unknown;
  try {
    handlerResult = definition.run({
      input: assessment.normalizedInput,
      executionAt,
    });
  } catch {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: ["skill_execution_failed"],
      applicability: applicable,
      prePolicy,
    });
  }

  if (!isHandlerResult(handlerResult)) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: ["skill_handler_result_invalid"],
      applicability: applicable,
      prePolicy,
    });
  }

  const postPolicy = evaluateVerdantSkillPostExecutionPolicy(handlerResult.outcome);
  if (!postPolicy.allowed) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "policy_blocked",
      reasonCodes: postPolicy.findings.map((item) => item.code),
      applicability: applicable,
      prePolicy,
      postPolicy,
    });
  }

  let outcomeValidation: ReturnType<typeof definition.validateOutcome>;
  try {
    outcomeValidation = definition.validateOutcome(handlerResult.outcome);
  } catch {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: ["skill_outcome_validation_failed"],
      applicability: applicable,
      prePolicy,
      postPolicy,
    });
  }

  if (outcomeValidation.ok === false) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: ["skill_outcome_invalid", ...outcomeValidation.reasonCodes],
      applicability: applicable,
      prePolicy,
      postPolicy,
    });
  }

  const validatedOutcomeInspection = inspectVerdantSkillData(outcomeValidation.outcome);
  if (!validatedOutcomeInspection.ok) {
    return createVerdantSkillRunReceipt({
      runId,
      executionAt,
      skillId,
      skillVersion,
      status: "skill_error",
      reasonCodes: ["skill_outcome_invalid", ...validatedOutcomeInspection.issues],
      applicability: applicable,
      prePolicy,
      postPolicy,
    });
  }

  return createVerdantSkillRunReceipt({
    runId,
    executionAt,
    skillId,
    skillVersion,
    status: handlerResult.status,
    reasonCodes:
      handlerResult.status === "completed" ? ["skill_completed"] : ["skill_insufficient_evidence"],
    applicability: applicable,
    prePolicy,
    postPolicy,
    outcome: outcomeValidation.outcome,
  });
}
