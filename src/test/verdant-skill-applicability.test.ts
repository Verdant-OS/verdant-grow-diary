import { describe, expect, it } from "vitest";
import {
  applicableVerdantSkill,
  inspectVerdantSkillData,
  invalidVerdantSkillApplicability,
  notApplicableVerdantSkill,
  parseVerdantSkillExecutionAt,
  validateVerdantSkillApplicabilityResult,
  VERDANT_SKILL_DATA_LIMITS,
} from "@/lib/verdantSkillApplicabilityRules";

describe("Verdant skill injected execution time", () => {
  it("accepts only exact canonical ISO instants and never supplies a clock fallback", () => {
    expect(parseVerdantSkillExecutionAt("2026-07-30T18:00:00.000Z")).toBe(
      "2026-07-30T18:00:00.000Z",
    );
    expect(parseVerdantSkillExecutionAt("2026-07-30T13:00:00-05:00")).toBeNull();
    expect(parseVerdantSkillExecutionAt("2026-07-30")).toBeNull();
    expect(parseVerdantSkillExecutionAt(undefined)).toBeNull();
    expect(parseVerdantSkillExecutionAt("not-a-date")).toBeNull();
  });
});

describe("bounded untrusted skill data", () => {
  it("accepts bounded JSON-like records without mutation", () => {
    const input = {
      event: {
        id: "event-1",
        warnings: ["missing-stage"],
        notePresent: false,
      },
      reading: 24.5,
    };
    const before = structuredClone(input);

    expect(inspectVerdantSkillData(input)).toEqual({ ok: true, issues: [] });
    expect(input).toEqual(before);
  });

  it.each([
    ["non-finite number", { value: Number.NaN }, "data_number_invalid"],
    ["sensitive key", { raw_payload: {} }, "data_sensitive_key_forbidden"],
    ["camel-case sensitive key", { authToken: "private" }, "data_sensitive_key_forbidden"],
    ["callable value", { run: () => undefined }, "data_value_type_invalid"],
    ["symbol value", { value: Symbol("x") }, "data_value_type_invalid"],
  ])("fails closed for %s", (_label, candidate, issue) => {
    const result = inspectVerdantSkillData(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues).toContain(issue);
  });

  it("rejects inherited prototypes, accessors, cycles, sparse arrays, and symbol keys", () => {
    const inherited = Object.assign(Object.create({ inherited: true }), { safe: true });
    expect(inspectVerdantSkillData(inherited).issues).toContain("data_prototype_invalid");

    let getterRead = false;
    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => {
        getterRead = true;
        return "unsafe";
      },
    });
    expect(inspectVerdantSkillData(accessor).issues).toContain("data_accessor_forbidden");
    expect(getterRead).toBe(false);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(inspectVerdantSkillData(cyclic).issues).toContain("data_reference_cycle");

    const sparse = new Array(2);
    sparse[1] = "present";
    expect(inspectVerdantSkillData(sparse).issues).toContain("data_array_shape_invalid");

    const symbolKey = { safe: true, [Symbol("hidden")]: "unsafe" };
    expect(inspectVerdantSkillData(symbolKey).issues).toContain("data_symbol_key_forbidden");

    const throwingProxy = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("must not escape");
        },
      },
    );
    expect(inspectVerdantSkillData(throwingProxy)).toEqual({
      ok: false,
      issues: ["data_inspection_failed"],
    });
  });

  it("rejects hostile arrays without invoking custom prototypes, accessors, or methods", () => {
    let customMethodCalls = 0;
    const customPrototype = Object.create(Array.prototype);
    Object.defineProperty(customPrototype, "forEach", {
      value: () => {
        customMethodCalls += 1;
      },
    });
    const customPrototypeArray = ["safe"];
    Object.setPrototypeOf(customPrototypeArray, customPrototype);
    expect(inspectVerdantSkillData(customPrototypeArray).issues).toContain(
      "data_array_prototype_invalid",
    );

    let getterReads = 0;
    const accessorArray = ["safe"];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      configurable: true,
      get: () => {
        getterReads += 1;
        return "unsafe";
      },
    });
    expect(inspectVerdantSkillData(accessorArray).issues).toContain("data_accessor_forbidden");

    const shadowedMethodArray = ["safe"] as string[] & { map?: () => void };
    Object.defineProperty(shadowedMethodArray, "map", {
      enumerable: true,
      value: () => {
        customMethodCalls += 1;
      },
    });
    expect(inspectVerdantSkillData(shadowedMethodArray).issues).toContain(
      "data_array_shape_invalid",
    );

    const symbolArray = ["safe"];
    Object.defineProperty(symbolArray, Symbol("hidden"), {
      value: "unsafe",
    });
    expect(inspectVerdantSkillData(symbolArray).issues).toContain("data_symbol_key_forbidden");

    const throwingArrayProxy = new Proxy(["safe"], {
      ownKeys: () => {
        throw new Error("must not escape");
      },
    });
    expect(inspectVerdantSkillData(throwingArrayProxy)).toEqual({
      ok: false,
      issues: ["data_inspection_failed"],
    });
    expect(getterReads).toBe(0);
    expect(customMethodCalls).toBe(0);
  });

  it("clones valid object and array proxies through descriptors without property reads", () => {
    let propertyReads = 0;
    const proxiedArray = new Proxy(["safe"], {
      get: (target, key, receiver) => {
        propertyReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const proxiedInput = new Proxy(
      { values: proxiedArray },
      {
        get: (target, key, receiver) => {
          propertyReads += 1;
          return Reflect.get(target, key, receiver);
        },
      },
    );

    const result = applicableVerdantSkill(proxiedInput);
    expect(result.status).toBe("applicable");
    expect(propertyReads).toBe(0);
    if (result.status === "applicable") {
      expect(result.normalizedInput).toEqual({ values: ["safe"] });
      expect(Object.isFrozen(result.normalizedInput)).toBe(true);
      expect(Object.isFrozen(result.normalizedInput.values)).toBe(true);
    }
  });

  it("enforces deterministic depth, node, array, and text budgets", () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let index = 0; index <= VERDANT_SKILL_DATA_LIMITS.maximumDepth; index += 1) {
      deep.next = {};
      deep = deep.next as Record<string, unknown>;
    }
    expect(inspectVerdantSkillData(root).issues).toContain("data_depth_limit_exceeded");

    expect(
      inspectVerdantSkillData(
        Array.from({ length: VERDANT_SKILL_DATA_LIMITS.maximumArrayItems + 1 }, () => null),
      ).issues,
    ).toContain("data_array_limit_exceeded");

    expect(
      inspectVerdantSkillData({
        text: "x".repeat(VERDANT_SKILL_DATA_LIMITS.maximumStringLength + 1),
      }).issues,
    ).toContain("data_string_limit_exceeded");

    const manyNodes = Array.from({ length: VERDANT_SKILL_DATA_LIMITS.maximumArrayItems }, () =>
      Array.from({ length: 6 }, () => null),
    );
    expect(inspectVerdantSkillData(manyNodes).issues).toContain("data_node_limit_exceeded");
  });
});

describe("Verdant skill applicability result", () => {
  it("normalizes reason order, freezes a copy, and stays byte-identical", () => {
    const input = {
      event: {
        id: "event-1",
        warnings: ["missing_stage"],
      },
    };
    const before = structuredClone(input);

    const first = applicableVerdantSkill(input, ["z_reason", "a_reason", "z_reason"]);
    const second = applicableVerdantSkill(input, ["z_reason", "a_reason", "z_reason"]);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.status).toBe("applicable");
    if (first.status === "applicable") {
      expect(first.reasonCodes).toEqual(["a_reason", "z_reason"]);
      expect(first.normalizedInput).not.toBe(input);
      expect(Object.isFrozen(first.normalizedInput)).toBe(true);
      expect(Object.isFrozen(first.normalizedInput.event)).toBe(true);
    }
    expect(input).toEqual(before);
  });

  it("constructs stable not-applicable and invalid discriminants", () => {
    expect(notApplicableVerdantSkill(["missing_event", "missing_event"])).toEqual({
      status: "not_applicable",
      reasonCodes: ["missing_event"],
    });
    expect(invalidVerdantSkillApplicability(["event_shape_invalid"])).toEqual({
      status: "invalid",
      issues: ["event_shape_invalid"],
    });
  });

  it("revalidates exact assessment shapes and rejects unexpected keys", () => {
    const valid = validateVerdantSkillApplicabilityResult({
      status: "applicable",
      normalizedInput: { eventId: "event-1" },
      reasonCodes: ["requirements_met"],
    });
    expect(valid.ok).toBe(true);

    expect(
      validateVerdantSkillApplicabilityResult({
        status: "applicable",
        normalizedInput: { eventId: "event-1" },
        reasonCodes: ["requirements_met"],
        effect: "write",
      }),
    ).toEqual({
      ok: false,
      issues: ["applicability_shape_invalid"],
    });

    expect(
      validateVerdantSkillApplicabilityResult({
        status: "not_applicable",
        reasonCodes: [],
      }),
    ).toEqual({
      ok: false,
      issues: ["applicability_reason_codes_invalid"],
    });

    let customReasonMethodCalls = 0;
    const hostileReasonCodes = ["requirements_met"] as string[] & {
      some?: () => boolean;
    };
    Object.defineProperty(hostileReasonCodes, "some", {
      enumerable: true,
      value: () => {
        customReasonMethodCalls += 1;
        return false;
      },
    });
    expect(
      validateVerdantSkillApplicabilityResult({
        status: "applicable",
        normalizedInput: { eventId: "event-1" },
        reasonCodes: hostileReasonCodes,
      }),
    ).toEqual({
      ok: false,
      issues: ["applicability_reason_codes_invalid"],
    });
    expect(customReasonMethodCalls).toBe(0);
  });
});
