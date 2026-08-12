import { createHash } from "node:crypto";

export const AI_CREDIT_SERVICE_CONTRACT_MIGRATION = Object.freeze({
  file: "20260727050000_ai_credit_service_contract_forward_reassert.sql",
  version: "20260727050000",
});

export const AI_CREDIT_SERVICE_SIGNATURES = Object.freeze({
  spend: "public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)",
  refund: "public.ai_credit_refund(uuid,uuid,text,text)",
});

const EXPECTED_IDENTITY_ARGUMENTS = Object.freeze({
  [AI_CREDIT_SERVICE_SIGNATURES.spend]: "uuid, text, text, uuid, text, text, jsonb",
  [AI_CREDIT_SERVICE_SIGNATURES.refund]: "uuid, uuid, text, text",
});

/**
 * Normalize only representation PostgreSQL may change without changing the
 * PL/pgSQL contract: comments, unquoted identifier/keyword case, and runs of
 * whitespace. Quoted strings and identifiers are preserved byte-for-byte.
 */
export function normalizeSqlDefinition(source) {
  if (typeof source !== "string") return "";

  let output = "";
  let index = 0;
  let state = "normal";
  let dollarTag = "";
  let blockDepth = 0;

  const appendSpace = () => {
    if (output && !output.endsWith(" ")) output += " ";
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] ?? "";

    if (state === "line-comment") {
      if (char === "\n" || char === "\r") {
        appendSpace();
        state = "normal";
      }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "/" && next === "*") {
        blockDepth += 1;
        index += 2;
        continue;
      }
      if (char === "*" && next === "/") {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) {
          appendSpace();
          state = "normal";
        }
        continue;
      }
      index += 1;
      continue;
    }

    if (state === "single-quote") {
      output += char;
      if (char === "'" && next === "'") {
        output += next;
        index += 2;
        continue;
      }
      if (char === "'") state = "normal";
      index += 1;
      continue;
    }

    if (state === "double-quote") {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        index += 2;
        continue;
      }
      if (char === '"') state = "normal";
      index += 1;
      continue;
    }

    // pg_get_functiondef wraps PL/pgSQL in one outer dollar quote. Treat that
    // delimiter as representation, then normalize the body as executable SQL.
    if (dollarTag && source.startsWith(dollarTag, index)) {
      appendSpace();
      index += dollarTag.length;
      dollarTag = "";
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block-comment";
      blockDepth = 1;
      index += 2;
      continue;
    }
    if (char === "'") {
      output += char;
      state = "single-quote";
      index += 1;
      continue;
    }
    if (char === '"') {
      output += char;
      state = "double-quote";
      index += 1;
      continue;
    }
    if (char === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(source.slice(index))?.[0];
      if (tag) {
        appendSpace();
        dollarTag = tag;
        index += tag.length;
        continue;
      }
    }
    if (/\s/.test(char)) {
      appendSpace();
      index += 1;
      continue;
    }

    output += char.toLowerCase();
    index += 1;
  }

  return output.trim();
}

function normalizeFragment(fragment) {
  return normalizeSqlDefinition(fragment);
}

function includesFragment(normalizedDefinition, fragment) {
  return normalizedDefinition.includes(normalizeFragment(fragment));
}

function checkIncludes(normalizedDefinition, id, fragment, category = "definition") {
  return {
    id,
    category,
    passed: includesFragment(normalizedDefinition, fragment),
  };
}

function checkOrdered(normalizedDefinition, id, fragments) {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = normalizedDefinition.indexOf(normalizeFragment(fragment), cursor + 1);
    if (next === -1) return { id, category: "definition", passed: false };
    cursor = next;
  }
  return { id, category: "definition", passed: true };
}

function secureSearchPath(proconfig) {
  if (!Array.isArray(proconfig)) return false;
  return proconfig.some(
    (entry) =>
      String(entry)
        .toLowerCase()
        .replace(/["'\s]/g, "") === "search_path=public,pg_temp",
  );
}

function sharedFunctionChecks(row, signature) {
  const normalizedDefinition = normalizeSqlDefinition(row?.definition);
  return [
    {
      id: "exact_signature_resolves_once",
      category: "definition",
      passed: row?.exact_match_count === 1,
    },
    {
      id: "identity_arguments_match",
      category: "definition",
      passed:
        typeof row?.identity_arguments === "string" &&
        row.identity_arguments.replace(/\s+/g, " ").trim() ===
          EXPECTED_IDENTITY_ARGUMENTS[signature],
    },
    {
      id: "definition_readable",
      category: "readability",
      passed: row?.exact_match_count !== 1 || normalizedDefinition.length > 0,
    },
    {
      id: "returns_jsonb",
      category: "definition",
      passed: String(row?.result_type ?? "").toLowerCase() === "jsonb",
    },
    {
      id: "language_plpgsql",
      category: "definition",
      passed: String(row?.language ?? "").toLowerCase() === "plpgsql",
    },
    {
      id: "security_definer",
      category: "definition",
      passed: row?.security_definer === true,
    },
    {
      id: "pinned_search_path",
      category: "definition",
      passed: secureSearchPath(row?.proconfig),
    },
    {
      id: "service_role_execute",
      category: "privilege",
      passed: row?.service_role_execute === true,
    },
    {
      id: "authenticated_execute_revoked",
      category: "privilege",
      passed: row?.authenticated_execute === false,
    },
    {
      id: "anon_execute_revoked",
      category: "privilege",
      passed: row?.anon_execute === false,
    },
  ];
}

function spendChecks(row) {
  const definition = normalizeSqlDefinition(row?.definition);
  const shared = sharedFunctionChecks(row, AI_CREDIT_SERVICE_SIGNATURES.spend);
  if (!definition) return shared;
  return [
    ...shared,
    checkIncludes(
      definition,
      "service_role_guard",
      "IF v_role IS DISTINCT FROM 'service_role' THEN",
    ),
    checkIncludes(
      definition,
      "environment_allowlist",
      "p_billing_environment NOT IN ('live', 'sandbox')",
    ),
    checkIncludes(
      definition,
      "feature_allowlist",
      "p_feature NOT IN ('ai_doctor_review','ai_coach')",
    ),
    checkIncludes(
      definition,
      "model_tier_allowlist",
      "p_model_tier NOT IN ('standard','escalated')",
    ),
    checkIncludes(definition, "inline_result_rejected", "IF p_result IS NOT NULL THEN"),
    checkIncludes(definition, "inline_result_reason", "'inline_result_not_allowed'"),
    checkIncludes(
      definition,
      "user_serialization_lock",
      "PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));",
    ),
    checkIncludes(
      definition,
      "grow_owner_predicate",
      "grow_row.id = p_grow_id AND grow_row.user_id = v_uid",
    ),
    checkIncludes(definition, "grow_row_lock", "FOR SHARE;"),
    checkIncludes(definition, "grow_not_owned_rejection", "'grow_not_owned'"),
    checkIncludes(
      definition,
      "result_sidecar_join",
      "LEFT JOIN public.ai_credit_spend_results cache",
    ),
    checkIncludes(
      definition,
      "cached_result_precedence",
      "COALESCE(cache.result, spend.result) AS cached_result",
    ),
    checkIncludes(
      definition,
      "refund_aware_replay",
      "reversal.refund_of = spend.id AND reversal.status = 'refunded'",
    ),
    checkIncludes(
      definition,
      "idempotency_feature_bound",
      "v_existing.feature IS DISTINCT FROM p_feature",
    ),
    checkIncludes(
      definition,
      "idempotency_grow_bound",
      "v_existing.grow_id IS DISTINCT FROM p_grow_id",
    ),
    checkIncludes(
      definition,
      "idempotency_tier_bound",
      "v_existing.model_tier IS DISTINCT FROM p_model_tier",
    ),
    checkIncludes(
      definition,
      "idempotency_environment_bound",
      "v_existing.server_billing_environment IS DISTINCT FROM p_billing_environment",
    ),
    checkIncludes(definition, "idempotency_conflict_rejected", "'idempotency_key_conflict'"),
    checkIncludes(definition, "refunded_spend_rejected", "'spend_refunded'"),
    checkIncludes(
      definition,
      "craft_entitlement_supported",
      "s.price_id IN ('pro_monthly','pro_annual','craft_monthly','craft_annual')",
    ),
    checkIncludes(
      definition,
      "pack_spends_excluded_from_allowance",
      "->> 'funded_by') IS DISTINCT FROM 'pack'",
    ),
    checkIncludes(definition, "grant_balance_derived", "FROM public.ai_credit_grants"),
    checkIncludes(definition, "pack_usage_derived", "->> 'funded_by') = 'pack'"),
    checkOrdered(definition, "allowance_before_pack", [
      "IF v_used + v_weight <= v_limit THEN",
      "v_funded_by := 'allowance';",
      "v_pack_balance >= v_weight THEN",
      "v_funded_by := 'pack';",
    ]),
    checkIncludes(definition, "financial_row_stores_no_result", "p_idempotency_key, NULL,"),
    checkIncludes(
      definition,
      "billing_environment_recorded",
      "'server_billing_environment', p_billing_environment",
    ),
    checkIncludes(definition, "funding_source_recorded", "'funded_by', v_funded_by"),
    checkOrdered(definition, "lock_and_ownership_precede_replay", [
      "PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));",
      "FROM public.grows grow_row",
      "FROM public.ai_credit_spends spend",
    ]),
  ];
}

function refundChecks(row) {
  const definition = normalizeSqlDefinition(row?.definition);
  const shared = sharedFunctionChecks(row, AI_CREDIT_SERVICE_SIGNATURES.refund);
  if (!definition) return shared;
  return [
    ...shared,
    checkIncludes(
      definition,
      "service_role_guard",
      "IF v_role IS DISTINCT FROM 'service_role' THEN",
    ),
    checkIncludes(definition, "expected_user_required", "IF v_uid IS NULL THEN"),
    checkIncludes(definition, "spend_id_required", "IF p_spend_id IS NULL THEN"),
    checkIncludes(
      definition,
      "user_serialization_lock",
      "PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));",
    ),
    checkIncludes(
      definition,
      "idempotency_scoped_to_user",
      "WHERE user_id = v_uid AND idempotency_key = p_idempotency_key",
    ),
    checkIncludes(
      definition,
      "idempotent_refund_replay",
      "v_existing_by_key.status = 'refunded' AND v_existing_by_key.refund_of = p_spend_id",
    ),
    checkIncludes(definition, "idempotency_conflict_rejected", "'idempotency_key_conflict'"),
    checkIncludes(
      definition,
      "original_funding_metadata_loaded",
      "model_tier, feature, status, meta",
    ),
    checkIncludes(
      definition,
      "refund_user_and_status_bound",
      "v_orig.user_id <> v_uid OR v_orig.status <> 'spent'",
    ),
    checkIncludes(definition, "one_refund_per_spend", "WHERE refund_of = p_spend_id"),
    checkIncludes(definition, "append_only_negative_reversal", "-v_orig.weight"),
    checkIncludes(definition, "reversal_links_original", "p_idempotency_key, p_spend_id"),
    checkIncludes(
      definition,
      "funding_source_preserved",
      "'funded_by', v_orig.meta ->> 'funded_by'",
    ),
  ];
}

function sidecarChecks(sidecar) {
  return [
    { id: "result_sidecar_exists", category: "privilege", passed: sidecar?.exists === true },
    {
      id: "service_role_can_read_result_sidecar",
      category: "privilege",
      passed: sidecar?.service_role_select === true,
    },
    ...["insert", "update", "delete"].map((privilege) => ({
      id: `service_role_${privilege}_result_sidecar_revoked`,
      category: "privilege",
      passed: sidecar?.[`service_role_${privilege}`] === false,
    })),
    ...["select", "insert", "update", "delete"].flatMap((privilege) =>
      ["authenticated", "anon"].map((role) => ({
        id: `${role}_${privilege}_result_sidecar_revoked`,
        category: "privilege",
        passed: sidecar?.[`${role}_${privilege}`] === false,
      })),
    ),
  ];
}

function summarizeFunction(row, checks) {
  const failed = checks.filter((check) => !check.passed);
  const definition = typeof row?.definition === "string" ? row.definition : "";
  return {
    signature: row?.signature ?? "unknown",
    definition_sha256: definition
      ? createHash("sha256").update(normalizeSqlDefinition(definition)).digest("hex")
      : null,
    check_count: checks.length,
    failed_checks: failed.map(({ id, category }) => ({ id, category })),
  };
}

/**
 * Convert one database observation into four independent, tri-state statuses.
 * `null` means unknown; it is never serialized as a reassuring `false`.
 */
export function evaluateAiCreditServiceContractObservation(observation) {
  if (!observation || typeof observation !== "object") {
    throw new TypeError("Database observation must be an object.");
  }
  if (typeof observation.migration_applied !== "boolean") {
    throw new TypeError("Database observation did not include a boolean migration_applied.");
  }
  if (!Array.isArray(observation.functions)) {
    throw new TypeError("Database observation did not include a functions array.");
  }

  const rowsBySignature = new Map(observation.functions.map((row) => [row?.signature, row]));
  const expectedSignatures = Object.values(AI_CREDIT_SERVICE_SIGNATURES);
  if (
    observation.functions.length !== expectedSignatures.length ||
    rowsBySignature.size !== expectedSignatures.length ||
    expectedSignatures.some((signature) => !rowsBySignature.has(signature))
  ) {
    throw new TypeError(
      "Database observation did not contain exactly one row for each exact service signature.",
    );
  }
  const spendRow = rowsBySignature.get(AI_CREDIT_SERVICE_SIGNATURES.spend);
  const refundRow = rowsBySignature.get(AI_CREDIT_SERVICE_SIGNATURES.refund);
  const spend = summarizeFunction(spendRow, spendChecks(spendRow));
  const refund = summarizeFunction(refundRow, refundChecks(refundRow));
  const functionSummaries = [spend, refund];
  const sidecar = sidecarChecks(observation.result_sidecar);

  const allFailures = [
    ...functionSummaries.flatMap((item) => item.failed_checks),
    ...sidecar.filter((check) => !check.passed).map(({ id, category }) => ({ id, category })),
  ];
  const readabilityBlocked = allFailures.some((failure) => failure.category === "readability");
  const definitionDrift = allFailures.some((failure) => failure.category === "definition");
  const contractFailure = allFailures.some((failure) => failure.category !== "readability");

  return {
    schema_version: 1,
    tool: "verify-ai-credit-service-contract-effect",
    target_env: observation.target_env ?? "unspecified",
    checked_at: new Date().toISOString(),
    statuses: {
      migration_applied: observation.migration_applied,
      contract_effective: contractFailure ? false : readabilityBlocked ? null : true,
      definition_drift_detected: definitionDrift ? true : readabilityBlocked ? null : false,
      verification_blocked: readabilityBlocked,
    },
    migration: AI_CREDIT_SERVICE_CONTRACT_MIGRATION,
    functions: functionSummaries,
    result_sidecar: {
      check_count: sidecar.length,
      failed_checks: sidecar
        .filter((check) => !check.passed)
        .map(({ id, category }) => ({ id, category })),
    },
  };
}

export function blockedAiCreditServiceContractReport(targetEnv, reason) {
  return {
    schema_version: 1,
    tool: "verify-ai-credit-service-contract-effect",
    target_env: targetEnv,
    checked_at: new Date().toISOString(),
    statuses: {
      migration_applied: null,
      contract_effective: null,
      definition_drift_detected: null,
      verification_blocked: true,
    },
    migration: AI_CREDIT_SERVICE_CONTRACT_MIGRATION,
    functions: [],
    result_sidecar: { check_count: 0, failed_checks: [] },
    blocked_reason: reason,
  };
}
