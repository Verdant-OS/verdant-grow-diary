import { afterEach, describe, expect, it, vi } from "vitest";
import { applicableVerdantSkill } from "@/lib/verdantSkillApplicabilityRules";
import {
  createVerdantSkillManifest,
  VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
  VERDANT_SKILL_V1_CAPABILITIES,
  VERDANT_SKILL_V1_POLICY_TAGS,
  type VerdantSkillDefinition,
} from "@/lib/verdantSkillManifest";
import {
  createVerdantSkillRunReceipt,
  serializeVerdantSkillRunReceipt,
  type CreateVerdantSkillRunReceiptInput,
  type VerdantSkillRunReceipt,
} from "@/lib/verdantSkillOutcomeRules";

const EXECUTION_AT = "2026-07-30T18:00:00.000Z";

function request(input: unknown = { eventId: "event-1" }) {
  return {
    runId: "skill-run-001",
    executionAt: EXECUTION_AT,
    skillId: "runtime-test",
    version: "1.0.0",
    input,
  };
}

function testDefinition(
  overrides: Partial<VerdantSkillDefinition<{ eventId: string }, { summary: string }>> = {},
): VerdantSkillDefinition<{ eventId: string }, { summary: string }> {
  return {
    manifest: createVerdantSkillManifest({
      schemaVersion: VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
      id: "runtime-test",
      version: "1.0.0",
      title: "Runtime test",
      description: "Pure deterministic runtime fixture.",
      inputKind: "runtime-test-input.v1",
      outputKind: "runtime-test-output.v1",
      activation: "explicit",
      sideEffects: "none",
      capabilities: VERDANT_SKILL_V1_CAPABILITIES,
      policyTags: VERDANT_SKILL_V1_POLICY_TAGS,
      fixtureSet: "runtime-test-golden-cases.v1",
    }),
    assess: (input) => {
      if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        Object.keys(input).length !== 1 ||
        typeof (input as { eventId?: unknown }).eventId !== "string"
      ) {
        return {
          status: "invalid",
          issues: ["event_id_invalid"],
        };
      }
      return applicableVerdantSkill({
        eventId: (input as { eventId: string }).eventId,
      });
    },
    run: ({ input }) => ({
      status: "completed",
      outcome: { summary: `Reviewed ${input.eventId}.` },
    }),
    validateOutcome: (outcome) => {
      if (
        typeof outcome !== "object" ||
        outcome === null ||
        Array.isArray(outcome) ||
        Object.keys(outcome).length !== 1 ||
        typeof (outcome as { summary?: unknown }).summary !== "string"
      ) {
        return { ok: false, reasonCodes: ["outcome_shape_invalid"] };
      }
      return {
        ok: true,
        outcome: { summary: (outcome as { summary: string }).summary },
      };
    },
    ...overrides,
  };
}

async function loadRuntimeWithDefinition(
  definition: VerdantSkillDefinition<unknown, unknown> | null,
) {
  vi.resetModules();
  vi.doUnmock("@/lib/verdantSkillPolicyRules");
  vi.doMock("@/lib/verdantSkillRegistry", () => ({
    resolveVerdantSkillDefinition: () => definition,
  }));
  return import("@/lib/verdantSkillRuntime");
}

afterEach(() => {
  vi.doUnmock("@/lib/verdantSkillRegistry");
  vi.doUnmock("@/lib/verdantSkillPolicyRules");
  vi.resetModules();
});

function directReceiptInput(
  overrides: Partial<CreateVerdantSkillRunReceiptInput> = {},
): CreateVerdantSkillRunReceiptInput {
  return {
    runId: "direct-run-001",
    executionAt: EXECUTION_AT,
    skillId: "runtime-test",
    skillVersion: "1.0.0",
    status: "completed",
    reasonCodes: ["skill_completed"],
    outcome: {
      summary: "Safe result.",
      evidence: ["event-1"],
    },
    ...overrides,
  };
}

function expectInvalidDirectReceipt(receipt: VerdantSkillRunReceipt): void {
  expect(receipt).toMatchObject({
    runId: null,
    executionAt: null,
    skill: { id: null, version: null },
    status: "skill_error",
    reasonCodes: ["receipt_input_invalid"],
    outcome: null,
  });
}

describe("Verdant Skill Runtime receipt boundary", () => {
  it("builds and serializes a deeply frozen valid direct receipt deterministically", () => {
    const first = createVerdantSkillRunReceipt(directReceiptInput());
    const second = createVerdantSkillRunReceipt(directReceiptInput());

    expect(first).toMatchObject({
      status: "completed",
      reasonCodes: ["skill_completed"],
      outcome: {
        summary: "Safe result.",
        evidence: ["event-1"],
      },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.reasonCodes)).toBe(true);
    expect(Object.isFrozen(first.outcome)).toBe(true);
    expect(
      Object.isFrozen((first.outcome as { readonly evidence: readonly string[] }).evidence),
    ).toBe(true);
    expect(serializeVerdantSkillRunReceipt(first)).toBe(serializeVerdantSkillRunReceipt(second));
  });

  it.each([false, 0, ""])(
    "rejects a falsy non-null policy decision instead of treating %j as absent",
    (prePolicy) => {
      expectInvalidDirectReceipt(
        createVerdantSkillRunReceipt(
          directReceiptInput({
            prePolicy: prePolicy as never,
          }),
        ),
      );
    },
  );

  it("rejects hostile array prototypes and accessors without invoking them", () => {
    let methodCalls = 0;
    const prototypeReasonCodes = ["skill_completed"];
    Object.setPrototypeOf(prototypeReasonCodes, {
      filter: () => {
        methodCalls += 1;
        return ["forged_reason"];
      },
    });
    expectInvalidDirectReceipt(
      createVerdantSkillRunReceipt(
        directReceiptInput({
          reasonCodes: prototypeReasonCodes,
        }),
      ),
    );

    let reasonGetterReads = 0;
    const accessorReasonCodes = ["skill_completed"];
    Object.defineProperty(accessorReasonCodes, "0", {
      enumerable: true,
      configurable: true,
      get: () => {
        reasonGetterReads += 1;
        return "forged_reason";
      },
    });
    expectInvalidDirectReceipt(
      createVerdantSkillRunReceipt(
        directReceiptInput({
          reasonCodes: accessorReasonCodes,
        }),
      ),
    );

    const prototypeEvidence = ["event-1"];
    Object.setPrototypeOf(prototypeEvidence, {
      map: () => {
        methodCalls += 1;
        return ["forged evidence"];
      },
    });
    expectInvalidDirectReceipt(
      createVerdantSkillRunReceipt(
        directReceiptInput({
          outcome: {
            summary: "Safe result.",
            evidence: prototypeEvidence,
          },
        }),
      ),
    );

    let outcomeGetterReads = 0;
    const accessorOutcome: Record<string, unknown> = {};
    Object.defineProperty(accessorOutcome, "summary", {
      enumerable: true,
      get: () => {
        outcomeGetterReads += 1;
        return "Forged result.";
      },
    });
    expectInvalidDirectReceipt(
      createVerdantSkillRunReceipt(directReceiptInput({ outcome: accessorOutcome })),
    );

    let inputGetterReads = 0;
    const accessorInput = directReceiptInput() as unknown as Record<string, unknown>;
    Object.defineProperty(accessorInput, "outcome", {
      enumerable: true,
      get: () => {
        inputGetterReads += 1;
        return { summary: "Forged result." };
      },
    });
    expectInvalidDirectReceipt(
      createVerdantSkillRunReceipt(accessorInput as unknown as CreateVerdantSkillRunReceiptInput),
    );

    expect(methodCalls).toBe(0);
    expect(reasonGetterReads).toBe(0);
    expect(outcomeGetterReads).toBe(0);
    expect(inputGetterReads).toBe(0);
  });

  it("contains throwing receipt-builder proxy traps behind the safe fallback", () => {
    const trappedInput = new Proxy(directReceiptInput(), {
      ownKeys: () => {
        throw new Error("must not escape");
      },
    });

    expectInvalidDirectReceipt(createVerdantSkillRunReceipt(trappedInput));
  });

  it("serializes forged or trapped receipt objects as the fixed safe fallback", () => {
    let propertyReads = 0;
    const forgedReceipt = new Proxy({} as VerdantSkillRunReceipt, {
      get: () => {
        propertyReads += 1;
        throw new Error("must not be read");
      },
    });

    const serialized = serializeVerdantSkillRunReceipt(forgedReceipt);

    expect(propertyReads).toBe(0);
    expect(JSON.parse(serialized)).toMatchObject({
      status: "skill_error",
      reasonCodes: ["receipt_input_invalid"],
      outcome: null,
    });
  });
});

describe("Verdant Skill Runtime request and lookup boundary", () => {
  it("accepts unknown at the public boundary and rejects extra/accessor/prototype request shapes", async () => {
    const { runVerdantSkill } = await loadRuntimeWithDefinition(
      testDefinition() as VerdantSkillDefinition<unknown, unknown>,
    );

    expect(runVerdantSkill(null)).toMatchObject({
      status: "skill_error",
      reasonCodes: ["runtime_request_invalid"],
    });
    expect(runVerdantSkill({ ...request(), extra: true })).toMatchObject({
      status: "skill_error",
      reasonCodes: ["runtime_request_invalid"],
    });

    const inherited = Object.assign(Object.create({ hidden: true }), request());
    expect(runVerdantSkill(inherited).status).toBe("skill_error");

    let getterRead = false;
    const accessor = request() as Record<string, unknown>;
    Object.defineProperty(accessor, "input", {
      enumerable: true,
      get: () => {
        getterRead = true;
        return { eventId: "event-1" };
      },
    });
    expect(runVerdantSkill(accessor).status).toBe("skill_error");
    expect(getterRead).toBe(false);

    const throwingProxy = new Proxy(request(), {
      getPrototypeOf: () => {
        throw new Error("must not escape");
      },
    });
    expect(runVerdantSkill(throwingProxy)).toMatchObject({
      status: "skill_error",
      reasonCodes: ["runtime_request_invalid"],
    });
  });

  it("fails closed for an unknown exact id@version without exposing input", async () => {
    const { runVerdantSkill } = await loadRuntimeWithDefinition(null);
    const receipt = runVerdantSkill({
      ...request({ eventId: "private-event-id", note: "private note" }),
      skillId: "not-registered",
    });

    expect(receipt).toMatchObject({
      status: "unknown_skill",
      reasonCodes: ["skill_not_registered"],
      skill: { id: "not-registered", version: "1.0.0" },
      outcome: null,
    });
    expect(JSON.stringify(receipt)).not.toContain("private-event-id");
    expect(JSON.stringify(receipt)).not.toContain("private note");
  });

  it("requires injected canonical execution time and safe run identity", async () => {
    const { runVerdantSkill } = await loadRuntimeWithDefinition(
      testDefinition() as VerdantSkillDefinition<unknown, unknown>,
    );
    expect(
      runVerdantSkill({
        ...request(),
        runId: "unsafe run id",
        executionAt: "2026-07-30T13:00:00-05:00",
      }),
    ).toMatchObject({
      status: "skill_error",
      runId: null,
      executionAt: null,
      reasonCodes: ["execution_time_invalid", "run_id_invalid"],
    });
  });
});

describe("Verdant Skill Runtime orchestration", () => {
  it("runs assess -> handler -> output validation and returns a frozen deterministic receipt", async () => {
    const definition = testDefinition();
    const { runVerdantSkill } = await loadRuntimeWithDefinition(
      definition as VerdantSkillDefinition<unknown, unknown>,
    );

    const first = runVerdantSkill(request());
    const second = runVerdantSkill(request());

    expect(first).toMatchObject({
      schemaVersion: "verdant-skill-run-receipt.v1",
      runId: "skill-run-001",
      executionAt: EXECUTION_AT,
      skill: { id: "runtime-test", version: "1.0.0" },
      status: "completed",
      reasonCodes: ["skill_completed"],
      applicability: {
        status: "applicable",
        reasonCodes: ["requirements_met"],
      },
      policy: {
        preExecution: [],
        postExecution: [],
      },
      outcome: { summary: "Reviewed event-1." },
    });
    expect(serializeVerdantSkillRunReceipt(first)).toBe(serializeVerdantSkillRunReceipt(second));
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.skill)).toBe(true);
    expect(Object.isFrozen(first.outcome)).toBe(true);
    expect(Object.isFrozen(first.reasonCodes)).toBe(true);
  });

  it("rejects malformed and oversized input before assess or run", async () => {
    const assess = vi.fn(testDefinition().assess);
    const run = vi.fn(testDefinition().run);
    const definition = testDefinition({ assess, run });
    const { runVerdantSkill } = await loadRuntimeWithDefinition(
      definition as VerdantSkillDefinition<unknown, unknown>,
    );

    const receipt = runVerdantSkill(
      request({
        eventId: "event-1",
        raw_payload: "must not cross the boundary",
      }),
    );

    expect(receipt.status).toBe("not_applicable");
    expect(receipt.reasonCodes).toContain("data_sensitive_key_forbidden");
    expect(assess).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(receipt)).not.toContain("raw_payload");
  });

  it("passes a frozen reconstructed clone to assess without reading caller proxy properties", async () => {
    let callerPropertyReads = 0;
    const callerInput = new Proxy(
      { eventId: "event-1" },
      {
        get: (target, key, receiver) => {
          callerPropertyReads += 1;
          return Reflect.get(target, key, receiver);
        },
      },
    );
    const assess = vi.fn((input: unknown) => {
      expect(Object.isFrozen(input)).toBe(true);
      return testDefinition().assess(input, EXECUTION_AT);
    });
    const definition = testDefinition({ assess });
    const { runVerdantSkill } = await loadRuntimeWithDefinition(
      definition as VerdantSkillDefinition<unknown, unknown>,
    );

    expect(runVerdantSkill(request(callerInput)).status).toBe("completed");
    expect(assess).toHaveBeenCalledTimes(1);
    expect(callerPropertyReads).toBe(0);
    expect(Object.isFrozen(callerInput)).toBe(false);
  });

  it("maps an invalid or not-applicable assessment without invoking the handler", async () => {
    const run = vi.fn(testDefinition().run);
    const invalidDefinition = testDefinition({
      assess: () => ({ status: "invalid", issues: ["event_shape_invalid"] }),
      run,
    });
    let runtime = await loadRuntimeWithDefinition(
      invalidDefinition as VerdantSkillDefinition<unknown, unknown>,
    );
    expect(runtime.runVerdantSkill(request()).status).toBe("not_applicable");
    expect(run).not.toHaveBeenCalled();

    const unavailableDefinition = testDefinition({
      assess: () => ({
        status: "not_applicable",
        reasonCodes: ["event_outside_supported_scope"],
      }),
      run,
    });
    runtime = await loadRuntimeWithDefinition(
      unavailableDefinition as VerdantSkillDefinition<unknown, unknown>,
    );
    expect(runtime.runVerdantSkill(request())).toMatchObject({
      status: "not_applicable",
      reasonCodes: ["event_outside_supported_scope"],
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("checks raw output policy before a validator could strip forbidden effects", async () => {
    const validateOutcome = vi.fn(() => ({
      ok: true as const,
      outcome: { summary: "Stripped output." },
    }));
    const definition = testDefinition({
      run: () => ({
        status: "completed",
        outcome: {
          summary: "Looks safe.",
          endpoint: "remote",
        },
      }),
      validateOutcome,
    });
    const { runVerdantSkill } = await loadRuntimeWithDefinition(
      definition as VerdantSkillDefinition<unknown, unknown>,
    );
    const receipt = runVerdantSkill(request());

    expect(receipt.status).toBe("policy_blocked");
    expect(receipt.reasonCodes).toContain("policy.network_forbidden");
    expect(validateOutcome).not.toHaveBeenCalled();
    expect(receipt.outcome).toBeNull();
  });

  it("sanitizes handler exceptions and invalid outcomes into typed failures", async () => {
    const throwing = testDefinition({
      run: () => {
        throw new Error("provider token private-stack-detail");
      },
    });
    let runtime = await loadRuntimeWithDefinition(
      throwing as VerdantSkillDefinition<unknown, unknown>,
    );
    const thrownReceipt = runtime.runVerdantSkill(request());
    expect(thrownReceipt).toMatchObject({
      status: "skill_error",
      reasonCodes: ["skill_execution_failed"],
      outcome: null,
    });
    expect(JSON.stringify(thrownReceipt)).not.toMatch(/provider|token|private-stack-detail/i);

    const invalidOutcome = testDefinition({
      validateOutcome: () => ({
        ok: false,
        reasonCodes: ["outcome_shape_invalid"],
      }),
    });
    runtime = await loadRuntimeWithDefinition(
      invalidOutcome as VerdantSkillDefinition<unknown, unknown>,
    );
    expect(runtime.runVerdantSkill(request())).toMatchObject({
      status: "skill_error",
      reasonCodes: ["outcome_shape_invalid", "skill_outcome_invalid"],
      outcome: null,
    });
  });

  it("pre-policy denial prevents assessment and handler invocation", async () => {
    const assess = vi.fn(testDefinition().assess);
    const run = vi.fn(testDefinition().run);
    const definition = testDefinition({ assess, run });

    vi.resetModules();
    vi.doMock("@/lib/verdantSkillRegistry", () => ({
      resolveVerdantSkillDefinition: () => definition,
    }));
    vi.doMock("@/lib/verdantSkillPolicyRules", async () => {
      const actual = await vi.importActual<typeof import("@/lib/verdantSkillPolicyRules")>(
        "@/lib/verdantSkillPolicyRules",
      );
      return {
        ...actual,
        evaluateVerdantSkillPreExecutionPolicy: () =>
          Object.freeze({
            allowed: false,
            phase: "pre_execution" as const,
            findings: Object.freeze([
              Object.freeze({
                code: "policy.test_denial",
                path: "$.manifest",
                severity: "block" as const,
              }),
            ]),
          }),
      };
    });
    const { runVerdantSkill } = await import("@/lib/verdantSkillRuntime");
    const receipt = runVerdantSkill(request());

    expect(receipt).toMatchObject({
      status: "policy_blocked",
      reasonCodes: ["policy.test_denial"],
    });
    expect(assess).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
