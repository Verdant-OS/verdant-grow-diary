import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PHOTO_DIAGNOSIS_NOTE_DETAILS_VERSION,
  PHOTO_DIAGNOSIS_NOTE_EVENT_TYPE,
  PHOTO_DIAGNOSIS_NOTE_LABEL,
  PHOTO_DIAGNOSIS_NOTE_SAFETY_COPY,
  PHOTO_DIAGNOSIS_REVIEW_STATUSES,
  buildPhotoDiagnosisDiaryDraft,
  isValidPhotoDiagnosisReviewStatus,
  parsePhotoDiagnosisNoteRow,
  projectLatestPhotoDiagnosisReview,
  projectLatestPhotoDiagnosisReviewsByPhoto,
  type PhotoDiagnosisGrowerReviewInput,
  type PhotoDiagnosisPhotoInput,
} from "@/lib/photoDiagnosisNoteRules";

const RECORDED_AT = "2026-07-17T15:00:00.000Z";
const RULES_SOURCE = readFileSync(resolve(__dirname, "../lib/photoDiagnosisNoteRules.ts"), "utf8");

function basePhoto(overrides: Partial<PhotoDiagnosisPhotoInput> = {}): PhotoDiagnosisPhotoInput {
  return {
    photo_id: "photo-1",
    grow_id: "grow-1",
    tent_id: "tent-1",
    plant_id: "plant-1",
    ...overrides,
  };
}

function baseReview(
  overrides: Partial<PhotoDiagnosisGrowerReviewInput> = {},
): PhotoDiagnosisGrowerReviewInput {
  return {
    observation: "Lower leaves look a little lighter than yesterday.",
    review_status: "reviewed",
    recorded_at: RECORDED_AT,
    ...overrides,
  };
}

function reviewRow(
  overrides: {
    id?: string;
    photoId?: string;
    status?: "reviewed" | "needs_follow_up" | "cleared";
    observation?: string;
    recordedAt?: string;
  } = {},
) {
  return {
    id: overrides.id ?? "entry-1",
    details: {
      event_type: PHOTO_DIAGNOSIS_NOTE_EVENT_TYPE,
      details_version: PHOTO_DIAGNOSIS_NOTE_DETAILS_VERSION,
      photo_id: overrides.photoId ?? "photo-1",
      review_status: overrides.status ?? "reviewed",
      observation: overrides.observation ?? "Grower saw a small change.",
      recorded_by: "grower",
      recorded_at: overrides.recordedAt ?? RECORDED_AT,
      append_only: true,
    },
  };
}

describe("photoDiagnosisNoteRules — append-only draft", () => {
  it("builds a typed diary draft for every allowed review status", () => {
    for (const status of PHOTO_DIAGNOSIS_REVIEW_STATUSES) {
      const result = buildPhotoDiagnosisDiaryDraft(
        basePhoto({ photo_id: "  photo-1  ", grow_id: "  grow-1  " }),
        baseReview({ review_status: status }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.draft).toEqual({
        grow_id: "grow-1",
        tent_id: "tent-1",
        plant_id: "plant-1",
        note: "Lower leaves look a little lighter than yesterday.",
        details: {
          event_type: PHOTO_DIAGNOSIS_NOTE_EVENT_TYPE,
          details_version: PHOTO_DIAGNOSIS_NOTE_DETAILS_VERSION,
          photo_id: "photo-1",
          review_status: status,
          observation: "Lower leaves look a little lighter than yesterday.",
          recorded_by: "grower",
          recorded_at: RECORDED_AT,
          append_only: true,
        },
      });
    }
  });

  it("is deterministic for identical caller-supplied input", () => {
    const photo = basePhoto();
    const review = baseReview();
    expect(buildPhotoDiagnosisDiaryDraft(photo, review)).toEqual(
      buildPhotoDiagnosisDiaryDraft(photo, review),
    );
  });

  it("keeps optional plant and tent ids nullable and excludes user_id", () => {
    const result = buildPhotoDiagnosisDiaryDraft(
      basePhoto({ tent_id: "   ", plant_id: null }),
      baseReview(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.tent_id).toBeNull();
    expect(result.draft.plant_id).toBeNull();
    expect("user_id" in result.draft).toBe(false);
    expect("user_id" in result.draft.details).toBe(false);
  });
});

describe("photoDiagnosisNoteRules — validation", () => {
  it("recognizes only the documented statuses", () => {
    expect(isValidPhotoDiagnosisReviewStatus("reviewed")).toBe(true);
    expect(isValidPhotoDiagnosisReviewStatus("needs_follow_up")).toBe(true);
    expect(isValidPhotoDiagnosisReviewStatus("cleared")).toBe(true);
    expect(isValidPhotoDiagnosisReviewStatus("open")).toBe(false);
    expect(isValidPhotoDiagnosisReviewStatus(null)).toBe(false);
  });

  it("fails closed for missing or blank identity and observation values", () => {
    expect(buildPhotoDiagnosisDiaryDraft(null, baseReview())).toEqual({
      ok: false,
      reason: "missing_photo",
    });
    expect(buildPhotoDiagnosisDiaryDraft(basePhoto({ photo_id: "  " }), baseReview())).toEqual({
      ok: false,
      reason: "missing_photo_id",
    });
    expect(buildPhotoDiagnosisDiaryDraft(basePhoto({ grow_id: undefined }), baseReview())).toEqual({
      ok: false,
      reason: "missing_grow_id",
    });
    expect(buildPhotoDiagnosisDiaryDraft(basePhoto(), null)).toEqual({
      ok: false,
      reason: "missing_grower_review",
    });
    expect(
      buildPhotoDiagnosisDiaryDraft(basePhoto(), baseReview({ observation: " \n\t " })),
    ).toEqual({ ok: false, reason: "missing_observation" });
  });

  it("rejects unknown statuses and absent or non-absolute timestamps", () => {
    expect(
      buildPhotoDiagnosisDiaryDraft(basePhoto(), baseReview({ review_status: "unknown" })),
    ).toEqual({ ok: false, reason: "invalid_review_status" });
    expect(buildPhotoDiagnosisDiaryDraft(basePhoto(), baseReview({ recorded_at: null }))).toEqual({
      ok: false,
      reason: "missing_recorded_at",
    });
    expect(
      buildPhotoDiagnosisDiaryDraft(
        basePhoto(),
        baseReview({ recorded_at: "2026-07-17T15:00:00" }),
      ),
    ).toEqual({ ok: false, reason: "invalid_recorded_at" });
  });
});

describe("photoDiagnosisNoteRules — latest review projection", () => {
  it("projects the newest review per photo independent of input order", () => {
    const older = reviewRow({
      id: "entry-a",
      status: "reviewed",
      recordedAt: "2026-07-17T12:00:00.000Z",
    });
    const newer = reviewRow({
      id: "entry-b",
      status: "needs_follow_up",
      observation: "Grower wants another look tomorrow.",
      recordedAt: "2026-07-17T13:00:00.000Z",
    });

    const forward = projectLatestPhotoDiagnosisReview([older, newer], "photo-1");
    const reverse = projectLatestPhotoDiagnosisReview([newer, older], "photo-1");

    expect(forward).toEqual({
      photoId: "photo-1",
      reviewStatus: "needs_follow_up",
      observation: "Grower wants another look tomorrow.",
      recordedAt: "2026-07-17T13:00:00.000Z",
      diaryEntryId: "entry-b",
    });
    expect(reverse).toEqual(forward);
  });

  it("uses the lexically later diary id when review timestamps tie", () => {
    const first = reviewRow({ id: "entry-a", status: "reviewed" });
    const second = reviewRow({ id: "entry-b", status: "cleared" });

    const projection = projectLatestPhotoDiagnosisReview([second, first], "photo-1");
    expect(projection?.diaryEntryId).toBe("entry-b");
    expect(projection?.reviewStatus).toBe("cleared");
  });

  it("returns a lexically keyed map and ignores malformed rows", () => {
    const byPhoto = projectLatestPhotoDiagnosisReviewsByPhoto([
      reviewRow({ id: "z-1", photoId: "photo-z" }),
      null,
      { id: "wrong-type", details: { event_type: "unrelated" } },
      reviewRow({ id: "a-1", photoId: "photo-a", status: "cleared" }),
    ]);

    expect(Array.from(byPhoto.keys())).toEqual(["photo-a", "photo-z"]);
    expect(byPhoto.get("photo-a")?.reviewStatus).toBe("cleared");
  });

  it("treats null, undefined, invalid rows, and unknown photo ids safely", () => {
    expect(projectLatestPhotoDiagnosisReviewsByPhoto(null).size).toBe(0);
    expect(projectLatestPhotoDiagnosisReviewsByPhoto(undefined).size).toBe(0);
    expect(parsePhotoDiagnosisNoteRow(null)).toBeNull();
    expect(parsePhotoDiagnosisNoteRow({ id: "entry-1", details: null })).toBeNull();
    expect(projectLatestPhotoDiagnosisReview([], "photo-1")).toBeNull();
    expect(projectLatestPhotoDiagnosisReview([reviewRow()], null)).toBeNull();
  });
});

describe("photoDiagnosisNoteRules — scope wording and pure boundary", () => {
  it("uses grower-review wording and does not label the record as an automated finding", () => {
    expect(PHOTO_DIAGNOSIS_NOTE_LABEL).toBe("Grower photo review");
    expect(PHOTO_DIAGNOSIS_NOTE_SAFETY_COPY).toMatch(/grower-authored observation/i);
    expect(PHOTO_DIAGNOSIS_NOTE_LABEL).not.toMatch(/AI diagnosis|confirmed/i);
    expect(PHOTO_DIAGNOSIS_NOTE_SAFETY_COPY).not.toMatch(/AI diagnosis|confirmed/i);
  });

  it("contains no framework, network, database, or ambient-clock dependency", () => {
    expect(RULES_SOURCE).not.toMatch(/from\s+["']react/);
    expect(RULES_SOURCE).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES_SOURCE).not.toMatch(/\bfetch\s*\(/);
    expect(RULES_SOURCE).not.toMatch(/Date\.now\s*\(/);
  });
});
