/**
 * diaryTimelineEvidenceQualityRules — pure, read-only evidence-quality
 * indicators for the Plant Relative Timeline "Category view".
 *
 * Hard contract:
 *  - Pure, deterministic, null-safe. No I/O, no React, no side effects.
 *  - No writes, no Supabase, no AI calls, no automation, no device control.
 *  - Read-only context indicator only. Never classifies missing evidence
 *    as a health problem; it only states what is or is not present
 *    *in the current view*.
 *  - Copy is calm and factual. Never uses "healthy", "ideal", "fix",
 *    "urgent", "auto", "execute", "control", "actuate", "relay".
 *  - Never recommends cultivation actions and never implies AI certainty.
 *
 * Status values are intentionally simple and non-diagnostic:
 *
 *   present — the section has one or more entries in the current view.
 *   missing — the section has zero entries in the current view.
 *
 * A `limited` status is reserved for future use; this rules module does
 * not emit it yet to avoid implying conclusions from weak evidence.
 */
import type {
  DiaryTimelineSectionId,
  DiaryTimelineSection,
} from "@/lib/diaryTimelineSectionRules";

export type DiaryTimelineEvidenceQualityStatus =
  | "present"
  | "missing"
  | "limited";

export interface DiaryTimelineEvidenceQualityForSection {
  sectionId: DiaryTimelineSectionId;
  status: DiaryTimelineEvidenceQualityStatus;
  /** Calm, factual single-line copy suitable for direct render. */
  copy: string;
}

/**
 * Per-section evidence copy. "Present" copy is intentionally distinct
 * from the section's `emptyCopy` so the presenter can render both
 * cleanly without overlap.
 */
const PRESENT_COPY: Readonly<Record<DiaryTimelineSectionId, string>> = {
  watering: "Watering evidence present in this view.",
  feeding: "Feeding evidence present in this view.",
  training: "Training evidence present in this view.",
  photos: "Photo evidence present in this view.",
  diagnoses: "Diagnosis evidence present in this view.",
  harvest: "Harvest result evidence present in this view.",
  other: "Uncategorized diary evidence present in this view.",
};

const MISSING_COPY: Readonly<Record<DiaryTimelineSectionId, string>> = {
  watering: "No watering entries in this view.",
  feeding: "No feeding entries in this view.",
  training: "No training entries in this view.",
  photos: "No photo entries in this view.",
  diagnoses: "No diagnosis entries in this view.",
  harvest: "No harvest result entries in this view.",
  other: "No uncategorized diary entries in this view.",
};

function isKnownSectionId(value: unknown): value is DiaryTimelineSectionId {
  return (
    value === "watering" ||
    value === "feeding" ||
    value === "training" ||
    value === "photos" ||
    value === "diagnoses" ||
    value === "harvest" ||
    value === "other"
  );
}

/**
 * Build the evidence-quality descriptor for a single section.
 *
 * Null-safe: malformed or unknown sections collapse to a safe
 * "missing"/"other" fallback so the presenter can always render copy.
 */
export function buildDiaryTimelineEvidenceQualityForSection<T>(
  section: DiaryTimelineSection<T> | null | undefined,
): DiaryTimelineEvidenceQualityForSection {
  if (!section || typeof section !== "object") {
    return {
      sectionId: "other",
      status: "missing",
      copy: MISSING_COPY.other,
    };
  }
  const sectionId = isKnownSectionId(section.id) ? section.id : "other";
  const count = typeof section.count === "number" && Number.isFinite(section.count)
    ? section.count
    : Array.isArray(section.items)
      ? section.items.length
      : 0;
  if (count > 0) {
    return {
      sectionId,
      status: "present",
      copy: PRESENT_COPY[sectionId],
    };
  }
  return {
    sectionId,
    status: "missing",
    copy: MISSING_COPY[sectionId],
  };
}

export interface DiaryTimelineEvidenceQualitySummary {
  totalSections: number;
  presentCount: number;
  missingCount: number;
  /** Single-line summary copy, e.g. "3 of 7 sections have evidence in this view." */
  copy: string;
}

/**
 * Build a section-count summary across all sections.
 *
 * Null-safe: null/empty input returns a zeroed summary with safe copy.
 */
export function buildDiaryTimelineEvidenceQualitySummary<T>(
  sections: readonly DiaryTimelineSection<T>[] | null | undefined,
): DiaryTimelineEvidenceQualitySummary {
  const list = Array.isArray(sections) ? sections : [];
  let presentCount = 0;
  let missingCount = 0;
  for (const s of list) {
    const q = buildDiaryTimelineEvidenceQualityForSection(s);
    if (q.status === "present") presentCount += 1;
    else if (q.status === "missing") missingCount += 1;
  }
  const totalSections = list.length;
  const copy =
    totalSections === 0
      ? "No timeline sections to summarize in this view."
      : `${presentCount} of ${totalSections} sections have evidence in this view.`;
  return { totalSections, presentCount, missingCount, copy };
}
