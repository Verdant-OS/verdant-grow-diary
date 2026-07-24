/**
 * Action → Response Pairing V0 rules.
 *
 * Pure helper for the grower memory loop:
 *   What changed? → How did the plant respond afterward?
 *
 * Reads already-loaded diary activity rows only. No I/O, no React, no Supabase,
 * no AI, no alerts, no Action Queue, no automation, no device control.
 */

import { normalizeDiaryNoteText } from "./diaryNoteFormatting";
import {
  actionTextWithoutResponseContext,
  readResponseCheckStatus,
  responseActionChronologyRank,
} from "./tenSecondQuickCheckRules";

export interface ActionResponsePairingRow {
  id?: string | null;
  eventType: string;
  notePreview: string;
  occurredAt: string | null;
}

export interface ActionResponsePairingInput {
  rows: readonly ActionResponsePairingRow[] | null | undefined;
}

export interface ActionResponsePairingResult {
  show: boolean;
  reason: "paired" | "awaiting_response" | "no_action" | "response_without_action";
  title: string;
  actionLabel: string;
  responseLabel: string;
  responseStatus: "Better" | "Same" | "Worse" | null;
  helper: string;
}

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
  "environment changed",
  "issue spotted",
  "training / pruning",
] as const;

const MAX_LABEL = 88;

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function includesAny(value: string, needles: readonly string[]): boolean {
  const haystack = value.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function extractResponseStatus(note: string): ActionResponsePairingResult["responseStatus"] {
  return readResponseCheckStatus(note ?? "");
}

function isResponse(row: ActionResponsePairingRow): boolean {
  return extractResponseStatus(row.notePreview) !== null;
}

function isAction(row: ActionResponsePairingRow): boolean {
  const eventType = (row.eventType ?? "").toLowerCase();
  const actionText = actionTextWithoutResponseContext(row.notePreview ?? "");
  return (
    ACTION_EVENT_TYPES.some((type) => eventType.includes(type)) ||
    includesAny(actionText, ACTION_NOTE_KEYWORDS)
  );
}

function label(row: ActionResponsePairingRow): string {
  // Normalize repeated section labels and missing-space concat artifacts
  // before clipping. Keeps grower content intact; only collapses
  // "Response check: Response check:" and "Nats.Response" style noise.
  const note = normalizeDiaryNoteText(row.notePreview).trim();
  const fallback = (row.eventType ?? "log").replace(/_/g, " ").trim() || "log";
  const source = note || fallback;
  return source.length <= MAX_LABEL ? source : `${source.slice(0, MAX_LABEL - 1).trimEnd()}…`;
}

function actionLabel(row: ActionResponsePairingRow): string {
  const actionText = actionTextWithoutResponseContext(row.notePreview ?? "");
  return label({ ...row, notePreview: actionText });
}

function chronologicalRank(row: ActionResponsePairingRow): number {
  return responseActionChronologyRank({
    hasAction: isAction(row),
    hasResponse: isResponse(row),
  });
}

function empty(reason: ActionResponsePairingResult["reason"]): ActionResponsePairingResult {
  return {
    show: false,
    reason,
    title: "",
    actionLabel: "",
    responseLabel: "",
    responseStatus: null,
    helper: "",
  };
}

export function buildActionResponsePairing(
  input: ActionResponsePairingInput,
): ActionResponsePairingResult {
  const parsed = (input.rows ?? [])
    .map((row, sourceIndex) => ({ row, at: parseTime(row.occurredAt), sourceIndex }))
    .filter(
      (item): item is { row: ActionResponsePairingRow; at: number; sourceIndex: number } =>
        item.at !== null,
    )
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at;
      const rankDelta = chronologicalRank(a.row) - chronologicalRank(b.row);
      if (rankDelta !== 0) return rankDelta;
      const idDelta = (a.row.id ?? "").localeCompare(b.row.id ?? "");
      return idDelta !== 0 ? idDelta : a.sourceIndex - b.sourceIndex;
    });

  if (parsed.length === 0) return empty("no_action");

  const latestActionIndex = (() => {
    for (let i = parsed.length - 1; i >= 0; i -= 1) {
      if (isAction(parsed[i].row)) return i;
    }
    return -1;
  })();

  if (latestActionIndex === -1) {
    return parsed.some((item) => isResponse(item.row))
      ? empty("response_without_action")
      : empty("no_action");
  }

  const action = parsed[latestActionIndex];
  const response = parsed.slice(latestActionIndex + 1).find((item) => isResponse(item.row));

  if (!response) {
    return {
      show: true,
      reason: "awaiting_response",
      title: "Waiting on plant response",
      actionLabel: actionLabel(action.row),
      responseLabel: "No response check yet",
      responseStatus: null,
      helper: "Next useful log: Better, Same, or Worse after this change has had time to show up.",
    };
  }

  const status = extractResponseStatus(response.row.notePreview);
  return {
    show: true,
    reason: "paired",
    title: "Action → response captured",
    actionLabel: actionLabel(action.row),
    responseLabel: label(response.row),
    responseStatus: status,
    helper: status
      ? `${status} was logged after this change. This is plant memory you can compare next run.`
      : "A response was logged after this change. This is plant memory you can compare next run.",
  };
}
