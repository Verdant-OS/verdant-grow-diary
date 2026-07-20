/**
 * Privacy-safe diagnostics for AI Doctor history persistence failures.
 *
 * Raw database errors can contain arbitrary row text, identifiers, or secret
 * material. That text is inspected only transiently to choose a category and
 * is never returned. Diagnostics keep fixed allowlisted copy plus the narrow
 * code/scope/auth context needed to distinguish failure classes.
 */

export type AiDoctorSessionPersistenceFailureStage = "validation" | "insert" | "unexpected";

export type AiDoctorSessionPersistenceFailureCategory =
  | "validation"
  | "rls"
  | "permission"
  | "auth"
  | "constraint"
  | "network"
  | "insert"
  | "unexpected";

export type AiDoctorSessionPersistenceAuthResolution =
  | "resolved"
  | "anonymous"
  | "unavailable"
  | "lookup_failed";

export interface AiDoctorSessionPersistenceScopeContext {
  hasGrowScope: boolean;
  hasTentScope: boolean;
  hasPlantScope: boolean;
}

export interface AiDoctorSessionPersistenceFailureDiagnostic {
  table: "ai_doctor_sessions";
  operation: "insert";
  stage: AiDoctorSessionPersistenceFailureStage;
  category: AiDoctorSessionPersistenceFailureCategory;
  code: string | null;
  safeMessage: string;
  safeDetails: string | null;
  safeHint: string | null;
  authResolution: AiDoctorSessionPersistenceAuthResolution;
  scope: AiDoctorSessionPersistenceScopeContext;
}

export interface AiDoctorSessionPersistenceErrorLike {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
}

// PostgreSQL SQLSTATE (5 alphanumerics) or PostgREST's PGRST### family only.
// Arbitrary provider strings can contain keys/tokens and must not bypass the
// allowlist through the structured `code` field.
const SAFE_CODE_RE = /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/i;

const SAFE_MESSAGE_BY_CATEGORY: Readonly<
  Record<AiDoctorSessionPersistenceFailureCategory, string>
> = Object.freeze({
  validation: "AI Doctor history payload failed validation.",
  rls: "AI Doctor history save was blocked by its ownership policy.",
  permission: "AI Doctor history save lacks a required database permission.",
  auth: "AI Doctor history save could not authenticate the current user.",
  constraint: "AI Doctor history save violated a database constraint.",
  network: "AI Doctor history save could not reach the database.",
  insert: "AI Doctor history save failed at the database insert.",
  unexpected: "AI Doctor history save failed unexpectedly.",
});

function safeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return SAFE_CODE_RE.test(trimmed) ? trimmed : null;
}

function transientErrorText(value: unknown): string {
  // Used only to choose an allowlisted category. It is never returned,
  // rendered, logged, or stored in hook state.
  return typeof value === "string" ? value.slice(0, 2_000) : "";
}

function categorizeFailure(
  stage: AiDoctorSessionPersistenceFailureStage,
  code: string | null,
  combinedText: string,
): AiDoctorSessionPersistenceFailureCategory {
  if (stage === "validation") return "validation";
  if (stage === "unexpected" && /fetch|network|timeout|timed out|offline/i.test(combinedText)) {
    return "network";
  }
  if (/row.level security|\brls\b/i.test(combinedText)) {
    return "rls";
  }
  if (
    code === "PGRST301" ||
    code === "PGRST302" ||
    /jwt|not authenticated|auth session|authentication/i.test(combinedText)
  ) {
    return "auth";
  }
  if (code === "42501" || /permission denied/i.test(combinedText)) return "permission";
  if (code?.startsWith("23")) return "constraint";
  if (/fetch|network|timeout|timed out|offline/i.test(combinedText)) return "network";
  return stage === "unexpected" ? "unexpected" : "insert";
}

export function buildAiDoctorSessionPersistenceFailureDiagnostic(args: {
  stage: AiDoctorSessionPersistenceFailureStage;
  error?: AiDoctorSessionPersistenceErrorLike | Error | null;
  authResolution: AiDoctorSessionPersistenceAuthResolution;
  scope: AiDoctorSessionPersistenceScopeContext;
  fallbackMessage: string;
}): AiDoctorSessionPersistenceFailureDiagnostic {
  const error = args.error ?? null;
  const code = safeCode(error && "code" in error ? error.code : null);
  const combinedText = [
    error && "message" in error ? transientErrorText(error.message) : "",
    error && "details" in error ? transientErrorText(error.details) : "",
    error && "hint" in error ? transientErrorText(error.hint) : "",
    transientErrorText(args.fallbackMessage),
  ].join(" ");
  const category = categorizeFailure(args.stage, code, combinedText);

  return {
    table: "ai_doctor_sessions",
    operation: "insert",
    stage: args.stage,
    category,
    code,
    safeMessage: SAFE_MESSAGE_BY_CATEGORY[category],
    safeDetails: null,
    safeHint: null,
    authResolution: args.authResolution,
    scope: { ...args.scope },
  };
}
