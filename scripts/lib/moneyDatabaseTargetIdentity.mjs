import { sanitizeSupabaseDatabaseUrlForPsql } from "./supabaseDatabaseTargetIdentity.mjs";

const MONEY_TARGETS = Object.freeze({
  sandbox: "sandbox",
  live: "production",
});

/**
 * Convert the money workflows' public sandbox/live vocabulary into the
 * canonical database-target vocabulary. `unspecified` remains available only
 * for the documented local CLI path; protected workflows always set one of
 * the two pinned labels.
 */
export function coreTargetEnvironmentForMoney(targetEnv) {
  if (targetEnv === "unspecified") return null;
  if (Object.hasOwn(MONEY_TARGETS, targetEnv)) {
    return MONEY_TARGETS[targetEnv];
  }
  throw new Error("TARGET_ENV must be exactly sandbox, live, or unspecified.");
}

/**
 * Prepare a money-gate database URL for psql.
 *
 * Protected sandbox/live runs inherit the core gate's exact host, port, path,
 * TLS, query-option, and project-binding rules. The local `unspecified` mode
 * preserves the caller-supplied URL for backwards-compatible ad-hoc checks.
 * The returned URL contains credentials and must never be logged.
 */
export function sanitizeMoneyDatabaseUrlForPsql(databaseUrl, targetEnv) {
  const coreTargetEnv = coreTargetEnvironmentForMoney(targetEnv);
  if (coreTargetEnv === null) {
    return Object.freeze({
      databaseUrl,
      sslMode: null,
      targetBound: false,
    });
  }

  const sanitized = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, coreTargetEnv);
  return Object.freeze({
    ...sanitized,
    targetBound: true,
  });
}
