/**
 * P.3 preservation contract - the single source of truth for the three frozen
 * "P.2" files that must be preserved byte-for-byte.
 *
 * IMPORTANT: `sha256` is the SHA-256 of each file's RAW bytes (PowerShell
 * Get-FileHash / `sha256sum`), NOT a git blob hash (`git hash-object`, which is
 * SHA-1 over "blob <len>\0<content>"). Verification hashes raw bytes with
 * SHA-256 and compares to these values - never conflate the two.
 *
 * LINE ENDINGS: `bytes` and `sha256` were captured over LF content (`eol: "lf"`).
 * This repo has `core.autocrlf=true` and no `.gitattributes`, so git WOULD
 * normalize EOLs when staging text and change the stored blob's bytes. The
 * preservation workflow MUST neutralize that - either a path-scoped
 * `.gitattributes` rule (`<path> -text`) or running git with
 * `-c core.autocrlf=false -c core.eol=lf`. `verify-staged-bytes` is the detector
 * for a normalization slip (WORKING_INDEX_BYTES_DIFFER).
 */

export const P3_CONTRACT = Object.freeze({
  // Base for the preservation branch: `main` (the normal PR base; confirmed by lead).
  // Preflight pins this branch's remote SHA for the pre-push TOCTOU re-check.
  baseBranch: "main",
  targetBranch: "feat/pheno-candidate-number-foundation",
  toolingBranch: "codex/p3-preservation-workflow",
  eol: "lf",
  files: Object.freeze([
    Object.freeze({
      path: "supabase/migrations/20260712010343_pheno_candidate_number_foundation.sql",
      bytes: 8248,
      sha256: "1f7c9bedffa64dc449b94d168ff9940d66d518236e1264090db055bcf032a770",
    }),
    Object.freeze({
      path: "scripts/run-pheno-candidate-number-rls-harness.ts",
      bytes: 16858,
      sha256: "6bcc89a7ff77b8f62ee71b9f51ddb65404b42be53d856b15f703897843793116",
    }),
    Object.freeze({
      path: "supabase/tests/pheno_candidate_number_contract.sql",
      bytes: 9045,
      sha256: "1f6f0986e77424efdc6406521502599849041d0a92d7415b6001ff666e61fbac",
    }),
  ]),
});

const HEX64 = /^[0-9a-f]{64}$/;

/** Look up a contract file entry by its repo-relative path (or null). */
export function getContractFile(path, contract = P3_CONTRACT) {
  return contract.files.find((f) => f.path === path) ?? null;
}

/**
 * Validate the contract is internally well-formed. Throws on the first problem.
 * Pure structural check - does not touch the filesystem or git.
 */
export function assertContractIntegrity(contract = P3_CONTRACT) {
  if (!contract || !Array.isArray(contract.files) || contract.files.length === 0) {
    throw new Error("P3 contract: `files` must be a non-empty array");
  }
  if (contract.eol !== "lf" && contract.eol !== "crlf") {
    throw new Error(`P3 contract: unexpected eol "${contract.eol}" (want "lf" or "crlf")`);
  }
  for (const key of ["baseBranch", "targetBranch", "toolingBranch"]) {
    if (typeof contract[key] !== "string" || contract[key].length === 0) {
      throw new Error(`P3 contract: "${key}" must be a non-empty string`);
    }
  }
  const seen = new Set();
  for (const f of contract.files) {
    if (typeof f.path !== "string" || f.path.length === 0) {
      throw new Error("P3 contract: every file needs a non-empty path");
    }
    if (f.path.includes("\\")) {
      throw new Error(`P3 contract: path must use forward slashes: ${f.path}`);
    }
    if (seen.has(f.path)) {
      throw new Error(`P3 contract: duplicate path ${f.path}`);
    }
    seen.add(f.path);
    if (!Number.isInteger(f.bytes) || f.bytes <= 0) {
      throw new Error(`P3 contract: bytes must be a positive integer for ${f.path}`);
    }
    if (typeof f.sha256 !== "string" || !HEX64.test(f.sha256)) {
      throw new Error(`P3 contract: sha256 must be 64 lowercase hex chars for ${f.path}`);
    }
  }
  return true;
}
