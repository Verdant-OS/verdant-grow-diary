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
  if (chip.tone === "eligible") {
    return {
      id: 2,
      label: "Fresh manual snapshot saved",
      status: "complete",
      message: `Latest snapshot is ${chip.label} (${chip.qualifier ?? "fresh"}) and eligible for alert persistence.`,
      ctaLabel: "Open Sensors",
      ctaHref: href,
    };
  }
  if (chip.tone === "warning") {
    return {
      id: 2,
      label: "Fresh manual snapshot saved",
      status: "stale",
      message:
        "Latest manual/live snapshot is stale. Enter a fresh manual reading inside the alert window. Example: RH 61% with RH max target set to 55%.",
      ctaLabel: "Add Manual Snapshot",
      ctaHref: href,
    };
  }
  if (chip.tone === "context") {
    return {
      id: 2,
      label: "Fresh manual snapshot saved",
      status: "pending",
      message:
        "Latest snapshot is context-only (CSV/diary/simulated). Enter a real manual reading to create a persisted alert.",
      ctaLabel: "Add Manual Snapshot",
      ctaHref: href,
    };
  }
  return {
    id: 2,
    label: "Fresh manual snapshot saved",
    status: "pending",
    message:
      "Enter a real/manual reading. For the proof, use a value that safely breaches one target. Example: RH 61% with RH max target set to 55%.",
    ctaLabel: "Add Manual Snapshot",
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
      ? "No matching alert yet. Confirm the snapshot is inside the freshness window and a target was breached."
      : "No matching alert yet. Confirm the manual snapshot saved, target was breached, and the snapshot is inside the freshness window.";
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
      "Open the alert and add it to Action Queue. Action Queue items are grower-initiated and approval-required.",
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
        "Linked action is still open. Complete it in Action Queue. Completing an action records the grower's decision.",
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
  const nextRecommendedStepId =
    (steps.find((s) => s.status === "pending" || s.status === "stale")?.id as
      | ProofStep["id"]
      | undefined) ?? null;
  const proofComplete = steps.every((s) => s.status === "complete");
  const needsOperatorConfirmation = steps.some(
    (s) => s.status === "needs-confirmation",
  );
  return {
    selectionSummary: summarizeContext(context),
    steps,
    safetyBadges: PROOF_SAFETY_BADGES,
    nextRecommendedStepId,
    proofComplete,
    needsOperatorConfirmation,
    sourceChip: chip,
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
