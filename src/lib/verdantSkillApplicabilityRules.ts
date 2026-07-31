/**
 * Pure applicability and untrusted-data rules shared by first-party skills.
 *
 * This module never decides cultivation guidance. It only provides bounded
 * structural validation, deterministic reason-code normalization, immutable
 * result constructors, and injected-time validation.
 */

import type { VerdantSkillApplicabilityResult } from "@/lib/verdantSkillManifest";

export const VERDANT_SKILL_DATA_LIMITS = Object.freeze({
  maximumDepth: 8,
  maximumNodes: 500,
  maximumArrayItems: 100,
  maximumObjectKeys: 80,
  maximumStringLength: 4_000,
  maximumTotalStringLength: 50_000,
  maximumReasonCodes: 40,
});

export interface VerdantSkillDataInspection {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export type VerdantSkillApplicabilityValidation<Input> =
  | {
      readonly ok: true;
      readonly result: VerdantSkillApplicabilityResult<Input>;
    }
  | {
      readonly ok: false;
      readonly issues: readonly string[];
    };

const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;
const BLOCKED_META_KEY_PATTERN = /^(?:__proto__|prototype|constructor)$/i;
const SENSITIVE_KEY_PATTERN =
  /(?:^|_)(?:raw_payload|secret|secrets|token|tokens|api_key|service_role|password|credential|credentials|bearer|jwt)(?:_|$)/i;

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

type ExactArrayData =
  | {
      readonly ok: true;
      readonly length: number;
      readonly items: readonly PropertyDescriptor[];
    }
  | {
      readonly ok: false;
      readonly issue: string;
    };

/**
 * Snapshot an untrusted array through reflection only. No instance property,
 * iterator, accessor, or inherited method is read or invoked.
 */
function readExactArrayData(value: unknown, maximumItems: number): ExactArrayData {
  if (!Array.isArray(value)) return { ok: false, issue: "data_array_shape_invalid" };
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return { ok: false, issue: "data_array_prototype_invalid" };
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return { ok: false, issue: "data_symbol_key_forbidden" };
  }

  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const lengthDescriptor = descriptors["length"];
  const lengthValue =
    lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (
    !lengthDescriptor ||
    typeof lengthValue !== "number" ||
    lengthDescriptor.enumerable ||
    !Number.isInteger(lengthValue) ||
    lengthValue < 0
  ) {
    return { ok: false, issue: "data_array_shape_invalid" };
  }

  const length = lengthValue;
  if (length > maximumItems) {
    return { ok: false, issue: "data_array_limit_exceeded" };
  }

  const ownNames = Object.keys(descriptors);
  if (ownNames.length !== length + 1) {
    return { ok: false, issue: "data_array_shape_invalid" };
  }

  const items: PropertyDescriptor[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      return {
        ok: false,
        issue:
          descriptor && !("value" in descriptor)
            ? "data_accessor_forbidden"
            : "data_array_shape_invalid",
      };
    }
    items.push(descriptor);
  }

  return {
    ok: true,
    length,
    items: Object.freeze(items),
  };
}

function stableCodes(codes: readonly string[], fallback: string): readonly string[] {
  const valid: string[] = [];
  try {
    const snapshot = readExactArrayData(codes, VERDANT_SKILL_DATA_LIMITS.maximumReasonCodes);
    if (snapshot.ok) {
      for (let index = 0; index < snapshot.length; index += 1) {
        const code = snapshot.items[index].value;
        if (
          typeof code === "string" &&
          code.length > 0 &&
          code.length <= 120 &&
          REASON_CODE_PATTERN.test(code)
        ) {
          valid.push(code);
        }
      }
    }
  } catch {
    // A reflective failure is normalized to the caller-supplied stable fallback.
  }
  const normalized = valid.length > 0 ? valid : [fallback];
  return Object.freeze([...new Set(normalized)].sort());
}

function cloneAndFreezeData<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    const snapshot = readExactArrayData(value, VERDANT_SKILL_DATA_LIMITS.maximumArrayItems);
    if (!snapshot.ok) throw new TypeError("unsafe_array");
    const items: unknown[] = new Array(snapshot.length);
    for (let index = 0; index < snapshot.length; index += 1) {
      items[index] = cloneAndFreezeData(snapshot.items[index].value);
    }
    return Object.freeze(items) as Value;
  }

  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("unsafe_object_prototype");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("unsafe_object_symbol");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).sort();
    if (keys.length > VERDANT_SKILL_DATA_LIMITS.maximumObjectKeys) {
      throw new TypeError("unsafe_object_size");
    }
    const copy: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      const normalizedKey = normalizeKey(key);
      if (
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        BLOCKED_META_KEY_PATTERN.test(normalizedKey) ||
        SENSITIVE_KEY_PATTERN.test(normalizedKey)
      ) {
        throw new TypeError("unsafe_object_descriptor");
      }
      Object.defineProperty(copy, key, {
        value: cloneAndFreezeData(descriptor.value),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(copy) as Value;
  }

  return value;
}

function exactRecordKeys(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => !("value" in descriptor) || descriptor.enumerable !== true,
    )
  ) {
    return false;
  }

  const actual = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function readReasonCodeArray(value: unknown): readonly string[] | null {
  const snapshot = readExactArrayData(value, VERDANT_SKILL_DATA_LIMITS.maximumReasonCodes);
  if (!snapshot.ok || snapshot.length === 0) return null;

  const codes: string[] = [];
  for (let index = 0; index < snapshot.length; index += 1) {
    const item = snapshot.items[index].value;
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      item.length > 120 ||
      !REASON_CODE_PATTERN.test(item)
    ) {
      return null;
    }
    codes.push(item);
  }
  return Object.freeze(codes);
}

/**
 * Returns a canonical UTC timestamp only when the caller supplied an exact ISO
 * instant. There is deliberately no current-time fallback.
 */
export function parseVerdantSkillExecutionAt(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const canonical = new Date(milliseconds).toISOString();
  return canonical === value ? canonical : null;
}

/**
 * Inspect an untrusted JSON-like value without invoking getters or accepting
 * executable/sensitive values. The function never mutates the inspected value.
 */
export function inspectVerdantSkillData(value: unknown): VerdantSkillDataInspection {
  const issues = new Set<string>();
  const seen = new WeakSet<object>();
  let nodes = 0;
  let totalStringLength = 0;

  const visit = (current: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > VERDANT_SKILL_DATA_LIMITS.maximumNodes) {
      issues.add("data_node_limit_exceeded");
      return;
    }
    if (depth > VERDANT_SKILL_DATA_LIMITS.maximumDepth) {
      issues.add("data_depth_limit_exceeded");
      return;
    }

    if (current === null || typeof current === "boolean") return;

    if (typeof current === "string") {
      totalStringLength += current.length;
      if (current.length > VERDANT_SKILL_DATA_LIMITS.maximumStringLength) {
        issues.add("data_string_limit_exceeded");
      }
      if (totalStringLength > VERDANT_SKILL_DATA_LIMITS.maximumTotalStringLength) {
        issues.add("data_total_string_limit_exceeded");
      }
      return;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) issues.add("data_number_invalid");
      return;
    }

    if (typeof current !== "object") {
      issues.add("data_value_type_invalid");
      return;
    }

    if (seen.has(current)) {
      issues.add("data_reference_cycle");
      return;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      const snapshot = readExactArrayData(current, VERDANT_SKILL_DATA_LIMITS.maximumArrayItems);
      if (snapshot.ok === false) {
        issues.add(snapshot.issue);
        return;
      }
      for (let index = 0; index < snapshot.length; index += 1) {
        visit(snapshot.items[index].value, depth + 1);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      issues.add("data_prototype_invalid");
      return;
    }
    if (Object.getOwnPropertySymbols(current).length > 0) {
      issues.add("data_symbol_key_forbidden");
    }

    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Object.keys(descriptors);
    if (keys.length > VERDANT_SKILL_DATA_LIMITS.maximumObjectKeys) {
      issues.add("data_object_key_limit_exceeded");
      return;
    }

    for (const key of keys.sort()) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !("value" in descriptor)) {
        issues.add("data_accessor_forbidden");
        continue;
      }
      const normalizedKey = normalizeKey(key);
      if (
        BLOCKED_META_KEY_PATTERN.test(normalizedKey) ||
        SENSITIVE_KEY_PATTERN.test(normalizedKey)
      ) {
        issues.add("data_sensitive_key_forbidden");
        continue;
      }
      visit(descriptor.value, depth + 1);
    }
  };

  try {
    visit(value, 0);
  } catch {
    issues.add("data_inspection_failed");
  }
  const normalizedIssues = Object.freeze([...issues].sort());
  return {
    ok: normalizedIssues.length === 0,
    issues: normalizedIssues,
  };
}

export function applicableVerdantSkill<Input>(
  normalizedInput: Input,
  reasonCodes: readonly string[] = ["requirements_met"],
): VerdantSkillApplicabilityResult<Input> {
  const inspection = inspectVerdantSkillData(normalizedInput);
  if (!inspection.ok) {
    return invalidVerdantSkillApplicability(inspection.issues);
  }
  try {
    return Object.freeze({
      status: "applicable",
      normalizedInput: cloneAndFreezeData(normalizedInput),
      reasonCodes: stableCodes(reasonCodes, "requirements_met"),
    });
  } catch {
    return invalidVerdantSkillApplicability(["data_clone_failed"]);
  }
}

export function notApplicableVerdantSkill<Input = never>(
  reasonCodes: readonly string[],
): VerdantSkillApplicabilityResult<Input> {
  return Object.freeze({
    status: "not_applicable",
    reasonCodes: stableCodes(reasonCodes, "requirements_not_met"),
  });
}

export function invalidVerdantSkillApplicability<Input = never>(
  issues: readonly string[],
): VerdantSkillApplicabilityResult<Input> {
  return Object.freeze({
    status: "invalid",
    issues: stableCodes(issues, "input_invalid"),
  });
}

/**
 * Revalidate a skill-supplied assessment before the runtime trusts it.
 */
function validateVerdantSkillApplicabilityResultInternal<Input = unknown>(
  value: unknown,
): VerdantSkillApplicabilityValidation<Input> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, issues: Object.freeze(["applicability_shape_invalid"]) };
  }

  const statusDescriptor = Object.getOwnPropertyDescriptor(value, "status");
  if (!statusDescriptor || !("value" in statusDescriptor)) {
    return { ok: false, issues: Object.freeze(["applicability_shape_invalid"]) };
  }
  const status = statusDescriptor.value;

  if (status === "applicable") {
    if (!exactRecordKeys(value, ["status", "normalizedInput", "reasonCodes"])) {
      return { ok: false, issues: Object.freeze(["applicability_shape_invalid"]) };
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const normalizedInput = descriptors.normalizedInput.value;
    const reasonCodes = readReasonCodeArray(descriptors.reasonCodes.value);
    const inspection = inspectVerdantSkillData(normalizedInput);
    if (!inspection.ok || !reasonCodes) {
      return {
        ok: false,
        issues: inspection.ok
          ? Object.freeze(["applicability_reason_codes_invalid"])
          : inspection.issues,
      };
    }
    return {
      ok: true,
      result: applicableVerdantSkill(normalizedInput as Input, reasonCodes),
    };
  }

  if (status === "not_applicable") {
    if (!exactRecordKeys(value, ["status", "reasonCodes"])) {
      return { ok: false, issues: Object.freeze(["applicability_shape_invalid"]) };
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const reasonCodes = readReasonCodeArray(descriptors.reasonCodes.value);
    if (!reasonCodes) {
      return {
        ok: false,
        issues: Object.freeze(["applicability_reason_codes_invalid"]),
      };
    }
    return {
      ok: true,
      result: notApplicableVerdantSkill(reasonCodes),
    };
  }

  if (status === "invalid") {
    if (!exactRecordKeys(value, ["status", "issues"])) {
      return { ok: false, issues: Object.freeze(["applicability_shape_invalid"]) };
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const issues = readReasonCodeArray(descriptors.issues.value);
    if (!issues) {
      return {
        ok: false,
        issues: Object.freeze(["applicability_issues_invalid"]),
      };
    }
    return {
      ok: true,
      result: invalidVerdantSkillApplicability(issues),
    };
  }

  return { ok: false, issues: Object.freeze(["applicability_status_invalid"]) };
}

export function validateVerdantSkillApplicabilityResult<Input = unknown>(
  value: unknown,
): VerdantSkillApplicabilityValidation<Input> {
  try {
    return validateVerdantSkillApplicabilityResultInternal<Input>(value);
  } catch {
    return {
      ok: false,
      issues: Object.freeze(["applicability_shape_invalid"]),
    };
  }
}
