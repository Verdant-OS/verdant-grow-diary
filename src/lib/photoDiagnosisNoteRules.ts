/**
 * photoDiagnosisNoteRules — append-only diary details for a grower's photo
 * review note.
 *
 * SCOPE / SAFETY:
 * - Pure data only. No I/O, framework, database, or clock reads.
 * - A caller supplies the review time, so identical input produces identical
 *   output.
 * - Each draft is a new diary record; this module provides no update path.
 * - Records preserve a grower's observation and review state only. They do
 *   not infer a cause, prescribe a change, or make a finding on the grower's
 *   behalf.
 * - `user_id` is deliberately absent: the database authentication boundary is
 *   the sole source of the author identity.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Stable discriminator for the JSON object stored in `diary_entries.details`. */
export const PHOTO_DIAGNOSIS_NOTE_EVENT_TYPE = "photo_diagnosis_note" as const;

/** Lets a future reader reject a changed payload shape rather than guessing. */
export const PHOTO_DIAGNOSIS_NOTE_DETAILS_VERSION = 1 as const;

export const PHOTO_DIAGNOSIS_REVIEW_STATUSES = ["reviewed", "needs_follow_up", "cleared"] as const;

export type PhotoDiagnosisReviewStatus = (typeof PHOTO_DIAGNOSIS_REVIEW_STATUSES)[number];

/** Presenter copy deliberately describes a grower review, not a finding. */
export const PHOTO_DIAGNOSIS_NOTE_LABEL = "Grower photo review";

/** Calm scope reminder for a presenter that renders this review surface. */
export const PHOTO_DIAGNOSIS_NOTE_SAFETY_COPY =
  "Grower-authored observation only. Record what you noticed and follow up as needed.";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Minimal photo context needed to create a diary draft. */
export interface PhotoDiagnosisPhotoInput {
  photo_id: string | null | undefined;
  grow_id: string | null | undefined;
  tent_id?: string | null;
  plant_id?: string | null;
}

/** Values supplied directly by the grower and the calling surface. */
export interface PhotoDiagnosisGrowerReviewInput {
  observation: string | null | undefined;
  review_status: string | null | undefined;
  /** Absolute ISO timestamp with a timezone, supplied by the caller. */
  recorded_at: string | null | undefined;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** JSON-serializable payload persisted as `diary_entries.details`. */
export interface PhotoDiagnosisNoteDetails {
  event_type: typeof PHOTO_DIAGNOSIS_NOTE_EVENT_TYPE;
  details_version: typeof PHOTO_DIAGNOSIS_NOTE_DETAILS_VERSION;
  photo_id: string;
  review_status: PhotoDiagnosisReviewStatus;
  observation: string;
  recorded_by: "grower";
  recorded_at: string;
  append_only: true;
}

/** Insert-ready `diary_entries` values. It intentionally has no `user_id`. */
export interface PhotoDiagnosisDiaryDraft {
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  note: string;
  details: PhotoDiagnosisNoteDetails;
}

export type PhotoDiagnosisDraftResult =
  | { ok: true; draft: PhotoDiagnosisDiaryDraft }
  | { ok: false; reason: string };

/** The normalized latest-review record returned by the read-only projectors. */
export interface PhotoDiagnosisLatestReview {
  photoId: string;
  reviewStatus: PhotoDiagnosisReviewStatus;
  observation: string;
  recordedAt: string;
  diaryEntryId: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Require an absolute timestamp so parsing and ordering never depend on a
 * browser's local timezone. Preserve the supplied ISO text in the record.
 */
function absoluteIsoTimestamp(value: unknown): string | null {
  const timestamp = nonEmptyString(value);
  if (!timestamp) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) {
    return null;
  }
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

export function isValidPhotoDiagnosisReviewStatus(
  value: unknown,
): value is PhotoDiagnosisReviewStatus {
  return (
    typeof value === "string" &&
    (PHOTO_DIAGNOSIS_REVIEW_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Append-only draft builder
// ---------------------------------------------------------------------------

/**
 * Build a new, insert-ready `diary_entries` draft for one grower-authored
 * photo review. The caller must insert this draft as a new row; no existing
 * diary row is read or altered here.
 */
export function buildPhotoDiagnosisDiaryDraft(
  photo: PhotoDiagnosisPhotoInput | null | undefined,
  review: PhotoDiagnosisGrowerReviewInput | null | undefined,
): PhotoDiagnosisDraftResult {
  if (!photo) return { ok: false, reason: "missing_photo" };

  const photoId = nonEmptyString(photo.photo_id);
  if (!photoId) return { ok: false, reason: "missing_photo_id" };

  const growId = nonEmptyString(photo.grow_id);
  if (!growId) return { ok: false, reason: "missing_grow_id" };

  if (!review) return { ok: false, reason: "missing_grower_review" };

  const observation = nonEmptyString(review.observation);
  if (!observation) return { ok: false, reason: "missing_observation" };

  if (!isValidPhotoDiagnosisReviewStatus(review.review_status)) {
    return { ok: false, reason: "invalid_review_status" };
  }

  const recordedAt = absoluteIsoTimestamp(review.recorded_at);
  if (!recordedAt) {
    return {
      ok: false,
      reason: nonEmptyString(review.recorded_at) ? "invalid_recorded_at" : "missing_recorded_at",
    };
  }

  return {
    ok: true,
    draft: {
      grow_id: growId,
      tent_id: nonEmptyString(photo.tent_id),
      plant_id: nonEmptyString(photo.plant_id),
      note: observation,
      details: {
        event_type: PHOTO_DIAGNOSIS_NOTE_EVENT_TYPE,
        details_version: PHOTO_DIAGNOSIS_NOTE_DETAILS_VERSION,
        photo_id: photoId,
        review_status: review.review_status,
        observation,
        recorded_by: "grower",
        recorded_at: recordedAt,
        append_only: true,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Read-only latest-review projection
// ---------------------------------------------------------------------------

/**
 * Parse exactly the append-only payload shape emitted above. Unknown or
 * incomplete diary rows are ignored rather than being interpreted as a
 * review.
 */
export function parsePhotoDiagnosisNoteRow(row: unknown): PhotoDiagnosisLatestReview | null {
  if (!isPlainObject(row)) return null;

  const diaryEntryId = nonEmptyString(row.id);
  if (!diaryEntryId) return null;

  const details = isPlainObject(row.details) ? row.details : null;
  if (!details) return null;
  if (details.event_type !== PHOTO_DIAGNOSIS_NOTE_EVENT_TYPE) return null;
  if (details.details_version !== PHOTO_DIAGNOSIS_NOTE_DETAILS_VERSION) return null;
  if (details.recorded_by !== "grower" || details.append_only !== true) return null;

  const photoId = nonEmptyString(details.photo_id);
  const observation = nonEmptyString(details.observation);
  const recordedAt = absoluteIsoTimestamp(details.recorded_at);
  if (
    !photoId ||
    !observation ||
    !recordedAt ||
    !isValidPhotoDiagnosisReviewStatus(details.review_status)
  ) {
    return null;
  }

  return {
    photoId,
    reviewStatus: details.review_status,
    observation,
    recordedAt,
    diaryEntryId,
  };
}

/**
 * Total ascending ordering for review records. A later timestamp wins; equal
 * timestamps use the lexically later diary id. The final two comparisons only
 * make malformed duplicate ids deterministic as well.
 */
function compareReviewAscending(
  a: PhotoDiagnosisLatestReview,
  b: PhotoDiagnosisLatestReview,
): number {
  const byTimestamp = Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
  if (byTimestamp !== 0) return byTimestamp;

  if (a.diaryEntryId < b.diaryEntryId) return -1;
  if (a.diaryEntryId > b.diaryEntryId) return 1;
  if (a.reviewStatus < b.reviewStatus) return -1;
  if (a.reviewStatus > b.reviewStatus) return 1;
  if (a.observation < b.observation) return -1;
  if (a.observation > b.observation) return 1;
  return 0;
}

/**
 * Project the newest valid review for every photo. The returned map's keys are
 * lexically ordered, which keeps its observable iteration order independent
 * of the incoming database row order.
 */
export function projectLatestPhotoDiagnosisReviewsByPhoto(
  rows: ReadonlyArray<unknown> | null | undefined,
): Map<string, PhotoDiagnosisLatestReview> {
  if (!Array.isArray(rows) || rows.length === 0) return new Map();

  const records: PhotoDiagnosisLatestReview[] = [];
  for (const row of rows) {
    const parsed = parsePhotoDiagnosisNoteRow(row);
    if (parsed) records.push(parsed);
  }

  records.sort((a, b) => {
    if (a.photoId < b.photoId) return -1;
    if (a.photoId > b.photoId) return 1;
    return compareReviewAscending(a, b);
  });

  const latestByPhoto = new Map<string, PhotoDiagnosisLatestReview>();
  for (const record of records) {
    const current = latestByPhoto.get(record.photoId);
    if (!current || compareReviewAscending(current, record) <= 0) {
      latestByPhoto.set(record.photoId, record);
    }
  }
  return latestByPhoto;
}

/**
 * Read the newest valid review for one photo. Missing ids, empty input, or a
 * photo with no compatible review all return null.
 */
export function projectLatestPhotoDiagnosisReview(
  rows: ReadonlyArray<unknown> | null | undefined,
  photoId: unknown,
): PhotoDiagnosisLatestReview | null {
  const id = nonEmptyString(photoId);
  if (!id) return null;
  return projectLatestPhotoDiagnosisReviewsByPhoto(rows).get(id) ?? null;
}
