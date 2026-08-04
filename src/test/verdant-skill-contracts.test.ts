/**
 * verdant-skill-contracts — contract tests for Verdant Skill Runtime v1.
 *
 * Covers: valid parsing, missing required context, malformed timestamps,
 * unknown source labels, invalid confidence values, invalid risk levels,
 * attempted device-execution capability, deterministic serialization,
 * backward-compatible optional fields, and secret-like value exclusion.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "./utils/stripSourceComments";
import {
  SKILL_ERROR_CODES,
  SKILL_EXECUTION_CAPABILITIES,
  SKILL_FOLLOWUP_OUTCOMES,
  SKILL_RISK_LEVELS,
  VERDANT_SKILL_FOLLOWUP_EVENT_TYPE,
  VERDANT_SKILL_ENVELOPE_SCHEMA_VERSION,
  VERDANT_SKILL_RUNTIME_CONTRACT_VERSION,
} from "@/lib/verdantSkillTypes";
import {
  EvidenceRecordSchema,
  PlantContextBundleSchema,
  SkillActionProposalSchema,
  SkillErrorSchema,
  SkillHypothesisSchema,
  SkillOutcomeFollowUpSchema,
  SkillVersionSchema,
  VerdantSkillConfidenceInputSchema,
  buildVerdantSkillOutcomeFollowUp,
  deriveVerdantSkillConfidence,
  parseVerdantSkillInputEnvelope,
  parseVerdantSkillRunResult,
  serializeVerdantSkillInputEnvelope,
  serializeVerdantSkillRunResult,
  stableSkillStringify,
} from "@/lib/verdantSkillSchemas";
import {
  AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
  AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER,
} from "@/lib/aiDoctorReviewRequestPacketValidationRules";
import { AI_DOCTOR_REVIEW_ARRAY_CAP } from "@/lib/aiDoctorReviewResultContract";
import { MAX_SUGGESTED_ACTIONS } from "@/lib/aiDoctorDiagnosisRules";
import {
  CONFIDENCE_CEILING_CAPS,
  CONFIDENCE_LIMITED_COPY,
  harmonizeDiagnosisConfidence,
} from "@/lib/aiDoctorConfidenceRules";
import { ACTION_FOLLOWUP_OUTCOMES } from "@/lib/actionFollowUpEvidenceRules";
import { CANONICAL_SENSOR_SOURCES } from "@/constants/sensorIngestProvenance";
import type { AiDoctorConfidenceResult } from "@/lib/aiDoctorConfidenceAdapter";

const SKILL_NOW = new Date("2026-07-31T12:00:00Z");

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GROW_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PLANT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const evidenceConfidence = (): AiDoctorConfidenceResult => ({
  score: 55,
  level: "medium",
  explanation: "Manual readings cover the last day; no fresh telemetry.",
  positive_factors: ["recent manual snapshot"],
  limiting_factors: ["no fresh telemetry"],
  source_quality: {
    live_recent: 0,
    manual_recent: 2,
    csv_backfill: 1,
    demo_or_stale: 0,
  } as unknown as AiDoctorConfidenceResult["source_quality"],
  safety_flags: [],
});

const validEvidence = () => ({
  id: "skill-evidence-vpd-drift",
  kind: "sensor_metric" as const,
  summary: "VPD drifted above the veg target for six hours yesterday.",
  source: "manual" as const,
  trust: "medium" as const,
  stale: false,
  metric: "vpd_kpa" as const,
  value: 1.62,
  unit: "kPa",
  observedAt: "2026-07-30T18:00:00.000Z",
});

const validBundle = () => ({
  contextPayload: { grow_id: null, stage: "veg" },
  readiness: "partial" as const,
  sufficiency: "limited" as const,
  confidenceCeiling: "medium" as const,
  missing: ["recent_photo"],
  sourceTags: ["csv", "manual"] as const,
  hasFreshLiveTelemetry: false,
  compiledAt: "2026-07-31T11:00:00.000Z",
});

const validEnvelope = () => ({
  schemaVersion: VERDANT_SKILL_ENVELOPE_SCHEMA_VERSION,
  contractVersion: VERDANT_SKILL_RUNTIME_CONTRACT_VERSION,
  skillId: "leaf-triage",
  skillVersion: "leaf-triage/v1",
  runId: RUN_ID,
  requestedAt: "2026-07-31T12:00:00.000Z",
  requestedBy: USER_ID,
  growId: GROW_ID,
  tentId: TENT_ID,
  plantId: PLANT_ID,
  contextVersion: 3,
  context: validBundle(),
  evidence: [validEvidence()],
  sourceSummary: [
    { source: "manual" as const, count: 2 },
    { source: "csv" as const, count: 1 },
  ],
  inputCompleteness: "limited" as const,
  provenanceWarnings: ["Sensor history is manual-entry only for this window."],
  flags: { "pheno-aware": true },
});

const validHypothesis = () => ({
  id: "vpd-stress",
  statement: "Elevated VPD likely stressed the upper canopy.",
  likelyIssue: "Transpiration stress from dry air.",
  riskLevel: "medium" as const,
  evidenceIds: ["skill-evidence-vpd-drift"],
  missingInformation: ["A current canopy photo would strengthen this."],
  modelConfidence: 0.62,
});

const validProposal = () => ({
  actionType: "advisory" as const,
  status: "pending_approval" as const,
  approvalRequired: true as const,
  executionCapability: "manual_only" as const,
  riskLevel: "low" as const,
  title: "Raise humidity toward the veg target",
  suggestedChange: "Add a small open water tray to the tent to nudge humidity upward.",
  reason: "Manual readings show VPD above target while humidity trends low.",
  evidenceIds: ["skill-evidence-vpd-drift"],
  missingInformation: ["Whether the intake pulls from a drier room."],
  expectedResponse: "VPD should settle back into the veg band within a day.",
  followUpIntervalHours: 24,
  cancellationConditions: ["Humidity returns to the target band on its own."],
  targetMetric: "general" as const,
  source: "skill_runtime" as const,
  backPointer: "[skill:leaf-triage]",
});

const validFollowUp = () => ({
  idempotencyKey: `${VERDANT_SKILL_FOLLOWUP_EVENT_TYPE}::s:leaf-triage|r:${RUN_ID}|p:none`,
  eventType: VERDANT_SKILL_FOLLOWUP_EVENT_TYPE,
  title: "Check canopy response to the humidity change",
  body: "Look for relaxed leaf posture and note the current VPD reading.",
  dueAt: "2026-08-01T12:00:00.000Z",
  checklist: ["Note current VPD", "Photograph the upper canopy"],
  outcome: null,
  note: null,
  observedAt: null,
  photoReference: null,
});

const validRunResult = () => ({
  skillId: "leaf-triage",
  skillVersion: "leaf-triage/v1",
  runId: RUN_ID,
  startedAt: "2026-07-31T12:00:00.000Z",
  finishedAt: "2026-07-31T12:00:04.000Z",
  hypotheses: [validHypothesis()],
  evidence: [validEvidence()],
  confidence: { modelConfidence: 0.62 },
  proposals: [validProposal()],
  followUp: validFollowUp(),
  warnings: ["Confidence limited by manual-entry history."],
});

const deps = () => ({
  evidenceConfidence: evidenceConfidence(),
  ceiling: "medium" as const,
});

describe("verdant skill contracts", () => {
  describe("input envelope", () => {
    it("parses a valid envelope, deterministically and without mutating input", () => {
      const input = validEnvelope();
      const before = JSON.stringify(input);
      const first = parseVerdantSkillInputEnvelope(input);
      const second = parseVerdantSkillInputEnvelope(input);
      expect(first.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(JSON.stringify(first.envelope)).toBe(JSON.stringify(second.envelope));
        expect(first.envelope).not.toBe(input);
        expect(first.envelope.skillId).toBe("leaf-triage");
        // sourceSummary normalized to sorted-by-source order
        expect(first.envelope.sourceSummary.map((s) => s.source)).toEqual(["csv", "manual"]);
      }
      expect(JSON.stringify(input)).toBe(before);
    });

    it("rejects unsupported schema and contract versions with specific codes", () => {
      const badSchema = parseVerdantSkillInputEnvelope({ ...validEnvelope(), schemaVersion: 2 });
      expect(badSchema.ok).toBe(false);
      if (badSchema.ok === false) {
        expect(["unsupported_schema_version", "invalid_envelope"]).toContain(badSchema.error.code);
      }

      const badContract = parseVerdantSkillInputEnvelope({
        ...validEnvelope(),
        contractVersion: "verdant-skill-runtime/v2",
      });
      expect(badContract.ok).toBe(false);
      if (badContract.ok === false) {
        expect(["unsupported_contract_version", "invalid_envelope"]).toContain(
          badContract.error.code,
        );
      }

      const noVersion = { ...validEnvelope() } as Record<string, unknown>;
      delete noVersion.schemaVersion;
      expect(parseVerdantSkillInputEnvelope(noVersion).ok).toBe(false);
    });

    it("rejects an envelope missing its required context", () => {
      const input = { ...validEnvelope() } as Record<string, unknown>;
      delete input.context;
      const parsed = parseVerdantSkillInputEnvelope(input);
      expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.error.code).toBe("invalid_context_bundle");
    });

    it("rejects malformed timestamps", () => {
      for (const bad of ["yesterday", "2026-07-31", "2026-13-40T99:00:00Z", 1234567890]) {
        const parsed = parseVerdantSkillInputEnvelope({ ...validEnvelope(), requestedAt: bad });
        expect(parsed.ok, `requestedAt ${JSON.stringify(bad)} must reject`).toBe(false);
      }
    });

    it("re-serializes timestamps canonically so equal instants compare equal", () => {
      const parsed = parseVerdantSkillInputEnvelope({
        ...validEnvelope(),
        requestedAt: "2026-07-31T14:00:00+02:00",
      });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.envelope.requestedAt).toBe("2026-07-31T12:00:00.000Z");
    });

    it("rejects unknown source labels wherever sources appear", () => {
      for (const bad of ["sim", "unknown", "sensor", "IMPORTED"]) {
        const badTag = parseVerdantSkillInputEnvelope({
          ...validEnvelope(),
          context: { ...validBundle(), sourceTags: [bad] },
        });
        expect(badTag.ok, `sourceTag ${bad} must reject`).toBe(false);
        const badSummary = parseVerdantSkillInputEnvelope({
          ...validEnvelope(),
          sourceSummary: [{ source: bad, count: 1 }],
        });
        expect(badSummary.ok, `sourceSummary ${bad} must reject`).toBe(false);
      }
    });

    it("silently strips secret-like keys at any depth and resists prototype pollution", () => {
      const input = {
        ...validEnvelope(),
        raw_payload: { hidden: true },
        secret: "shhh",
        api_key: "sk-xxxx",
        tokens: ["a", "b"],
        context: { ...validBundle(), contextPayload: { grow_id: null, bridge_token: "leak-me" } },
      } as Record<string, unknown>;
      Object.defineProperty(input, "__proto__", {
        value: { polluted: true },
        enumerable: true,
        configurable: true,
      });
      const parsed = parseVerdantSkillInputEnvelope(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const dump = JSON.stringify(parsed.envelope);
        expect(dump).not.toMatch(/raw_payload/);
        expect(dump).not.toMatch(/api_key/);
        expect(dump).not.toMatch(/shhh/);
        expect(dump).not.toMatch(/sk-xxxx/);
        expect(dump).not.toMatch(/leak-me/);
        expect(Object.prototype.hasOwnProperty.call(parsed.envelope, "__proto__")).toBe(false);
      }
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it("rejects a client-supplied user_id key (identity is never client-trusted)", () => {
      const parsed = parseVerdantSkillInputEnvelope({ ...validEnvelope(), user_id: USER_ID });
      expect(parsed.ok).toBe(false);
    });

    it("normalizes absent tent/plant scope to null and preserves explicit nulls", () => {
      const absent = { ...validEnvelope() } as Record<string, unknown>;
      delete absent.tentId;
      delete absent.plantId;
      const parsedAbsent = parseVerdantSkillInputEnvelope(absent);
      expect(parsedAbsent.ok).toBe(true);
      if (parsedAbsent.ok) {
        expect(parsedAbsent.envelope.tentId).toBeNull();
        expect(parsedAbsent.envelope.plantId).toBeNull();
      }
      const parsedNull = parseVerdantSkillInputEnvelope({
        ...validEnvelope(),
        tentId: null,
        plantId: null,
      });
      expect(parsedNull.ok).toBe(true);
      if (parsedNull.ok) {
        expect(parsedNull.envelope.tentId).toBeNull();
        expect(parsedNull.envelope.plantId).toBeNull();
      }
    });

    it("rejects unknown completeness labels and non-boolean flags", () => {
      expect(
        parseVerdantSkillInputEnvelope({ ...validEnvelope(), inputCompleteness: "full" }).ok,
      ).toBe(false);
      expect(
        parseVerdantSkillInputEnvelope({ ...validEnvelope(), flags: { "pheno-aware": "yes" } }).ok,
      ).toBe(false);
      expect(
        parseVerdantSkillInputEnvelope({ ...validEnvelope(), flags: { "Bad Key": true } }).ok,
      ).toBe(false);
    });
  });

  describe("plant context bundle", () => {
    it("rejects unknown readiness, sufficiency, and ceiling labels", () => {
      for (const [field, bad] of [
        ["readiness", "ready"],
        ["sufficiency", "full"],
        ["confidenceCeiling", "max"],
      ] as const) {
        const parsed = PlantContextBundleSchema.safeParse({ ...validBundle(), [field]: bad });
        expect(parsed.success, `${field}=${bad} must reject`).toBe(false);
      }
    });

    it("rejects a non-object context payload", () => {
      for (const bad of [null, [], "context", 4]) {
        const parsed = PlantContextBundleSchema.safeParse({
          ...validBundle(),
          contextPayload: bad,
        });
        expect(parsed.success, `contextPayload ${JSON.stringify(bad)} must reject`).toBe(false);
      }
    });
  });

  describe("evidence record", () => {
    it("preserves explicit nulls for source, metric, value, unit, and observedAt", () => {
      const parsed = EvidenceRecordSchema.safeParse({
        ...validEvidence(),
        id: "skill-evidence-canopy-photo",
        kind: "visual",
        source: null,
        metric: null,
        value: null,
        unit: null,
        observedAt: null,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.source).toBeNull();
        expect(parsed.data.observedAt).toBeNull();
      }
    });

    it("rejects ids shaped like UI DOM anchors, unknown trust, and oversize values", () => {
      expect(
        EvidenceRecordSchema.safeParse({ ...validEvidence(), id: "evidence-envcheck-1" }).success,
      ).toBe(false);
      expect(EvidenceRecordSchema.safeParse({ ...validEvidence(), trust: "unknown" }).success).toBe(
        false,
      );
      expect(
        EvidenceRecordSchema.safeParse({
          ...validEvidence(),
          value: AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER + 1,
        }).success,
      ).toBe(false);
    });
  });

  describe("hypothesis", () => {
    it("rejects out-of-range model confidence", () => {
      for (const bad of [-0.1, 1.1, Number.NaN]) {
        const parsed = SkillHypothesisSchema.safeParse({
          ...validHypothesis(),
          modelConfidence: bad,
        });
        expect(parsed.success, `modelConfidence ${bad} must reject`).toBe(false);
      }
    });

    it("rejects overconfident vocabulary and device-control language", () => {
      expect(
        SkillHypothesisSchema.safeParse({
          ...validHypothesis(),
          statement: "This is guaranteed to be nitrogen deficiency.",
        }).success,
      ).toBe(false);
      expect(
        SkillHypothesisSchema.safeParse({
          ...validHypothesis(),
          statement: "Turn on the exhaust fan to fix this.",
        }).success,
      ).toBe(false);
    });

    it("uses the 3-value diagnosis risk vocabulary, not the proposal scale", () => {
      const parsed = SkillHypothesisSchema.safeParse({
        ...validHypothesis(),
        riskLevel: "critical",
      });
      expect(parsed.success).toBe(false);
    });

    it("requires missing-information notes on low-confidence hypotheses", () => {
      const parsed = SkillHypothesisSchema.safeParse({
        ...validHypothesis(),
        modelConfidence: 0.2,
        missingInformation: [],
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("confidence fence", () => {
    it("keeps model, evidence, and system confidence as separate legs", () => {
      const derived = deriveVerdantSkillConfidence(
        { modelConfidence: 0.62 },
        evidenceConfidence(),
        "medium",
      );
      expect(derived.model.rawConfidence).toBe(0.62);
      expect(derived.evidence.level).toBe("medium");
      expect(derived.system.displayedConfidence).toBeLessThanOrEqual(
        CONFIDENCE_CEILING_CAPS.medium,
      );
    });

    it("rejects any attempt to supply system confidence directly", () => {
      for (const smuggled of [
        { modelConfidence: 0.5, system: { displayedConfidence: 1 } },
        { modelConfidence: 0.5, displayedConfidence: 1 },
        { modelConfidence: 0.5, final: 1 },
      ]) {
        const parsed = VerdantSkillConfidenceInputSchema.safeParse(smuggled);
        expect(parsed.success, `smuggled key must reject: ${JSON.stringify(smuggled)}`).toBe(false);
      }
    });

    it("rejects invalid confidence values at the input schema", () => {
      for (const bad of [-1, 2, "high", null]) {
        const parsed = VerdantSkillConfidenceInputSchema.safeParse({ modelConfidence: bad });
        expect(parsed.success, `modelConfidence ${JSON.stringify(bad)} must reject`).toBe(false);
      }
    });

    it("system confidence is downgrade-only against the context ceiling", () => {
      const capped = deriveVerdantSkillConfidence(
        { modelConfidence: 0.95 },
        evidenceConfidence(),
        "low",
      );
      expect(capped.system.displayedConfidence).toBe(CONFIDENCE_CEILING_CAPS.low);
      expect(capped.system.wasCapped).toBe(true);
      expect(capped.system.limitedCopy).toBe(CONFIDENCE_LIMITED_COPY);

      const uncapped = deriveVerdantSkillConfidence(
        { modelConfidence: 0.2 },
        evidenceConfidence(),
        "high",
      );
      expect(uncapped.system.displayedConfidence).toBe(0.2);
      expect(uncapped.system.wasCapped).toBe(false);
      expect(Object.isFrozen(uncapped)).toBe(true);
    });
  });

  describe("action proposal", () => {
    it("parses a valid advisory proposal", () => {
      const parsed = SkillActionProposalSchema.safeParse(validProposal());
      expect(parsed.success).toBe(true);
    });

    it("the capability vocabulary is exactly none|manual_only", () => {
      expect([...SKILL_EXECUTION_CAPABILITIES]).toEqual(["none", "manual_only"]);
    });

    it("rejects every attempted device-execution capability value", () => {
      for (const bad of [
        "device",
        "hardware",
        "auto",
        "automatic",
        "remote",
        "scheduled",
        "manual",
        "",
      ]) {
        const parsed = SkillActionProposalSchema.safeParse({
          ...validProposal(),
          executionCapability: bad,
        });
        expect(parsed.success, `executionCapability ${JSON.stringify(bad)} must reject`).toBe(
          false,
        );
      }
    });

    it("locks the literal safety lattice: status, approval, target, source", () => {
      for (const [field, bad] of [
        ["status", "approved"],
        ["status", "completed"],
        ["approvalRequired", false],
        ["targetMetric", "temperature_c"],
        ["source", "ai_doctor"],
        ["actionType", "purchase"],
      ] as const) {
        const parsed = SkillActionProposalSchema.safeParse({ ...validProposal(), [field]: bad });
        expect(parsed.success, `${field}=${JSON.stringify(bad)} must reject`).toBe(false);
      }
    });

    it("uses the 4-value Action Queue risk vocabulary", () => {
      expect([...SKILL_RISK_LEVELS]).toEqual(["low", "medium", "high", "critical"]);
      expect(
        SkillActionProposalSchema.safeParse({ ...validProposal(), riskLevel: "critical" }).success,
      ).toBe(true);
      expect(
        SkillActionProposalSchema.safeParse({ ...validProposal(), riskLevel: "watch" }).success,
      ).toBe(false);
    });

    it("rejects device-control language in proposal prose", () => {
      const parsed = SkillActionProposalSchema.safeParse({
        ...validProposal(),
        reason: "Set the humidifier to 60% and wait.",
      });
      expect(parsed.success).toBe(false);
    });

    it("requires cancellation conditions and bounds the follow-up interval", () => {
      expect(
        SkillActionProposalSchema.safeParse({ ...validProposal(), cancellationConditions: [] })
          .success,
      ).toBe(false);
      for (const bad of [0, -1, 24 * 30 + 1, 1.5]) {
        expect(
          SkillActionProposalSchema.safeParse({ ...validProposal(), followUpIntervalHours: bad })
            .success,
          `followUpIntervalHours ${bad} must reject`,
        ).toBe(false);
      }
    });

    it("contains no device-command-shaped keys", () => {
      const parsed = SkillActionProposalSchema.safeParse(validProposal());
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const keys: string[] = [];
        const walk = (v: unknown) => {
          if (Array.isArray(v)) return v.forEach(walk);
          if (v !== null && typeof v === "object") {
            for (const [k, child] of Object.entries(v)) {
              keys.push(k);
              walk(child);
            }
          }
        };
        walk(parsed.data);
        for (const key of keys) {
          expect(key).not.toMatch(/^(command|device_id|device|control|relay|schedule|execute)$/i);
        }
      }
    });
  });

  describe("run result", () => {
    it("parses valid model output and recomputes the system confidence leg", () => {
      const parsed = parseVerdantSkillRunResult(validRunResult(), deps());
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const expected = harmonizeDiagnosisConfidence(0.62, "medium");
        expect(parsed.result.confidence.system).toEqual(expected);
        expect(parsed.result.contractVersion).toBe(VERDANT_SKILL_RUNTIME_CONTRACT_VERSION);
        expect(Object.isFrozen(parsed.result)).toBe(true);
      }
    });

    it("rejects model output that tries to smuggle a system confidence", () => {
      const parsed = parseVerdantSkillRunResult(
        {
          ...validRunResult(),
          confidence: { modelConfidence: 0.9, system: { displayedConfidence: 1 } },
        },
        deps(),
      );
      expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.error.code).toBe("confidence_field_rejected");
    });

    it("enforces caps by rejection, never truncation", () => {
      const evidence = Array.from({ length: AI_DOCTOR_REVIEW_ARRAY_CAP + 1 }, (_, i) => ({
        ...validEvidence(),
        id: `skill-evidence-${i}`,
      }));
      const overEvidence = parseVerdantSkillRunResult({ ...validRunResult(), evidence }, deps());
      expect(overEvidence.ok).toBe(false);
      if (overEvidence.ok === false) expect(overEvidence.error.code).toBe("over_cap");

      const proposals = Array.from({ length: MAX_SUGGESTED_ACTIONS + 1 }, () => validProposal());
      expect(parseVerdantSkillRunResult({ ...validRunResult(), proposals }, deps()).ok).toBe(false);

      const oversize = "x".repeat(AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH + 1);
      expect(
        parseVerdantSkillRunResult({ ...validRunResult(), warnings: [oversize] }, deps()).ok,
      ).toBe(false);
    });

    it("rejects dangling evidence references and inverted timestamps", () => {
      const dangling = parseVerdantSkillRunResult(
        {
          ...validRunResult(),
          hypotheses: [{ ...validHypothesis(), evidenceIds: ["skill-evidence-ghost"] }],
        },
        deps(),
      );
      expect(dangling.ok).toBe(false);

      const inverted = parseVerdantSkillRunResult(
        {
          ...validRunResult(),
          startedAt: "2026-07-31T12:00:05.000Z",
          finishedAt: "2026-07-31T12:00:00.000Z",
        },
        deps(),
      );
      expect(inverted.ok).toBe(false);
    });

    it("enforces the readiness ceiling when readiness is supplied", () => {
      const parsed = parseVerdantSkillRunResult(validRunResult(), {
        ...deps(),
        ceiling: "high",
        readiness: "insufficient",
      });
      expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.error.code).toBe("insufficient_context");
    });

    it("accepts an explicit null follow-up (backward-compatible optionality)", () => {
      const parsed = parseVerdantSkillRunResult({ ...validRunResult(), followUp: null }, deps());
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.result.followUp).toBeNull();
    });

    it("never throws on garbage input", () => {
      for (const bad of [null, undefined, 42, "junk", [], { deeply: { nested: [{ junk: 1 }] } }]) {
        expect(() => parseVerdantSkillRunResult(bad, deps())).not.toThrow();
        expect(parseVerdantSkillRunResult(bad, deps()).ok).toBe(false);
      }
    });

    it("excludes secret-like values from parsed results", () => {
      const parsed = parseVerdantSkillRunResult(
        {
          ...validRunResult(),
          raw_payload: { hidden: true },
          api_key: "sk-secret-sentinel",
        },
        deps(),
      );
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const dump = JSON.stringify(parsed.result);
        expect(dump).not.toMatch(/raw_payload/);
        expect(dump).not.toMatch(/sk-secret-sentinel/);
      }
    });
  });

  describe("follow-up", () => {
    it("requires a grower note for outcomes that demand one", () => {
      for (const outcome of ["declined", "unclear"] as const) {
        expect(
          SkillOutcomeFollowUpSchema.safeParse({ ...validFollowUp(), outcome, note: null }).success,
          `${outcome} without note must reject`,
        ).toBe(false);
        expect(
          SkillOutcomeFollowUpSchema.safeParse({
            ...validFollowUp(),
            outcome,
            note: "Looked the same after a day.",
          }).success,
        ).toBe(true);
      }
    });

    it("rejects transient photo references but accepts durable ones", () => {
      for (const bad of ["https://cdn.example/x.jpg", "data:image/png;base64,AAA", "x?token=y"]) {
        expect(
          SkillOutcomeFollowUpSchema.safeParse({ ...validFollowUp(), photoReference: bad }).success,
          `photoReference ${bad} must reject`,
        ).toBe(false);
      }
      expect(
        SkillOutcomeFollowUpSchema.safeParse({
          ...validFollowUp(),
          photoReference: "diary-photo/abc123",
        }).success,
      ).toBe(true);
    });

    it("builds a deterministic follow-up from an injectable clock", () => {
      const built = buildVerdantSkillOutcomeFollowUp(
        {
          skillId: "leaf-triage",
          runId: RUN_ID,
          plantId: null,
          title: "Check canopy response",
          body: "Note posture and the current VPD reading.",
          checklist: ["Note current VPD"],
        },
        SKILL_NOW,
      );
      expect(built.ok).toBe(true);
      if (built.ok) {
        expect(built.followUp.dueAt).toBe("2026-08-01T12:00:00.000Z");
        expect(built.followUp.outcome).toBeNull();
        expect(built.followUp.idempotencyKey).toBe(
          `verdant_skill_follow_up::s:leaf-triage|r:${RUN_ID}|p:none`,
        );
      }
    });

    it("keeps raw ids out of grower-facing copy", () => {
      const parsed = SkillOutcomeFollowUpSchema.safeParse({
        ...validFollowUp(),
        title: `Check plant ${PLANT_ID} again`,
      });
      expect(parsed.success).toBe(false);
    });

    it("pins the outcome vocabulary to the shared follow-up outcomes", () => {
      expect([...SKILL_FOLLOWUP_OUTCOMES]).toEqual([...ACTION_FOLLOWUP_OUTCOMES]);
    });
  });

  describe("skill error", () => {
    it("locks the error-code vocabulary and rejects unknown codes", () => {
      expect(SKILL_ERROR_CODES.length).toBeGreaterThan(0);
      const parsed = SkillErrorSchema.safeParse({
        code: "quota_exceeded",
        message: "payload: invalid",
        field: null,
        issues: [],
      });
      expect(parsed.success).toBe(false);
    });

    it("rejects secret-like values in error messages", () => {
      const parsed = SkillErrorSchema.safeParse({
        code: "invalid_model_output",
        message: "leaked eyJhbGciOiJIUzI1NiIsInR5cCI6 fragment",
        field: null,
        issues: [],
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("skill version", () => {
    it("accepts tag-style versions and rejects everything else", () => {
      expect(SkillVersionSchema.safeParse("leaf-triage/v1").success).toBe(true);
      for (const bad of ["leaf-triage/v1.2", "LeafTriage/v1", "leaf-triage", "v1", ""]) {
        expect(SkillVersionSchema.safeParse(bad).success, `${bad} must reject`).toBe(false);
      }
    });
  });

  describe("deterministic serialization", () => {
    it("serializes the same logical value identically regardless of key order", () => {
      const a = { z: 1, a: { c: [1, 2], b: "x" } };
      const b = { a: { b: "x", c: [1, 2] }, z: 1 };
      expect(stableSkillStringify(a)).toBe(stableSkillStringify(b));
      expect(stableSkillStringify([2, 1])).not.toBe(stableSkillStringify([1, 2]));
    });

    it("serializes the same run result identically across parses", () => {
      const first = parseVerdantSkillRunResult(validRunResult(), deps());
      const second = parseVerdantSkillRunResult(validRunResult(), deps());
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(serializeVerdantSkillRunResult(first.result)).toBe(
          serializeVerdantSkillRunResult(second.result),
        );
      }
      const env = parseVerdantSkillInputEnvelope(validEnvelope());
      if (env.ok) {
        expect(serializeVerdantSkillInputEnvelope(env.envelope)).toBe(
          serializeVerdantSkillInputEnvelope(env.envelope),
        );
      }
    });
  });

  describe("review regressions", () => {
    it("strips service_role keys at contextPayload depth (highest-value secret)", () => {
      const parsed = parseVerdantSkillInputEnvelope({
        ...validEnvelope(),
        context: {
          ...validBundle(),
          contextPayload: {
            grow_id: null,
            service_role: "sr-SECRET-SENTINEL",
            service_role_key: "srk-SECRET-SENTINEL",
            nested: { supabase_service_role_key: "deep-SECRET-SENTINEL" },
          },
        },
      });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        const dump = JSON.stringify(parsed.envelope);
        expect(dump).not.toMatch(/service_role/);
        expect(dump).not.toMatch(/SECRET-SENTINEL/);
      }
    });

    it("canonical sorts are code-unit ordered, never locale-dependent", () => {
      const parsed = parseVerdantSkillRunResult(
        { ...validRunResult(), warnings: ["a warning first", "B warning second"] },
        deps(),
      );
      expect(parsed.ok).toBe(true);
      // Code-unit order puts "B" (0x42) before "a" (0x61); en-locale
      // localeCompare would order them the other way.
      if (parsed.ok)
        expect(parsed.result.warnings).toEqual(["B warning second", "a warning first"]);
    });

    it("distinguishes missing fields from present-but-wrong-typed fields", () => {
      const wrongType = parseVerdantSkillInputEnvelope({ ...validEnvelope(), requestedAt: 1234 });
      expect(wrongType.ok).toBe(false);
      if (wrongType.ok === false) {
        expect(wrongType.error.code).not.toBe("missing_required_field");
      }
      const missing = { ...validEnvelope() } as Record<string, unknown>;
      delete missing.requestedAt;
      const absent = parseVerdantSkillInputEnvelope(missing);
      expect(absent.ok).toBe(false);
      if (absent.ok === false) expect(absent.error.code).toBe("missing_required_field");
    });

    it("maps refine-based caps to over_cap", () => {
      const parsed = parseVerdantSkillRunResult(
        {
          ...validRunResult(),
          evidence: [
            { ...validEvidence(), value: AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER + 1 },
          ],
        },
        deps(),
      );
      expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.error.code).toBe("over_cap");
    });

    it("rejects a follow-up whose idempotency key does not match the run identity", () => {
      const parsed = parseVerdantSkillRunResult(
        {
          ...validRunResult(),
          followUp: {
            ...validFollowUp(),
            idempotencyKey: `${VERDANT_SKILL_FOLLOWUP_EVENT_TYPE}::s:other-skill|r:${RUN_ID}|p:none`,
          },
        },
        deps(),
      );
      expect(parsed.ok).toBe(false);
    });

    it("rejects instants whose canonical ISO form leaves the RFC3339 pattern", () => {
      const parsed = parseVerdantSkillInputEnvelope({
        ...validEnvelope(),
        requestedAt: "9999-12-31T23:59:59-01:00",
      });
      expect(parsed.ok).toBe(false);
    });

    it("never freezes or aliases the caller-owned evidence confidence", () => {
      const owned = evidenceConfidence();
      const parsed = parseVerdantSkillRunResult(validRunResult(), {
        evidenceConfidence: owned,
        ceiling: "medium",
      });
      expect(parsed.ok).toBe(true);
      expect(Object.isFrozen(owned)).toBe(false);
      if (parsed.ok) {
        expect(parsed.result.confidence.evidence).not.toBe(owned);
        expect(parsed.result.confidence.evidence).toEqual(owned);
        owned.explanation = "mutated afterwards";
        expect(parsed.result.confidence.evidence.explanation).not.toBe("mutated afterwards");
      }
    });

    it("fails closed on an unknown readiness label instead of skipping the fence", () => {
      const parsed = parseVerdantSkillRunResult(validRunResult(), {
        ...deps(),
        readiness: "Insufficient" as never,
      });
      expect(parsed.ok).toBe(false);
      if (parsed.ok === false) expect(parsed.error.code).toBe("insufficient_context");
    });

    it("keeps the follow-up default cadence pinned to the AI Doctor value", async () => {
      const { AI_DOCTOR_FOLLOWUP_DEFAULT_HOURS } = await import("@/lib/aiDoctorFollowUpRules");
      const { VERDANT_SKILL_FOLLOWUP_DEFAULT_HOURS } = await import("@/lib/verdantSkillTypes");
      expect(VERDANT_SKILL_FOLLOWUP_DEFAULT_HOURS).toBe(AI_DOCTOR_FOLLOWUP_DEFAULT_HOURS);
    });
  });

  describe("static safety", () => {
    const read = (rel: string) =>
      stripSourceComments(readFileSync(resolve(__dirname, "..", rel), "utf8"));

    it("keeps the contract sources free of forbidden runtime surfaces", () => {
      for (const rel of ["lib/verdantSkillTypes.ts", "lib/verdantSkillSchemas.ts"]) {
        const source = read(rel);
        expect(source).not.toMatch(/from ["']@\/integrations\/supabase/);
        expect(source).not.toMatch(/\bfetch\s*\(/);
        expect(source).not.toMatch(/Date\.now\s*\(/);
        expect(source).not.toMatch(/\.insert\s*\(/);
        expect(source).not.toMatch(/from\(["']action_queue["']\)/);
      }
    });

    it("keeps hardware execution unrepresentable in the capability vocabulary", () => {
      const source = read("lib/verdantSkillTypes.ts");
      expect(source).toContain('["none", "manual_only"] as const');
      expect(source).not.toMatch(/"(device|hardware|auto|automatic|remote)"\s*,?\s*\]\s*as const/);
    });
  });
});
