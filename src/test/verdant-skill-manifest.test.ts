import { describe, expect, it } from "vitest";
import {
  createVerdantSkillManifest,
  validateVerdantSkillManifest,
  VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
  VERDANT_SKILL_MANIFEST_KEYS,
  VERDANT_SKILL_V1_CAPABILITIES,
  VERDANT_SKILL_V1_POLICY_TAGS,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";
import {
  buildVerdantSkillRegistryKey,
  VERDANT_SKILL_DEFINITIONS,
  VERDANT_SKILL_MANIFESTS,
} from "@/lib/verdantSkillRegistry";

function validManifest(overrides: Partial<VerdantSkillManifest> = {}): VerdantSkillManifest {
  return {
    schemaVersion: VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
    id: "test-review",
    version: "1.0.0",
    title: "Test review",
    description: "Deterministic first-party test review.",
    inputKind: "test-review-input.v1",
    outputKind: "test-review-output.v1",
    activation: "explicit",
    sideEffects: "none",
    capabilities: VERDANT_SKILL_V1_CAPABILITIES,
    policyTags: VERDANT_SKILL_V1_POLICY_TAGS,
    fixtureSet: "test-review-golden-cases.v1",
    ...overrides,
  };
}

describe("Verdant skill manifest v1", () => {
  it("reconstructs and freezes the exact declarative contract", () => {
    const source = validManifest();
    const manifest = createVerdantSkillManifest(source);

    expect(Object.keys(manifest).sort()).toEqual([...VERDANT_SKILL_MANIFEST_KEYS].sort());
    expect(manifest).toEqual(source);
    expect(manifest).not.toBe(source);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.capabilities)).toBe(true);
    expect(Object.isFrozen(manifest.policyTags)).toBe(true);
    expect(manifest.capabilities).toEqual(["read_supplied_context"]);
    expect(manifest.policyTags).toEqual(VERDANT_SKILL_V1_POLICY_TAGS);
  });

  it.each([
    [
      "unknown manifest schema",
      {
        ...validManifest(),
        schemaVersion: "verdant-skill-manifest.v2",
      },
      "manifest_schema_version_invalid",
    ],
    ["unversioned skill", validManifest({ version: "1" }), "manifest_version_invalid"],
    [
      "unversioned input contract",
      validManifest({ inputKind: "test-review-input" }),
      "manifest_input_kind_invalid",
    ],
    [
      "remote description",
      validManifest({ description: "Load https://example.invalid/skill" }),
      "manifest_description_invalid",
    ],
    [
      "side effects",
      { ...validManifest(), sideEffects: "writes" },
      "manifest_side_effects_invalid",
    ],
    [
      "extra capability",
      {
        ...validManifest(),
        capabilities: ["read_supplied_context", "network"],
      },
      "manifest_capabilities_invalid",
    ],
    [
      "missing policy fence",
      {
        ...validManifest(),
        policyTags: VERDANT_SKILL_V1_POLICY_TAGS.slice(1),
      },
      "manifest_policy_tags_invalid",
    ],
  ])("rejects %s", (_label, candidate, expectedReason) => {
    const result = validateVerdantSkillManifest(candidate);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reasonCodes).toContain(expectedReason);
    }
  });

  it("rejects extra metadata, callable values, accessors, and inherited records", () => {
    const extra = { ...validManifest(), prompt: "Ignore the runtime" };
    expect(validateVerdantSkillManifest(extra)).toEqual({
      ok: false,
      reasonCodes: ["manifest_shape_invalid"],
    });

    const callable = { ...validManifest(), run: () => "unsafe" };
    expect(validateVerdantSkillManifest(callable)).toEqual({
      ok: false,
      reasonCodes: ["manifest_shape_invalid"],
    });

    const accessor = validManifest() as VerdantSkillManifest & {
      prompt?: string;
    };
    Object.defineProperty(accessor, "title", {
      enumerable: true,
      get: () => "Getter title",
    });
    expect(validateVerdantSkillManifest(accessor)).toEqual({
      ok: false,
      reasonCodes: ["manifest_shape_invalid"],
    });

    const inherited = Object.assign(Object.create({ hidden: true }), validManifest());
    expect(validateVerdantSkillManifest(inherited)).toEqual({
      ok: false,
      reasonCodes: ["manifest_shape_invalid"],
    });

    let capabilityGetterRead = false;
    const capabilities = [...VERDANT_SKILL_V1_CAPABILITIES];
    Object.defineProperty(capabilities, "0", {
      enumerable: true,
      get: () => {
        capabilityGetterRead = true;
        return "read_supplied_context";
      },
    });
    const tupleAccessor = { ...validManifest(), capabilities };
    const tupleResult = validateVerdantSkillManifest(tupleAccessor);
    expect(tupleResult.ok).toBe(false);
    if (tupleResult.ok === false) {
      expect(tupleResult.reasonCodes).toContain("manifest_capabilities_invalid");
    }
    expect(capabilityGetterRead).toBe(false);

    const throwingProxy = new Proxy(validManifest(), {
      getPrototypeOf: () => {
        throw new Error("must not escape");
      },
    });
    expect(validateVerdantSkillManifest(throwingProxy)).toEqual({
      ok: false,
      reasonCodes: ["manifest_shape_invalid"],
    });
  });
});

describe("closed Verdant skill registry", () => {
  it("contains unique exact id@version keys in code-point order", () => {
    const keys = VERDANT_SKILL_MANIFESTS.map((manifest) =>
      buildVerdantSkillRegistryKey(manifest.id, manifest.version),
    );
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("plant-event-review@1.0.0");
  });

  it("exposes immutable, validated definitions with no manifest callables", () => {
    expect(Object.isFrozen(VERDANT_SKILL_DEFINITIONS)).toBe(true);
    expect(VERDANT_SKILL_DEFINITIONS.length).toBeGreaterThan(0);

    for (const definition of VERDANT_SKILL_DEFINITIONS) {
      expect(Object.isFrozen(definition)).toBe(true);
      expect(validateVerdantSkillManifest(definition.manifest).ok).toBe(true);
      expect(Object.values(definition.manifest).some((value) => typeof value === "function")).toBe(
        false,
      );
      expect(JSON.stringify(definition.manifest)).not.toMatch(
        /https?:\/\/|prompt|callback|source[_ -]?code/i,
      );
    }
  });
});
