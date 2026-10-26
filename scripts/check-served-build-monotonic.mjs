#!/usr/bin/env node
// Post-deploy check: production must never move BACKWARD to an older build.
// Incident #2123: the apex briefly served an older commit than the one it had already
// served. This compares the commit production serves now (public /version.json) with the
// last commit this check accepted, using git ancestry on the deploy branch.
// Reads public build metadata only. It never deploys, never writes to production and
// uses no secrets or tokens. The only write is the local state file (--write-file),
// and only on PASS, so a FAIL keeps alerting until production moves forward again.
// A missing checkpoint (first run, cache miss or eviction) records the served SHA as
// the baseline and exits 0. Later runs compare against that checkpoint. A rollback or
// a diverged served SHA FAILs and does not overwrite it. --initialize is accepted and
// does not skip a comparison when a checkpoint is already present.
// Exit 0 PASS, 1 FAIL, 2 BLOCKED.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  // No checkpoint yet: seed from the served SHA. A scheduled run can arm the alert
  // without a manual dispatch. initialize is accepted and does not change this
  // outcome. An existing checkpoint is still compared below, including when
  // initialize is set.
  if (previousSha === null || previousSha === undefined || previousSha === "") {
    void initialize;
    return { status: "PASS", reason: "baseline_recorded" };
  }
  // A recorded state that is not a commit SHA cannot be compared; fail closed and keep it.
  if (!isSha(previousSha)) return { status: "BLOCKED", reason: "previous_unreadable" };
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
  initialize = false,
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
  if (result.status === "PASS") writeServed(servedSha);
  log(formatServedBuildSummary(result, { servedSha, previousSha }));
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
    },
  });
  const previousFile = values["previous-file"];
  const writeFile = values["write-file"];
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
    initialize: values.initialize === true,
  });
  process.exitCode = outcome.exitCode;
}
