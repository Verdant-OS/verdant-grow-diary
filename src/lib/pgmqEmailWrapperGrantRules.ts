/**
 * Execute-grant contract for SECURITY DEFINER routines hardened in
 * 20260815054529 / 20260815054605 / 20260815054645.
 *
 * Pure data. No I/O. No React. No Supabase.
 *
 * Why this exists: Postgres grants EXECUTE on new functions to PUBLIC by
 * default, and both `anon` and `authenticated` inherit through that
 * pseudo-role. A REVOKE that names only `anon, authenticated` reports
 * success while `has_function_privilege()` stays true. The durable posture
 * is REVOKE FROM PUBLIC (and the named roles), then GRANT the intended
 * callers back.
 *
 * Client-secret boundary: this file must not use the billing/control role
 * name as a bare identifier. Quoted string literals and computed keys are
 * the sanctioned form (see `SERVICE_ROLE_GRANT_KEY` in rlsAuditRules.ts).
 */

/** Quoted so the client-secret boundary scan does not see a bare identifier. */
export const EXECUTE_ROLE_SERVICE = "service_role" as const;

export const CLIENT_EXECUTE_ROLES = ["anon", "authenticated", EXECUTE_ROLE_SERVICE] as const;

export type ClientExecuteRole = (typeof CLIENT_EXECUTE_ROLES)[number];

export type ExecuteGrantMatrix = {
  anon: boolean;
  authenticated: boolean;
} & { [EXECUTE_ROLE_SERVICE]: boolean };

export const PGMQ_EMAIL_WRAPPER_FUNCTIONS = [
  "enqueue_email",
  "read_email_batch",
  "delete_email",
  "move_to_dlq",
] as const;

export type PgmqEmailWrapperFunction = (typeof PGMQ_EMAIL_WRAPPER_FUNCTIONS)[number];

export const TRIGGER_DEFINER_FUNCTIONS = [
  "grant_staff_role_for_verified_email",
  "profiles_block_gamification_updates",
] as const;

export type TriggerDefinerFunction = (typeof TRIGGER_DEFINER_FUNCTIONS)[number];

export const QUICKLOG_WRITER_FUNCTIONS = ["quicklog_save_manual", "quicklog_save_event"] as const;

export type QuicklogWriterFunction = (typeof QUICKLOG_WRITER_FUNCTIONS)[number];

export type HardenableDefinerFunction =
  | PgmqEmailWrapperFunction
  | TriggerDefinerFunction
  | QuicklogWriterFunction;

export const PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS = {
  wrappers: "supabase/migrations/20260815054529_restrict_pgmq_email_wrappers_to_service_role.sql",
  triggerNoop: "supabase/migrations/20260815054605_revoke_client_execute_on_trigger_functions.sql",
  publicRevoke: "supabase/migrations/20260815054645_revoke_public_and_anon_execute_on_definer_functions.sql",
} as const;

export function serviceRoleOnlyExecute(): ExecuteGrantMatrix {
  return {
    anon: false,
    authenticated: false,
    [EXECUTE_ROLE_SERVICE]: true,
  };
}

export function authenticatedAndServiceRoleExecute(): ExecuteGrantMatrix {
  return {
    anon: false,
    authenticated: true,
    [EXECUTE_ROLE_SERVICE]: true,
  };
}

export function expectedExecuteForHardenableDefiner(
  name: HardenableDefinerFunction,
): ExecuteGrantMatrix {
  switch (name) {
    case "enqueue_email":
    case "read_email_batch":
    case "delete_email":
    case "move_to_dlq":
    case "grant_staff_role_for_verified_email":
    case "profiles_block_gamification_updates":
      return serviceRoleOnlyExecute();
    case "quicklog_save_manual":
    case "quicklog_save_event":
      return authenticatedAndServiceRoleExecute();
    default: {
      const exhaustive: never = name;
      throw new Error(`unhandled definer function: ${String(exhaustive)}`);
    }
  }
}

export function executeMatricesMatch(left: ExecuteGrantMatrix, right: ExecuteGrantMatrix): boolean {
  return (
    left.anon === right.anon &&
    left.authenticated === right.authenticated &&
    left[EXECUTE_ROLE_SERVICE] === right[EXECUTE_ROLE_SERVICE]
  );
}

/** PostgREST RPC exposure for the four pgmq wrappers: none for browser roles. */
export function clientRoleMayExecutePgmqWrapper(
  _role: Extract<ClientExecuteRole, "anon" | "authenticated">,
): boolean {
  return false;
}

export function publicSchemaFunctionName(name: HardenableDefinerFunction): string {
  return `public.${name}`;
}
