import { X509Certificate } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const PRODUCTION_SUPABASE_CA_FILENAME = "verdant-production-supabase-root.crt";
export const PRODUCTION_SUPABASE_CA_PATH_ENV = "SUPABASE_DB_CA_CERT_PATH";

const MAX_ROOT_CERT_BYTES = 64 * 1024;
const BEGIN_CERTIFICATE = "-----BEGIN CERTIFICATE-----";
const END_CERTIFICATE = "-----END CERTIFICATE-----";

export class ProductionSupabaseTlsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductionSupabaseTlsError";
    this.code = code;
  }
}

function tlsError(code, message) {
  throw new ProductionSupabaseTlsError(code, message);
}

function exactNonEmptyText(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/**
 * Resolve the one production trust-anchor path permitted by the protected
 * GitHub runner. The path is operational metadata, not certificate material.
 */
export function expectedProductionSupabaseRootCertPath(sourceEnv) {
  const runnerTemp = sourceEnv?.RUNNER_TEMP;
  if (
    !exactNonEmptyText(runnerTemp) ||
    !isAbsolute(runnerTemp) ||
    resolve(runnerTemp) !== runnerTemp
  ) {
    tlsError(
      "runner_temp_rejected",
      "RUNNER_TEMP must be one canonical absolute directory before production database access.",
    );
  }
  return join(runnerTemp, PRODUCTION_SUPABASE_CA_FILENAME);
}

function readAndValidateRootCertificate({
  rootCertPath,
  lstatImpl,
  readFileImpl,
  parseCertificateImpl,
}) {
  let stat;
  try {
    stat = lstatImpl(rootCertPath);
  } catch {
    tlsError("root_cert_unavailable", "The protected production database CA is unavailable.");
  }

  if (
    stat === null ||
    typeof stat !== "object" ||
    typeof stat.isFile !== "function" ||
    typeof stat.isSymbolicLink !== "function" ||
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    !Number.isSafeInteger(stat.size) ||
    stat.size < 1 ||
    stat.size > MAX_ROOT_CERT_BYTES
  ) {
    tlsError(
      "root_cert_file_rejected",
      "The protected production database CA must be one bounded regular file.",
    );
  }

  let certificateText;
  try {
    const raw = readFileImpl(rootCertPath);
    certificateText = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  } catch {
    tlsError("root_cert_unavailable", "The protected production database CA is unavailable.");
  }

  if (
    Buffer.byteLength(certificateText, "utf8") !== stat.size ||
    certificateText.length === 0 ||
    certificateText.split(BEGIN_CERTIFICATE).length !== 2 ||
    certificateText.split(END_CERTIFICATE).length !== 2
  ) {
    tlsError(
      "root_cert_content_rejected",
      "The protected production database CA did not contain one bounded certificate.",
    );
  }

  let certificate;
  try {
    certificate = parseCertificateImpl(certificateText);
  } catch {
    tlsError("root_cert_parse_rejected", "The protected production database CA is invalid.");
  }
  if (certificate?.ca !== true) {
    tlsError("root_cert_not_ca", "The protected production database certificate is not a CA.");
  }
}

/**
 * Harden an already allowlisted libpq environment for production access.
 * The protected workflow supplies only the fixed CA path; raw CA material
 * and unrelated parent-process environment values never enter the child.
 */
export function hardenProductionPsqlEnvironment({
  sourceEnv,
  childEnv,
  lstatImpl = lstatSync,
  readFileImpl = readFileSync,
  parseCertificateImpl = (certificateText) => new X509Certificate(certificateText),
}) {
  if (childEnv === null || typeof childEnv !== "object" || Array.isArray(childEnv)) {
    tlsError(
      "child_environment_rejected",
      "A sanitized database child environment is required before TLS hardening.",
    );
  }

  const expectedRootCertPath = expectedProductionSupabaseRootCertPath(sourceEnv);
  if (sourceEnv?.[PRODUCTION_SUPABASE_CA_PATH_ENV] !== expectedRootCertPath) {
    tlsError(
      "root_cert_path_rejected",
      "The production database CA path did not match the protected runner path.",
    );
  }

  readAndValidateRootCertificate({
    rootCertPath: expectedRootCertPath,
    lstatImpl,
    readFileImpl,
    parseCertificateImpl,
  });

  return Object.freeze({
    ...childEnv,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: expectedRootCertPath,
  });
}
