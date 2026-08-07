/**
 * Pure verdict logic for the post-merge required-status-check audit.
 *
 * A green merge is not proof that the gates ran. Ruleset 20421416 grants
 * `RepositoryRole 5` a `pull_request` bypass, so an admin can merge a PR whose
 * required contexts are red — which is exactly what happened to PR #769, where
 * `Full test suite (shard 26/32)` reported `failure` and the merge landed
 * anyway, leaving the deploy branch red for roughly nine hours.
 *
 * This module answers one question against evidence the caller fetched:
 * for the commit that just landed on the deploy branch, did every context we
 * believe gates that branch actually run and go green?
 *
 * Two provenances, because two different failures produced the same outcome:
 *  - `required`    mirrors the ruleset. Red or absent here means a bypass.
 *  - `mustBeGreen` is not in the ruleset at all. Red here means the gate the
 *    repo believes it has does not exist.
 *
 * No network, no clock, no randomness. Ordering is stable with explicit
 * tie-breakers so the same evidence always yields the same report.
 */

/** Per-context outcome. Mirrors the status vocabulary in AGENTS.md. */
export const CHECK_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  MISSING: "MISSING",
  NOT_MEASURED: "NOT_MEASURED",
});

/** Overall audit outcome. */
export const AUDIT_VERDICT = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
});

/** How the head commit under audit was reached. */
export const PR_RESOLUTION = Object.freeze({
  PULL_REQUEST: "pull_request",
  NO_PULL_REQUEST: "no_pull_request",
});

/**
 * GitHub treats `neutral` and `skipped` as satisfying a required check, so the
 * audit must too or it would report reds GitHub never blocked on. `skipped` is
 * still surfaced as NOT_MEASURED rather than PASS — a check that did not run is
 * not evidence that it would have passed.
 */
const CONCLUSION_STATUS = Object.freeze({
  success: CHECK_STATUS.PASS,
  neutral: CHECK_STATUS.PASS,
  skipped: CHECK_STATUS.NOT_MEASURED,
  failure: CHECK_STATUS.FAIL,
  timed_out: CHECK_STATUS.FAIL,
  cancelled: CHECK_STATUS.FAIL,
  action_required: CHECK_STATUS.FAIL,
  stale: CHECK_STATUS.FAIL,
  startup_failure: CHECK_STATUS.FAIL,
});

/** Legacy commit-status states. `pending` is a FAIL: it merged before finishing. */
const STATE_STATUS = Object.freeze({
  success: CHECK_STATUS.PASS,
  failure: CHECK_STATUS.FAIL,
  error: CHECK_STATUS.FAIL,
  pending: CHECK_STATUS.FAIL,
});

function asString(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Descending sort key for picking the surviving observation of a context.
 * Newest wins; `id` breaks ties so equal timestamps never sort randomly.
 */
function compareObservations(a, b) {
  const aTime = a.completedAt || a.startedAt || "";
  const bTime = b.completedAt || b.startedAt || "";
  if (aTime !== bTime) return aTime < bTime ? 1 : -1;
  const aId = Number.isFinite(a.id) ? a.id : -1;
  const bId = Number.isFinite(b.id) ? b.id : -1;
  if (aId !== bId) return bId - aId;
  return a.context < b.context ? -1 : a.context > b.context ? 1 : 0;
}

/**
 * Fold raw check-runs and legacy commit statuses into one context -> observation
 * map. Both APIs can report the same required context, so matching only
 * `check_runs` would drop contexts into MISSING and produce a false red.
 */
export function normalizeObservedChecks({ checkRuns = [], commitStatuses = [] } = {}) {
  const observations = [];

  for (const run of Array.isArray(checkRuns) ? checkRuns : []) {
    const context = asString(run?.name).trim();
    if (!context) continue;
    const completed = asString(run?.status) === "completed";
    const conclusion = asString(run?.conclusion);
    const status = completed
      ? (CONCLUSION_STATUS[conclusion] ?? CHECK_STATUS.FAIL)
      : CHECK_STATUS.FAIL;
    observations.push({
      context,
      status,
      source: "check_run",
      observed: completed
        ? conclusion || "(no conclusion)"
        : asString(run?.status) || "(no status)",
      incomplete: !completed,
      id: Number(run?.id),
      startedAt: asString(run?.started_at),
      completedAt: asString(run?.completed_at),
    });
  }

  for (const entry of Array.isArray(commitStatuses) ? commitStatuses : []) {
    const context = asString(entry?.context).trim();
    if (!context) continue;
    const state = asString(entry?.state);
    observations.push({
      context,
      status: STATE_STATUS[state] ?? CHECK_STATUS.FAIL,
      source: "commit_status",
      observed: state || "(no state)",
      incomplete: state === "pending",
      id: Number(entry?.id),
      startedAt: asString(entry?.created_at),
      completedAt: asString(entry?.updated_at),
    });
  }

  const byContext = new Map();
  for (const observation of observations) {
    const existing = byContext.get(observation.context);
    if (!existing || compareObservations(observation, existing) < 0) {
      byContext.set(observation.context, observation);
    }
  }
  return byContext;
}

function evaluate(contexts, provenance, observed, failOn) {
  const findings = [];
  for (const context of [...new Set(contexts)].sort()) {
    const observation = observed.get(context);
    const status = observation ? observation.status : CHECK_STATUS.MISSING;
    let reason = "";
    if (status === CHECK_STATUS.MISSING) {
      reason = "no check run or commit status reported this context";
    } else if (observation.incomplete) {
      reason = `still ${observation.observed} when the merge landed`;
    } else if (status === CHECK_STATUS.FAIL) {
      reason = `reported ${observation.observed}`;
    } else if (status === CHECK_STATUS.NOT_MEASURED) {
      reason = "skipped — did not run, so it proves nothing";
    }
    findings.push({
      context,
      provenance,
      status,
      reason,
      observed: observation ? observation.observed : null,
      source: observation ? observation.source : null,
      failing: failOn.includes(status),
    });
  }
  return findings;
}

/**
 * Audit one merged commit.
 *
 * `required` fails on FAIL or MISSING: the ruleset says these must be present
 * and green, so an absent one is as much a violation as a red one.
 *
 * `mustBeGreen` fails only on FAIL. These contexts are not gated by anything,
 * so path-filtered and opt-in workflows legitimately do not run on every PR —
 * failing on MISSING there would produce constant false reds and the job would
 * be switched off within a week.
 *
 * A commit with no associated pull request is a FAIL in its own right: the
 * required checks never ran on any PR head, so there is no evidence to audit.
 * Silence here would be indistinguishable from success.
 */
export function auditRequiredChecks({
  pinned,
  checkRuns = [],
  commitStatuses = [],
  prResolution,
  rulesetDrift = null,
} = {}) {
  const required = Array.isArray(pinned?.required) ? pinned.required : [];
  const mustBeGreen = Array.isArray(pinned?.mustBeGreen) ? pinned.mustBeGreen : [];
  const observed = normalizeObservedChecks({ checkRuns, commitStatuses });

  const findings = [
    ...evaluate(required, "required", observed, [CHECK_STATUS.FAIL, CHECK_STATUS.MISSING]),
    ...evaluate(mustBeGreen, "mustBeGreen", observed, [CHECK_STATUS.FAIL]),
  ];

  const blockers = [];
  const resolutionKind = prResolution?.kind ?? PR_RESOLUTION.NO_PULL_REQUEST;
  if (resolutionKind !== PR_RESOLUTION.PULL_REQUEST) {
    blockers.push({
      code: "no_pull_request",
      message:
        "commit has no associated pull request — required checks never ran on a PR head, " +
        "so nothing about this merge has been verified",
    });
  }

  const failingFindings = findings.filter((f) => f.failing);
  const verdict =
    blockers.length > 0 || failingFindings.length > 0 ? AUDIT_VERDICT.FAIL : AUDIT_VERDICT.PASS;

  return {
    verdict,
    prResolution: prResolution ?? { kind: PR_RESOLUTION.NO_PULL_REQUEST },
    findings,
    failingFindings,
    blockers,
    // Never synthesised. A drift check with no admin token stays BLOCKED.
    rulesetDrift: rulesetDrift ?? {
      status: "BLOCKED",
      reason: "no admin token supplied — pinned list could not be compared with the live ruleset",
    },
    counts: {
      required: required.length,
      mustBeGreen: mustBeGreen.length,
      observed: observed.size,
      failing: failingFindings.length,
    },
  };
}

/**
 * Compare the pinned list with the live ruleset. Only called when an admin
 * token was available; absence of a token is BLOCKED, resolved by the caller.
 */
export function diffPinnedAgainstRuleset(pinnedRequired, liveContexts) {
  const pinnedSet = new Set(Array.isArray(pinnedRequired) ? pinnedRequired : []);
  const liveSet = new Set(Array.isArray(liveContexts) ? liveContexts : []);
  const removedFromRuleset = [...pinnedSet].filter((c) => !liveSet.has(c)).sort();
  const addedToRuleset = [...liveSet].filter((c) => !pinnedSet.has(c)).sort();
  return {
    status: removedFromRuleset.length || addedToRuleset.length ? "FAIL" : "PASS",
    removedFromRuleset,
    addedToRuleset,
  };
}

/** Render a Markdown report for the Actions job summary. */
export function formatAuditReport(result, { sha = "", prNumber = null } = {}) {
  const lines = [];
  lines.push(`## Required-check audit — ${result.verdict}`);
  lines.push("");
  lines.push(`- commit: \`${sha || "(unknown)"}\``);
  lines.push(`- pull request: ${prNumber ? `#${prNumber}` : "**none — see blockers**"}`);
  lines.push(
    `- contexts: ${result.counts.required} required, ${result.counts.mustBeGreen} must-be-green, ` +
      `${result.counts.observed} observed`,
  );
  lines.push(`- ruleset drift: ${result.rulesetDrift.status}`);
  lines.push("");

  if (result.blockers.length) {
    lines.push("### Blockers");
    for (const blocker of result.blockers) lines.push(`- **${blocker.code}** — ${blocker.message}`);
    lines.push("");
  }

  if (result.failingFindings.length) {
    lines.push("### Failing contexts");
    lines.push("");
    lines.push("| context | provenance | status | detail |");
    lines.push("| --- | --- | --- | --- |");
    for (const f of result.failingFindings) {
      lines.push(`| \`${f.context}\` | ${f.provenance} | ${f.status} | ${f.reason} |`);
    }
    lines.push("");
  }

  const notMeasured = result.findings.filter((f) => f.status === CHECK_STATUS.NOT_MEASURED);
  if (notMeasured.length) {
    lines.push("### Not measured (skipped — surfaced, not failed)");
    for (const f of notMeasured) lines.push(`- \`${f.context}\` (${f.provenance})`);
    lines.push("");
  }

  if (result.verdict === AUDIT_VERDICT.PASS) {
    lines.push("Every pinned context ran and went green on the merged pull request head.");
  }
  return lines.join("\n");
}
