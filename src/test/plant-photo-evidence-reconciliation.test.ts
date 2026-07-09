/**
 * Tests for plantPhotoEvidenceReconciliation — pure view-model that
 * reconciles Recent Photos gallery counts with Harvest Watch photo
 * evidence counts so growers never see a contradiction between
 * "No photos yet" and "N photo evidence points".
 */
import { describe, expect, it } from "vitest";

import { buildPhotoEvidenceDisplay } from "@/lib/plantPhotoEvidenceReconciliation";

describe("buildPhotoEvidenceDisplay", () => {
  it("labels a zero-evidence state without contradiction", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 0, galleryPhotoCount: 0 });
    expect(d.count).toBe(0);
    expect(d.label).toBe("0 photo evidence points");
    expect(d.explanation).toMatch(/No diary entries/i);
    expect(d.hasGalleryMismatch).toBe(false);
    expect(d.mismatchNote).toBe("");
  });

  it("uses singular for exactly one evidence point", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 1, galleryPhotoCount: 1 });
    expect(d.label).toBe("1 photo evidence point");
    expect(d.hasGalleryMismatch).toBe(false);
  });

  it("does not claim mismatch when gallery matches evidence", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 3, galleryPhotoCount: 3 });
    expect(d.hasGalleryMismatch).toBe(false);
    expect(d.mismatchNote).toBe("");
    expect(d.explanation).toMatch(/Recent Activity/i);
  });

  it("does not claim mismatch when gallery exceeds evidence", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 2, galleryPhotoCount: 5 });
    expect(d.hasGalleryMismatch).toBe(false);
    expect(d.mismatchNote).toBe("");
  });

  it("flags mismatch and points to Recent Activity when gallery is empty but evidence exists", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 4, galleryPhotoCount: 0 });
    expect(d.hasGalleryMismatch).toBe(true);
    expect(d.mismatchNote).toMatch(/Recent Photos/i);
    expect(d.mismatchNote).toMatch(/Recent Activity/i);
  });

  it("flags partial mismatch when gallery is smaller than evidence", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 4, galleryPhotoCount: 1 });
    expect(d.hasGalleryMismatch).toBe(true);
    expect(d.mismatchNote).toMatch(/do not have a gallery thumbnail/i);
  });

  it("omits mismatch note when gallery count is unknown", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 4, galleryPhotoCount: null });
    expect(d.hasGalleryMismatch).toBe(false);
    expect(d.mismatchNote).toBe("");
    // Explanation still tells grower what an evidence point is.
    expect(d.explanation).toMatch(/photo/i);
  });

  it("normalizes negative or NaN counts to zero deterministically", () => {
    const d1 = buildPhotoEvidenceDisplay({ evidenceCount: -3, galleryPhotoCount: Number.NaN });
    expect(d1.count).toBe(0);
    expect(d1.hasGalleryMismatch).toBe(false);
    const d2 = buildPhotoEvidenceDisplay({ evidenceCount: 2.9, galleryPhotoCount: 1.7 });
    expect(d2.count).toBe(2);
  });

  it("is deterministic across repeated calls", () => {
    const a = buildPhotoEvidenceDisplay({ evidenceCount: 3, galleryPhotoCount: 0 });
    const b = buildPhotoEvidenceDisplay({ evidenceCount: 3, galleryPhotoCount: 0 });
    expect(a).toEqual(b);
  });
});
