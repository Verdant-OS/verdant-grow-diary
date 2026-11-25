/**
 * Quick Log note-save rules — pure, deterministic, null-safe.
 *
 * The All activity types Note panel saves its own diary entry. After that save
 * the legacy Quick Log form below it must stop asking for a note, and its
 * Save log must not write the same note a second time. Both confirmations name
 * the saved note text so the grower can see what went in.
 *
 * No React, no Supabase, no clock.
 */

/** Preview line code that replaces `note:missing` after a panel note save. */
export const QUICK_LOG_PANEL_NOTE_SAVED_CODE = "note:saved-in-panel" as const;

/** Shown when Save log would repeat the note the Note panel already saved. */
export const QUICK_LOG_NOTE_ALREADY_SAVED_COPY =
  "This note is already saved. Change the text to add another entry, or close Quick Log.";

/** Default length of a note excerpt shown in a save confirmation. */
export const QUICK_LOG_SAVED_NOTE_EXCERPT_MAX = 120;

/** Legacy Quick Log event types that save as a plain note entry. */
const NOTE_LIKE_EVENT_TYPES: ReadonlySet<string> = new Set(["observation", "note"]);

/** Trim and collapse whitespace; anything that is not a string becomes "". */
export function normalizeQuickLogNoteText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

/** A short, single-line excerpt of a saved note, or null when there is no text. */
export function buildQuickLogSavedNoteExcerpt(
  note: unknown,
  max: number = QUICK_LOG_SAVED_NOTE_EXCERPT_MAX,
): string | null {
  const text = normalizeQuickLogNoteText(note);
  if (!text) return null;
  const limit =
    Number.isFinite(max) && max >= 2 ? Math.floor(max) : QUICK_LOG_SAVED_NOTE_EXCERPT_MAX;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** Grower-facing preview line naming the note the panel already saved. */
export function buildPanelSavedNotePreviewMessage(note: unknown): string | null {
  const excerpt = buildQuickLogSavedNoteExcerpt(note);
  if (!excerpt) return null;
  return `Note saved: “${excerpt}”. You don't need to save it again.`;
}

export interface QuickLogPreviewLine {
  code: string;
  message: string;
  severity: "info" | "warning";
}

/**
 * Swap the "Add a quick note before saving" hint for a saved-note line once
 * the Note panel has saved a note. Returns the input array unchanged when no
 * panel note was saved, so callers can compare by reference.
 */
export function applyPanelSavedNoteToPreviewWarnings<T extends QuickLogPreviewLine>(
  warnings: readonly T[],
  panelSavedNote: string | null | undefined,
): ReadonlyArray<T | QuickLogPreviewLine> {
  const message = buildPanelSavedNotePreviewMessage(panelSavedNote);
  if (!message) return warnings;
  if (!warnings.some((w) => w.code === "note:missing")) return warnings;
  return warnings.map((w) =>
    w.code === "note:missing"
      ? { code: QUICK_LOG_PANEL_NOTE_SAVED_CODE, message, severity: "info" as const }
      : w,
  );
}

export interface DuplicatePanelNoteInput {
  note: unknown;
  panelSavedNote: unknown;
  eventType: unknown;
}

/**
 * True when Save log would write the same plain note the Note panel already
 * saved in this Quick Log session. Other entry types keep their own data and
 * are never blocked here.
 */
export function isDuplicateOfPanelSavedNote(input: DuplicatePanelNoteInput): boolean {
  if (typeof input.eventType !== "string" || !NOTE_LIKE_EVENT_TYPES.has(input.eventType)) {
    return false;
  }
  const note = normalizeQuickLogNoteText(input.note);
  const saved = normalizeQuickLogNoteText(input.panelSavedNote);
  return note.length > 0 && note === saved;
}

/** How long the same note on the same plant stays blocked. Matthew, 2026-11-25. */
export const QUICK_LOG_NOTE_REPEAT_WINDOW_MINUTES = 10;

export interface RecentSavedNoteEntry {
  plantId: unknown;
  note: unknown;
  eventType: unknown;
  savedAt: unknown;
}

export interface RepeatRecentSavedNoteInput {
  note: unknown;
  plantId: unknown;
  eventType: unknown;
  recentEntries: readonly RecentSavedNoteEntry[] | null | undefined;
  now: Date;
  windowMinutes?: number;
  /** A failed or uncertain attempt of this same save must stay retryable. */
  sameSaveRetry?: boolean;
}

function savedAtMillis(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isNoteLikeEventType(eventType: unknown): boolean {
  return typeof eventType === "string" && NOTE_LIKE_EVENT_TYPES.has(eventType);
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Details keys that make a saved diary row more than a plain note: a photo,
 * typed readings, a structured check, an issue, or another activity. A row
 * that carries any of them is never a repeat candidate, so a new photo or
 * reading with the same caption still saves. The tent snapshot a note attaches
 * on its own (`details.sensor`) is not the grower's content, so it does not
 * count.
 */
const STRUCTURED_DETAIL_KEYS: readonly string[] = [
  "photo_url",
  "photo_path",
  "photo_urls",
  "photos",
  "manual_sensor_snapshot",
  "manual_provenance",
  "environment_check",
  "early_stage",
  "harvest",
  "watering",
  "feeding",
  "volume_ml",
  "kind",
];

/** The event type a diary row was saved as, or "note" when it names none. */
function diaryRowEventType(
  record: Record<string, unknown>,
  details: Record<string, unknown> | null,
): string {
  if (details && hasText(details.subtype)) {
    return `observation:${String(details.subtype).trim().toLowerCase()}`;
  }
  if (details) {
    for (const key of STRUCTURED_DETAIL_KEYS) {
      const value = details[key];
      if (value !== undefined && value !== null && value !== "") return key;
    }
  }
  if (hasText(record.photo_url)) return "photo";
  const activity = details?.quick_log_activity;
  if (typeof activity === "string" && activity.trim().toLowerCase() !== "note") {
    return activity.trim().toLowerCase();
  }
  return (
    (typeof details?.event_type === "string" && details.event_type) ||
    (typeof record.event_type === "string" && record.event_type) ||
    (typeof record.entry_type === "string" && record.entry_type) ||
    "note"
  );
}

/**
 * True when a `quicklog_save_manual` payload saves only note text: no reading,
 * photo, volume or structured details. Anything else is never blocked as a
 * repeated note.
 */
export function isPlainNoteSavePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  for (const key of ["p_temperature_c", "p_humidity_pct", "p_vpd_kpa", "p_volume_ml"]) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return false;
  }
  if (typeof record.p_action === "string" && record.p_action !== "note") return false;
  const details = record.p_details;
  if (details === undefined || details === null) return true;
  if (typeof details !== "object" || Array.isArray(details)) return false;
  return isNoteLikeEventType(diaryRowEventType({}, details as Record<string, unknown>));
}

/**
 * Hard block for saving the same plain note on the same plant again inside
 * the window. Reads confirmed, saved entries only. Case stays as
 * `normalizeQuickLogNoteText` left it. Structured entries are never a match.
 */
export class QuickLogNoteRepeatSaveRules {
  static isRepeatOfRecentSavedNote(input: RepeatRecentSavedNoteInput): boolean {
    if (input.sameSaveRetry === true) return false;
    if (!isNoteLikeEventType(input.eventType)) return false;
    if (typeof input.plantId !== "string" || input.plantId.length === 0) return false;
    const note = normalizeQuickLogNoteText(input.note);
    if (note.length === 0) return false;
    if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return false;
    if (!Array.isArray(input.recentEntries)) return false;
    const windowMinutes = input.windowMinutes ?? QUICK_LOG_NOTE_REPEAT_WINDOW_MINUTES;
    if (!Number.isFinite(windowMinutes) || windowMinutes < 0) return false;
    const windowMs = windowMinutes * 60_000;
    const nowMs = input.now.getTime();
    for (const entry of input.recentEntries) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.plantId !== input.plantId) continue;
      if (!isNoteLikeEventType(entry.eventType)) continue;
      if (normalizeQuickLogNoteText(entry.note) !== note) continue;
      const savedMs = savedAtMillis(entry.savedAt);
      if (savedMs === null) continue;
      if (Math.abs(nowMs - savedMs) <= windowMs) return true;
    }
    return false;
  }

  /**
   * Saved diary rows (the `diary_entries` query Recent Activity uses).
   * Unreadable and retracted rows are skipped. The save time is the row's
   * `created_at`, so a backdated note still counts from when it was saved.
   */
  static candidatesFromDiaryRows(rows: unknown): RecentSavedNoteEntry[] {
    if (!Array.isArray(rows)) return [];
    const candidates: RecentSavedNoteEntry[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as Record<string, unknown>;
      if (record.retracted_at) continue;
      const details =
        record.details && typeof record.details === "object" && !Array.isArray(record.details)
          ? (record.details as Record<string, unknown>)
          : null;
      candidates.push({
        plantId: record.plant_id ?? record.plantId ?? null,
        note: record.note,
        eventType: diaryRowEventType(record, details),
        savedAt: record.created_at ?? record.createdAt ?? record.entry_at ?? record.entryAt ?? null,
      });
    }
    return candidates;
  }

  /** Confirmed note prepended onto the diary cache. Does not invent a row for a failed save. */
  static rememberConfirmedNote(
    current: unknown,
    entry: { plantId: string; note: string; eventType: string; savedAt: string },
  ): unknown[] {
    const rows = Array.isArray(current) ? current : [];
    return [
      {
        id: `quick-log-note-${entry.savedAt}`,
        plant_id: entry.plantId,
        note: entry.note,
        entry_at: entry.savedAt,
        created_at: entry.savedAt,
        retracted_at: null,
        details: { event_type: entry.eventType },
      },
      ...rows,
    ];
  }
}

/** Title of the toast shown when the All activity types Note panel saves. */
export const QUICK_LOG_NOTE_SAVED_TOAST_TITLE = "Note saved";

/** Length of the first-line quote in the Note-saved toast. */
export const QUICK_LOG_NOTE_SAVED_TOAST_EXCERPT_MAX = 80;

export interface QuickLogNoteSavedToast {
  title: string;
  /** The note's first non-empty line, quoted; null when there is no text. */
  description: string | null;
}

/** Toast for a confirmed Note panel save: the title and the note's first line. */
export function buildQuickLogNoteSavedToast(note: unknown): QuickLogNoteSavedToast {
  const firstLine =
    typeof note === "string"
      ? (note.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "")
      : "";
  const excerpt = buildQuickLogSavedNoteExcerpt(firstLine, QUICK_LOG_NOTE_SAVED_TOAST_EXCERPT_MAX);
  return {
    title: QUICK_LOG_NOTE_SAVED_TOAST_TITLE,
    description: excerpt ? `“${excerpt}”` : null,
  };
}
