/**
 * Deterministic, read-only rules for the operator RLS + policy audit.
 *
 * These checks compare catalog evidence with the repository's intended
 * table-level access profiles. Policy-expression checks are deliberately
 * conservative heuristics, not a formal proof of authorization behavior.
 */

export type AuditRole = "PUBLIC" | "anon" | "authenticated" | "service_role";
export type TableAccessProfile =
  | "owner_crud"
  | "authenticated_read_only"
  | "append_select_insert"
  | "owner_preference_update"
  | "service_only"
  | "unknown";

export type RlsAuditGrants = Partial<Record<AuditRole, string[]>>;
export type RlsAuditColumnGrants = Partial<Record<AuditRole, Record<string, string[]>>>;

export interface RlsPolicyAudit {
  name: string;
  command: string;
  roles: string[];
  permissive: boolean | null;
  qual: string | null;
  with_check: string | null;
}

export interface RlsAuditInput {
  table: string;
  exists: boolean;
  rls_enabled: boolean | null;
  rls_forced: boolean | null;
  policy_count: number | null;
  grants: RlsAuditGrants | null;
  column_grants: RlsAuditColumnGrants | null;
  policies: RlsPolicyAudit[] | null;
  access_profile: TableAccessProfile;
}

export type RlsFindingSeverity = "critical" | "warning" | "unverified" | "info";

export interface RlsFinding {
  table: string;
  severity: RlsFindingSeverity;
  code:
    | "table_missing"
    | "table_existence_unverified"
    | "access_profile_unknown"
    | "rls_state_unverified"
    | "rls_disabled"
    | "policies_unverified"
    | "policy_count_mismatch"
    | "required_policy_missing"
    | "grants_unverified"
    | "column_grants_unverified"
    | "public_or_anon_grant"
    | "public_or_anon_column_grant"
    | "authenticated_grants_mismatch"
    | "authenticated_column_grants_mismatch"
    | "service_role_missing_crud"
    | "policy_public_or_anon_role"
    | "policy_literal_true"
    | "policy_missing_using"
    | "policy_missing_with_check"
    | "owner_policy_missing_identity"
    | "unsafe_permissive_policy";
  message: string;
  detail?: string;
}

export const SCHEMA_AUDIT_ACCESS_PROFILES = {
  // User-owned lifecycle tables with direct authenticated CRUD.
  plants: "owner_crud",
  tents: "owner_crud",
  soil_moisture_calibrations: "owner_crud",
  pheno_crosses: "owner_crud",

  // Append surfaces: authenticated users can read and insert, not mutate history.
  action_queue: "append_select_insert",
  pheno_reversals: "append_select_insert",

  // Server-written or narrowly RPC-written tables with owner-scoped client reads.
  ai_credit_grants: "authenticated_read_only",
  ai_credit_spends: "authenticated_read_only",
  billing_subscriptions: "authenticated_read_only",
  feeding_events: "authenticated_read_only",
  founders: "owner_preference_update",
  quicklog_audit_events: "authenticated_read_only",
  quicklog_idempotency: "authenticated_read_only",
  referrals: "authenticated_read_only",
  subscriptions: "authenticated_read_only",
} as const satisfies Record<string, Exclude<TableAccessProfile, "unknown">>;

const AUTHENTICATED_COLUMN_GRANTS = {
  founders: {
    display_name: ["UPDATE"],
    display_style: ["UPDATE"],
    optional_link: ["UPDATE"],
    show_on_wall: ["UPDATE"],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

const CRUD = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
const BROWSER_ROLES = new Set(["PUBLIC", "anon", "authenticated"]);
const AUTH_UID_EXPRESSION = String.raw`auth\s*\.\s*uid\s*\(\s*\)(?:::[a-z0-9_".]+)?`;
const IDENTITY_COLUMN_EXPRESSION = String.raw`(?:(?:"?[a-z0-9_]+"?)\.)?"?(?:user_id|owner_id|created_by|referrer_id)"?(?:::[a-z0-9_".]+)?`;
const IDENTITY_COMPARISON = new RegExp(
  String.raw`^(?:${AUTH_UID_EXPRESSION}\s*=\s*${IDENTITY_COLUMN_EXPRESSION}|${IDENTITY_COLUMN_EXPRESSION}\s*=\s*${AUTH_UID_EXPRESSION})$`,
  "i",
);
const PRIVILEGED_ROLE_CHECK = new RegExp(
  String.raw`^(?:[a-z0-9_"]+\.)?has_role\s*\(\s*${AUTH_UID_EXPRESSION}\s*,\s*['"](?:operator|staff)['"](?:\s*::[a-z0-9_".]+)?\s*\)$`,
  "i",
);

function normalizedPrivileges(privileges: unknown): string[] {
  return Array.from(
    new Set(
      (Array.isArray(privileges) ? privileges : [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toUpperCase()),
    ),
  ).sort();
}

function completePrivilegeList(privileges: unknown): privileges is string[] {
  return (
    Array.isArray(privileges) &&
    privileges.every((privilege) => typeof privilege === "string" && privilege.length > 0)
  );
}

function expectedAuthenticatedPrivileges(profile: TableAccessProfile): readonly string[] | null {
  switch (profile) {
    case "owner_crud":
      return CRUD;
    case "authenticated_read_only":
      return ["SELECT"];
    case "append_select_insert":
      return ["SELECT", "INSERT"];
    case "owner_preference_update":
      return ["SELECT"];
    case "service_only":
      return [];
    case "unknown":
      return null;
  }
}

function normalizedColumnGrants(value: unknown): Record<string, string[]> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const normalized: Record<string, string[]> = {};
  for (const [column, privileges] of Object.entries(value)) {
    if (
      column.length === 0 ||
      !Array.isArray(privileges) ||
      privileges.length === 0 ||
      !privileges.every((privilege) => typeof privilege === "string" && privilege.length > 0)
    ) {
      return null;
    }
    normalized[column] = normalizedPrivileges(privileges);
  }
  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sameColumnGrants(
  actual: Record<string, string[]>,
  expected: Record<string, readonly string[]>,
): boolean {
  const actualColumns = Object.keys(actual).sort();
  const expectedColumns = Object.keys(expected).sort();
  return (
    sameMembers(actualColumns, expectedColumns) &&
    expectedColumns.every((column) => sameMembers(actual[column] ?? [], expected[column] ?? []))
  );
}

function columnGrantSummary(grants: Record<string, readonly string[]>): string {
  return (
    Object.entries(grants)
      .map(([column, privileges]) => `${column}:${privileges.join("/")}`)
      .join(", ") || "(none)"
  );
}

function sameMembers(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && expected.every((privilege) => actual.includes(privilege))
  );
}

function completePolicyEvidence(policy: unknown): policy is RlsPolicyAudit {
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) return false;
  const candidate = policy as Partial<RlsPolicyAudit>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    typeof candidate.command === "string" &&
    candidate.command.length > 0 &&
    Array.isArray(candidate.roles) &&
    candidate.roles.every((role) => typeof role === "string") &&
    typeof candidate.permissive === "boolean" &&
    (candidate.qual === null || typeof candidate.qual === "string") &&
    (candidate.with_check === null || typeof candidate.with_check === "string")
  );
}

function policyRoles(policy: RlsPolicyAudit): string[] {
  return Array.from(
    new Set(
      (policy.roles ?? []).map((role) =>
        role.toLowerCase() === "public" ? "PUBLIC" : role.toLowerCase(),
      ),
    ),
  );
}

function isLiteralTrue(expression: string | null): boolean {
  if (!expression) return false;
  let normalized = expression.trim().replace(/\s+/g, "");
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1);
  }
  return /^(?:true(?:::boolean)?|'true'::boolean)$/i.test(normalized);
}

function hasBalancedOuterParentheses(expression: string): boolean {
  if (!expression.startsWith("(") || !expression.endsWith(")")) return false;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (quote) {
      if (character === quote && expression[index + 1] === quote) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0 && index < expression.length - 1) return false;
  }
  return depth === 0 && quote === null;
}

function stripOuterParentheses(expression: string): string {
  let stripped = expression.trim();
  while (hasBalancedOuterParentheses(stripped)) {
    stripped = stripped.slice(1, -1).trim();
  }
  return stripped;
}

function splitTopLevelBoolean(expression: string, keyword: "and" | "or"): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  const lower = expression.toLowerCase();

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (quote) {
      if (character === quote && expression[index + 1] === quote) {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth -= 1;
      continue;
    }
    if (
      depth === 0 &&
      lower.slice(index, index + keyword.length) === keyword &&
      !/[a-z0-9_]/i.test(expression[index - 1] ?? "") &&
      !/[a-z0-9_]/i.test(expression[index + keyword.length] ?? "")
    ) {
      parts.push(expression.slice(start, index).trim());
      start = index + keyword.length;
      index += keyword.length - 1;
    }
  }

  if (parts.length === 0) return [expression];
  parts.push(expression.slice(start).trim());
  return parts;
}

function isIdentityScoped(expression: string | null): boolean {
  if (!expression) return false;
  const normalized = stripOuterParentheses(expression);
  const orBranches = splitTopLevelBoolean(normalized, "or");
  if (orBranches.length > 1) return orBranches.every(isIdentityScoped);
  const andBranches = splitTopLevelBoolean(normalized, "and");
  if (andBranches.length > 1) return andBranches.some(isIdentityScoped);
  return IDENTITY_COMPARISON.test(normalized) || PRIVILEGED_ROLE_CHECK.test(normalized);
}

function policyEvidenceLabel(policy: unknown): string {
  if (
    typeof policy === "object" &&
    policy !== null &&
    "name" in policy &&
    typeof policy.name === "string"
  ) {
    return policy.name;
  }
  return "(unnamed policy)";
}

function requiredPolicyCommands(profile: TableAccessProfile): readonly string[] {
  if (profile === "owner_preference_update") return ["SELECT", "UPDATE"];
  return expectedAuthenticatedPrivileges(profile) ?? [];
}

function policyCoversCommand(policy: unknown, command: string): boolean {
  if (!completePolicyEvidence(policy)) return false;
  const roles = policyRoles(policy);
  if (!roles.includes("authenticated") || policy.permissive !== true) return false;
  const policyCommand = policy.command.toUpperCase();
  return policyCommand === "ALL" || policyCommand === command;
}

function addMissingClauseFindings(
  row: RlsAuditInput,
  policy: RlsPolicyAudit,
  findings: RlsFinding[],
) {
  const command = policy.command.toUpperCase();
  const needsUsing =
    command === "SELECT" || command === "UPDATE" || command === "DELETE" || command === "ALL";
  const needsCheck = command === "INSERT" || command === "UPDATE" || command === "ALL";

  if (needsUsing && !policy.qual?.trim()) {
    findings.push({
      table: row.table,
      severity: "critical",
      code: "policy_missing_using",
      message: `Policy ${policy.name} is missing USING for ${command}.`,
    });
  }
  if (needsCheck && !policy.with_check?.trim()) {
    findings.push({
      table: row.table,
      severity: "critical",
      code: "policy_missing_with_check",
      message: `Policy ${policy.name} is missing WITH CHECK for ${command}.`,
    });
  }
}

function addPolicySafetyFindings(
  row: RlsAuditInput,
  policy: RlsPolicyAudit,
  findings: RlsFinding[],
) {
  const roles = policyRoles(policy);
  const browserPolicy = roles.some((role) => BROWSER_ROLES.has(role));
  const publicRoles = roles.filter((role) => role === "PUBLIC" || role === "anon");

  if (publicRoles.length > 0) {
    findings.push({
      table: row.table,
      severity: "critical",
      code: "policy_public_or_anon_role",
      message: `Policy ${policy.name} applies to a public browser role.`,
      detail: publicRoles.join(", "),
    });
  }

  if (!browserPolicy) return;

  addMissingClauseFindings(row, policy, findings);

  const literalTrueClauses = [
    isLiteralTrue(policy.qual) ? "USING" : null,
    isLiteralTrue(policy.with_check) ? "WITH CHECK" : null,
  ].filter((value): value is string => value !== null);
  if (literalTrueClauses.length > 0) {
    findings.push({
      table: row.table,
      severity: "critical",
      code: "policy_literal_true",
      message: `Policy ${policy.name} contains an unconditional true expression.`,
      detail: literalTrueClauses.join(", "),
    });
  }

  const command = policy.command.toUpperCase();
  const scopedPolicy =
    command === "SELECT" ||
    command === "INSERT" ||
    command === "UPDATE" ||
    command === "DELETE" ||
    command === "ALL";
  if (!scopedPolicy || policy.permissive !== true || !roles.includes("authenticated")) return;

  const expressions = [
    command === "INSERT" ? null : policy.qual,
    command === "DELETE" ? null : policy.with_check,
  ].filter((value): value is string | null => value !== null);
  const identityScoped = expressions.length > 0 && expressions.every(isIdentityScoped);
  if (identityScoped) return;

  const dmlPolicy =
    command === "INSERT" || command === "UPDATE" || command === "DELETE" || command === "ALL";
  const ownerNamed = dmlPolicy && /\bown(?:er)?\b/i.test(policy.name);
  findings.push({
    table: row.table,
    severity: "critical",
    code: ownerNamed ? "owner_policy_missing_identity" : "unsafe_permissive_policy",
    message: ownerNamed
      ? `Owner DML policy ${policy.name} is missing a recognizable auth.uid() ownership check.`
      : `Permissive policy ${policy.name} is not recognizably owner- or operator-scoped.`,
    detail: "Heuristic review only; inspect the complete policy expression before remediation.",
  });
}

export function accessProfileForTable(table: string): TableAccessProfile {
  return (
    SCHEMA_AUDIT_ACCESS_PROFILES[table as keyof typeof SCHEMA_AUDIT_ACCESS_PROFILES] ?? "unknown"
  );
}

export function evaluateRlsAudit(rows: RlsAuditInput[]): RlsFinding[] {
  const findings: RlsFinding[] = [];

  for (const row of rows) {
    if (typeof row.exists !== "boolean") {
      findings.push({
        table: typeof row.table === "string" ? row.table : "(unknown table)",
        severity: "unverified",
        code: "table_existence_unverified",
        message: "Table existence was not returned as a boolean.",
      });
      continue;
    }
    if (row.exists === false) {
      findings.push({
        table: row.table,
        severity: "critical",
        code: "table_missing",
        message: "Table does not exist in the live schema.",
      });
      continue;
    }

    if (row.access_profile === "unknown") {
      findings.push({
        table: row.table,
        severity: "unverified",
        code: "access_profile_unknown",
        message: "No reviewed repository access profile exists for this table.",
      });
    }

    if (typeof row.rls_enabled !== "boolean" || typeof row.rls_forced !== "boolean") {
      findings.push({
        table: row.table,
        severity: "unverified",
        code: "rls_state_unverified",
        message: "RLS state was not returned completely.",
      });
    } else if (!row.rls_enabled) {
      findings.push({
        table: row.table,
        severity: "critical",
        code: "rls_disabled",
        message: "Row-level security is not enabled.",
      });
    }

    if (!row.grants) {
      findings.push({
        table: row.table,
        severity: "unverified",
        code: "grants_unverified",
        message: "Direct table grants were not returned.",
      });
    } else {
      const missingGrantRoles = (
        ["PUBLIC", "anon", "authenticated", "service_role"] as const
      ).filter((role) => !completePrivilegeList(row.grants?.[role]));
      if (missingGrantRoles.length > 0) {
        findings.push({
          table: row.table,
          severity: "unverified",
          code: "grants_unverified",
          message: "Direct table grants are incomplete.",
          detail: `missing roles: ${missingGrantRoles.join(", ")}`,
        });
      }

      for (const role of ["PUBLIC", "anon"] as const) {
        const privileges = normalizedPrivileges(row.grants[role]);
        if (privileges.length > 0) {
          findings.push({
            table: row.table,
            severity: "critical",
            code: "public_or_anon_grant",
            message: `${role} has a direct grant on this private table.`,
            detail: privileges.join(", "),
          });
        }
      }

      const expected = expectedAuthenticatedPrivileges(row.access_profile);
      if (expected) {
        const actual = normalizedPrivileges(row.grants.authenticated);
        if (!sameMembers(actual, expected)) {
          findings.push({
            table: row.table,
            severity: "warning",
            code: "authenticated_grants_mismatch",
            message: `authenticated grants do not match the ${row.access_profile} profile.`,
            detail: `expected: ${expected.join(", ") || "(none)"}; has: ${actual.join(", ") || "(none)"}`,
          });
        }
      }

      const servicePrivileges = normalizedPrivileges(row.grants["service_role"]);
      if (!CRUD.every((privilege) => servicePrivileges.includes(privilege))) {
        findings.push({
          table: row.table,
          severity: "warning",
          code: "service_role_missing_crud",
          message: "service_role is missing one or more table CRUD grants.",
          detail: `has: ${servicePrivileges.join(", ") || "(none)"}`,
        });
      }
    }

    if (!row.column_grants) {
      findings.push({
        table: row.table,
        severity: "unverified",
        code: "column_grants_unverified",
        message: "Direct column grants were not returned.",
      });
    } else {
      const roles = ["PUBLIC", "anon", "authenticated", "service_role"] as const;
      const normalizedByRole = new Map<AuditRole, Record<string, string[]>>();
      const malformedRoles: AuditRole[] = [];
      for (const role of roles) {
        const normalized = normalizedColumnGrants(row.column_grants[role]);
        if (!normalized) malformedRoles.push(role);
        else normalizedByRole.set(role, normalized);
      }

      if (malformedRoles.length > 0) {
        findings.push({
          table: row.table,
          severity: "unverified",
          code: "column_grants_unverified",
          message: "Direct column grants are incomplete or malformed.",
          detail: `roles: ${malformedRoles.join(", ")}`,
        });
      }

      for (const role of ["PUBLIC", "anon"] as const) {
        const grants = normalizedByRole.get(role);
        if (grants && Object.keys(grants).length > 0) {
          findings.push({
            table: row.table,
            severity: "critical",
            code: "public_or_anon_column_grant",
            message: `${role} has a direct column grant on this private table.`,
            detail: columnGrantSummary(grants),
          });
        }
      }

      const authenticatedGrants = normalizedByRole.get("authenticated");
      if (authenticatedGrants) {
        const expected =
          AUTHENTICATED_COLUMN_GRANTS[row.table as keyof typeof AUTHENTICATED_COLUMN_GRANTS] ?? {};
        if (!sameColumnGrants(authenticatedGrants, expected)) {
          findings.push({
            table: row.table,
            severity: "warning",
            code: "authenticated_column_grants_mismatch",
            message: `authenticated column grants do not match the ${row.access_profile} profile.`,
            detail: `expected: ${columnGrantSummary(expected)}; has: ${columnGrantSummary(authenticatedGrants)}`,
          });
        }
      }
    }

    if (!Array.isArray(row.policies) || !Number.isInteger(row.policy_count)) {
      findings.push({
        table: row.table,
        severity: "unverified",
        code: "policies_unverified",
        message: "Policy definitions were not returned completely.",
      });
      continue;
    }

    if (row.policy_count !== row.policies.length) {
      findings.push({
        table: row.table,
        severity: "unverified",
        code: "policy_count_mismatch",
        message: "Policy count does not match the returned policy definitions.",
        detail: `count: ${row.policy_count}; definitions: ${row.policies.length}`,
      });
    }

    for (const policy of row.policies) {
      if (!completePolicyEvidence(policy)) {
        findings.push({
          table: row.table,
          severity: "unverified",
          code: "policies_unverified",
          message: "At least one policy definition is incomplete.",
          detail: policyEvidenceLabel(policy),
        });
        continue;
      }
      addPolicySafetyFindings(row, policy, findings);
    }

    for (const command of requiredPolicyCommands(row.access_profile)) {
      if (!row.policies.some((policy) => policyCoversCommand(policy, command))) {
        findings.push({
          table: row.table,
          severity: "warning",
          code: "required_policy_missing",
          message: `No authenticated ${command} policy was returned for the ${row.access_profile} profile.`,
        });
      }
    }
  }

  return findings;
}

export function summarizeRlsFindings(findings: RlsFinding[]) {
  return {
    total: findings.length,
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    unverified: findings.filter((finding) => finding.severity === "unverified").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
}

export function rlsPostureForTable(
  table: string,
  findings: RlsFinding[],
): "critical" | "warning" | "unverified" | "ready" {
  const tableFindings = findings.filter((finding) => finding.table === table);
  if (tableFindings.some((finding) => finding.severity === "critical")) return "critical";
  if (tableFindings.some((finding) => finding.severity === "warning")) return "warning";
  if (tableFindings.some((finding) => finding.severity === "unverified")) return "unverified";
  return "ready";
}
