import { isCanonicalSensorSource } from "@/constants/sensorIngestProvenance";
import { readCommunityInstant } from "@/lib/communityDigestRules";
import type {
  CommunityResult,
  PublicationDraft,
  PublicationPreview,
  SharedMeasurement,
} from "@/lib/communityTypes";

export const COMMUNITY_MAX_SELECTED_ENTRIES = 100;
export const COMMUNITY_PREVIEW_TTL_MS = 15 * 60 * 1000;

const SOURCE_LABEL_MAX = 80;
const NOTE_MAX = 4000;

function characterCount(text: string): number {
  return Array.from(text).length;
}

/** YYYY-MM-DD only: a shared date never carries a time of day. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date; an impossible day (Feb 30, month 13) rolls over and fails. */
function isCalendarDate(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const match = DATE_PATTERN.exec(text);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isPresent(text: string): boolean {
  return typeof text === "string" && text.trim().length > 0;
}

function isValidMeasurement(measurement: SharedMeasurement): boolean {
  return (
    typeof measurement === "object" &&
    measurement !== null &&
    isPresent(measurement.name) &&
    isPresent(measurement.unit) &&
    Number.isFinite(measurement.value) &&
    isCanonicalSensorSource(measurement.provenance)
  );
}

function isValidDraft(entry: PublicationDraft): boolean {
  // The label is returned as given, so its padding counts toward the limit.
  return (
    typeof entry === "object" &&
    entry !== null &&
    isPresent(entry.sourceEntryHandle) &&
    isPresent(entry.sourceRevision) &&
    isPresent(entry.action) &&
    isPresent(entry.sourceJournalLabel) &&
    characterCount(entry.sourceJournalLabel) <= SOURCE_LABEL_MAX &&
    (entry.occurredDate === null || isCalendarDate(entry.occurredDate)) &&
    typeof entry.note === "string" &&
    characterCount(entry.note) <= NOTE_MAX &&
    (entry.stage === null || isPresent(entry.stage)) &&
    (entry.mediaRevisionHandle === null || isPresent(entry.mediaRevisionHandle)) &&
    Array.isArray(entry.measurements) &&
    entry.measurements.every(isValidMeasurement)
  );
}

/**
 * Validates the owner's selected entries. A draft may be empty; publishing
 * needs at least one entry. Omitted values stay absent: nothing is enriched.
 */
export function validatePublicationDrafts(
  entries: readonly PublicationDraft[],
  mode: "draft" | "publish",
): CommunityResult<readonly PublicationDraft[]> {
  if (!Array.isArray(entries)) return { ok: false, code: "invalid" };
  if (entries.length > COMMUNITY_MAX_SELECTED_ENTRIES) return { ok: false, code: "invalid" };
  if (mode === "publish" && entries.length === 0) return { ok: false, code: "invalid" };
  if (!entries.every(isValidDraft)) return { ok: false, code: "invalid" };
  return { ok: true, value: entries };
}

/**
 * True only while the owner's exact preview still describes what would be
 * published: before its expiry (by injected time) and with the same collection
 * revision, audience/access version, display payload and source/media binding.
 * A UI check only; the server re-validates the preview token at publish.
 */
export function isPreviewCurrent(
  preview: PublicationPreview,
  current: {
    collectionRevision: number;
    accessVersion: number;
    payloadHash: string;
    sourceMediaBindingHash: string;
  },
  nowMs: number,
): boolean {
  if (typeof preview !== "object" || preview === null) return false;
  if (typeof current !== "object" || current === null) return false;
  const expiresAtMs = readCommunityInstant(preview.expiresAt)?.ms ?? Number.NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresAtMs)) return false;
  if (!isPresent(preview.previewToken)) return false;
  if (nowMs >= expiresAtMs) return false;
  // Absent on both sides is not a match: every binding field must be present to compare.
  const bindings = [preview, current];
  if (!bindings.every((b) => Number.isFinite(b.collectionRevision))) return false;
  if (!bindings.every((b) => Number.isFinite(b.accessVersion))) return false;
  if (!bindings.every((b) => isPresent(b.payloadHash))) return false;
  if (!bindings.every((b) => isPresent(b.sourceMediaBindingHash))) return false;
  return (
    preview.collectionRevision === current.collectionRevision &&
    preview.accessVersion === current.accessVersion &&
    preview.payloadHash === current.payloadHash &&
    preview.sourceMediaBindingHash === current.sourceMediaBindingHash
  );
}
