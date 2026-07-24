#!/usr/bin/env node
/**
 * Generic CI preflight — fails fast with an actionable, step-named error
 * when a required repository secret is missing.
 *
 * Intended to be invoked by the `.github/actions/require-ci-secret`
 * composite action, but is safe to call directly in any workflow.
 *
 * Env inputs:
 *   SECRET_NAME        Required. Exact name of the required secret,
 *                      used verbatim in the `::error title=…::` annotation
 *                      and in the fix-me steps.
 *   SECRET_VALUE       Required for the "configured" path. The workflow
 *                      supplies `${{ secrets.<SECRET_NAME> }}` here.
 *                      An empty / whitespace-only value counts as missing.
 *   GUARD_HEADING      Optional. Heading used in logs + markdown report.
 *                      Defaults to `Required CI secret guard — <name>`.
 *   FIX_STEPS_JSON     Optional JSON array of strings. When set, replaces
 *                      the default numbered fix steps.
 *   REASON_LINES_JSON  Optional JSON array of strings. Extra explanatory
 *                      lines appended after the fix steps.
 *   REPORT_PATH        Optional. Markdown report path (workflow summary /
 *                      PR sticky comment).
 *   LOG_PREFIX         Optional. Log prefix. Defaults to
 *                      `ci-secret-preflight`.
 *
 * Exit codes:
 *   0 secret configured
 *   1 secret missing (annotation + optional report written)
 *   2 misuse (SECRET_NAME missing, malformed JSON input)
 */
import { assertRequiredCiSecret } from "./lib/assertRequiredCiSecret.mjs";

function parseJsonArray(name, raw) {
  if (raw === undefined || raw === "") return undefined;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(
      `::error::assert-required-ci-secret: ${name} must be valid JSON (${err instanceof Error ? err.message : String(err)}).`,
    );
    process.exit(2);
  }
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string")) {
    console.error(
      `::error::assert-required-ci-secret: ${name} must be a JSON array of strings.`,
    );
    process.exit(2);
  }
  return parsed;
}

const secretName = (process.env.SECRET_NAME ?? "").trim();
if (!secretName) {
  console.error(
    "::error::assert-required-ci-secret: SECRET_NAME env var is required.",
  );
  process.exit(2);
}

const code = assertRequiredCiSecret({
  secretName,
  secretValue: process.env.SECRET_VALUE,
  guardHeading: process.env.GUARD_HEADING,
  fixSteps: parseJsonArray("FIX_STEPS_JSON", process.env.FIX_STEPS_JSON),
  reasonLines: parseJsonArray("REASON_LINES_JSON", process.env.REASON_LINES_JSON),
  reportPath: process.env.REPORT_PATH || undefined,
  logPrefix: process.env.LOG_PREFIX || undefined,
});

process.exit(code);
