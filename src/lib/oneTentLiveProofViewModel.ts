/**
 * oneTentLiveProofViewModel — pure helpers for the One-Tent Live Proof
 * guided demo page.
 *
 * Hard rules:
 *   - Pure. No I/O, no React, no Supabase, no time except injectable `now`.
 *   - Never invents step completion. When a step cannot be safely
 *     inferred, status is "needs-confirmation".
 *   - Never describes automation, AI fixes, or device control.
 *   - Mirrors the alert-engine persistence gate via `buildSourceChip`.
 */
import {
  alertsPath,
  actionsPath,
  timelinePath,
  sensorsPath,
  growDetailPath,
  alertDetailPath,
  actionDetailPath,
} from "@/lib/routes";
import { buildSourceChip, type SourceChipViewModel } from "@/lib/alertFreshnessContext";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

export type ProofStepStatus =
  | "pending"
  | "complete"
  | "stale"
  | "needs-confirmation";

export interface ProofStep {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  status: ProofStepStatus;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Short evidence summary suitable for the printable report. */
  evidenceSummary?: string;
  /** Operator-facing missing-evidence line, or null when complete. */
  missingEvidence?: string | null;
}

export interface ProofShortcutLink {
  id: "snapshot" | "alert" | "action" | "timeline";
  label: string;
  href: string;
  /** True when the href points at the specific known detail route. */
  exact: boolean;
}

export interface ProofSafetyBadge {
  id: string;
  label: string;
}

export const PROOF_SAFETY_BADGES: ReadonlyArray<ProofSafetyBadge> = [
  { id: "manual-or-live", label: "Manual or live data only" },
  { id: "no-fake-live", label: "No fake live data" },
  { id: "alerts-need-fresh", label: "Alerts require fresh manual/live readings" },
  { id: "grower-approved", label: "Action Queue is grower-approved" },
  { id: "no-device-control", label: "No device control" },
];

/** Operator-facing reminder shown on the proof page. Never includes
 *  tokens, endpoints, or secret-shaped strings. */
export const PROOF_DEMO_SAFETY_WARNING =
  "Demo safety: avoid opening bridge token, webhook, or integration credential screens while recording.";

/** Recommended demo path checklist. Pure UI copy. */
export const PROOF_DEMO_RUN_STEPS: ReadonlyArray<string> = [
  "Add Manual Snapshot",
  "Open Alerts",
  "Add to Action Queue",
  "Complete Action",
  "Open Timeline",
  "Refresh Proof Status",
];

export interface ProofContextInput {
  grow?: { id: string; name: string | null } | null;
  tent?: { id: string; name: string | null } | null;
  plant?: { id: string; name: string | null } | null;
}

export interface ProofSignalsInput {
  /** Latest sensor snapshot for the selected scope. */
  snapshot: SensorSnapshot | null;
  snapshotStatus: "idle" | "loading" | "ok" | "unavailable";
  /** True when ANY open alert exists for the selected grow. Caller is
   * responsible for scoping. */
  hasMatchingOpenAlert: boolean;
  /** Optional id of the matching open alert. When known, enables a
   * deep-link CTA. Not rendered as visible copy. */
  matchingAlertId?: string | null;
  /** True when at least one action_queue row references any of the grow's
   * alerts via the existing back-pointer, regardless of status. */
  linkedActionExists: boolean;
  /** Optional id of the single linked action when uniquely known. When
   * present, enables a deep-link CTA. Not rendered as visible copy. */
  linkedActionId?: string | null;
  /** True only when at least one linked action is in a completed
   * terminal state. `null` = unknown / not yet inferable. */
  linkedActionCompleted: boolean | null;
  /** True when a follow-up diary row has been inferred from existing
   * read-only data for the completed linked action. `null` = unknown. */
  timelineFollowupConfirmed: boolean | null;
  now?: number;
}

export interface ProofViewModel {
  selectionSummary: string | null;
  steps: ProofStep[];
  safetyBadges: ReadonlyArray<ProofSafetyBadge>;
  nextRecommendedStepId: ProofStep["id"] | null;
  proofComplete: boolean;
  needsOperatorConfirmation: boolean;
  sourceChip: SourceChipViewModel;
  shortcutLinks: ProofShortcutLink[];
}

/* -------------------------------------------------------------------------- */

function summarizeContext(ctx: ProofContextInput): string | null {
  const parts: string[] = [];
  if (ctx.grow?.name) parts.push(`Grow: ${ctx.grow.name}`);
  if (ctx.tent?.name) parts.push(`Tent: ${ctx.tent.name}`);
  if (ctx.plant?.name) parts.push(`Plant: ${ctx.plant.name}`);
  return parts.length ? parts.join(" · ") : null;
}

function step1(ctx: ProofContextInput): ProofStep {
  const haveGrow = !!ctx.grow?.id;
  const haveTent = !!ctx.tent?.id;
  const complete = haveGrow && haveTent;
  return {
    id: 1,
    label: "Context selected",
    status: complete ? "complete" : "pending",
    message: complete
      ? "Grow and tent selected for the proof."
      : "Create or select a grow and tent to run the proof.",
    ctaLabel: ctx.grow?.id ? "Open Grow" : undefined,
    ctaHref: ctx.grow?.id ? growDetailPath(ctx.grow.id) : undefined,
  };
}

function step2(chip: SourceChipViewModel, ctx: ProofContextInput): ProofStep {
  const href = sensorsPath(ctx.grow?.id ?? null) + "#manual-reading";
  const LABEL = "Add a fresh Manual Sensor Snapshot";
  const HELPER =
    "Use the Manual Snapshot form, not Quick Log hardware notes, so Alerts can evaluate the reading. After saving, return here and click Refresh proof status.";
  if (chip.tone === "eligible") {
    return {
      id: 2,
      label: LABEL,
      status: "complete",
      message: `Latest snapshot is ${chip.label} (${chip.qualifier ?? "fresh"}) and eligible for alert persistence.`,
      ctaLabel: "Open Manual Snapshot",
      ctaHref: href,
    };
  }
  if (chip.tone === "warning") {
    return {
      id: 2,
      label: LABEL,
      status: "stale",
      message:
        "Not ready: no fresh manual snapshot is saved inside the alert window. " +
        HELPER,
      ctaLabel: "Open Manual Snapshot",
      ctaHref: href,
    };
  }
  if (chip.tone === "context") {
    return {
      id: 2,
      label: LABEL,
      status: "pending",
      message:
        "Not ready: latest snapshot is context-only (CSV/diary/simulated). " +
        HELPER,
      ctaLabel: "Open Manual Snapshot",
      ctaHref: href,
    };
  }
  return {
    id: 2,
    label: LABEL,
    status: "pending",
    message:
      "Not ready: no fresh manual snapshot is saved inside the alert window. " +
      HELPER,
    ctaLabel: "Open Manual Snapshot",
    ctaHref: href,
  };
}

function step3(args: {
  ctx: ProofContextInput;
  chip: SourceChipViewModel;
  hasMatchingOpenAlert: boolean;
  matchingAlertId?: string | null;
}): ProofStep {
  const fallback = alertsPath(args.ctx.grow?.id ?? null);
  const href = args.matchingAlertId
    ? alertDetailPath(args.matchingAlertId)
    : fallback;
  const ctaLabel = args.matchingAlertId ? "Open alert detail" : "Open Alerts";
  if (args.hasMatchingOpenAlert) {
    return {
      id: 3,
      label: "Alert created from target breach",
      status: "complete",
      message: "Matching open alert found for the selected grow.",
      ctaLabel,
      ctaHref: href,
    };
  }
  const explanation =
    args.chip.tone === "eligible"
      ? "Not ready: no open alert found for the selected grow. Confirm the snapshot is inside the freshness window and a target was breached."
      : "Not ready: no open alert found for the selected grow. Confirm the manual snapshot saved, target was breached, and the snapshot is inside the freshness window.";
  return {
    id: 3,
    label: "Alert created from target breach",
    status: "pending",
    message: explanation,
    ctaLabel: "Open Alerts",
    ctaHref: fallback,
  };
}

function step4(args: {
  ctx: ProofContextInput;
  hasMatchingOpenAlert: boolean;
  linkedActionExists: boolean;
  linkedActionId?: string | null;
}): ProofStep {
  const fallback = actionsPath(args.ctx.grow?.id ?? null);
  const href = args.linkedActionId
    ? actionDetailPath(args.linkedActionId)
    : fallback;
  if (args.linkedActionExists) {
    return {
      id: 4,
      label: "Action Queue item created",
      status: "complete",
      message:
        "Action Queue item found linked to an alert. Action Queue items are grower-initiated and approval-required.",
      ctaLabel: args.linkedActionId ? "Open action detail" : "Open Action Queue",
      ctaHref: href,
    };
  }
  return {
    id: 4,
    label: "Action Queue item created",
    status: "pending",
    message:
      "Not ready: alert has not been added to Action Queue. Open the alert and add it. Action Queue items are grower-initiated and approval-required.",
    ctaLabel: "Open Alerts",
    ctaHref: alertsPath(args.ctx.grow?.id ?? null),
  };
}

function step5(args: {
  ctx: ProofContextInput;
  linkedActionExists: boolean;
  linkedActionCompleted: boolean | null;
  linkedActionId?: string | null;
}): ProofStep {
  const fallback = actionsPath(args.ctx.grow?.id ?? null);
  const href = args.linkedActionId
    ? actionDetailPath(args.linkedActionId)
    : fallback;
  const ctaLabel = args.linkedActionId ? "Open action detail" : "Open Action Queue";
  if (args.linkedActionCompleted === true) {
    return {
      id: 5,
      label: "Action completed",
      status: "complete",
      message:
        "Linked action completed. Completing an action records the grower's decision. Verdant does not control equipment.",
      ctaLabel,
      ctaHref: href,
    };
  }
  if (args.linkedActionExists && args.linkedActionCompleted === false) {
    return {
      id: 5,
      label: "Action completed",
      status: "pending",
      message:
        "Not ready: linked Action Queue item is not completed. Complete it in Action Queue. Completing an action records the grower's decision.",
      ctaLabel,
      ctaHref: href,
    };
  }
  if (args.linkedActionCompleted === null) {
    return {
      id: 5,
      label: "Action completed",
      status: "needs-confirmation",
      message:
        "Needs operator confirmation. Open the Action Queue and confirm the linked action is completed. Verdant does not control equipment.",
      ctaLabel,
      ctaHref: href,
    };
  }
  return {
    id: 5,
    label: "Action completed",
    status: "pending",
    message:
      "Complete the action in Action Queue. Completing an action records the grower's decision.",
    ctaLabel,
    ctaHref: href,
  };
}

function step6(args: {
  ctx: ProofContextInput;
  timelineFollowupConfirmed: boolean | null;
}): ProofStep {
  const href = timelinePath(args.ctx.grow?.id ?? null);
  if (args.timelineFollowupConfirmed === true) {
    return {
      id: 6,
      label: "Timeline follow-up visible",
      status: "complete",
      message: "Timeline follow-up confirmed for the completed action.",
      ctaLabel: "Open Timeline",
      ctaHref: href,
    };
  }
  return {
    id: 6,
    label: "Timeline follow-up visible",
    status: "needs-confirmation",
    message:
      "Needs operator confirmation. Open Timeline and confirm the completed action appears as a follow-up.",
    ctaLabel: "Open Timeline",
    ctaHref: href,
  };
}

export function buildOneTentLiveProofViewModel(
  context: ProofContextInput,
  signals: ProofSignalsInput,
): ProofViewModel {
  const chip = buildSourceChip({
    status: signals.snapshotStatus,
    snapshot: signals.snapshot,
    now: signals.now,
  });
  const steps: ProofStep[] = [
    step1(context),
    step2(chip, context),
    step3({
      ctx: context,
      chip,
      hasMatchingOpenAlert: signals.hasMatchingOpenAlert,
      matchingAlertId: signals.matchingAlertId ?? null,
    }),
    step4({
      ctx: context,
      hasMatchingOpenAlert: signals.hasMatchingOpenAlert,
      linkedActionExists: signals.linkedActionExists,
      linkedActionId: signals.linkedActionId ?? null,
    }),
    step5({
      ctx: context,
      linkedActionExists: signals.linkedActionExists,
      linkedActionCompleted: signals.linkedActionCompleted,
      linkedActionId: signals.linkedActionId ?? null,
    }),
    step6({
      ctx: context,
      timelineFollowupConfirmed: signals.timelineFollowupConfirmed,
    }),
  ];
  // Decorate steps with evidence/missing-evidence copy.
  const decorated = steps.map((s) => decorateStep(s, { chip, signals }));
  const nextRecommendedStepId =
    (decorated.find((s) => s.status === "pending" || s.status === "stale")?.id as
      | ProofStep["id"]
      | undefined) ?? null;
  const proofComplete = decorated.every((s) => s.status === "complete");
  const needsOperatorConfirmation = decorated.some(
    (s) => s.status === "needs-confirmation",
  );
  const shortcutLinks = buildShortcutLinks(context, signals);
  return {
    selectionSummary: summarizeContext(context),
    steps: decorated,
    safetyBadges: PROOF_SAFETY_BADGES,
    nextRecommendedStepId,
    proofComplete,
    needsOperatorConfirmation,
    sourceChip: chip,
    shortcutLinks,
  };
}

/* ----------------------- Evidence + shortcut helpers ---------------------- */

function decorateStep(
  step: ProofStep,
  args: { chip: SourceChipViewModel; signals: ProofSignalsInput },
): ProofStep {
  const { chip, signals } = args;
  let evidenceSummary = "";
  let missingEvidence: string | null = null;
  switch (step.id) {
    case 1:
      evidenceSummary =
        step.status === "complete" ? "Grow and tent selected." : "Not selected.";
      missingEvidence =
        step.status === "complete" ? null : "Missing evidence: select a grow and tent.";
      break;
    case 2:
      evidenceSummary =
        step.status === "complete"
          ? `Latest snapshot: ${chip.label}${chip.qualifier ? ` (${chip.qualifier})` : ""}.`
          : step.status === "stale"
            ? "Latest snapshot is stale or context-only."
            : "No fresh manual/live snapshot available.";
      missingEvidence =
        step.status === "complete"
          ? null
          : "Missing evidence: fresh manual/live snapshot inside the alert window.";
      break;
    case 3:
      evidenceSummary =
        step.status === "complete"
          ? "Matching open alert found."
          : "No matching open alert for the selected grow.";
      missingEvidence =
        step.status === "complete"
          ? null
          : "Missing evidence: open alert linked to the latest target breach.";
      break;
    case 4:
      evidenceSummary =
        step.status === "complete"
          ? "Action Queue item linked to alert."
          : "No linked Action Queue item.";
      missingEvidence =
        step.status === "complete"
          ? null
          : "Missing evidence: alert has not been added to Action Queue.";
      break;
    case 5:
      if (step.status === "complete") {
        evidenceSummary = "Linked action completed.";
        missingEvidence = null;
      } else if (step.status === "needs-confirmation") {
        evidenceSummary = "Completion cannot be inferred from existing data.";
        missingEvidence =
          "Needs operator confirmation: linked action completion cannot be inferred.";
      } else {
        evidenceSummary =
          signals.linkedActionExists && signals.linkedActionCompleted === false
            ? "Linked action still open."
            : "No linked action to complete.";
        missingEvidence =
          "Missing evidence: linked Action Queue item is not completed.";
      }
      break;
    case 6:
      if (step.status === "complete") {
        evidenceSummary = "Follow-up visible in Timeline.";
        missingEvidence = null;
      } else {
        evidenceSummary = "Timeline follow-up cannot be inferred.";
        missingEvidence =
          "Needs operator confirmation: no safe timeline back-pointer is available.";
      }
      break;
  }
  return { ...step, evidenceSummary, missingEvidence };
}

function buildShortcutLinks(
  ctx: ProofContextInput,
  signals: ProofSignalsInput,
): ProofShortcutLink[] {
  const growId = ctx.grow?.id ?? null;
  const alertExact = !!signals.matchingAlertId;
  const actionExact = !!signals.linkedActionId;
  return [
    {
      id: "snapshot",
      label: "Open Manual Snapshot",
      href: `${sensorsPath(growId)}#manual-reading`,
      exact: false,
    },
    {
      id: "alert",
      label: "Open Alert",
      href: alertExact
        ? alertDetailPath(signals.matchingAlertId as string)
        : alertsPath(growId),
      exact: alertExact,
    },
    {
      id: "action",
      label: "Open Action",
      href: actionExact
        ? actionDetailPath(signals.linkedActionId as string)
        : actionsPath(growId),
      exact: actionExact,
    },
    {
      id: "timeline",
      label: "Open Timeline",
      href: timelinePath(growId),
      exact: false,
    },
  ];
}

/* ----------------------------- Report builder ----------------------------- */

export const PROOF_REPORT_TITLE = "One-Tent Live Proof Report";

export const PROOF_REPORT_SAFETY_NOTES: ReadonlyArray<string> = [
  "Manual or live data only",
  "No fake live data",
  "No automation",
  "No device control",
  "Action Queue remains grower-approved",
];

const STATUS_LABEL_FOR_REPORT: Record<ProofStepStatus, string> = {
  pending: "Pending",
  complete: "Complete",
  stale: "Stale",
  "needs-confirmation": "Needs operator confirmation",
};

export interface ProofReportStepRow {
  id: number;
  label: string;
  status: ProofStepStatus;
  statusLabel: string;
  evidenceSummary: string;
  missingEvidence: string | null;
}

export interface ProofReport {
  title: string;
  generatedAtLabel: string;
  generatedAtIso: string;
  contextLines: string[];
  safetyNotes: ReadonlyArray<string>;
  steps: ProofReportStepRow[];
  proofComplete: boolean;
  closingLine: string | null;
  markdown: string;
}

function formatGeneratedAt(now: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

/**
 * Build a sanitized, printable proof report from the view-model.
 *
 * Safety:
 *   - Never includes internal ids, raw payloads, or secrets.
 *   - Closing line says "LIVE PROOF REMAINS GREEN" only when
 *     `vm.proofComplete` is true.
 */
export function buildOneTentLiveProofReport(
  vm: ProofViewModel,
  opts: { now: Date | number },
): ProofReport {
  const nowDate = opts.now instanceof Date ? opts.now : new Date(opts.now);
  const generatedAtLabel = formatGeneratedAt(nowDate);
  const generatedAtIso = nowDate.toISOString();
  const contextLines = vm.selectionSummary
    ? vm.selectionSummary.split(" · ")
    : ["No grow/tent selected."];
  const steps: ProofReportStepRow[] = vm.steps.map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    statusLabel: STATUS_LABEL_FOR_REPORT[s.status],
    evidenceSummary: s.evidenceSummary ?? "",
    missingEvidence: s.missingEvidence ?? null,
  }));
  const closingLine = vm.proofComplete ? "LIVE PROOF REMAINS GREEN" : null;
  const md: string[] = [];
  md.push(`# ${PROOF_REPORT_TITLE}`);
  md.push("");
  md.push(`Generated: ${generatedAtLabel}`);
  md.push("");
  md.push(`## Context`);
  for (const c of contextLines) md.push(`- ${c}`);
  md.push("");
  md.push(`## Safety notes`);
  for (const n of PROOF_REPORT_SAFETY_NOTES) md.push(`- ${n}`);
  md.push("");
  md.push(`## Checklist`);
  for (const s of steps) {
    md.push(`### ${s.id}. ${s.label} — ${s.statusLabel}`);
    if (s.evidenceSummary) md.push(`Evidence: ${s.evidenceSummary}`);
    if (s.missingEvidence) md.push(s.missingEvidence);
    md.push("");
  }
  if (closingLine) {
    md.push(`**${closingLine}**`);
  }
  return {
    title: PROOF_REPORT_TITLE,
    generatedAtLabel,
    generatedAtIso,
    contextLines,
    safetyNotes: PROOF_REPORT_SAFETY_NOTES,
    steps,
    proofComplete: vm.proofComplete,
    closingLine,
    markdown: md.join("\n"),
  };
}

/** Convenience: alert-detail link helper for the Action Queue handoff. */
export function proofAlertDetailHref(alertId: string): string {
  return alertDetailPath(alertId);
}

/** Convenience: action-detail link helper for the Action Queue handoff. */
export function proofActionDetailHref(actionId: string): string {
  return actionDetailPath(actionId);
}
