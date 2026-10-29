/**
 * noticeStateRules — one state model for anything Verdant shows the grower
 * unasked and lets them put away: Simple home tips today, in-app notifications
 * later (a later surface needs its own approval).
 *
 * Each notice id carries a small record. "Not now" hides it for a day and
 * counts; the third "Not now" retires it until the grower restores it.
 * "Remind me later" hides it for a few days and does not count.
 *
 * Pure: no React, no Supabase, no clock (`now` is injected). Malformed stored
 * values read as "no record" (visible), never as a choice the grower did not make.
 */

export const NOTICE_DISMISS_LIMIT = 3;
export const NOTICE_DISMISS_HIDE_MS = 24 * 60 * 60 * 1000;
export const NOTICE_SNOOZE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NoticeRecord {
  dismissCount: number;
  /** ISO time of the latest "Not now", or null. */
  dismissedAt: string | null;
  /** ISO time a "Remind me later" ends, or null. */
  snoozedUntil: string | null;
}

export type NoticeVisibility = "visible" | "dismissed" | "snoozed" | "retired";

export type NoticeAction = "dismiss" | "snooze" | "restore";

export const EMPTY_NOTICE_RECORD: NoticeRecord = {
  dismissCount: 0,
  dismissedAt: null,
  snoozedUntil: null,
};

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Null for anything that is not a well-formed record. */
export function parseNoticeRecord(value: unknown): NoticeRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const count = raw.dismissCount;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
  return {
    dismissCount: Math.min(count, NOTICE_DISMISS_LIMIT),
    dismissedAt: isoOrNull(raw.dismissedAt),
    snoozedUntil: isoOrNull(raw.snoozedUntil),
  };
}

/** First match wins: retired → snoozed → dismissed (within a day) → visible. */
export function resolveNoticeVisibility(
  record: NoticeRecord | null | undefined,
  now: Date,
): NoticeVisibility {
  if (!record) return "visible";
  if (record.dismissCount >= NOTICE_DISMISS_LIMIT) return "retired";
  const t = now.getTime();
  if (record.snoozedUntil && Date.parse(record.snoozedUntil) > t) return "snoozed";
  if (record.dismissedAt && t - Date.parse(record.dismissedAt) < NOTICE_DISMISS_HIDE_MS) {
    return "dismissed";
  }
  return "visible";
}

/** The next record after an action; `null` means "no record" (restored). */
export function applyNoticeAction(
  record: NoticeRecord | null | undefined,
  action: NoticeAction,
  now: Date,
): NoticeRecord | null {
  if (action === "restore") return null;
  const base = record ?? EMPTY_NOTICE_RECORD;
  if (action === "snooze") {
    return {
      ...base,
      snoozedUntil: new Date(now.getTime() + NOTICE_SNOOZE_DAYS * DAY_MS).toISOString(),
    };
  }
  return {
    ...base,
    dismissCount: Math.min(base.dismissCount + 1, NOTICE_DISMISS_LIMIT),
    dismissedAt: now.toISOString(),
  };
}
