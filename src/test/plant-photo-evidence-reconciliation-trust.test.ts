/**
 * Trust + traceability polish for the Evidence tile:
 *   - honest source label (live / demo / unknown)
 *   - demo copy that never implies live gallery photos
 *   - supporting-records CTA to Recent Activity
 *
 * Pure view-model — no React, no I/O, no fetches.
 */
import { describe, expect, it } from "vitest";

import { buildPhotoEvidenceDisplay } from "@/lib/plantPhotoEvidenceReconciliation";

describe("buildPhotoEvidenceDisplay — trust + traceability", () => {
  it("labels live source without demo/sample language", () => {
    const d = buildPhotoEvidenceDisplay({
      evidenceCount: 2,
      galleryPhotoCount: 2,
      dataSource: "live",
    });
    expect(d.dataSource).toBe("live");
    expect(d.sourceLabel).toMatch(/Your grow data/i);
    expect(d.sourceLabel).not.toMatch(/demo/i);
    expect(d.explanation).not.toMatch(/demo|sample/i);
  });

  it("labels demo source explicitly as sample records", () => {
    const d = buildPhotoEvidenceDisplay({
      evidenceCount: 3,
      galleryPhotoCount: 0,
      dataSource: "demo",
    });
    expect(d.dataSource).toBe("demo");
    expect(d.sourceLabel).toMatch(/Demo/i);
    expect(d.sourceLabel).toMatch(/sample/i);
    expect(d.explanation).toMatch(/demo|sample/i);
  });

  it("demo copy never claims live gallery photos exist", () => {
    const d = buildPhotoEvidenceDisplay({
      evidenceCount: 3,
      galleryPhotoCount: 0,
      dataSource: "demo",
    });
    const blob = `${d.explanation} ${d.mismatchNote} ${d.sourceLabel}`.toLowerCase();
    expect(blob).not.toMatch(/live gallery/);
    expect(blob).not.toMatch(/real plant photos/);
    // "live" as a bare word must not appear in demo copy.
    expect(blob).not.toMatch(/\blive\b/);
  });

  it("unspecified source falls back to a neutral label", () => {
    const d = buildPhotoEvidenceDisplay({ evidenceCount: 1 });
    expect(d.dataSource).toBe("unknown");
    expect(d.sourceLabel).toMatch(/unspecified/i);
    expect(d.explanation).toMatch(/unspecified/i);
  });

  it("shows a CTA to supporting records when evidence > 0", () => {
    const d = buildPhotoEvidenceDisplay({
      evidenceCount: 4,
      galleryPhotoCount: 0,
      dataSource: "live",
    });
    expect(d.showSupportingRecordsCta).toBe(true);
    expect(d.supportingRecordsHref).toBe("#plant-recent-activity");
    expect(d.supportingRecordsCtaLabel).toMatch(/related activity/i);
    expect(d.supportingRecordsCtaAriaLabel).toMatch(/Recent Activity/i);
  });

  it("hides the CTA when there is no evidence to inspect", () => {
    const d = buildPhotoEvidenceDisplay({
      evidenceCount: 0,
      galleryPhotoCount: 0,
      dataSource: "live",
    });
    expect(d.showSupportingRecordsCta).toBe(false);
  });

  it("accepts a custom supporting-records href but never invents one", () => {
    const d = buildPhotoEvidenceDisplay({
      evidenceCount: 1,
      supportingRecordsHref: "#custom-anchor",
    });
    expect(d.supportingRecordsHref).toBe("#custom-anchor");
    // Blank / whitespace-only falls back to the default anchor.
    const d2 = buildPhotoEvidenceDisplay({
      evidenceCount: 1,
      supportingRecordsHref: "   ",
    });
    expect(d2.supportingRecordsHref).toBe("#plant-recent-activity");
  });

  it("demo mismatch note points at Recent Activity, not the gallery", () => {
    const d = buildPhotoEvidenceDisplay({
      evidenceCount: 2,
      galleryPhotoCount: 0,
      dataSource: "demo",
    });
    expect(d.hasGalleryMismatch).toBe(true);
    expect(d.mismatchNote).toMatch(/Recent Activity/i);
    expect(d.mismatchNote).not.toMatch(/\blive\b/i);
  });

  it("is deterministic across identical inputs", () => {
    const a = buildPhotoEvidenceDisplay({
      evidenceCount: 3,
      galleryPhotoCount: 1,
      dataSource: "live",
    });
    const b = buildPhotoEvidenceDisplay({
      evidenceCount: 3,
      galleryPhotoCount: 1,
      dataSource: "live",
    });
    expect(a).toEqual(b);
  });
});
