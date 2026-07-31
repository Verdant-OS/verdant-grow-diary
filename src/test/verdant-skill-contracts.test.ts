/**
 * Verdant Skill Runtime v1 — canonical contract family tests.
 *
 * Locks the contract behaviors that later runtime components rely on:
 * strict parsing, canonical vocabularies, non-model-supplied system
 * confidence, approval-required manual-only proposals, deterministic
 * serialization, safe normalization of optional values, preserved
 * explicit nulls, and secret-shaped key exclusion.
 */

import { describe, it, expect } from "vitest";
import {
  SKILL_APPROVAL_REQUIREMENT,
  SKILL_CONFIDENCE_DERIVATION,
  SKILL_CONTRACT_VERSION,
  SKILL_EXECUTION_CAPABILITIES,
  SKILL_RISK_LEVELS,
  SKILL_SENSOR_SOURCE_LABELS,
  buildSkillConfidenceResult,
  deriveSystemConfidence,
  parseEvidenceRecord,
  parsePlantContextBundle,
  parseSkillActionProposal,
  parseSkillConfidenceResult,
  parseSkillError,
  parseSkillHypothesis,
  parseSkillOutcomeFollowUp,
  parseSkillRunResult,
  parseSkillVersion,
  parseVerdantSkillInputEnvelope,
  serializeSkillContract,
  type SkillContractParse,
} from "@/lib/verdantSkillSchemas";

const RUN_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const T0 = "2026-07-30T12:00:00.000Z";
const T1 = "2026-07-30T12:00:05.000Z";

function expectOk<T>(r: SkillContractParse<T>): T {
  if (r.ok === false) {
    throw new Error(`expected ok parse, got issues: ${r.issues.join("; ")}`);
  }
  return r.value;
}

function expectIssues<T>(r: SkillContractParse<T>): string[] {
  if (r.ok === false) return r.issues;
  throw new Error("expected parse failure, but parse succeeded");
}

function makeEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    skillId: "nutrient-deficiency-triage",
    skillVersion: "1.0.0",
    runId: RUN_ID,
    requestedAt: T0,
    growId: GROW_ID,
    tentId: TENT_ID,
    plantId: PLANT_ID,
    requestedBy: { userId: USER_ID },
    contextVersion: "ctx-2026-07-30.1",
    sourceSummary: [
      { source: "live", count: 12 },
      { source: "manual", count: 3 },
    ],
    inputCompleteness: "partial",
    provenanceWarnings: ["Humidity sensor last validated 26h ago."],
    flags: { skillRuntimeV1: true },
    ...overrides,
  };
}

function makeEvidence(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: "ev-1",
    kind: "sensor_reading",
    observedAt: T0,
    source: "manual",
    summary: "Tent humidity logged at 71% during late flower.",
    metric: { name: "humidityPct", value: 71 },
    ...overrides,
  };
}

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: "prop-1",
    proposedAction: "Increase exhaust timer runtime by 15 minutes per hour tonight.",
    reason: "Humidity has stayed above the late-flower target band for 2 days.",
    riskLevel: "medium",
    supportingEvidenceIds: ["ev-1"],
    missingInformation: ["No dehumidifier runtime logs for this tent."],
    expectedResponse: "Humidity drops below 60% within 24 hours.",
    followUpIntervalHours: 24,
    cancellationConditions: ["Humidity falls below 50%."],
    approvalRequirement: "approval_required",
    executionCapability: "manual_only",
    ...overrides,
  };
}

function makeFollowUp(overrides: Record<string, unknown> = {}) {
  return {
    followUpId: "fu-1",
    runId: RUN_ID,
    proposalId: "prop-1",
    checkAfterHours: 24,
    question: "Did tent humidity drop below 60%?",
    expectedObservation: "Humidity readings at or below 60%.",
    ...overrides,
  };
}

function makeRunResult(overrides: Record<string, unknown> = {}) {
  return {
    runId: RUN_ID,
    skillId: "nutrient-deficiency-triage",
    skillVersion: "1.0.0",
    status: "ok",
    startedAt: T0,
    completedAt: T1,
    contextVersion: "ctx-2026-07-30.1",
    evidence: [makeEvidence(), makeEvidence({ evidenceId: "ev-2" })],
    hypotheses: [
      {
        hypothesisId: "hyp-1",
        statement: "Sustained high humidity is stressing late-flower colas.",
        rationale: "Two days of readings above the configured band.",
        rank: 1,
        supportingEvidenceIds: ["ev-1", "ev-2"],
      },
    ],
    confidence: buildSkillConfidenceResult(0.8, 0.5),
    proposals: [makeProposal()],
    followUps: [makeFollowUp()],
    ...overrides,
  };
}

describe("contract family pins", () => {
  it("locks the V1 vocabularies future components rely on", () => {
    expect(SKILL_CONTRACT_VERSION).toBe("1.0.0");
    expect([...SKILL_EXECUTION_CAPABILITIES]).toEqual(["none", "manual_only"]);
    expect(SKILL_APPROVAL_REQUIREMENT).toBe("approval_required");
    expect([...SKILL_RISK_LEVELS]).toEqual(["low", "medium", "high", "critical"]);
    expect([...SKILL_SENSOR_SOURCE_LABELS]).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
    ]);
  });
});

describe("VerdantSkillInputEnvelope", () => {
  it("parses a fully-populated envelope", () => {
    const v = expectOk(parseVerdantSkillInputEnvelope(makeEnvelope()));
    expect(v.contractVersion).toBe("1.0.0");
    expect(v.skillId).toBe("nutrient-deficiency-triage");
    expect(v.inputCompleteness).toBe("partial");
    expect(v.sourceSummary).toHaveLength(2);
  });

  it("rejects when required context is missing", () => {
    expectIssues(parseVerdantSkillInputEnvelope(makeEnvelope({ growId: undefined })));
    expectIssues(parseVerdantSkillInputEnvelope(makeEnvelope({ requestedAt: undefined })));
    expectIssues(parseVerdantSkillInputEnvelope(makeEnvelope({ inputCompleteness: undefined })));
    expectIssues(parseVerdantSkillInputEnvelope(makeEnvelope({ requestedBy: undefined })));
    expectIssues(parseVerdantSkillInputEnvelope(null));
    expectIssues(parseVerdantSkillInputEnvelope("not an object"));
  });

  it("rejects malformed timestamps", () => {
    for (const bad of [
      "not-a-date",
      "2026-07-30",
      "2026-07-30T12:00:00",
      "2026-02-30T10:00:00Z",
      "2026-13-01T10:00:00Z",
      1722340800000,
    ]) {
      expectIssues(parseVerdantSkillInputEnvelope(makeEnvelope({ requestedAt: bad })));
    }
  });

  it("rejects unknown or legacy source labels in the source summary", () => {
    for (const bad of ["vendor_xyz", "imported", "sim", "LIVE", ""]) {
      expectIssues(
        parseVerdantSkillInputEnvelope(
          makeEnvelope({ sourceSummary: [{ source: bad, count: 1 }] }),
        ),
      );
    }
  });

  it("normalizes absent optional fields safely (backward-compatible payloads)", () => {
    const minimal: Record<string, unknown> = makeEnvelope();
    delete minimal.tentId;
    delete minimal.plantId;
    delete minimal.sourceSummary;
    delete minimal.provenanceWarnings;
    delete minimal.flags;
    const v = expectOk(parseVerdantSkillInputEnvelope(minimal));
    expect(v.contractVersion).toBe(SKILL_CONTRACT_VERSION);
    expect(v.sourceSummary).toEqual([]);
    expect(v.provenanceWarnings).toEqual([]);
    expect(v.flags).toEqual({});
    expect("tentId" in v).toBe(false);
  });

  it("preserves explicit nulls instead of dropping them", () => {
    const v = expectOk(
      parseVerdantSkillInputEnvelope(
        makeEnvelope({
          tentId: null,
          plantId: null,
          requestedBy: { userId: USER_ID, accountRef: null },
        }),
      ),
    );
    expect(v.tentId).toBeNull();
    expect(v.plantId).toBeNull();
    expect(v.requestedBy.accountRef).toBeNull();
  });

  it("strips secret-shaped flag keys and unknown top-level keys", () => {
    const v = expectOk(
      parseVerdantSkillInputEnvelope(
        makeEnvelope({
          flags: {
            skillRuntimeV1: true,
            api_key: "sk-should-never-survive",
            paddle_token: "tok-should-never-survive",
            service_role: "should-never-survive",
          },
          raw_payload: { anything: "should-never-survive" },
        }),
      ),
    );
    expect(v.flags).toEqual({ skillRuntimeV1: true });
    expect("raw_payload" in v).toBe(false);
    expect(serializeSkillContract(v)).not.toContain("never-survive");
  });

  it("strips camelCase, hyphenated, and value-shaped secrets from flags", () => {
    const v = expectOk(
      parseVerdantSkillInputEnvelope(
        makeEnvelope({
          flags: {
            skillRuntimeV1: true,
            betaUi: "on",
            accessToken: "tok-should-never-survive",
            clientSecret: "should-never-survive",
            stripeSecretKey: "should-never-survive",
            supabaseServiceRoleKey: "should-never-survive",
            openaiApiKey: "should-never-survive",
            privateKeyPem: "should-never-survive",
            authorization: "should-never-survive",
            "x-api-key": "should-never-survive",
            launchWindow: "eyJzaG91bGQtbmV2ZXItc3Vydml2ZQ",
            modelNote: "sk-NEVERSURVIVE1234567890",
          },
        }),
      ),
    );
    expect(v.flags).toEqual({ skillRuntimeV1: true, betaUi: "on" });
    const serialized = serializeSkillContract(v);
    expect(serialized).not.toContain("never-survive");
    expect(serialized).not.toContain("eyJ");
    expect(serialized).not.toContain("NEVERSURVIVE");
  });

  it("rejects a wrong contract version instead of silently accepting it", () => {
    expectIssues(parseVerdantSkillInputEnvelope(makeEnvelope({ contractVersion: "2.0.0" })));
  });
});

describe("PlantContextBundle", () => {
  function makeBundle(overrides: Record<string, unknown> = {}) {
    return {
      contextVersion: "ctx-2026-07-30.1",
      growId: GROW_ID,
      tentId: TENT_ID,
      plantId: PLANT_ID,
      stage: "late_flower",
      strain: "Sour Ishizaka",
      isAutoflower: false,
      ageDays: 62,
      medium: "coco",
      potSize: "11L",
      latestSnapshot: {
        capturedAt: T0,
        source: "live",
        quality: "ok",
        temperatureC: 25.1,
        humidityPct: 71,
        vpdKpa: 1.02,
        co2Ppm: null,
        soilMoisturePct: null,
      },
      recentDiaryEntryCount: 4,
      notes: ["Watered yesterday evening."],
      targets: { humidityPct: { min: 45, max: 60 } },
      ...overrides,
    };
  }

  it("parses a full bundle and keeps explicit metric nulls", () => {
    const v = expectOk(parsePlantContextBundle(makeBundle()));
    expect(v.latestSnapshot?.co2Ppm).toBeNull();
    expect(v.isAutoflower).toBe(false);
  });

  it("keeps isAutoflower null (unknown) distinct from false", () => {
    const v = expectOk(parsePlantContextBundle(makeBundle({ isAutoflower: null })));
    expect(v.isAutoflower).toBeNull();
  });

  it("normalizes the legacy plant-stage alias cure → curing, nothing else", () => {
    const cured = expectOk(parsePlantContextBundle(makeBundle({ stage: "cure" })));
    expect(cured.stage).toBe("curing");
    expectIssues(parsePlantContextBundle(makeBundle({ stage: "vegging" })));
    expectIssues(parsePlantContextBundle(makeBundle({ stage: "dry" })));
  });

  it("rejects ok quality on snapshots whose source already denies trust", () => {
    for (const source of ["stale", "invalid"]) {
      expectIssues(
        parsePlantContextBundle(
          makeBundle({
            latestSnapshot: { capturedAt: T0, source, quality: "ok" },
          }),
        ),
      );
    }
    const coherent = expectOk(
      parsePlantContextBundle(
        makeBundle({
          latestSnapshot: { capturedAt: T0, source: "invalid", quality: "invalid" },
        }),
      ),
    );
    expect(coherent.latestSnapshot?.quality).toBe("invalid");
  });

  it("carries optional per-reading confidence, bounded to [0, 1]", () => {
    const withConfidence = expectOk(
      parsePlantContextBundle(
        makeBundle({
          latestSnapshot: { capturedAt: T0, source: "live", quality: "ok", confidence: 0.35 },
        }),
      ),
    );
    expect(withConfidence.latestSnapshot?.confidence).toBe(0.35);
    const nullConfidence = expectOk(
      parsePlantContextBundle(
        makeBundle({
          latestSnapshot: { capturedAt: T0, source: "live", quality: "ok", confidence: null },
        }),
      ),
    );
    expect(nullConfidence.latestSnapshot?.confidence).toBeNull();
    expectIssues(
      parsePlantContextBundle(
        makeBundle({
          latestSnapshot: { capturedAt: T0, source: "live", quality: "ok", confidence: 1.5 },
        }),
      ),
    );
  });

  it("rejects unknown snapshot source labels (deny-by-default trust)", () => {
    for (const bad of ["vendor_xyz", "imported", "sim"]) {
      expectIssues(
        parsePlantContextBundle(
          makeBundle({
            latestSnapshot: {
              capturedAt: T0,
              source: bad,
              quality: "ok",
            },
          }),
        ),
      );
    }
  });

  it("rejects missing plant identity and inverted target ranges", () => {
    expectIssues(parsePlantContextBundle(makeBundle({ plantId: undefined })));
    expectIssues(
      parsePlantContextBundle(makeBundle({ targets: { humidityPct: { min: 70, max: 40 } } })),
    );
  });
});

describe("EvidenceRecord", () => {
  it("parses valid evidence", () => {
    const v = expectOk(parseEvidenceRecord(makeEvidence()));
    expect(v.kind).toBe("sensor_reading");
    expect(v.metric?.value).toBe(71);
  });

  it("rejects unknown source labels and kinds", () => {
    expectIssues(parseEvidenceRecord(makeEvidence({ source: "vendor_xyz" })));
    expectIssues(parseEvidenceRecord(makeEvidence({ kind: "rumor" })));
  });

  it("rejects malformed observation timestamps", () => {
    expectIssues(parseEvidenceRecord(makeEvidence({ observedAt: "yesterday" })));
  });
});

describe("SkillHypothesis", () => {
  it("parses and defaults evidence id lists", () => {
    const v = expectOk(
      parseSkillHypothesis({
        hypothesisId: "hyp-1",
        statement: "High humidity is the primary stressor.",
        rationale: "Sustained readings above target.",
        rank: 1,
      }),
    );
    expect(v.supportingEvidenceIds).toEqual([]);
    expect(v.conflictingEvidenceIds).toEqual([]);
  });

  it("rejects a non-positive rank", () => {
    expectIssues(
      parseSkillHypothesis({
        hypothesisId: "hyp-1",
        statement: "s",
        rationale: "r",
        rank: 0,
      }),
    );
  });
});

describe("SkillConfidenceResult", () => {
  it("derives system confidence as min(model, evidence), clamped", () => {
    expect(deriveSystemConfidence(0.8, 0.5)).toBe(0.5);
    expect(deriveSystemConfidence(0.2, 0.9)).toBe(0.2);
    expect(deriveSystemConfidence(7, 0.9)).toBe(0.9);
    expect(deriveSystemConfidence(-1, 0.9)).toBe(0);
    expect(deriveSystemConfidence(Number.NaN, 0.9)).toBe(0);
  });

  it("accepts only a correctly derived system confidence", () => {
    const built = buildSkillConfidenceResult(0.8, 0.5);
    const v = expectOk(parseSkillConfidenceResult(built));
    expect(v.systemConfidence).toBe(0.5);
    expect(v.derivation).toBe(SKILL_CONFIDENCE_DERIVATION);
  });

  it("rejects a model-supplied final confidence that ignores evidence", () => {
    const issues = expectIssues(
      parseSkillConfidenceResult({
        modelConfidence: 0.4,
        evidenceConfidence: 0.9,
        systemConfidence: 0.9,
        derivation: SKILL_CONFIDENCE_DERIVATION,
      }),
    );
    expect(issues.join(" ")).toContain("system_confidence_not_derived");
  });

  it("rejects invalid confidence values", () => {
    for (const bad of [1.2, -0.1, Number.NaN, "0.5", null, undefined]) {
      expectIssues(
        parseSkillConfidenceResult({
          modelConfidence: bad,
          evidenceConfidence: 0.5,
          systemConfidence: 0.5,
          derivation: SKILL_CONFIDENCE_DERIVATION,
        }),
      );
    }
    expectIssues(
      parseSkillConfidenceResult({
        modelConfidence: 0.5,
        evidenceConfidence: 0.5,
        systemConfidence: 0.5,
        derivation: "model_says_so",
      }),
    );
  });
});

describe("SkillActionProposal", () => {
  it("parses a valid manual-only, approval-required proposal", () => {
    const v = expectOk(parseSkillActionProposal(makeProposal()));
    expect(v.approvalRequirement).toBe("approval_required");
    expect(v.executionCapability).toBe("manual_only");
  });

  it("cannot represent hardware execution", () => {
    for (const bad of ["device", "hardware", "automated", "remote", ""]) {
      expectIssues(parseSkillActionProposal(makeProposal({ executionCapability: bad })));
    }
    expectIssues(parseSkillActionProposal(makeProposal({ approvalRequirement: "none" })));
    expectIssues(parseSkillActionProposal(makeProposal({ approvalRequirement: "auto" })));
  });

  it("rejects invalid risk levels, including the review-contract vocabulary", () => {
    for (const bad of ["watch", "elevated", "extreme", "", 3]) {
      expectIssues(parseSkillActionProposal(makeProposal({ riskLevel: bad })));
    }
    for (const good of SKILL_RISK_LEVELS) {
      expectOk(parseSkillActionProposal(makeProposal({ riskLevel: good })));
    }
  });

  it("requires supporting evidence and cancellation conditions", () => {
    expectIssues(parseSkillActionProposal(makeProposal({ supportingEvidenceIds: [] })));
    expectIssues(parseSkillActionProposal(makeProposal({ cancellationConditions: [] })));
  });

  it("rejects out-of-band follow-up intervals", () => {
    for (const bad of [0, -4, 721, Number.POSITIVE_INFINITY]) {
      expectIssues(parseSkillActionProposal(makeProposal({ followUpIntervalHours: bad })));
    }
  });
});

describe("SkillOutcomeFollowUp", () => {
  it("parses and defaults status to pending", () => {
    const v = expectOk(parseSkillOutcomeFollowUp(makeFollowUp()));
    expect(v.status).toBe("pending");
  });

  it("couples recorded status with a recorded outcome", () => {
    expectIssues(parseSkillOutcomeFollowUp(makeFollowUp({ status: "recorded" })));
    expectIssues(
      parseSkillOutcomeFollowUp(
        makeFollowUp({
          status: "pending",
          recordedOutcome: { observedAt: T1, outcome: "improved" },
        }),
      ),
    );
    const v = expectOk(
      parseSkillOutcomeFollowUp(
        makeFollowUp({
          status: "recorded",
          recordedOutcome: { observedAt: T1, outcome: "improved", note: null },
        }),
      ),
    );
    expect(v.recordedOutcome?.outcome).toBe("improved");
    expect(v.recordedOutcome?.note).toBeNull();
  });
});

describe("SkillError", () => {
  it("parses a valid error and strips secret-shaped detail keys", () => {
    const v = expectOk(
      parseSkillError({
        code: "upstream_unavailable",
        message: "Context compiler timed out.",
        retryable: true,
        occurredAt: T0,
        details: {
          attempt: 2,
          api_key: "sk-should-never-survive",
          bearer: "should-never-survive",
          serviceRoleKey: "should-never-survive",
          apiToken: "should-never-survive",
          upstreamAuth: "Bearer eyJzaG91bGQtbmV2ZXItc3Vydml2ZQ",
        },
      }),
    );
    expect(v.details).toEqual({ attempt: 2 });
    expect(serializeSkillContract(v)).not.toContain("never-survive");
  });

  it("rejects unknown error codes and malformed timestamps", () => {
    expectIssues(
      parseSkillError({
        code: "kaboom",
        message: "m",
        retryable: false,
        occurredAt: T0,
      }),
    );
    expectIssues(
      parseSkillError({
        code: "internal",
        message: "m",
        retryable: false,
        occurredAt: "soon",
      }),
    );
  });
});

describe("SkillVersion", () => {
  it("accepts semver core and rejects everything else", () => {
    expectOk(parseSkillVersion("1.0.0"));
    expectOk(parseSkillVersion("0.12.3"));
    for (const bad of ["1.2", "01.2.3", "1.2.3-beta", "v1.2.3", "", 1]) {
      expectIssues(parseSkillVersion(bad));
    }
  });
});

describe("SkillRunResult", () => {
  it("parses a complete ok result", () => {
    const v = expectOk(parseSkillRunResult(makeRunResult()));
    expect(v.status).toBe("ok");
    expect(v.proposals).toHaveLength(1);
    expect(v.confidence?.systemConfidence).toBe(0.5);
  });

  it("enforces evidence-id referential integrity", () => {
    const issues = expectIssues(
      parseSkillRunResult(
        makeRunResult({
          proposals: [makeProposal({ supportingEvidenceIds: ["ev-ghost"] })],
        }),
      ),
    );
    expect(issues.join(" ")).toContain("unknown_evidence_id");
  });

  it("enforces follow-up linkage to this run and its proposals", () => {
    expectIssues(
      parseSkillRunResult(
        makeRunResult({
          followUps: [makeFollowUp({ runId: "99999999-9999-4999-8999-999999999999" })],
        }),
      ),
    );
    expectIssues(
      parseSkillRunResult(makeRunResult({ followUps: [makeFollowUp({ proposalId: "ghost" })] })),
    );
  });

  it("couples status with error and confidence presence", () => {
    expectIssues(parseSkillRunResult(makeRunResult({ status: "error" })));
    expectIssues(parseSkillRunResult(makeRunResult({ confidence: undefined })));
    expectIssues(
      parseSkillRunResult(
        makeRunResult({
          status: "insufficient_context",
          confidence: null,
        }),
      ),
    );
    const v = expectOk(
      parseSkillRunResult(
        makeRunResult({
          status: "insufficient_context",
          confidence: null,
          proposals: [],
          followUps: [],
          hypotheses: [],
        }),
      ),
    );
    expect(v.confidence).toBeNull();
  });

  it("rejects a completion timestamp earlier than the start", () => {
    expectIssues(parseSkillRunResult(makeRunResult({ startedAt: T1, completedAt: T0 })));
  });
});

describe("deterministic serialization", () => {
  it("serializes the same envelope identically regardless of key order", () => {
    const shuffled = JSON.parse(
      JSON.stringify({
        flags: { skillRuntimeV1: true },
        provenanceWarnings: ["Humidity sensor last validated 26h ago."],
        inputCompleteness: "partial",
        sourceSummary: [
          { count: 12, source: "live" },
          { count: 3, source: "manual" },
        ],
        contextVersion: "ctx-2026-07-30.1",
        requestedBy: { userId: USER_ID },
        plantId: PLANT_ID,
        tentId: TENT_ID,
        growId: GROW_ID,
        requestedAt: T0,
        runId: RUN_ID,
        skillVersion: "1.0.0",
        skillId: "nutrient-deficiency-triage",
      }),
    );
    const a = serializeSkillContract(expectOk(parseVerdantSkillInputEnvelope(makeEnvelope())));
    const b = serializeSkillContract(expectOk(parseVerdantSkillInputEnvelope(shuffled)));
    expect(a).toBe(b);
  });

  it("round-trips: serialize → JSON.parse → parse → serialize is a fixpoint", () => {
    const first = serializeSkillContract(expectOk(parseSkillRunResult(makeRunResult())));
    const reparsed = expectOk(parseSkillRunResult(JSON.parse(first)));
    expect(serializeSkillContract(reparsed)).toBe(first);
  });

  it("sorts nested object keys recursively and keeps array order", () => {
    expect(serializeSkillContract({ b: 1, a: { d: [2, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,1]},"b":1}',
    );
  });
});
