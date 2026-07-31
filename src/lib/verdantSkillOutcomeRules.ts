/**
 * Immutable, privacy-minimal receipts for Verdant Skill Runtime v1.
 *
 * Receipts retain version, injected execution time, stable reason codes,
 * applicability, and policy findings. They never include caller input,
 * thrown errors, stack traces, provider details, or operational metadata.
 */

import type {
  VerdantSkillPolicyDecision,
  VerdantSkillPolicyFinding,
} from "@/lib/verdantSkillPolicyRules";
import { inspectVerdantSkillData } from "@/lib/verdantSkillApplicabilityRules";

export const VERDANT_SKILL_RUN_RECEIPT_SCHEMA_VERSION = "verdant-skill-run-receipt.v1" as const;

export type VerdantSkillRunStatus =
  | "unknown_skill"
  | "invalid_manifest"
  | "not_applicable"
  | "policy_blocked"
  | "completed"
  | "insufficient_evidence"
  | "skill_error";

export interface VerdantSkillReceiptApplicability {
  readonly status: "applicable" | "not_applicable" | "invalid";
  readonly reasonCodes: readonly string[];
}

export interface VerdantSkillReceiptPolicy {
  readonly preExecution: readonly VerdantSkillPolicyFinding[];
  readonly postExecution: readonly VerdantSkillPolicyFinding[];
}

export interface VerdantSkillRunReceipt<Outcome = unknown> {
  readonly schemaVersion: typeof VERDANT_SKILL_RUN_RECEIPT_SCHEMA_VERSION;
  readonly runId: string | null;
  readonly executionAt: string | null;
  readonly skill: Readonly<{
    id: string | null;
    version: string | null;
  }>;
  readonly status: VerdantSkillRunStatus;
  readonly reasonCodes: readonly string[];
  readonly applicability: VerdantSkillReceiptApplicability | null;
  readonly policy: VerdantSkillReceiptPolicy;
  readonly outcome: Outcome | null;
}

export interface CreateVerdantSkillRunReceiptInput<Outcome = unknown> {
  readonly runId: string | null;
  readonly executionAt: string | null;
  readonly skillId: string | null;
  readonly skillVersion: string | null;
  readonly status: VerdantSkillRunStatus;
  readonly reasonCodes: readonly string[];
  readonly applicability?: VerdantSkillReceiptApplicability | null;
  readonly prePolicy?: VerdantSkillPolicyDecision | null;
  readonly postPolicy?: VerdantSkillPolicyDecision | null;
  readonly outcome?: Outcome | null;
}

const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_RECEIPT_ARRAY_ITEMS = 100;
const MAX_RECEIPT_OBJECT_KEYS = 80;
const MAX_RECEIPT_DEPTH = 8;
const MAX_RECEIPT_NODES = 500;

const RUN_STATUS_VALUES: readonly VerdantSkillRunStatus[] = Object.freeze([
  "unknown_skill",
  "invalid_manifest",
  "not_applicable",
  "policy_blocked",
  "completed",
  "insufficient_evidence",
  "skill_error",
]);

const APPLICABILITY_STATUS_VALUES: readonly VerdantSkillReceiptApplicability["status"][] =
  Object.freeze(["applicable", "not_applicable", "invalid"]);

const RECEIPT_INPUT_REQUIRED_KEYS = Object.freeze([
  "runId",
  "executionAt",
  "skillId",
  "skillVersion",
  "status",
  "reasonCodes",
] as const);
const RECEIPT_INPUT_OPTIONAL_KEYS = Object.freeze([
  "applicability",
  "prePolicy",
  "postPolicy",
  "outcome",
] as const);

type DescriptorRecord = Record<string, PropertyDescriptor>;

type ExactArraySnapshot =
  | {
      readonly ok: true;
      readonly length: number;
      readonly items: readonly PropertyDescriptor[];
    }
  | {
      readonly ok: false;
    };

const TRUSTED_RECEIPTS = new WeakSet<object>();

function readExactArray(value: unknown, maximumItems: number): ExactArraySnapshot {
  if (!Array.isArray(value)) return { ok: false };
  if (Object.getPrototypeOf(value) !== Array.prototype) return { ok: false };
  if (Object.getOwnPropertySymbols(value).length > 0) return { ok: false };

  const descriptors = Object.getOwnPropertyDescriptors(value) as DescriptorRecord;
  const lengthDescriptor = descriptors["length"];
  const lengthValue =
    lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (
    typeof lengthValue !== "number" ||
    !Number.isInteger(lengthValue) ||
    lengthValue < 0 ||
    lengthValue > maximumItems ||
    lengthDescriptor.enumerable
  ) {
    return { ok: false };
  }

  const names = Object.keys(descriptors);
  if (names.length !== lengthValue + 1) return { ok: false };

  const items: PropertyDescriptor[] = [];
  for (let index = 0; index < lengthValue; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      return { ok: false };
    }
    items.push(descriptor);
  }
  return {
    ok: true,
    length: lengthValue,
    items: Object.freeze(items),
  };
}

function readExactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): DescriptorRecord | null {
  const descriptors = readPlainRecord(value);
  if (!descriptors) return null;

  const keys = Object.keys(descriptors);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (
    keys.length < requiredKeys.length ||
    keys.length > allowed.size ||
    requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key)) ||
    keys.some((key) => !allowed.has(key))
  ) {
    return null;
  }
  return descriptors;
}

function readPlainRecord(value: unknown): DescriptorRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Object.getOwnPropertySymbols(value).length > 0) return null;

  const descriptors = Object.getOwnPropertyDescriptors(value) as DescriptorRecord;
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_RECEIPT_OBJECT_KEYS) return null;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) return null;
  }
  return descriptors;
}

function readBoundedNullableString(
  value: unknown,
  pattern: RegExp,
  maximumLength: number,
): string | null | undefined {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    !pattern.test(value)
  ) {
    return undefined;
  }
  return value;
}

function readExecutionAt(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 40) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  return new Date(milliseconds).toISOString() === value ? value : undefined;
}

function stableReasonCodes(codes: unknown): readonly string[] | null {
  const snapshot = readExactArray(codes, MAX_RECEIPT_ARRAY_ITEMS);
  if (!snapshot.ok) return null;
  const safe: string[] = [];
  for (let index = 0; index < snapshot.length; index += 1) {
    const code = snapshot.items[index].value;
    if (
      typeof code === "string" &&
      code.length > 0 &&
      code.length <= 160 &&
      REASON_CODE_PATTERN.test(code)
    ) {
      safe.push(code);
    }
  }
  return Object.freeze([...new Set(safe.length > 0 ? safe : ["runtime_failure"])].sort());
}

interface CloneBudget {
  nodes: number;
  readonly seen: WeakSet<object>;
}

function cloneAndFreeze<Value>(
  value: Value,
  budget: CloneBudget = { nodes: 0, seen: new WeakSet<object>() },
  depth = 0,
): Value {
  budget.nodes += 1;
  if (budget.nodes > MAX_RECEIPT_NODES || depth > MAX_RECEIPT_DEPTH) {
    throw new TypeError("receipt_value_over_budget");
  }

  if (Array.isArray(value)) {
    if (budget.seen.has(value)) throw new TypeError("receipt_value_cycle");
    budget.seen.add(value);
    const snapshot = readExactArray(value, MAX_RECEIPT_ARRAY_ITEMS);
    if (!snapshot.ok) throw new TypeError("receipt_array_invalid");
    const copy: unknown[] = new Array(snapshot.length);
    for (let index = 0; index < snapshot.length; index += 1) {
      copy[index] = cloneAndFreeze(snapshot.items[index].value, budget, depth + 1);
    }
    return Object.freeze(copy) as Value;
  }
  if (typeof value === "object" && value !== null) {
    if (budget.seen.has(value)) throw new TypeError("receipt_value_cycle");
    budget.seen.add(value);
    const descriptors = readPlainRecord(value);
    if (!descriptors) throw new TypeError("receipt_object_invalid");
    const keys = Object.keys(descriptors).sort();
    const copy: Record<string, unknown> = {};
    for (const key of keys) {
      Object.defineProperty(copy, key, {
        value: cloneAndFreeze(descriptors[key].value, budget, depth + 1),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(copy) as Value;
  }
  if (
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new TypeError("receipt_value_type_invalid");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("receipt_number_invalid");
  }
  return value;
}

function freezeFindings(
  decisionValue: unknown,
  expectedPhase: "pre_execution" | "post_execution",
): readonly VerdantSkillPolicyFinding[] | null {
  if (decisionValue == null) return Object.freeze([]);

  const descriptors = readExactRecord(decisionValue, ["allowed", "phase", "findings"]);
  if (
    !descriptors ||
    typeof descriptors.allowed.value !== "boolean" ||
    descriptors.phase.value !== expectedPhase
  ) {
    return null;
  }

  const snapshot = readExactArray(descriptors.findings.value, MAX_RECEIPT_ARRAY_ITEMS);
  if (!snapshot.ok) return null;

  const findings: VerdantSkillPolicyFinding[] = [];
  for (let index = 0; index < snapshot.length; index += 1) {
    const findingDescriptors = readExactRecord(snapshot.items[index].value, [
      "code",
      "path",
      "severity",
    ]);
    if (
      !findingDescriptors ||
      typeof findingDescriptors.code.value !== "string" ||
      findingDescriptors.code.value.length === 0 ||
      findingDescriptors.code.value.length > 160 ||
      !REASON_CODE_PATTERN.test(findingDescriptors.code.value) ||
      typeof findingDescriptors.path.value !== "string" ||
      findingDescriptors.path.value.length === 0 ||
      findingDescriptors.path.value.length > 500 ||
      findingDescriptors.severity.value !== "block"
    ) {
      return null;
    }
    findings.push(
      Object.freeze({
        code: findingDescriptors.code.value,
        path: findingDescriptors.path.value,
        severity: "block",
      }),
    );
  }

  if (descriptors.allowed.value !== (findings.length === 0)) return null;
  return Object.freeze(findings);
}

function finalizeReceipt<Outcome>(
  receipt: VerdantSkillRunReceipt<Outcome>,
): VerdantSkillRunReceipt<Outcome> {
  TRUSTED_RECEIPTS.add(receipt);
  return receipt;
}

function buildInvalidReceipt(): VerdantSkillRunReceipt<unknown> {
  return finalizeReceipt<unknown>(
    Object.freeze({
      schemaVersion: VERDANT_SKILL_RUN_RECEIPT_SCHEMA_VERSION,
      runId: null,
      executionAt: null,
      skill: Object.freeze({ id: null, version: null }),
      status: "skill_error",
      reasonCodes: Object.freeze(["receipt_input_invalid"]),
      applicability: null,
      policy: Object.freeze({
        preExecution: Object.freeze([]),
        postExecution: Object.freeze([]),
      }),
      outcome: null,
    }),
  );
}

function createVerdantSkillRunReceiptInternal<Outcome>(
  input: unknown,
): VerdantSkillRunReceipt<Outcome> {
  const descriptors = readExactRecord(
    input,
    RECEIPT_INPUT_REQUIRED_KEYS,
    RECEIPT_INPUT_OPTIONAL_KEYS,
  );
  if (!descriptors) throw new TypeError("receipt_input_shape_invalid");

  const runId = readBoundedNullableString(descriptors.runId.value, RUN_ID_PATTERN, 128);
  const executionAt = readExecutionAt(descriptors.executionAt.value);
  const skillId = readBoundedNullableString(descriptors.skillId.value, SKILL_ID_PATTERN, 80);
  const skillVersion = readBoundedNullableString(
    descriptors.skillVersion.value,
    VERSION_PATTERN,
    32,
  );
  const status = descriptors.status.value;
  const reasonCodes = stableReasonCodes(descriptors.reasonCodes.value);
  if (
    runId === undefined ||
    executionAt === undefined ||
    skillId === undefined ||
    skillVersion === undefined ||
    typeof status !== "string" ||
    !RUN_STATUS_VALUES.includes(status as VerdantSkillRunStatus) ||
    !reasonCodes
  ) {
    throw new TypeError("receipt_input_value_invalid");
  }

  let applicability: VerdantSkillReceiptApplicability | null = null;
  const applicabilityValue = descriptors.applicability?.value;
  if (applicabilityValue != null) {
    const applicabilityDescriptors = readExactRecord(applicabilityValue, ["status", "reasonCodes"]);
    const applicabilityReasonCodes = applicabilityDescriptors
      ? stableReasonCodes(applicabilityDescriptors.reasonCodes.value)
      : null;
    if (
      !applicabilityDescriptors ||
      typeof applicabilityDescriptors.status.value !== "string" ||
      !APPLICABILITY_STATUS_VALUES.includes(
        applicabilityDescriptors.status.value as VerdantSkillReceiptApplicability["status"],
      ) ||
      !applicabilityReasonCodes
    ) {
      throw new TypeError("receipt_applicability_invalid");
    }
    applicability = Object.freeze({
      status: applicabilityDescriptors.status.value as VerdantSkillReceiptApplicability["status"],
      reasonCodes: applicabilityReasonCodes,
    });
  }

  const preExecution = freezeFindings(descriptors.prePolicy?.value, "pre_execution");
  const postExecution = freezeFindings(descriptors.postPolicy?.value, "post_execution");
  if (!preExecution || !postExecution) {
    throw new TypeError("receipt_policy_invalid");
  }

  const outcomeValue = descriptors.outcome?.value;
  let outcome: Outcome | null = null;
  if (outcomeValue != null) {
    const inspection = inspectVerdantSkillData(outcomeValue);
    if (!inspection.ok) throw new TypeError("receipt_outcome_invalid");
    outcome = cloneAndFreeze(outcomeValue) as Outcome;
    if (!inspectVerdantSkillData(outcome).ok) {
      throw new TypeError("receipt_outcome_clone_invalid");
    }
  }

  const policy = Object.freeze({
    preExecution,
    postExecution,
  });

  return finalizeReceipt(
    Object.freeze({
      schemaVersion: VERDANT_SKILL_RUN_RECEIPT_SCHEMA_VERSION,
      runId,
      executionAt,
      skill: Object.freeze({
        id: skillId,
        version: skillVersion,
      }),
      status: status as VerdantSkillRunStatus,
      reasonCodes,
      applicability,
      policy,
      outcome,
    }),
  );
}

export function createVerdantSkillRunReceipt<Outcome>(
  input: CreateVerdantSkillRunReceiptInput<Outcome>,
): VerdantSkillRunReceipt<Outcome> {
  try {
    return createVerdantSkillRunReceiptInternal<Outcome>(input);
  } catch {
    return buildInvalidReceipt() as VerdantSkillRunReceipt<Outcome>;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const snapshot = readExactArray(value, MAX_RECEIPT_ARRAY_ITEMS);
    if (!snapshot.ok) throw new TypeError("receipt_serialization_array_invalid");
    const copy: unknown[] = new Array(snapshot.length);
    for (let index = 0; index < snapshot.length; index += 1) {
      copy[index] = canonicalize(snapshot.items[index].value);
    }
    return copy;
  }
  if (typeof value === "object" && value !== null) {
    const descriptors = readPlainRecord(value);
    if (!descriptors) throw new TypeError("receipt_serialization_object_invalid");
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(descriptors).sort()) {
      Object.defineProperty(sorted, key, {
        value: canonicalize(descriptors[key].value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return sorted;
  }
  if (
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new TypeError("receipt_serialization_value_invalid");
  }
  return value;
}

/**
 * Stable serialization for evaluation snapshots and run-to-run comparisons.
 */
export function serializeVerdantSkillRunReceipt(receipt: VerdantSkillRunReceipt): string {
  try {
    if (typeof receipt !== "object" || receipt === null || !TRUSTED_RECEIPTS.has(receipt)) {
      throw new TypeError("receipt_not_trusted");
    }
    return JSON.stringify(canonicalize(receipt));
  } catch {
    return JSON.stringify(canonicalize(buildInvalidReceipt()));
  }
}
