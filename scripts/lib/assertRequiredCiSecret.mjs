/**
 * Shared core for the "required CI secret" preflight check.
 *
 * Turns the opaque red-X you get when a downstream step reads an unset
 * repository secret into a clear, step-named failure with a fix-me-now
 * message in the log AND, optionally, a markdown report suitable for a
 * sticky PR comment / workflow step summary.
 *
 * Called by:
 *   - scripts/assert-required-ci-secret.mjs (generic CLI wired into the
 *     `require-ci-secret` composite action).
 *   - scripts/assert-money-migration-db-secret.mjs (money-migration
 *     wrapper preserved for the existing contract test + call sites).
 *
 * Pure, deterministic, no network, no DB. Takes an injectable `console`
 * and `writeReport` for testability.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @typedef {object} AssertRequiredCiSecretInput
 * @property {string} secretName            Protected secret name, e.g. "SUPABASE_DB_URL".
 * @property {string | undefined} secretValue Raw value injected by the workflow (`${{ secrets.X }}`).
 * @property {string} [guardHeading]        Heading for logs + markdown report. Defaults to a generic guard label.
 * @property {string[]} [fixSteps]          Ordered fix steps rendered as a numbered list. Sensible default if omitted.
 * @property {string[]} [reasonLines]       Free-form paragraph explaining why this is a hard failure. Optional.
 * @property {string} [reportPath]          Optional markdown output path (workflow summary / PR sticky comment).
 * @property {string} [logPrefix]           Prefix for stdout/stderr log lines. Defaults to "ci-secret-preflight".
 */

/**
 * @param {AssertRequiredCiSecretInput} input
 * @param {{ log: (msg: string) => void, error: (msg: string) => void }} [io]
 * @returns {0 | 1} Exit code — 0 configured, 1 missing.
 */
export function assertRequiredCiSecret(input, io = defaultIo()) {
  const secretName = String(input.secretName ?? "").trim();
  if (!secretName) {
    throw new Error("assertRequiredCiSecret: secretName is required");
  }

  const value = String(input.secretValue ?? "").trim();
  const logPrefix = input.logPrefix ?? "ci-secret-preflight";
  const heading = input.guardHeading?.trim() || `Required CI secret guard — ${secretName}`;
  const fixSteps =
    input.fixSteps && input.fixSteps.length > 0 ? input.fixSteps : defaultFixSteps(secretName);
  const reasonLines = input.reasonLines ?? [];

  if (value.length > 0) {
    io.log(`[${logPrefix}] ${secretName} is configured — proceeding.`);
    return 0;
  }

  const oneLiner = `${secretName} secret is not configured in this repository.`;

  io.error(
    `::error title=${secretName} missing::${oneLiner} Do NOT proceed until this is configured.`,
  );
  io.error("");
  io.error(`[${logPrefix}] ${heading}`);
  io.error(`  Status: FAILED — ${oneLiner}`);
  io.error("  How to fix:");
  for (const step of fixSteps) {
    io.error(`    ${step}`);
  }
  for (const line of reasonLines) {
    io.error(`  ${line}`);
  }

  if (input.reportPath) {
    const body = [
      `### ${heading}`,
      "",
      `**Status:** ❌ ${oneLiner}`,
      "",
      "The gate could not run because the required secret is missing.",
      "This is a preflight failure — no downstream step has run yet.",
      "Configure the secret and re-run the workflow.",
      "",
      "**How to fix:**",
      "",
      ...fixSteps,
      ...(reasonLines.length > 0 ? ["", ...reasonLines] : []),
      "",
      "_Do NOT proceed until this check passes._",
      "",
    ].join("\n");
    try {
      mkdirSync(dirname(input.reportPath), { recursive: true });
      writeFileSync(input.reportPath, body, "utf8");
    } catch (err) {
      io.error(
        `[${logPrefix}] Failed to write report to ${input.reportPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return 1;
}

function defaultFixSteps(secretName) {
  return [
    "1. Open **Settings → Secrets and variables → Actions** in this repository.",
    `2. Add a repository secret named \`${secretName}\` with the correct value for this environment.`,
    "3. Re-run this workflow so the preflight and downstream steps can verify the value.",
  ];
}

function defaultIo() {
  return {
    log: (msg) => console.log(msg),

    error: (msg) => console.error(msg),
  };
}
