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
 *
 * When `mergedAt` is supplied the fold is evaluated *as of the merge*, not as
 * of now. Only an observation that had already completed when the merge landed
 * is evidence about that merge; anything finishing later is the answer to a
 * question nobody asked before shipping.
 *
 * This is not hypothetical. On PR #769 only 3 of 89 runs had completed at
 * merge time — all neutral or skipped — and `Full test suite (shard 26/32)`
 * did not start until 3.5 minutes after the merge. Reading final state alone
 * reports that merge as "one red shard" when the truth is that nothing had
 * run at all, and it lets a post-merge re-run launder a pre-merge red.
 */
export function normalizeObservedChecks({
  checkRuns = [],
  commitStatuses = [],
  mergedAt = null,
  landedSha = "",
} = {}) {
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
      // Which commit this evidence was recorded against. Load-bearing: the
      // landed sha and the PR head are separate bodies of evidence and must
      // not collapse into each other.
      sha: asString(run?.head_sha),
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
      sha: asString(entry?.sha),
      observed: state || "(no state)",
      incomplete: state === "pending",
      id: Number(entry?.id),
      startedAt: asString(entry?.created_at),
      completedAt: asString(entry?.updated_at),
    });
  }

  const mergeCutoff = mergedAt ? Date.parse(mergedAt) : Number.NaN;
  const gateAtMerge = Number.isFinite(mergeCutoff);

  /** True when this observation had finished before the merge landed. */
  const settledByMerge = (observation) => {
    if (!gateAtMerge) return true;
    if (observation.incomplete || !observation.completedAt) return false;
    const finished = Date.parse(observation.completedAt);
    return Number.isFinite(finished) && finished <= mergeCutoff;
  };

  /**
   * A run which started before a merge but completed afterward was in flight at
   * the cutoff. GitHub would have kept the merge blocked, even when an older
   * completed attempt for the same context was green. Missing timestamps cannot
   * prove a post-merge start, so the audit fails closed rather than crediting
   * the older result.
   */
  const unfinishedAtMerge = (observation) => {
    if (!gateAtMerge || settledByMerge(observation)) return false;
    const started = Date.parse(observation.startedAt);
    return !Number.isFinite(started) || started <= mergeCutoff;
  };

  // Resolve per (context, source, sha), not per context. Two independent
  // reasons the key has to be that wide:
  //
  //   source  GitHub treats a check run and a legacy commit status of the same
  //           name as two independently required results.
  //   sha     evidence is gathered from both the landed commit and the PR head.
  //           A queued merge's merge-group run lives on the landed sha; a
  //           same-named PR-head rerun finishing later — but still before the
  //           merge — would otherwise win on recency and hide a red
  //           merge-group result behind a green head one.
  //
  // Collapsing either dimension early lets one observation overwrite another
  // before the worst-first rule below ever sees it.
  const settled = new Map();
  const inFlight = new Map();
  const late = new Map();
  for (const observation of observations) {
    const key = `${observation.source} ${observation.sha ?? ""} ${observation.context}`;
    const bucket = settledByMerge(observation)
      ? settled
      : unfinishedAtMerge(observation)
        ? inFlight
        : late;
    const existing = bucket.get(key);
    if (!existing || compareObservations(observation, existing) < 0) {
      bucket.set(key, observation);
    }
  }

  // Merge-queue checks run on the landed merge-group SHA. If any evidence on
  // that SHA existed at merge time, it is authoritative for the whole merge:
  // a same-named PR-head failure/success is not the check that gated the
  // queued commit. Direct merges have no such landed evidence before merging,
  // so they fall back to the PR-head evidence gathered above.
  const authoritativeLandedSha = asString(landedSha);
  const useLandedEvidence = Boolean(
    gateAtMerge &&
    authoritativeLandedSha &&
    [...settled.values(), ...inFlight.values()].some(
      (observation) => observation.sha === authoritativeLandedSha,
    ),
  );
  const isRelevantEvidence = (observation) =>
    !useLandedEvidence || observation.sha === authoritativeLandedSha;

  const selected = new Map();
  const select = (key, observation) => {
    const existing = selected.get(key);
    if (
      !existing ||
      (observation.unfinishedAtMerge && !existing.unfinishedAtMerge) ||
      (observation.unfinishedAtMerge === existing.unfinishedAtMerge &&
        compareObservations(observation, existing) < 0)
    ) {
      selected.set(key, observation);
    }
  };

  for (const [key, observation] of settled) {
    if (isRelevantEvidence(observation)) select(key, observation);
  }
  for (const [key, observation] of inFlight) {
    if (!isRelevantEvidence(observation)) continue;
    select(key, {
      ...observation,
      status: CHECK_STATUS.FAIL,
      unfinishedAtMerge: true,
    });
  }

  // A context whose evidence ALL started after the merge gated nothing. Promote
  // it to a failure rather than crediting the late result.
  //
  // The test is per context, not per key. Now that the key carries the sha, a
  // direct merge's landed commit accumulates post-merge `push` runs under
  // their own keys — and promoting those would bury the genuinely green,
  // genuinely pre-merge PR-head evidence under a manufactured late failure.
  // Caught by re-running the live sweep: #794 and #812 flipped to 35 failures
  // before this was scoped to the context.
  if (gateAtMerge) {
    const contextsWithSettledEvidence = new Set(
      [...selected.values()].map((observation) => observation.context),
    );
    for (const [key, observation] of late) {
      if (!isRelevantEvidence(observation)) continue;
      if (contextsWithSettledEvidence.has(observation.context)) continue;
      select(key, { ...observation, status: CHECK_STATUS.FAIL, lateForMerge: true });
    }
  }

  // Collapse the surviving per-source observations to one per context, worst
  // first: any red source makes the context red regardless of what the other
  // source said, and only then does recency decide.
  const byContext = new Map();
  for (const observation of selected.values()) {
    const existing = byContext.get(observation.context);
    if (!existing) {
      byContext.set(observation.context, observation);
      continue;
    }
    const existingFailing = existing.status === CHECK_STATUS.FAIL;
    const candidateFailing = observation.status === CHECK_STATUS.FAIL;
    if (candidateFailing && !existingFailing) {
      byContext.set(observation.context, observation);
    } else if (
      candidateFailing === existingFailing &&
      compareObservations(observation, existing) < 0
    ) {
      byContext.set(observation.context, observation);
    }
  }
  return byContext;
}

/**
 * Accept `mustBeGreen` entries as either a bare string or a declaration object.
 *
 * `alwaysRuns` decides whether an absent result is a finding. It has to be
 * per-entry, not a blanket rule: `test:security-regression` has no path filter
 * and runs on every pull request to this branch, so its absence is the exact
 * silent-gate failure its own workflow header documents — treating that as
 * "did not apply" would leave the ungated security check unaudited unless it
 * happened to go red. A path-filtered or opt-in entry is the opposite case,
 * where failing on absent would produce a false red on every merge.
 *
 * A bare string reads as `alwaysRuns: false`, the conservative default.
 */
export function normalizeMustBeGreen(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const normalized = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      const context = entry.trim();
      if (context) normalized.push({ context, alwaysRuns: false });
      continue;
    }
    const context = asString(entry?.context).trim();
    if (!context) continue;
    normalized.push({ context, alwaysRuns: entry?.alwaysRuns === true });
  }
  return normalized;
}

function evaluate(contexts, provenance, observed, failOn) {
  const findings = [];
  for (const context of [...new Set(contexts)].sort()) {
    const observation = observed.get(context);
    const status = observation ? observation.status : CHECK_STATUS.MISSING;
    let reason = "";
    if (status === CHECK_STATUS.MISSING) {
      reason = "no check run or commit status reported this context";
    } else if (observation.lateForMerge) {
      reason =
        `had not finished when the merge landed — it started later and reported ` +
        `${observation.observed}, which gated nothing`;
    } else if (observation.unfinishedAtMerge) {
      reason = observation.incomplete
        ? `was still ${observation.observed} when the merge landed`
        : `had started but not finished when the merge landed — it completed later and ` +
          `reported ${observation.observed}`;
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
      lateForMerge: Boolean(observation?.lateForMerge),
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
 *
 * Evidence is read as of `prResolution.mergedAt` when it is known, so a check
 * that finished after the merge cannot retroactively vouch for it.
 */
export function auditRequiredChecks({
  pinned,
  checkRuns = [],
  commitStatuses = [],
  prResolution,
  rulesetDrift = null,
} = {}) {
  const required = Array.isArray(pinned?.required) ? pinned.required : [];
  const mustBeGreen = normalizeMustBeGreen(pinned?.mustBeGreen);
  const observed = normalizeObservedChecks({
    checkRuns,
    commitStatuses,
    mergedAt: prResolution?.mergedAt ?? null,
    landedSha: prResolution?.landedSha ?? "",
  });

  // An always-on entry must report as well as be green: absent or skipped is
  // the silent-gate failure. A conditional entry fails only when it is present
  // and red, so a path-filtered workflow that did not apply stays quiet.
  const alwaysRuns = mustBeGreen.filter((e) => e.alwaysRuns).map((e) => e.context);
  const conditional = mustBeGreen.filter((e) => !e.alwaysRuns).map((e) => e.context);

  // NOT_MEASURED fails for `required` too. A skipped required check did not
  // run, so it proves nothing, and AGENTS.md is explicit that an unmeasured
  // verification is never a pass. Tolerating it here while the weaker
  // `mustBeGreen` list rejects it was incoherent. Measured before changing:
  // zero skipped required contexts across the last 20 merges, so this costs
  // no false reds.
  const findings = [
    ...evaluate(required, "required", observed, [
      CHECK_STATUS.FAIL,
      CHECK_STATUS.MISSING,
      CHECK_STATUS.NOT_MEASURED,
    ]),
    ...evaluate(alwaysRuns, "mustBeGreen", observed, [
      CHECK_STATUS.FAIL,
      CHECK_STATUS.MISSING,
      CHECK_STATUS.NOT_MEASURED,
    ]),
    ...evaluate(conditional, "mustBeGreen", observed, [CHECK_STATUS.FAIL]),
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

  // Never synthesised. A drift check with no admin token stays BLOCKED.
  const drift = rulesetDrift ?? {
    status: "BLOCKED",
    reason: "no admin token supplied — pinned list could not be compared with the live ruleset",
  };

  // A verified drift must fail the run, not merely print. A context added to
  // the live ruleset but absent from the pin is a context this audit does not
  // check at all — reporting PASS beside that is the false-green the job exists
  // to prevent. BLOCKED stays advisory: unverified is not the same as wrong.
  if (drift.status === "FAIL") {
    blockers.push({
      code: "ruleset_drift",
      message:
        (drift.reason ? `${drift.reason} — ` : "") +
        "config/required-status-checks.json no longer matches the live ruleset" +
        (drift.addedToRuleset?.length
          ? ` — not pinned, therefore never audited: ${drift.addedToRuleset.join(", ")}`
          : "") +
        (drift.removedFromRuleset?.length
          ? ` — pinned but no longer required: ${drift.removedFromRuleset.join(", ")}`
          : "") +
        (drift.strictPolicy?.changed
          ? ` — strict_required_status_checks_policy is now ${drift.strictPolicy.live}, ` +
            `pinned as ${drift.strictPolicy.pinned}: checks may now count against a stale base`
          : "") +
        (drift.enforcement?.changed
          ? ` — ruleset enforcement is now ${drift.enforcement.live ?? "(missing)"}, ` +
            `pinned as ${drift.enforcement.pinned}: the ruleset may not enforce anything`
          : "") +
        (drift.refNameConditions?.changed
          ? ` — ref_name conditions are now ${formatRefNameConditions(
              drift.refNameConditions.live,
            )}, pinned as ${formatRefNameConditions(drift.refNameConditions.pinned)}`
          : ""),
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
    rulesetDrift: drift,
    counts: {
      required: required.length,
      mustBeGreen: mustBeGreen.length,
      observed: observed.size,
      failing: failingFindings.length,
      lateForMerge: findings.filter((f) => f.lateForMerge).length,
      unfinishedAtMerge: findings.filter((f) => f.unfinishedAtMerge).length,
    },
  };
}

/**
 * Compare the pinned list with the live ruleset. Only called when an admin
 * token was available; absence of a token is BLOCKED, resolved by the caller.
 */
function normalizeStringList(value) {
  return [
    ...new Set((Array.isArray(value) ? value : []).filter((entry) => typeof entry === "string")),
  ]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

function normalizeRefNameConditions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    include: normalizeStringList(value.include),
    exclude: normalizeStringList(value.exclude),
  };
}

function sameRefNameConditions(a, b) {
  return (
    a !== null &&
    b !== null &&
    a.include.join("\u0000") === b.include.join("\u0000") &&
    a.exclude.join("\u0000") === b.exclude.join("\u0000")
  );
}

function formatRefNameConditions(conditions) {
  if (!conditions) return "(missing)";
  const include = conditions.include.length ? conditions.include.join(", ") : "(none)";
  const exclude = conditions.exclude.length ? conditions.exclude.join(", ") : "(none)";
  return `include [${include}], exclude [${exclude}]`;
}

export function diffPinnedAgainstRuleset(pinnedRequired, liveContexts, policy = {}) {
  const pinnedSet = new Set(Array.isArray(pinnedRequired) ? pinnedRequired : []);
  const liveSet = new Set(Array.isArray(liveContexts) ? liveContexts : []);
  const removedFromRuleset = [...pinnedSet].filter((c) => !liveSet.has(c)).sort();
  const addedToRuleset = [...liveSet].filter((c) => !pinnedSet.has(c)).sort();

  // The context names are not the whole contract. `strict` is what forces a
  // head to be up to date with its base before its checks count; turning it
  // off admits results proven against a stale base while every context name
  // still matches, so comparing names alone would report PASS.
  const pinnedStrict = policy.pinnedStrict;
  const liveStrict = policy.liveStrict;
  const strictComparable = typeof pinnedStrict === "boolean" && typeof liveStrict === "boolean";
  const strictChanged = strictComparable && pinnedStrict !== liveStrict;

  // Disabled enforcement or a ref-name retarget leaves the context list intact
  // while removing it from the audited deploy branch. Keep those pins beside
  // the list and strict flag so an admin-token-backed audit catches all three.
  const pinnedEnforcement = asString(policy.pinnedEnforcement).trim();
  const liveEnforcement = asString(policy.liveEnforcement).trim();
  const enforcementPinned = Boolean(pinnedEnforcement);
  const enforcementChanged =
    enforcementPinned && (!liveEnforcement || pinnedEnforcement !== liveEnforcement);

  const pinnedRefNameConditions = normalizeRefNameConditions(policy.pinnedRefNameConditions);
  const liveRefNameConditions = normalizeRefNameConditions(policy.liveRefNameConditions);
  const refNameConditionsChanged =
    pinnedRefNameConditions !== null &&
    !sameRefNameConditions(pinnedRefNameConditions, liveRefNameConditions);

  return {
    status:
      removedFromRuleset.length ||
      addedToRuleset.length ||
      strictChanged ||
      enforcementChanged ||
      refNameConditionsChanged
        ? "FAIL"
        : "PASS",
    removedFromRuleset,
    addedToRuleset,
    strictPolicy: strictComparable
      ? { pinned: pinnedStrict, live: liveStrict, changed: strictChanged }
      : null,
    enforcement: enforcementPinned
      ? { pinned: pinnedEnforcement, live: liveEnforcement || null, changed: enforcementChanged }
      : null,
    refNameConditions:
      pinnedRefNameConditions !== null
        ? {
            pinned: pinnedRefNameConditions,
            live: liveRefNameConditions,
            changed: refNameConditionsChanged,
          }
        : null,
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
  if (result.prResolution?.mergedAt) {
    lines.push(`- evidence read as of the merge: \`${result.prResolution.mergedAt}\``);
  }
  if (result.counts.lateForMerge) {
    lines.push(
      `- **${result.counts.lateForMerge} pinned context(s) started only after the merge** — ` +
        "they gated nothing",
    );
  }
  if (result.counts.unfinishedAtMerge) {
    lines.push(
      `- **${result.counts.unfinishedAtMerge} pinned context(s) were still in flight at the merge** — ` +
        "an older result cannot vouch for the newer attempt",
    );
  }
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

  // Only the skipped contexts that are NOT failing belong here. Since skipped
  // became a failure for `required` and for alwaysRuns entries, an
  // unconditional "surfaced, not failed" heading would contradict both the
  // verdict and the table directly above it.
  const notMeasured = result.findings.filter(
    (f) => f.status === CHECK_STATUS.NOT_MEASURED && !f.failing,
  );
  if (notMeasured.length) {
    lines.push("### Not measured (skipped — surfaced, not failed)");
    for (const f of notMeasured) lines.push(`- \`${f.context}\` (${f.provenance})`);
    lines.push("");
  }

  if (result.verdict === AUDIT_VERDICT.PASS) {
    // Say exactly what was proved. A skipped required context and an absent
    // must-be-green context are both deliberately non-failing, so "everything
    // ran and went green" would be false in precisely the cases most worth
    // being honest about.
    const skipped = result.findings.filter((f) => f.status === CHECK_STATUS.NOT_MEASURED).length;
    const absent = result.findings.filter((f) => f.status === CHECK_STATUS.MISSING).length;
    const caveats = [];
    if (skipped) caveats.push(`${skipped} skipped`);
    if (absent) caveats.push(`${absent} never reported`);
    lines.push(
      caveats.length
        ? `No pinned context blocked this merge. Not everything was proved, though: ` +
            `${caveats.join(" and ")} — see above.`
        : "Every pinned context ran and went green before this merge landed.",
    );
    if (result.rulesetDrift.status === "BLOCKED") {
      lines.push("");
      lines.push(
        `Ruleset drift is BLOCKED, not PASS: ${String(result.rulesetDrift.reason).replace(/\.$/, "")}. ` +
          "The pinned list is assumed current; it has not been verified.",
      );
    }
  }
  return lines.join("\n");
}
