/**
 * PlantDetail: AI Doctor Review Result preview is mounted (static check).
 *
 * Avoids rendering the full PlantDetail page; asserts the source wires up
 * the safe read-only preview component with no result payload.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../../src/pages/PlantDetail.tsx"),
  "utf8",
);

describe("PlantDetail — AI Doctor Review Result preview", () => {
  it("imports AiDoctorReviewResultPreview", () => {
    expect(SRC).toMatch(
      /from "@\/components\/AiDoctorReviewResultPreview"/,
    );
  });

  it("mounts the preview component without a result prop", () => {
    expect(SRC).toMatch(/<AiDoctorReviewResultPreview\b[\s\S]*?\/>/);
    const match = SRC.match(/<AiDoctorReviewResultPreview\b([\s\S]*?)\/>/);
    expect(match).not.toBeNull();
    if (match) {
      expect(match[1]).not.toMatch(/result=/);
    }
  });
});
