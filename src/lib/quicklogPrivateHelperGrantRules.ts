/**
 * Execute-grant contract for the Quick Log manual-save private helpers.
 *
 * Pure data. No I/O. No React. No Supabase.
 *
 * The manual save path is one public SECURITY DEFINER wrapper over five
 * postgres-only helpers (established by 20260725024026 and re-asserted by
 * the 20260818010000 forward repair's pre/postconditions):
 *
 *   wrapper  public.quicklog_save_manual            — authenticated + service_role
 *   private  public.quicklog_save_manual_pre_logged_at — postgres only
 *   private  public.quicklog_try_parse_logged_at       — postgres only
 *   private  public.quicklog_try_parse_uuid            — postgres only
 *   private  public.quicklog_stamp_diary_logged_at     — postgres only
 *   private  public.quicklog_stamp_grow_event_logged_at — postgres only
 *
 * "Postgres only" means: EXECUTE for the owner role and for no one else —
 * not PUBLIC, not anon, not authenticated, not service_role. The trigger
 * stamps fire as triggers without caller EXECUTE; the delegate and parsers
 * run inside the wrapper's definer context. Any later migration that grants
 * a client role EXECUTE on one of the five, or revokes the wrapper from
 * authenticated/service_role, reopens the trust boundary this file pins.
 *
 * Matrix vocabulary is shared with pgmqEmailWrapperGrantRules to keep one
 * client-secret-safe convention for naming the service role.
 */
import {
  EXECUTE_ROLE_SERVICE,
  authenticatedAndServiceRoleExecute,
  noClientExecute,
  type ExecuteGrantMatrix,
} from "./pgmqEmailWrapperGrantRules";

export const QUICKLOG_MANUAL_WRAPPER_FUNCTION = "quicklog_save_manual" as const;

export const QUICKLOG_MANUAL_SIGNATURE =
  "text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text" as const;

export const QUICKLOG_PRIVATE_HELPER_FUNCTIONS = [
  "quicklog_save_manual_pre_logged_at",
  "quicklog_try_parse_logged_at",
  "quicklog_try_parse_uuid",
  "quicklog_stamp_diary_logged_at",
  "quicklog_stamp_grow_event_logged_at",
] as const;

export type QuicklogPrivateHelperFunction = (typeof QUICKLOG_PRIVATE_HELPER_FUNCTIONS)[number];

/** Exact regprocedure signatures so probes can never miss via overloads. */
export const QUICKLOG_PRIVATE_HELPER_SIGNATURES: Record<QuicklogPrivateHelperFunction, string> = {
  quicklog_save_manual_pre_logged_at: `public.quicklog_save_manual_pre_logged_at(${QUICKLOG_MANUAL_SIGNATURE})`,
  quicklog_try_parse_logged_at: "public.quicklog_try_parse_logged_at(text)",
  quicklog_try_parse_uuid: "public.quicklog_try_parse_uuid(text)",
  quicklog_stamp_diary_logged_at: "public.quicklog_stamp_diary_logged_at()",
  quicklog_stamp_grow_event_logged_at: "public.quicklog_stamp_grow_event_logged_at()",
};

export const QUICKLOG_GRANT_MIGRATIONS = {
  dualTimestampFoundation:
    "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql",
  forwardRepair: "supabase/migrations/20260818010000_quicklog_manual_delegate_forward_repair.sql",
} as const;

/** Migrations at or before this version established the sealed posture. */
export const QUICKLOG_FORWARD_REPAIR_VERSION = "20260818010000" as const;

export function expectedExecuteForQuicklogPrivateHelper(
  _name: QuicklogPrivateHelperFunction,
): ExecuteGrantMatrix {
  return noClientExecute();
}

export function expectedExecuteForQuicklogManualWrapper(): ExecuteGrantMatrix {
  return authenticatedAndServiceRoleExecute();
}

/** The one role that must retain EXECUTE on every private helper. */
export const QUICKLOG_PRIVATE_HELPER_OWNER_ROLE = "postgres" as const;

export { EXECUTE_ROLE_SERVICE };

/**
 * PostgreSQL 11+ accepts ROUTINE as an alias for FUNCTION in GRANT/REVOKE,
 * and ALL ROUTINES IN SCHEMA alongside ALL FUNCTIONS IN SCHEMA. A fence that
 * only knows the FUNCTION spelling can be walked straight past by the other
 * one, so both detectors below build their target forms from these.
 */
const ROUTINE_SINGULAR = String.raw`(?:FUNCTION|ROUTINE)`;
const ROUTINE_PLURAL = String.raw`(?:FUNCTIONS|ROUTINES)`;

/**
 * `IN SCHEMA` takes a comma-separated LIST, so `public` need not come first:
 * `IN SCHEMA extensions, public` reaches these routines exactly as surely as
 * `IN SCHEMA public` does, and a fence that only recognised the leading form
 * could be walked past by reordering the list.
 *
 * Only identifiers and commas may precede `public` here, and that bound is
 * load-bearing rather than decorative: a looser `[^;]*?` would run on past the
 * schema list and match the `public` in `… IN SCHEMA extensions TO public`,
 * where PUBLIC is the grantee ROLE and the statement touches nothing of ours.
 */
const SCHEMA_IDENT = String.raw`(?:[A-Za-z_][\w$]*|"[^"]*")`;
const IN_SCHEMA_PUBLIC = String.raw`IN\s+SCHEMA\s+(?:${SCHEMA_IDENT}\s*,\s*)*(?:public\b|"public")`;

/**
 * True when a migration SQL body (comments stripped) grants EXECUTE on the
 * named function to any role other than postgres. Used by the static fence
 * that scans migrations newer than the forward repair.
 */
export function migrationGrantsClientExecuteOn(
  executableSql: string,
  functionName: QuicklogPrivateHelperFunction,
): boolean {
  // The FUNCTION target may be a comma-separated list; the helper counts as
  // targeted when its name appears anywhere before TO. Over-matching errs
  // toward flagging, which is the safe polarity for a fence.
  const grantPattern = new RegExp(
    String.raw`GRANT\s+(?:ALL|EXECUTE)[^;]*?\bON\s+(?:ALL\s+${ROUTINE_PLURAL}\s+${IN_SCHEMA_PUBLIC}|${ROUTINE_SINGULAR}\s+[^;]*?\b(?:public\.)?${functionName}\b)[^;]*?\bTO\s+([^;]+);`,
    "gis",
  );
  for (const match of executableSql.matchAll(grantPattern)) {
    const grantees = match[1] ?? "";
    const nonOwnerGrantee = grantees
      .split(",")
      .map((grantee) => grantee.trim().replace(/;$/, "").toLowerCase())
      .some((grantee) => grantee.length > 0 && grantee !== "postgres");
    if (nonOwnerGrantee) return true;
  }
  return false;
}

/**
 * True when a migration SQL body would leave the public wrapper without
 * EXECUTE for a required caller (authenticated / service_role): it revokes
 * that role on `quicklog_save_manual` and never grants it back in the same
 * file. A revoke-then-regrant re-hardening pass stays legal. The negative
 * lookahead keeps the private delegate's own REVOKEs (…_pre_logged_at) out
 * of scope.
 *
 * The argument list is OPTIONAL: PostgreSQL lets a routine target omit it
 * when the name is unambiguous, and the catalog contract pins the wrapper to
 * a single overload — so `REVOKE EXECUTE ON ROUTINE public.quicklog_save_manual
 * FROM authenticated;` really does strip wrapper access. Requiring the parens
 * left that form invisible. Because the parens are what used to terminate the
 * identifier, dropping them requires an explicit `(?![\w$])` boundary, or a
 * different function whose name merely starts with the wrapper's (say
 * `quicklog_save_manual_v2`) would match and be misreported.
 */
export function migrationLeavesWrapperWithoutRequiredGrant(executableSql: string): boolean {
  const wrapperRef = String.raw`(?:public\.)?quicklog_save_manual(?!_pre_logged_at)(?![\w$])(?:\s*\([^)]*\))?`;
  // Every target form that reaches the wrapper: a direct FUNCTION/ROUTINE
  // target (the wrapper need not be first in a comma-separated list), or a
  // schema-wide ALL FUNCTIONS/ROUTINES IN SCHEMA public. Both directions use
  // the same forms — a schema-wide revoke followed by a schema-wide grant
  // genuinely does restore access, so recognizing it in only one direction
  // would misreport rather than harden.
  const wrapperTarget = String.raw`(?:ALL\s+${ROUTINE_PLURAL}\s+${IN_SCHEMA_PUBLIC}|${ROUTINE_SINGULAR}\s+[^;]*?${wrapperRef})`;
  for (const role of ["authenticated", EXECUTE_ROLE_SERVICE]) {
    // Statement order matters: a GRANT that precedes the REVOKE does not
    // restore access, so compare the LAST occurrence of each per role.
    const revokePattern = new RegExp(
      String.raw`REVOKE\s+(?:ALL|EXECUTE)[^;]*?\bON\s+${wrapperTarget}[^;]*?\bFROM\s+[^;]*\b${role}\b[^;]*;`,
      "gis",
    );
    const regrantPattern = new RegExp(
      String.raw`GRANT\s+(?:ALL|EXECUTE)[^;]*?\bON\s+${wrapperTarget}[^;]*?\bTO\s+[^;]*\b${role}\b[^;]*;`,
      "gis",
    );
    let lastRevokeIndex = -1;
    for (const match of executableSql.matchAll(revokePattern)) {
      lastRevokeIndex = match.index ?? lastRevokeIndex;
    }
    if (lastRevokeIndex === -1) continue;
    let lastGrantIndex = -1;
    for (const match of executableSql.matchAll(regrantPattern)) {
      lastGrantIndex = match.index ?? lastGrantIndex;
    }
    if (lastGrantIndex < lastRevokeIndex) return true;
  }
  return false;
}
