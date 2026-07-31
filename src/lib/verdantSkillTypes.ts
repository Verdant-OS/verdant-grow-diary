/**
 * verdantSkillTypes — type-only barrel for the Verdant Skill Runtime v1
 * contract family.
 *
 * The single source of truth is `verdantSkillSchemas.ts` (Zod schemas;
 * all types are inferred there so types and validators cannot drift).
 * Engine components that only need the types import from here; anything
 * that parses or serializes imports the schemas module directly.
 *
 * Do NOT define competing local contract shapes — extend the schemas
 * module instead.
 */

export type {
  VerdantSkillInputEnvelope,
  PlantContextBundle,
  EvidenceRecord,
  SkillHypothesis,
  SkillConfidenceResult,
  SkillActionProposal,
  SkillRunResult,
  SkillOutcomeFollowUp,
  SkillError,
  SkillVersion,
  SkillSensorSnapshot,
  SkillContractParse,
  SkillSensorSourceLabel,
  SkillReadingQuality,
  SkillRiskLevel,
  SkillPlantStage,
  SkillExecutionCapability,
  SkillInputCompleteness,
  SkillRunStatus,
  SkillErrorCode,
  SkillEvidenceKind,
  SkillFollowUpStatus,
  SkillFollowUpOutcome,
} from "@/lib/verdantSkillSchemas";

export {
  SKILL_CONTRACT_VERSION,
  SKILL_CONTRACT_LIMITS,
  SKILL_SENSOR_SOURCE_LABELS,
  SKILL_READING_QUALITY_LABELS,
  SKILL_RISK_LEVELS,
  SKILL_PLANT_STAGES,
  SKILL_EXECUTION_CAPABILITIES,
  SKILL_APPROVAL_REQUIREMENT,
  SKILL_CONFIDENCE_DERIVATION,
  SKILL_INPUT_COMPLETENESS_LEVELS,
  SKILL_RUN_STATUSES,
  SKILL_ERROR_CODES,
  SKILL_EVIDENCE_KINDS,
  SKILL_FOLLOW_UP_STATUSES,
  SKILL_FOLLOW_UP_OUTCOMES,
} from "@/lib/verdantSkillSchemas";
