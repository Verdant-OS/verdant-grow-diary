#!/usr/bin/env node
// Post-deploy check: production must never move BACKWARD to an older build.
// Incident #2123: the apex briefly served an older commit than the one it had already
// served. This compares the commit production serves now (public /version.json) with the
// last commit this check accepted, using git ancestry on the deploy branch.
// Reads public build metadata only. It never deploys, never writes to production and
// uses no secrets or tokens. The only write is the local state file (--write-file),
// A readable rollback FAILs without rewriting the checkpoint, so it keeps alerting.
// A missing checkpoint still records the served SHA, then exits 1. This workflow's
// run number is already past 40, so the first seed after merge is one of those runs:
// it goes red once, the cache save still stores the file, and the next run is green.
// The repository has no second record of the last accepted served SHA
// (public/version.json is a build stamp, not that checkpoint). A rollback
// or a diverged served SHA FAILs and does not overwrite a readable checkpoint.
// --initialize replaces only an unreadable checkpoint. A readable one is still compared.
// Exit 0 PASS, 1 FAIL, 2 BLOCKED.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DEPLOY_WAIT_ORIGIN, readDeployedCommit } from "./wait-for-deployed-sha.mjs";

export const SERVED_BUILD_DEPLOY_REF = "origin/verdant-grow-diary";
export const SERVED_BUILD_EXIT_CODES = Object.freeze({ PASS: 0, FAIL: 1, BLOCKED: 2 });

const SHA = /^[0-9a-f]{40}$/;
const isSha = (value) => typeof value === "string" && SHA.test(value);

/**
 * Pure decision core. Deterministic: no clock, no I/O. Ancestry facts are computed by the
 * caller and passed in as booleans.
 */
export function evaluateServedBuild({
  servedSha,
  previousSha,
  servedOnDeployBranch,
  previousIsAncestorOfServed,
  initialize = false,
}) {
  if (!isSha(servedSha)) return { status: "BLOCKED", reason: "served_unreadable" };
  if (servedOnDeployBranch !== true)
    return { status: "FAIL", reason: "served_not_on_deploy_branch" };
  // No checkpoint. Record the served SHA and fail the run so a scheduled loss of
  // the cache alerts once. github.run_number for this workflow is already past 40,
  // so this includes the first seed after the fix lands.
  if (previousSha === null || previousSha === undefined || previousSha === "") {
    return { status: "FAIL", reason: "baseline_recorded" };
  }
  // A recorded state that is not a commit SHA cannot be compared. initialize is the
  // only recovery: it replaces that unreadable value with the served SHA.
  if (!isSha(previousSha)) {
    return initialize === true
      ? { status: "PASS", reason: "baseline_recorded" }
      : { status: "BLOCKED", reason: "previous_unreadable" };
  }
  if (servedSha === previousSha) return { status: "PASS", reason: "unchanged" };
  if (previousIsAncestorOfServed === true) return { status: "PASS", reason: "moved_forward" };
  return { status: "FAIL", reason: "moved_backward_or_diverged" };
}

export function formatServedBuildSummary({ status, reason }, { servedSha, previousSha }) {
  return (
    `served-build-monotonic: ${status} (${reason}) ` +
    `served=${servedSha || "none"} previous=${previousSha || "none"}`
  );
}

export const SERVED_BUILD_PREVIOUS_UNREADABLE_HINT =
  "served-build-monotonic: the checkpoint is not a commit SHA, so it cannot be compared. " +
  "Dispatch the 'Served build monotonic check' workflow with initialize=true to replace " +
  "that unreadable checkpoint with the served SHA. A readable checkpoint is still compared " +
  "and is not replaced.";

function workflowRunLabel(workflowRunNumber) {
  return Number.isInteger(workflowRunNumber) ? String(workflowRunNumber) : "unknown";
}

/**
 * Visible notice when a baseline is recorded without a comparable checkpoint.
 * Names the SHA that will be stored. There is no second deployed-build record in
 * the repo to compare against.
 */
export function formatRecordedBaselineWarning({
  servedSha,
  workflowRunNumber,
  replacedUnreadable = false,
}) {
  const run = workflowRunLabel(workflowRunNumber);
  if (replacedUnreadable) {
    return (
      `served-build-monotonic: unreadable checkpoint replaced on workflow run ${run}; ` +
      `recorded baseline ${servedSha}.`
    );
  }
  return (
    `served-build-monotonic: checkpoint missing on workflow run ${run}; ` +
    `recorded baseline ${servedSha}. No earlier checkpoint was available to compare, ` +
    "so this served SHA is the new baseline."
  );
}

export function formatRecordedBaselineSummary({
  servedSha,
  workflowRunNumber,
  replacedUnreadable = false,
}) {
  const run = workflowRunLabel(workflowRunNumber);
  const detail = replacedUnreadable
    ? `An unreadable checkpoint was replaced on workflow run ${run}.`
    : `The checkpoint was missing on workflow run ${run}. No earlier checkpoint was available to compare, so a rollback served at this moment is stored as this baseline.`;
  return `### Served build monotonic\n\n${detail}\n\nRecorded baseline \`${servedSha}\`.\n`;
}

export function missingCheckpointNeedsWarning(workflowRunNumber) {
  void workflowRunNumber;
  return true;
}

/**
 * The I/O sequence with every effect injected, so the write-only-on-PASS rule is testable
 * without the network, git or the filesystem.
 */
export async function runServedBuildCheck({
  fetchImpl,
  isAncestor,
  readPrevious,
  writeServed,
  log,
  warn = log,
  appendSummary = () => {},
  initialize = false,
  workflowRunNumber = null,
}) {
  let servedSha = null;
  try {
    const response = await fetchImpl(`${DEPLOY_WAIT_ORIGIN}/version.json`, {
      redirect: "manual",
      cache: "no-store",
    });
    servedSha = await readDeployedCommit(response);
  } catch {
    servedSha = null;
  }
  const rawPrevious = readPrevious();
  const previousSha =
    typeof rawPrevious === "string" && rawPrevious.trim() ? rawPrevious.trim() : null;
  const servedOnDeployBranch = isSha(servedSha)
    ? isAncestor(servedSha, SERVED_BUILD_DEPLOY_REF)
    : false;
  const previousIsAncestorOfServed =
    isSha(servedSha) && isSha(previousSha) ? isAncestor(previousSha, servedSha) : false;
  const result = evaluateServedBuild({
    servedSha,
    previousSha,
    servedOnDeployBranch,
    previousIsAncestorOfServed,
    initialize,
  });
  const checkpointMissing = previousSha == null || previousSha === "";
  if (result.status === "PASS" || (result.reason === "baseline_recorded" && checkpointMissing)) {
    writeServed(servedSha);
  }
  log(formatServedBuildSummary(result, { servedSha, previousSha }));
  const replacedUnreadable = !isSha(previousSha) && previousSha != null && previousSha !== "";
  const seedingWithoutCheckpoint =
    result.reason === "baseline_recorded" &&
    (previousSha == null || previousSha === "" || replacedUnreadable);
  if (
    seedingWithoutCheckpoint &&
    isSha(servedSha) &&
    (replacedUnreadable || missingCheckpointNeedsWarning(workflowRunNumber))
  ) {
    const notice = {
      servedSha,
      workflowRunNumber,
      replacedUnreadable,
    };
    warn(formatRecordedBaselineWarning(notice));
    appendSummary(formatRecordedBaselineSummary(notice));
  }
  if (result.reason === "previous_unreadable") log(SERVED_BUILD_PREVIOUS_UNREADABLE_HINT);
  return { ...result, servedSha, previousSha, exitCode: SERVED_BUILD_EXIT_CODES[result.status] };
}

function gitIsAncestor(ancestor, descendant) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
    stdio: "ignore",
  });
  return result.status === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { values } = parseArgs({
    options: {
      "previous-file": { type: "string" },
      "write-file": { type: "string" },
      initialize: { type: "boolean", default: false },
      "run-number": { type: "string" },
    },
  });
  const previousFile = values["previous-file"];
  const writeFile = values["write-file"];
  const parsedRunNumber =
    values["run-number"] == null || values["run-number"] === ""
      ? null
      : Number(values["run-number"]);
  const workflowRunNumber = Number.isInteger(parsedRunNumber) ? parsedRunNumber : null;
  const outcome = await runServedBuildCheck({
    fetchImpl: fetch,
    isAncestor: gitIsAncestor,
    readPrevious: () =>
      previousFile && existsSync(previousFile) ? readFileSync(previousFile, "utf8") : null,
    writeServed: (sha) => {
      if (!writeFile) return;
      mkdirSync(dirname(writeFile), { recursive: true });
      writeFileSync(writeFile, `${sha}\n`);
    },
    log: (line) => console.log(line),
    warn: (line) => console.log(`::warning::${line}`),
    appendSummary: (markdown) => {
      if (!process.env.GITHUB_STEP_SUMMARY) return;
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    },
    initialize: values.initialize === true,
    workflowRunNumber,
  });
  process.exitCode = outcome.exitCode;
}
