/**
 * Shared low-level runtime helpers for the candidate-number tooling
 * (preflight, migration-history verifier, apply script).
 *
 * Extracted after a review comment observed that
 * scripts/preflight-candidate-number-membership.mjs and
 * scripts/verify-candidate-number-migration-history.mjs carried
 * byte-identical buildPsqlEnvironment implementations, and the apply
 * script a near-duplicate. Since this PR's whole premise is that these
 * tools must never silently disagree, connection sanitization and
 * artifact-writing belong in one place, not three.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildLibpqConnectionEnvironment,
  sanitizeSupabaseDatabaseUrlForPsql,
} from "./supabaseDatabaseTargetIdentity.mjs";

/**
 * Build a minimal, allowlisted child-process environment for psql: only the
 * ambient variables psql/libpq genuinely need, plus explicit identity-checked
 * connection fields and deterministic TLS/GSS policies
 * derived from the identity-checked connection string. Never forwards the
 * full parent environment (which could carry unrelated secrets) or ambient
 * DATABASE_URL/PG* connection variables (which could silently override the
 * checked-out target).
 */
export function buildPsqlEnvironment(sourceEnv, databaseUrl, targetEnv) {
  const childEnv = {};
  const pathValue = sourceEnv.PATH ?? sourceEnv.Path;
  if (typeof pathValue === "string") childEnv.PATH = pathValue;
  for (const key of [
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ]) {
    if (typeof sourceEnv[key] === "string") childEnv[key] = sourceEnv[key];
  }
  const connection = sanitizeSupabaseDatabaseUrlForPsql(databaseUrl, targetEnv);
  return { ...childEnv, ...buildLibpqConnectionEnvironment(connection) };
}

/** Write a sanitized artifact file, never throwing — a failed write degrades to a logged warning. */
export function writeTextFile(path, contents, logger, toolName) {
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  } catch {
    logger.error(`Warning: could not write a ${toolName} artifact.`);
  }
}
