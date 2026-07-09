/**
 * Regression: Recent Photos and Harvest Watch photo counts must never
 * contradict for the same plant context. The reconciled harvest-watch
 * view-model must expose an explanation for every non-zero evidence
 * count, and must expose a mismatch note whenever the Recent Photos
 * gallery is empty (or smaller) than the evidence count.
 *
 * Pure view-model level — no React, no Supabase, no network.
 */
import { describe, expect, it } from "vitest";

import { buildPlantDetailHarvestWatchCardViewModel } from "@/lib/plantDetailHarvestWatchCardViewModel";

const PLANT = {
  id: "plant-1",
  name: "Test Plant",
  strain: "Test Strain",
  stage: "flowering",
  startedAt: "2025-01-01T00:00:00.000Z",
  photo: null as string | null,
};

describe("Recent Photos ↔ Harvest Watch reconciliation", () => {
  it("no photos + no evidence: label is zero and no mismatch note", () => {
    const vm = buildPlantDetailHarvestWatchCardViewModel({
      plant: PLANT,
      recentActivityRows: [],
      hasPlantPhoto: false,
      galleryPhotoCount: 0,
    });
    expect(vm.evidenceLabel).toMatch(/0 photo evidence points/);
    expect(vm.evidenceGalleryMismatch).toBe(false);
    expect(vm.evidenceMismatchNote).toBe("");
    expect(vm.evidenceExplanation).toMatch(/No diary entries/i);
  });

  it("gallery photos exist and evidence count matches: no contradiction", () => {
    const vm = buildPlantDetailHarvestWatchCardViewModel({
      plant: PLANT,
      recentActivityRows: [
        { hasPhoto: true, hasSnapshot: false, occurredAt: "2025-06-01T00:00:00.000Z" },
        { hasPhoto: true, hasSnapshot: false, occurredAt: "2025-06-02T00:00:00.000Z" },
      ],
      hasPlantPhoto: false,
      galleryPhotoCount: 2,
    });
    expect(vm.evidenceLabel).toMatch(/2 photo evidence points/);
    expect(vm.evidenceGalleryMismatch).toBe(false);
    expect(vm.evidenceMismatchNote).toBe("");
  });

  it("evidence exists but Recent Photos is empty: mismatch note explains the source", () => {
    const vm = buildPlantDetailHarvestWatchCardViewModel({
      plant: PLANT,
      recentActivityRows: [
        { hasPhoto: true, hasSnapshot: false, occurredAt: "2025-06-01T00:00:00.000Z" },
        { hasPhoto: true, hasSnapshot: false, occurredAt: "2025-06-02T00:00:00.000Z" },
        { hasPhoto: true, hasSnapshot: false, occurredAt: "2025-06-03T00:00:00.000Z" },
        { hasPhoto: true, hasSnapshot: false, occurredAt: "2025-06-04T00:00:00.000Z" },
      ],
      hasPlantPhoto: false,
      galleryPhotoCount: 0,
    });
    expect(vm.evidenceLabel).toMatch(/4 photo evidence points/);
    expect(vm.evidenceGalleryMismatch).toBe(true);
    expect(vm.evidenceMismatchNote).toMatch(/Recent Photos/i);
    expect(vm.evidenceMismatchNote).toMatch(/Recent Activity/i);
    // Non-zero evidence must always carry an explanation.
    expect(vm.evidenceExplanation).toMatch(/Recent Activity/i);
  });

  it("gallery unknown: never fabricates a mismatch note", () => {
    const vm = buildPlantDetailHarvestWatchCardViewModel({
      plant: PLANT,
      recentActivityRows: [
        { hasPhoto: true, hasSnapshot: false, occurredAt: "2025-06-01T00:00:00.000Z" },
      ],
      hasPlantPhoto: false,
      // galleryPhotoCount intentionally omitted
    });
    expect(vm.evidenceGalleryMismatch).toBe(false);
    expect(vm.evidenceMismatchNote).toBe("");
    expect(vm.evidenceExplanation).toMatch(/photo/i);
  });

  it("does not treat plant hero photo as a gallery thumbnail on its own", () => {
    // The Recent Photos strip does not surface plant.photo — so if the
    // strip is empty but plant.photo bumps the evidence count, we still
    // need the mismatch note so the two surfaces agree.
    const vm = buildPlantDetailHarvestWatchCardViewModel({
      plant: { ...PLANT, photo: "https://example.com/hero.jpg" },
      recentActivityRows: [],
      hasPlantPhoto: true,
      galleryPhotoCount: 0,
    });
    expect(vm.evidenceLabel).toMatch(/1 photo evidence point\b/);
    expect(vm.evidenceGalleryMismatch).toBe(true);
    expect(vm.evidenceMismatchNote).not.toBe("");
  });
});
