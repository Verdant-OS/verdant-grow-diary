/**
 * Pure rules for the operator RLS + policy audit.
 *
 * Given the raw per-table snapshot returned by admin_schema_audit's rls_audit
 * payload, classify each table's posture and surface findings a human should
 * review. This is presentation-only guidance — it never grants or revokes
 * anything itself.
 */

export type RlsAuditGrants = Partial<Record<"anon" | "authenticated" | "service_role", string[]>>;

export interface RlsAuditInput {
  table: string;
  exists: boolean;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: number;
  grants: RlsAuditGrants;
}

export type RlsFindingSeverity = "critical" | "warning" | "info";

export interface RlsFinding {
  table: string;
  severity: RlsFindingSeverity;
  code:
    | "table_missing"
    | "rls_disabled"
    | "rls_enabled_no_policies"
    | "anon_write_grant"
    | "anon_read_grant"
    | "authenticated_missing_crud"
    | "service_role_missing_all";
  message: string;
  detail?: string;
}

const CRUD = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
const WRITE_PRIVS = new Set(["INSERT", "UPDATE", "DELETE", "TRUNCATE"]);

function hasAll(privs: string[] | undefined, required: readonly string[]): boolean {
  if (!privs) return false;
  const set = new Set(privs);
  return required.every((p) => set.has(p));
}

export function evaluateRlsAudit(rows: RlsAuditInput[]): RlsFinding[] {
  const findings: RlsFinding[] = [];

  for (const row of rows) {
    if (!row.exists) {
      findings.push({
        table: row.table,
        severity: "critical",
        code: "table_missing",
        message: "Table does not exist in the live schema.",
      });
      continue;
    }

    if (!row.rls_enabled) {
      findings.push({
        table: row.table,
        severity: "critical",
        code: "rls_disabled",
        message: "Row-level security is not enabled.",
      });
    } else if (row.policy_count === 0) {
      findings.push({
        table: row.table,
        severity: "warning",
        code: "rls_enabled_no_policies",
        message: "RLS is enabled but no policies exist — all non-service_role access is denied.",
      });
    }

    const anonPrivs = row.grants.anon ?? [];
    const anonWrites = anonPrivs.filter((p) => WRITE_PRIVS.has(p));
    if (anonWrites.length > 0) {
      findings.push({
        table: row.table,
        severity: "critical",
        code: "anon_write_grant",
        message: "Anonymous role has write privileges.",
        detail: anonWrites.join(", "),
      });
    }
    if (anonPrivs.includes("SELECT")) {
      findings.push({
        table: row.table,
        severity: "info",
        code: "anon_read_grant",
        message: "Anonymous role has SELECT. Confirm this table is intentionally public.",
      });
    }

    if (!hasAll(row.grants.authenticated, CRUD)) {
      findings.push({
        table: row.table,
        severity: "warning",
        code: "authenticated_missing_crud",
        message: "authenticated role is missing one or more of SELECT/INSERT/UPDATE/DELETE.",
        detail: `has: ${(row.grants.authenticated ?? []).join(", ") || "(none)"}`,
      });
    }

    const svc = row.grants["service_role"] ?? [];
    if (
      !svc.includes("SELECT") ||
      !svc.includes("INSERT") ||
      !svc.includes("UPDATE") ||
      !svc.includes("DELETE")
    ) {
      findings.push({
        table: row.table,
        severity: "warning",
        code: "service_role_missing_all",
        message: "service_role is missing full CRUD grants.",
        detail: `has: ${svc.join(", ") || "(none)"}`,
      });
    }
  }

  return findings;
}

export function summarizeRlsFindings(findings: RlsFinding[]) {
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}
