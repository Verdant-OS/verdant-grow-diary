/**
 * PlantDetail: only the real live-review flow owns result presentation.
 *
 * Avoids rendering the full PlantDetail page; asserts the page no longer
 * mounts an empty, preview-only result card ahead of the grower-initiated
 * review. The live review still renders the validated result component.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_SRC = readFileSync(resolve(__dirname, "../../src/pages/PlantDetail.tsx"), "utf8");
const LIVE_REVIEW_SRC = readFileSync(
  resolve(__dirname, "../../src/components/PlantDetailAiDoctorLiveReview.tsx"),
  "utf8",
);

describe("PlantDetail — AI Doctor review result ownership", () => {
  it("does not import or mount an empty result preview", () => {
    expect(PAGE_SRC).not.toMatch(/from "@\/components\/AiDoctorReviewResultPreview"/);
    expect(PAGE_SRC).not.toMatch(/<AiDoctorReviewResultPreview\b/);
  });

  it("keeps result rendering inside the live review with a validated result prop", () => {
    expect(LIVE_REVIEW_SRC).toMatch(/from "@\/components\/AiDoctorReviewResultPreview"/);
    expect(LIVE_REVIEW_SRC).toMatch(
      /<AiDoctorReviewResultPreview\s+result=\{review\.result\}\s+testIdPrefix="plant-detail-live"\s*\/>/,
    );
  });
});
