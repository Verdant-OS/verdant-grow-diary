/**
 * Outcome Follow-up V0 rules.
 *
 * Pure, read-only helper for closing the grower memory loop after an action:
 *   What changed? → How did the plant respond? → Better/Same/Worse.
 *
 * No I/O, no React, no Supabase, no AI, no alerts, no Action Queue, no device control.
 */

import {
  actionTextWithoutResponseContext,
  readResponseCheckStatus,
  responseActionChronologyRank,
} from "@/lib/tenSecondQuickCheckRules";

export interface OutcomeFollowUpRow {
  id?: string | null;
  eventType: string;
  notePreview: string;
  occurredAt: string | null;
}

export interface OutcomeFollowUpInput {
  rows: readonly OutcomeFollowUpRow[] | null | undefined;
  now: number;
  minAgeHours?: number;
  maxAgeHours?: number;
}

export interface OutcomeFollowUpResult {
  showPrompt: boolean;
  reason:
    | "needs_follow_up"
    | "no_action"
    | "too_soon"
    | "already_checked"
    | "expired"
    | "invalid_now";
  headline: string;
  body: string;
  ctaLabel: string;
  ariaLabel: string;
  actionSummary: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_MIN_AGE_HOURS = 12;
const DEFAULT_MAX_AGE_HOURS = 72;
const SUMMARY_MAX = 72;

const ACTION_EVENT_TYPES = [
  "watering",
  "water",
  "feeding",
  "feed",
  "nutrient",
  "training",
  "pruning",
  "defoliation",
  "transplant",
  "flush",
  "environment_change",
  "light_change",
] as const;

const ACTION_NOTE_KEYWORDS = [
  "watered",
  "watering",
  "fed",
  "feeding",
  "nutrient",
  "feed",
  "flush",
  "flushed",
  "prune",
  "pruned",
  "defoliate",
  "defoliated",
  "trained",
  "training",
  "topped",
  "transplant",
  "transplanted",
  "raised light",
  "lowered light",
  "changed light",
  "moved light",
  "changed vpd",
  "changed humidity",
  "changed temp",
] as const;

const PROMPT_COPY = {
  headline: "Follow up on the last change.",
  body: "How did the plant respond: Better, Same, or Worse?",
  ctaLabel: "Add follow-up check",
  ariaLabel: "Add a Better Same or Worse follow-up check",
} as const;

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function includesAny(value: string, needles: readonly string[]): boolean {
  const haystack = value.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function isAction(row: OutcomeFollowUpRow): boolean {
  const eventType = (row.eventType ?? "").toLowerCase();
  const actionText = actionTextWithoutResponseContext(row.notePreview ?? "");
  return (
    ACTION_EVENT_TYPES.some((type) => eventType.includes(type)) ||
    includesAny(actionText, ACTION_NOTE_KEYWORDS)
  );
}

function isResponseCheck(row: OutcomeFollowUpRow): boolean {
  return readResponseCheckStatus(row.notePreview ?? "") !== null;
}

function summarize(row: OutcomeFollowUpRow): string {
  const note = actionTextWithoutResponseContext(row.notePreview ?? "").trim();
  if (note) {
    return note.length <= SUMMARY_MAX ? note : `${note.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
  }
  return (row.eventType ?? "action").replace(/_/g, " ");
}

function empty(reason: OutcomeFollowUpResult["reason"]): OutcomeFollowUpResult {
  return {
    showPrompt: false,
    reason,
    headline: "",
    body: "",
    ctaLabel: "",
    ariaLabel: "",
    actionSummary: "",
  };
}

export function buildOutcomeFollowUp(input: OutcomeFollowUpInput): OutcomeFollowUpResult {
  if (typeof input.now !== "number" || !Number.isFinite(input.now)) {
    return empty("invalid_now");
  }

  const minAgeHours =
    typeof input.minAgeHours === "number" && Number.isFinite(input.minAgeHours)
      ? Math.max(1, input.minAgeHours)
      : DEFAULT_MIN_AGE_HOURS;
  const maxAgeHours =
    typeof input.maxAgeHours === "number" && Number.isFinite(input.maxAgeHours)
      ? Math.max(minAgeHours, input.maxAgeHours)
      : DEFAULT_MAX_AGE_HOURS;

  const parsed = (input.rows ?? [])
    .map((row, sourceIndex) => ({ row, at: parseTime(row.occurredAt), sourceIndex }))
    .filter(
      (item): item is { row: OutcomeFollowUpRow; at: number; sourceIndex: number } =>
        item.at !== null,
    )
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at;
      const rankDelta =
        responseActionChronologyRank({
          hasAction: isAction(a.row),
          hasResponse: isResponseCheck(a.row),
        }) -
        responseActionChronologyRank({
          hasAction: isAction(b.row),
          hasResponse: isResponseCheck(b.row),
        });
      if (rankDelta !== 0) return rankDelta;
      const idDelta = (a.row.id ?? "").localeCompare(b.row.id ?? "");
      return idDelta !== 0 ? idDelta : a.sourceIndex - b.sourceIndex;
    });

  let actionIndex = -1;
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    if (isAction(parsed[index].row)) {
      actionIndex = index;
      break;
    }
  }
  if (actionIndex === -1) return empty("no_action");
  const action = parsed[actionIndex];

  const ageHours = (input.now - action.at) / HOUR_MS;
  if (ageHours < minAgeHours) return empty("too_soon");
  if (ageHours > maxAgeHours) return empty("expired");

  const hasLaterResponseCheck = parsed
    .slice(actionIndex + 1)
    .some((item) => isResponseCheck(item.row));
  if (hasLaterResponseCheck) return empty("already_checked");

  return {
    showPrompt: true,
    reason: "needs_follow_up",
    ...PROMPT_COPY,
    actionSummary: summarize(action.row),
  };
}
