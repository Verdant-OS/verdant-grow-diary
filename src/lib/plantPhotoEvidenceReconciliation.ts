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

export interface PhotoEvidenceReconciliationInput {
  /** Number of diary/activity entries flagged as photo evidence for this plant. */
  evidenceCount: number;
  /**
   * Number of gallery photos rendered by the Recent Photos strip for this
   * plant. When undefined the reconciliation still produces a safe label
   * and generic explanation, but cannot compute the gallery-mismatch note.
   */
  galleryPhotoCount?: number | null;
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
}

function normalizeCount(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

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

  const label = `${count} photo evidence point${count === 1 ? "" : "s"}`;
  const explanation =
    count === 0
      ? "No diary entries flagged as photo evidence yet."
      : "Diary entries flagged as containing a photo. Counted from Recent Activity — not the same as gallery thumbnails.";

  const hasGalleryMismatch = gallery !== null && count > 0 && gallery < count;
  const mismatchNote = hasGalleryMismatch
    ? gallery === 0
      ? "Recent Photos shows no gallery thumbnails yet — the evidence points come from diary notes that referenced a photo. Open Recent Activity to review the supporting entries."
      : "Some evidence points do not have a gallery thumbnail yet. Open Recent Activity to review the supporting entries."
    : "";

  return { count, label, explanation, hasGalleryMismatch, mismatchNote };
}
