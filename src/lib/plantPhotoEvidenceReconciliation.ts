/**
 * plantPhotoEvidenceReconciliation — pure view-model for reconciling
 * "Recent Photos" gallery counts with Harvest Watch "photo evidence points".
 *
 * Deterministic. No React, no I/O, no fetch, no Supabase, no writes,
 * no AI calls, no alerts, no Action Queue writes, no automation.
 *
 * Photo evidence points are diary/activity entries flagged as containing
 * a photo. They are NOT the same as the gallery thumbnails rendered by
 * the Recent Photos strip — the strip requires a resolvable http(s)
 * thumbnail URL, while an evidence point only requires that the diary
 * entry recorded a photo attachment. This module produces an explicit
 * label + explanation so growers never see a contradiction between
 * "No photos yet" and "N photo evidence points".
 */

export type PhotoEvidenceDataSource = "live" | "demo" | "unknown";

export interface PhotoEvidenceReconciliationInput {
  /** Number of diary/activity entries flagged as photo evidence for this plant. */
  evidenceCount: number;
  /**
   * Number of gallery photos rendered by the Recent Photos strip for this
   * plant. When undefined the reconciliation still produces a safe label
   * and generic explanation, but cannot compute the gallery-mismatch note.
   */
  galleryPhotoCount?: number | null;
  /**
   * Source of the evidence rows behind the count. When "demo", copy is
   * explicit that the records are sample previews — never claims live
   * gallery photos exist. Defaults to "unknown".
   */
  dataSource?: PhotoEvidenceDataSource | null;
  /**
   * Anchor / URL that points at the supporting records (typically the
   * Recent Activity panel). Defaults to "#plant-recent-activity" so the
   * default CTA always has a safe, in-page target.
   */
  supportingRecordsHref?: string | null;
}

export interface PhotoEvidenceReconciliationDisplay {
  /** Count normalized to a non-negative integer. */
  count: number;
  /** Short primary label, e.g. "4 photo evidence points". */
  label: string;
  /** One-sentence explanation of what "photo evidence point" means. */
  explanation: string;
  /**
   * True when evidence points exist but the gallery is empty (or smaller)
   * — the surface that owns "Recent Photos" would otherwise contradict.
   */
  hasGalleryMismatch: boolean;
  /**
   * Grower-facing reconciliation note. Empty string when there is no
   * mismatch to explain (either gallery count is unknown, or the counts
   * are consistent).
   */
  mismatchNote: string;
  /** Normalized data source ("live" | "demo" | "unknown"). */
  dataSource: PhotoEvidenceDataSource;
  /** Short source label, e.g. "Source: Demo · sample records for preview". */
  sourceLabel: string;
  /** True when a CTA to supporting records should render (evidence > 0). */
  showSupportingRecordsCta: boolean;
  /** Href for the supporting records CTA. */
  supportingRecordsHref: string;
  /** Visible CTA label. */
  supportingRecordsCtaLabel: string;
  /** Accessible name for the CTA. */
  supportingRecordsCtaAriaLabel: string;
}

function normalizeCount(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeSource(
  s: PhotoEvidenceDataSource | null | undefined,
): PhotoEvidenceDataSource {
  return s === "live" || s === "demo" ? s : "unknown";
}

function normalizeHref(href: string | null | undefined): string {
  if (typeof href !== "string") return "#plant-recent-activity";
  const trimmed = href.trim();
  if (!trimmed) return "#plant-recent-activity";
  return trimmed;
}

const SOURCE_LABELS: Record<PhotoEvidenceDataSource, string> = {
  live: "Source: Your grow data",
  demo: "Source: Demo · sample records for preview",
  unknown: "Source: Unspecified",
};

/**
 * Build a deterministic label + explanation for a photo-evidence count.
 * Never invents evidence; never treats demo/manual/sample as live; never
 * exposes raw diary payloads.
 */
export function buildPhotoEvidenceDisplay(
  input: PhotoEvidenceReconciliationInput,
): PhotoEvidenceReconciliationDisplay {
  const count = normalizeCount(input.evidenceCount);
  const gallery =
    input.galleryPhotoCount === undefined || input.galleryPhotoCount === null
      ? null
      : normalizeCount(input.galleryPhotoCount);
  const dataSource = normalizeSource(input.dataSource);
  const supportingRecordsHref = normalizeHref(input.supportingRecordsHref);

  const label = `${count} photo evidence point${count === 1 ? "" : "s"}`;

  let explanation: string;
  if (count === 0) {
    explanation = "No diary entries flagged as photo evidence yet.";
  } else if (dataSource === "demo") {
    explanation =
      "Demo evidence points are sample records for preview only. They are not photos uploaded to your gallery.";
  } else if (dataSource === "live") {
    explanation =
      "Diary entries flagged as containing a photo from your grow. Counted from Recent Activity — not the same as gallery thumbnails.";
  } else {
    explanation =
      "Diary entries flagged as containing a photo. Counted from Recent Activity — not the same as gallery thumbnails. Source unspecified.";
  }

  const hasGalleryMismatch = gallery !== null && count > 0 && gallery < count;
  let mismatchNote = "";
  if (hasGalleryMismatch) {
    if (dataSource === "demo") {
      mismatchNote =
        "These are demo evidence points — they do not populate the Recent Photos gallery. Open Recent Activity to review the sample entries.";
    } else if (gallery === 0) {
      mismatchNote =
        "Recent Photos shows no gallery thumbnails yet — the evidence points come from diary notes that referenced a photo. Open Recent Activity to review the supporting entries.";
    } else {
      mismatchNote =
        "Some evidence points do not have a gallery thumbnail yet. Open Recent Activity to review the supporting entries.";
    }
  }

  const showSupportingRecordsCta = count > 0;
  const supportingRecordsCtaLabel = "View related activity";
  const supportingRecordsCtaAriaLabel =
    "View supporting photo evidence in Recent Activity.";

  return {
    count,
    label,
    explanation,
    hasGalleryMismatch,
    mismatchNote,
    dataSource,
    sourceLabel: SOURCE_LABELS[dataSource],
    showSupportingRecordsCta,
    supportingRecordsHref,
    supportingRecordsCtaLabel,
    supportingRecordsCtaAriaLabel,
  };
}
