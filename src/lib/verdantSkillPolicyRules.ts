/**
 * Structural policy gates for Verdant Skill Runtime v1.
 *
 * Policy is evaluated before a handler runs and again against the raw handler
 * outcome. V1 permits local, deterministic analysis of supplied context only.
 * It has no write, model, network, hardware, or executable-code capability.
 */

import {
  inspectVerdantSkillData,
  VERDANT_SKILL_DATA_LIMITS,
} from "@/lib/verdantSkillApplicabilityRules";
import {
  validateVerdantSkillManifest,
  VERDANT_SKILL_V1_CAPABILITIES,
  VERDANT_SKILL_V1_POLICY_TAGS,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";

export type VerdantSkillPolicyPhase = "pre_execution" | "post_execution";

export interface VerdantSkillPolicyFinding {
  readonly code: string;
  readonly path: string;
  readonly severity: "block";
}

export interface VerdantSkillPolicyDecision {
  readonly allowed: boolean;
  readonly phase: VerdantSkillPolicyPhase;
  readonly findings: readonly VerdantSkillPolicyFinding[];
}

const ACTION_QUEUE_KEY_PATTERN =
  /^(?:action_queue|actionqueue|action_queue_item|actionqueueitem|action_queue_suggestion|actionqueuesuggestion|queue_row|queue_write|target_device)$/i;
const WRITE_KEY_PATTERN =
  /^(?:insert|update|upsert|delete|rpc|persist|persistence|database|table|mutation|write_effect|writeeffect)$/i;
const HARDWARE_KEY_PATTERN =
  /^(?:command|commands|device_?command|hardware_command|hardwarecommand|relay|actuator|mqtt|serial|bluetooth|webusb|home_assistant)$/i;
const NETWORK_KEY_PATTERN =
  /^(?:url|uri|endpoint|webhook|request|response|socket|websocket|network|http|headers|authorization)$/i;
const MODEL_KEY_PATTERN =
  /^(?:model|model_id|modelid|prompt|system_prompt|systemprompt|tool_call|toolcall|completion|provider)$/i;
const EXECUTABLE_KEY_PATTERN =
  /^(?:source_code|sourcecode|module|callback|function|script|executable|wasm|worker)$/i;
const ALERT_WRITE_KEY_PATTERN = /^(?:alert_write|alertwrite|alert_row|alertrow)$/i;
const SENSITIVE_KEY_PATTERN =
  /(?:^|_)(?:raw_payload|secret|secrets|token|tokens|api_key|service_role|password|credential|credentials|bearer|jwt)(?:_|$)/i;
const URL_VALUE_PATTERN = /\b(?:https?:\/\/|wss?:\/\/|www\.)/i;

const HARDWARE_IMPERATIVE_PATTERN =
  /\b(?:turn|switch|enable|disable|activate|deactivate|toggle|trigger|power|start|stop|open|close)\b(?:\s+(?:on|off|the|a|an|your|all|every|this|that))*\s+\b(?:fan|fans|light|lights|pump|pumps|heater|heaters|humidifier|humidifiers|dehumidifier|dehumidifiers|valve|valves|relay|actuator|outlet|socket|controller|hvac|exhaust|intake|dosing|injector|irrigation|sprinkler)\b/i;
const DIRECT_NEGATION_PATTERN =
  /\b(?:do\s+not|do\s*n['’]t|don['’]t|never|avoid|without|should\s*not|shouldn['’]t|no\s+need\s+to|refrain\s+from|cannot|can['’]t|must\s+not|mustn['’]t)\s*$/i;
const COMMAND_SCOPE_BOUNDARY_PATTERN = /\b(?:and|but|or|then|yet|while)\b/gi;

function finding(code: string, path: string): VerdantSkillPolicyFinding {
  return Object.freeze({ code, path, severity: "block" });
}

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function decision(
  phase: VerdantSkillPolicyPhase,
  findings: readonly VerdantSkillPolicyFinding[],
): VerdantSkillPolicyDecision {
  const stable = [...findings]
    .sort((left, right) => {
      const byCode = left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
      if (byCode !== 0) return byCode;
      return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
    })
    .filter(
      (item, index, all) =>
        index === 0 || item.code !== all[index - 1].code || item.path !== all[index - 1].path,
    );
  return Object.freeze({
    allowed: stable.length === 0,
    phase,
    findings: Object.freeze(stable),
  });
}

function containsImperativeHardwareControl(text: string): boolean {
  const clauses = text.split(/[.!?;\n,]+|[\u2014\u2013]|\s-\s/);
  return clauses.some((rawClause) => {
    const clause = rawClause.trim();
    if (clause.length === 0) return false;

    const commandMatcher = new RegExp(HARDWARE_IMPERATIVE_PATTERN.source, "gi");
    let commandMatch = commandMatcher.exec(clause);
    while (commandMatch) {
      const prefix = clause.slice(0, commandMatch.index);
      const boundaryMatcher = new RegExp(COMMAND_SCOPE_BOUNDARY_PATTERN.source, "gi");
      let localScopeStart = 0;
      let boundaryMatch = boundaryMatcher.exec(prefix);
      while (boundaryMatch) {
        localScopeStart = boundaryMatch.index + boundaryMatch[0].length;
        boundaryMatch = boundaryMatcher.exec(prefix);
      }

      const localPrefix = prefix.slice(localScopeStart);
      if (!DIRECT_NEGATION_PATTERN.test(localPrefix)) return true;
      commandMatch = commandMatcher.exec(clause);
    }
    return false;
  });
}

/**
 * Verify that a registered manifest grants only the fixed v1 capability set.
 * Validation reconstructs the manifest first, so self-declared extra fields or
 * permissions cannot be ignored.
 */
export function evaluateVerdantSkillPreExecutionPolicy(
  manifest: unknown,
): VerdantSkillPolicyDecision {
  const validation = validateVerdantSkillManifest(manifest);
  if (validation.ok === false) {
    return decision(
      "pre_execution",
      validation.reasonCodes.map((code) => finding(`policy.${code}`, "$.manifest")),
    );
  }

  const checked: VerdantSkillManifest = validation.manifest;
  const findings: VerdantSkillPolicyFinding[] = [];

  if (checked.activation !== "explicit") {
    findings.push(finding("policy.explicit_activation_required", "$.manifest.activation"));
  }
  if (checked.sideEffects !== "none") {
    findings.push(finding("policy.side_effects_forbidden", "$.manifest.sideEffects"));
  }
  if (
    checked.capabilities.length !== VERDANT_SKILL_V1_CAPABILITIES.length ||
    checked.capabilities.some(
      (capability, index) => capability !== VERDANT_SKILL_V1_CAPABILITIES[index],
    )
  ) {
    findings.push(finding("policy.capability_forbidden", "$.manifest.capabilities"));
  }
  if (
    checked.policyTags.length !== VERDANT_SKILL_V1_POLICY_TAGS.length ||
    checked.policyTags.some((tag, index) => tag !== VERDANT_SKILL_V1_POLICY_TAGS[index])
  ) {
    findings.push(finding("policy.fence_missing", "$.manifest.policyTags"));
  }

  return decision("pre_execution", findings);
}

/**
 * Defense-in-depth scan of the raw handler outcome. The skill-specific output
 * validator still runs afterward and must reconstruct a fixed-key contract.
 */
export function evaluateVerdantSkillPostExecutionPolicy(
  outcome: unknown,
): VerdantSkillPolicyDecision {
  const findings: VerdantSkillPolicyFinding[] = [];
  const inspection = inspectVerdantSkillData(outcome);
  if (!inspection.ok) {
    inspection.issues.forEach((issue) => {
      findings.push(finding(`policy.${issue}`, "$.outcome"));
    });
    return decision("post_execution", findings);
  }

  const visit = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (URL_VALUE_PATTERN.test(value)) {
        findings.push(finding("policy.network_reference_forbidden", path));
      }
      if (containsImperativeHardwareControl(value)) {
        findings.push(finding("policy.hardware_control_forbidden", path));
      }
      return;
    }
    if (value === null || typeof value !== "object") return;

    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
        string,
        PropertyDescriptor
      >;
      const lengthDescriptor = descriptors["length"];
      const lengthValue =
        lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
      if (
        typeof lengthValue !== "number" ||
        !Number.isInteger(lengthValue) ||
        lengthValue < 0 ||
        lengthValue > VERDANT_SKILL_DATA_LIMITS.maximumArrayItems
      ) {
        findings.push(finding("policy.data_inspection_failed", path));
        return;
      }
      for (let index = 0; index < lengthValue; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor)) {
          findings.push(finding("policy.data_inspection_failed", path));
          return;
        }
        visit(descriptor.value, `${path}[${index}]`);
      }
      return;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor)) continue;
      const childPath = `${path}.${key}`;
      const normalizedKey = normalizeKey(key);

      if (ACTION_QUEUE_KEY_PATTERN.test(normalizedKey) && descriptor.value !== null) {
        findings.push(finding("policy.action_queue_write_forbidden", childPath));
      } else if (WRITE_KEY_PATTERN.test(normalizedKey)) {
        findings.push(finding("policy.persistence_forbidden", childPath));
      } else if (HARDWARE_KEY_PATTERN.test(normalizedKey)) {
        findings.push(finding("policy.hardware_control_forbidden", childPath));
      } else if (NETWORK_KEY_PATTERN.test(normalizedKey)) {
        findings.push(finding("policy.network_forbidden", childPath));
      } else if (MODEL_KEY_PATTERN.test(normalizedKey)) {
        findings.push(finding("policy.model_integration_forbidden", childPath));
      } else if (EXECUTABLE_KEY_PATTERN.test(normalizedKey)) {
        findings.push(finding("policy.arbitrary_code_forbidden", childPath));
      } else if (ALERT_WRITE_KEY_PATTERN.test(normalizedKey)) {
        findings.push(finding("policy.alert_write_forbidden", childPath));
      } else if (SENSITIVE_KEY_PATTERN.test(normalizedKey)) {
        findings.push(finding("policy.sensitive_data_forbidden", childPath));
      }

      visit(descriptor.value, childPath);
    }
  };

  try {
    visit(outcome, "$.outcome");
  } catch {
    findings.push(finding("policy.data_inspection_failed", "$.outcome"));
  }
  return decision("post_execution", findings);
}
