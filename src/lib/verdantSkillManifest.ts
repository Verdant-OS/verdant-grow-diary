/**
 * Closed, first-party contract for Verdant Skill Runtime v1.
 *
 * A manifest is declarative metadata only. It cannot contain callbacks,
 * prompts, URLs, tools, or effect permissions. Executable handlers live in
 * locally imported skill definitions and are reachable only through the
 * code-owned registry.
 */

export const VERDANT_SKILL_MANIFEST_KEYS = Object.freeze([
  "schemaVersion",
  "id",
  "version",
  "title",
  "description",
  "inputKind",
  "outputKind",
  "activation",
  "sideEffects",
  "capabilities",
  "policyTags",
  "fixtureSet",
] as const);

export const VERDANT_SKILL_MANIFEST_SCHEMA_VERSION = "verdant-skill-manifest.v1" as const;

export const VERDANT_SKILL_V1_CAPABILITIES = Object.freeze(["read_supplied_context"] as const);

export const VERDANT_SKILL_V1_POLICY_TAGS = Object.freeze([
  "advisory_only",
  "engine_only",
  "no_action_queue_write",
  "no_alert_write",
  "no_arbitrary_code",
  "no_device_control",
  "no_hardware_control",
  "no_model",
  "no_network",
  "no_persistence",
] as const);

export type VerdantSkillCapability = (typeof VERDANT_SKILL_V1_CAPABILITIES)[number];
export type VerdantSkillPolicyTag = (typeof VERDANT_SKILL_V1_POLICY_TAGS)[number];

export interface VerdantSkillManifest {
  readonly schemaVersion: typeof VERDANT_SKILL_MANIFEST_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly inputKind: string;
  readonly outputKind: string;
  readonly activation: "explicit";
  readonly sideEffects: "none";
  readonly capabilities: readonly VerdantSkillCapability[];
  readonly policyTags: readonly VerdantSkillPolicyTag[];
  readonly fixtureSet: string;
}

export type VerdantSkillApplicabilityResult<Input> =
  | {
      readonly status: "applicable";
      readonly normalizedInput: Input;
      readonly reasonCodes: readonly string[];
    }
  | {
      readonly status: "not_applicable";
      readonly reasonCodes: readonly string[];
    }
  | {
      readonly status: "invalid";
      readonly issues: readonly string[];
    };

export interface VerdantSkillExecutionContext<Input> {
  readonly input: Input;
  readonly executionAt: string;
}

export interface VerdantSkillHandlerResult {
  readonly status: "completed" | "insufficient_evidence";
  readonly outcome: unknown;
}

export type VerdantSkillOutcomeValidation<Outcome> =
  | {
      readonly ok: true;
      readonly outcome: Outcome;
    }
  | {
      readonly ok: false;
      readonly reasonCodes: readonly string[];
    };

/**
 * Definition implemented by a trusted, statically imported first-party skill.
 *
 * `assess` owns fixed-key input reconstruction. `validateOutcome` owns
 * fixed-key output reconstruction. The runtime still performs structural and
 * policy checks around both boundaries.
 */
export interface VerdantSkillDefinition<Input = unknown, Outcome = unknown> {
  readonly manifest: VerdantSkillManifest;
  readonly assess: (input: unknown, executionAt: string) => VerdantSkillApplicabilityResult<Input>;
  readonly run: (context: VerdantSkillExecutionContext<Input>) => VerdantSkillHandlerResult;
  readonly validateOutcome: (outcome: unknown) => VerdantSkillOutcomeValidation<Outcome>;
}

export type VerdantSkillManifestValidation =
  | {
      readonly ok: true;
      readonly manifest: VerdantSkillManifest;
    }
  | {
      readonly ok: false;
      readonly reasonCodes: readonly string[];
    };

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CONTRACT_KIND_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-(?:input|output)\.v[1-9]\d*$/;
const FIXTURE_SET_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.v[1-9]\d*$/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)/i;

function isExactPlainRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return false;
  }

  return Object.values(descriptors).every(
    (descriptor) => "value" in descriptor && descriptor.enumerable === true,
  );
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= maximumLength &&
    !URL_PATTERN.test(value)
  );
}

function isExactStringTuple(
  value: unknown,
  expected: readonly string[],
): value is readonly string[] {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const enumerableKeys = Object.keys(descriptors).filter((key) => key !== "length");
  if (
    enumerableKeys.length !== expected.length ||
    enumerableKeys.some((key, index) => key !== String(index))
  ) {
    return false;
  }
  return expected.every((item, index) => {
    const descriptor = descriptors[String(index)];
    return descriptor?.enumerable === true && "value" in descriptor && descriptor.value === item;
  });
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

/**
 * Validate unknown metadata and reconstruct an immutable, fixed-key manifest.
 */
function validateVerdantSkillManifestInternal(input: unknown): VerdantSkillManifestValidation {
  const reasons: string[] = [];

  if (!isExactPlainRecord(input, VERDANT_SKILL_MANIFEST_KEYS)) {
    return {
      ok: false,
      reasonCodes: Object.freeze(["manifest_shape_invalid"]),
    };
  }

  if (!isBoundedText(input.id, 80) || !ID_PATTERN.test(input.id)) {
    reasons.push("manifest_id_invalid");
  }
  if (input.schemaVersion !== VERDANT_SKILL_MANIFEST_SCHEMA_VERSION) {
    reasons.push("manifest_schema_version_invalid");
  }
  if (!isBoundedText(input.version, 32) || !VERSION_PATTERN.test(input.version)) {
    reasons.push("manifest_version_invalid");
  }
  if (!isBoundedText(input.title, 120)) reasons.push("manifest_title_invalid");
  if (!isBoundedText(input.description, 500)) reasons.push("manifest_description_invalid");
  if (
    !isBoundedText(input.inputKind, 120) ||
    !CONTRACT_KIND_PATTERN.test(input.inputKind) ||
    !input.inputKind.endsWith("-input.v1")
  ) {
    reasons.push("manifest_input_kind_invalid");
  }
  if (
    !isBoundedText(input.outputKind, 120) ||
    !CONTRACT_KIND_PATTERN.test(input.outputKind) ||
    !input.outputKind.endsWith("-output.v1")
  ) {
    reasons.push("manifest_output_kind_invalid");
  }
  if (input.activation !== "explicit") reasons.push("manifest_activation_invalid");
  if (input.sideEffects !== "none") reasons.push("manifest_side_effects_invalid");
  if (!isExactStringTuple(input.capabilities, VERDANT_SKILL_V1_CAPABILITIES)) {
    reasons.push("manifest_capabilities_invalid");
  }
  if (!isExactStringTuple(input.policyTags, VERDANT_SKILL_V1_POLICY_TAGS)) {
    reasons.push("manifest_policy_tags_invalid");
  }
  if (!isBoundedText(input.fixtureSet, 160) || !FIXTURE_SET_PATTERN.test(input.fixtureSet)) {
    reasons.push("manifest_fixture_set_invalid");
  }

  if (reasons.length > 0) {
    return {
      ok: false,
      reasonCodes: uniqueSorted(reasons),
    };
  }

  const manifest: VerdantSkillManifest = Object.freeze({
    schemaVersion: VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
    id: input.id as string,
    version: input.version as string,
    title: input.title as string,
    description: input.description as string,
    inputKind: input.inputKind as string,
    outputKind: input.outputKind as string,
    activation: "explicit",
    sideEffects: "none",
    capabilities: VERDANT_SKILL_V1_CAPABILITIES,
    policyTags: VERDANT_SKILL_V1_POLICY_TAGS,
    fixtureSet: input.fixtureSet as string,
  });

  return { ok: true, manifest };
}

export function validateVerdantSkillManifest(input: unknown): VerdantSkillManifestValidation {
  try {
    return validateVerdantSkillManifestInternal(input);
  } catch {
    return {
      ok: false,
      reasonCodes: Object.freeze(["manifest_shape_invalid"]),
    };
  }
}

/**
 * Authoring helper for code-owned manifests. Invalid first-party metadata is a
 * programming error and fails immediately during module initialization.
 */
export function createVerdantSkillManifest(input: VerdantSkillManifest): VerdantSkillManifest {
  const validation = validateVerdantSkillManifest(input);
  if (validation.ok === false) {
    throw new Error(`Invalid Verdant skill manifest: ${validation.reasonCodes.join(",")}`);
  }
  return validation.manifest;
}
