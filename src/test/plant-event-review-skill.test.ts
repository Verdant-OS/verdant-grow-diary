import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLANT_EVENT_REVIEW_FIXTURE_SET,
  PLANT_EVENT_REVIEW_SKILL_DEFINITION,
  PLANT_EVENT_REVIEW_SKILL_ID,
  PLANT_EVENT_REVIEW_SKILL_MANIFEST,
  PLANT_EVENT_REVIEW_SKILL_VERSION,
  validatePlantEventReviewOutcome,
  type PlantEventReviewInput,
  type PlantEventReviewOutcome,
  type PlantEventReviewSensorMetricKey,
  type PlantEventReviewSensorMetricKind,
} from "@/lib/plantEventReviewSkill";
import { runVerdantSkill } from "@/lib/verdantSkillRuntime";

interface ExpectedGoldenOutcome {
  readonly status: PlantEventReviewOutcome["status"];
  readonly category: PlantEventReviewOutcome["category"];
  readonly confidence: PlantEventReviewOutcome["confidence"];
  readonly findingCodes: readonly string[];
  readonly evidenceRefs: PlantEventReviewOutcome["evidenceRefs"];
  readonly missingInformation: readonly string[];
  readonly nextDataToLog: readonly string[];
}

interface GoldenCase {
  readonly id: string;
  readonly description: string;
  readonly input: unknown;
  readonly expected: {
    readonly applicabilityStatus: "applicable" | "not_applicable" | "invalid";
    readonly handlerStatus?: "completed" | "insufficient_evidence";
    readonly reasonCodes?: readonly string[];
    readonly issues?: readonly string[];
    readonly outcome?: ExpectedGoldenOutcome;
  };
}

interface GoldenFixture {
  readonly schemaVersion: "verdant-skill-golden-fixture.v1";
  readonly skillId: string;
  readonly skillVersion: string;
  readonly fixtureSet: string;
  readonly executionAt: string;
  readonly cases: readonly GoldenCase[];
}

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/skills/plant-event-review-golden-cases.json"),
    "utf8",
  ),
) as GoldenFixture;

const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

function goldenCase(id: string): GoldenCase {
  const result = fixture.cases.find((item) => item.id === id);
  if (!result) throw new Error(`Missing golden case: ${id}`);
  return result;
}

function runApplicableCase(
  item: GoldenCase,
  executionAt = fixture.executionAt,
): PlantEventReviewOutcome {
  const assessment = PLANT_EVENT_REVIEW_SKILL_DEFINITION.assess(item.input, executionAt);
  if (assessment.status !== "applicable") {
    throw new Error(`${item.id} unexpectedly assessed as ${assessment.status}`);
  }
  const result = PLANT_EVENT_REVIEW_SKILL_DEFINITION.run({
    input: assessment.normalizedInput,
    executionAt,
  });
  const validation = validatePlantEventReviewOutcome(result.outcome);
  if (validation.ok === false) {
    throw new Error(`${item.id} produced invalid output: ${validation.reasonCodes.join(", ")}`);
  }
  return validation.outcome;
}

describe("Plant Event Review skill contract", () => {
  it("declares one explicit, effect-free, first-party version and fixture set", () => {
    expect(PLANT_EVENT_REVIEW_SKILL_MANIFEST).toMatchObject({
      schemaVersion: "verdant-skill-manifest.v1",
      id: PLANT_EVENT_REVIEW_SKILL_ID,
      version: PLANT_EVENT_REVIEW_SKILL_VERSION,
      activation: "explicit",
      sideEffects: "none",
      capabilities: ["read_supplied_context"],
      fixtureSet: PLANT_EVENT_REVIEW_FIXTURE_SET,
    });
    expect(fixture).toMatchObject({
      schemaVersion: "verdant-skill-golden-fixture.v1",
      skillId: PLANT_EVENT_REVIEW_SKILL_ID,
      skillVersion: PLANT_EVENT_REVIEW_SKILL_VERSION,
      fixtureSet: PLANT_EVENT_REVIEW_FIXTURE_SET,
    });
    expect(new Set(fixture.cases.map((item) => item.id)).size).toBe(fixture.cases.length);
  });

  it.each(fixture.cases)("matches golden case $id", (item: GoldenCase) => {
    const untouched = clone(item.input);
    const assessment = PLANT_EVENT_REVIEW_SKILL_DEFINITION.assess(item.input, fixture.executionAt);
    const receipt = runVerdantSkill({
      runId: `golden-${item.id}`,
      executionAt: fixture.executionAt,
      skillId: fixture.skillId,
      version: fixture.skillVersion,
      input: item.input,
    });

    expect(assessment.status).toBe(item.expected.applicabilityStatus);
    expect(item.input).toEqual(untouched);
    expect(receipt.skill).toEqual({
      id: fixture.skillId,
      version: fixture.skillVersion,
    });
    expect(receipt.applicability?.status).toBe(item.expected.applicabilityStatus);

    if (assessment.status === "invalid") {
      expect(assessment.issues).toEqual(item.expected.issues);
      expect(receipt).toMatchObject({
        status: "not_applicable",
        outcome: null,
        applicability: {
          status: "invalid",
          reasonCodes: item.expected.issues,
        },
      });
      expect(receipt.reasonCodes).toEqual(
        [...(item.expected.issues ?? []), "input_invalid"].sort(),
      );
      return;
    }
    if (assessment.status === "not_applicable") {
      expect(assessment.reasonCodes).toEqual(item.expected.reasonCodes);
      expect(receipt).toMatchObject({
        status: "not_applicable",
        reasonCodes: item.expected.reasonCodes,
        outcome: null,
        applicability: {
          status: "not_applicable",
          reasonCodes: item.expected.reasonCodes,
        },
      });
      return;
    }

    const result = PLANT_EVENT_REVIEW_SKILL_DEFINITION.run({
      input: assessment.normalizedInput,
      executionAt: fixture.executionAt,
    });
    expect(result.status).toBe(item.expected.handlerStatus);

    const validation = validatePlantEventReviewOutcome(result.outcome);
    expect(validation.ok).toBe(true);
    if (validation.ok === false || !item.expected.outcome) return;

    const outcome = validation.outcome;
    expect(receipt.status).toBe(item.expected.handlerStatus);
    expect(receipt.outcome).toEqual(outcome);
    expect(receipt.policy).toEqual({
      preExecution: [],
      postExecution: [],
    });
    expect(outcome).toMatchObject({
      status: item.expected.outcome.status,
      category: item.expected.outcome.category,
      confidence: item.expected.outcome.confidence,
      evidenceRefs: item.expected.outcome.evidenceRefs,
      missingInformation: item.expected.outcome.missingInformation,
      nextDataToLog: item.expected.outcome.nextDataToLog,
      actionQueueSuggestion: null,
    });
    expect(outcome.findings.map((finding) => finding.findingId)).toEqual(
      item.expected.outcome.findingCodes,
    );
    expect(Object.keys(outcome).sort()).toEqual(
      [
        "actionQueueSuggestion",
        "category",
        "confidence",
        "evidenceRefs",
        "findings",
        "missingInformation",
        "nextDataToLog",
        "status",
        "summary",
      ].sort(),
    );
    expect(outcome.confidence).not.toBe("high");
  });

  it("normalizes evidence order deterministically", () => {
    const item = goldenCase("reordered-evidence-is-deterministic");
    const input = clone(item.input) as PlantEventReviewInput;
    const reversed: GoldenCase = {
      ...item,
      input: {
        ...input,
        sensorEvidence: [...input.sensorEvidence].reverse(),
      },
    };

    expect(runApplicableCase(item)).toEqual(runApplicableCase(reversed));
  });

  it("rejects duplicate explicit references independently of input order", () => {
    const item = goldenCase("duplicate-explicit-reference-ids");
    const input = clone(item.input) as PlantEventReviewInput;
    const reversedInput: PlantEventReviewInput = {
      ...input,
      sensorEvidence: [...input.sensorEvidence].reverse(),
    };

    const forward = PLANT_EVENT_REVIEW_SKILL_DEFINITION.assess(input, fixture.executionAt);
    const reversed = PLANT_EVENT_REVIEW_SKILL_DEFINITION.assess(reversedInput, fixture.executionAt);

    expect(forward).toEqual({
      status: "invalid",
      issues: ["sensor_ref_id_duplicate"],
    });
    expect(reversed).toEqual(forward);

    const run = (candidate: PlantEventReviewInput) =>
      runVerdantSkill({
        runId: "duplicate-reference-order-test",
        executionAt: fixture.executionAt,
        skillId: fixture.skillId,
        version: fixture.skillVersion,
        input: candidate,
      });
    expect(run(reversedInput)).toEqual(run(input));
  });

  it("uses only the caller-injected execution time for freshness", () => {
    const item = goldenCase("stale-sensor-context");
    const atFixtureTime = runApplicableCase(item);
    const tenMinutesAfterEvidence = runApplicableCase(item, "2026-07-30T10:10:00.000Z");

    expect(atFixtureTime.status).toBe("needs_context");
    expect(tenMinutesAfterEvidence).toMatchObject({
      status: "reviewed",
      confidence: "medium",
      evidenceRefs: [
        {
          id: "sensor-reading-008",
          source: "live",
        },
      ],
      actionQueueSuggestion: null,
    });
  });

  it("does not request an observation note when a photo event already has one", () => {
    const item = goldenCase("valid-observation-fresh-manual");
    const input = clone(item.input) as PlantEventReviewInput;
    const withPhoto: GoldenCase = {
      ...item,
      input: {
        ...input,
        event: {
          ...input.event,
          photoPresent: true,
        },
      },
    };

    expect(runApplicableCase(withPhoto)).toMatchObject({
      status: "reviewed",
      category: "photos",
    });
    expect(runApplicableCase(withPhoto).nextDataToLog).not.toContain("add_observation_note");
  });

  it("enforces the exact unit and bounded range for every canonical metric", () => {
    const contracts: readonly {
      key: PlantEventReviewSensorMetricKey;
      kind: PlantEventReviewSensorMetricKind;
      unit: string;
      validValue: number;
      invalidValue: number;
    }[] = [
      {
        key: "temp",
        kind: "environment",
        unit: "°C",
        validValue: 24,
        invalidValue: 61,
      },
      {
        key: "rh",
        kind: "environment",
        unit: "%",
        validValue: 58,
        invalidValue: 100,
      },
      {
        key: "vpd",
        kind: "environment",
        unit: "kPa",
        validValue: 1.2,
        invalidValue: 11,
      },
      {
        key: "soil",
        kind: "soil",
        unit: "%",
        validValue: 55,
        invalidValue: 0,
      },
      {
        key: "ec",
        kind: "other",
        unit: "mS/cm",
        validValue: 2,
        invalidValue: 51,
      },
      {
        key: "ph",
        kind: "other",
        unit: "pH",
        validValue: 6.2,
        invalidValue: 10,
      },
    ];

    const baseCase = goldenCase("valid-observation-fresh-manual");
    for (const contract of contracts) {
      const base = clone(baseCase.input) as PlantEventReviewInput;
      const evidence = base.sensorEvidence[0];
      const withMetric = (value: number, unit: string): GoldenCase => ({
        ...baseCase,
        id: `${baseCase.id}-${contract.key}-${value}-${unit}`,
        input: {
          ...base,
          sensorEvidence: [
            {
              ...evidence,
              snapshot: {
                ...evidence.snapshot,
                metrics: [
                  {
                    key: contract.key,
                    value,
                    unit,
                    kind: contract.kind,
                  },
                ],
              },
              explicitRef: {
                ...evidence.explicitRef!,
                metric: contract.key,
              },
            },
          ],
        },
      });

      expect(runApplicableCase(withMetric(contract.validValue, contract.unit)).status).toBe(
        "reviewed",
      );
      for (const invalid of [
        withMetric(contract.validValue, "wrong"),
        withMetric(contract.invalidValue, contract.unit),
      ]) {
        expect(runApplicableCase(invalid)).toMatchObject({
          status: "needs_context",
          confidence: "low",
          findings: [
            {
              findingId: "sensor_evidence_metrics_unusable",
              severity: "warning",
            },
          ],
          evidenceRefs: [],
        });
      }
    }
  });

  it("does not promote a snapshot that mixes usable and unusable metrics", () => {
    const baseCase = goldenCase("valid-observation-fresh-manual");
    const input = clone(baseCase.input) as PlantEventReviewInput;
    const evidence = input.sensorEvidence[0];
    const mixed: GoldenCase = {
      ...baseCase,
      input: {
        ...input,
        sensorEvidence: [
          {
            ...evidence,
            snapshot: {
              ...evidence.snapshot,
              metrics: [
                {
                  key: "temp",
                  value: 24,
                  unit: "°C",
                  kind: "environment",
                },
                {
                  key: "rh",
                  value: 100,
                  unit: "%",
                  kind: "environment",
                },
              ],
            },
          },
        ],
      },
    };

    expect(runApplicableCase(mixed)).toMatchObject({
      status: "needs_context",
      confidence: "low",
      findings: [
        {
          findingId: "sensor_evidence_metrics_unusable",
          severity: "warning",
        },
      ],
      evidenceRefs: [],
      missingInformation: ["fresh_sensor_context", "sensor_metrics"],
    });
  });

  it("rejects unsafe, expanded, and overconfident outcomes", () => {
    const valid = runApplicableCase(goldenCase("valid-observation-fresh-manual"));

    expect(validatePlantEventReviewOutcome({ ...valid, confidence: "high" })).toMatchObject({
      ok: false,
      reasonCodes: expect.arrayContaining(["outcome_confidence_invalid"]),
    });
    expect(
      validatePlantEventReviewOutcome({
        ...valid,
        actionQueueSuggestion: { title: "Write this" },
      }),
    ).toMatchObject({
      ok: false,
      reasonCodes: ["outcome_action_queue_suggestion_invalid"],
    });
    expect(validatePlantEventReviewOutcome({ ...valid, diagnosis: "certain" })).toEqual({
      ok: false,
      reasonCodes: ["outcome_shape_invalid"],
    });
  });

  it("rejects forged success without current evidence and source findings", () => {
    const valid = runApplicableCase(goldenCase("valid-observation-fresh-manual"));

    expect(
      validatePlantEventReviewOutcome({
        ...valid,
        evidenceRefs: [],
      }),
    ).toEqual({
      ok: false,
      reasonCodes: ["outcome_reviewed_evidence_missing"],
    });
    expect(
      validatePlantEventReviewOutcome({
        ...valid,
        findings: [],
      }),
    ).toEqual({
      ok: false,
      reasonCodes: ["outcome_reviewed_source_finding_missing"],
    });
    expect(
      validatePlantEventReviewOutcome({
        ...valid,
        missingInformation: ["fresh_sensor_context"],
      }),
    ).toEqual({
      ok: false,
      reasonCodes: ["outcome_reviewed_missing_information_conflict"],
    });
  });

  it("rejects a needs-context outcome with no limitation signal", () => {
    const needsContext = runApplicableCase(goldenCase("watering-without-sensor-context"));

    expect(
      validatePlantEventReviewOutcome({
        ...needsContext,
        findings: [],
        missingInformation: [],
        nextDataToLog: [],
      }),
    ).toEqual({
      ok: false,
      reasonCodes: ["outcome_needs_context_signal_missing"],
    });
  });

  it("runs through the registry and policy boundary without writes", () => {
    const item = goldenCase("valid-observation-fresh-manual");
    const receipt = runVerdantSkill({
      runId: "plant-event-review-golden-001",
      executionAt: fixture.executionAt,
      skillId: PLANT_EVENT_REVIEW_SKILL_ID,
      version: PLANT_EVENT_REVIEW_SKILL_VERSION,
      input: item.input,
    });

    expect(receipt).toMatchObject({
      status: "completed",
      reasonCodes: ["skill_completed"],
      applicability: {
        status: "applicable",
        reasonCodes: ["plant_event_context_supplied"],
      },
      policy: {
        preExecution: [],
        postExecution: [],
      },
      outcome: {
        status: "reviewed",
        confidence: "medium",
        actionQueueSuggestion: null,
      },
    });
  });

  it("keeps the implementation inside the v1 engine-only dependency fence", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/plantEventReviewSkill.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

    expect(imports.sort()).toEqual(
      ["@/lib/verdantSkillApplicabilityRules", "@/lib/verdantSkillManifest"].sort(),
    );
    expect(source).not.toMatch(/Date\.now|fetch\s*\(|supabase|raw_payload|photoUrl|localeCompare/);
  });
});
