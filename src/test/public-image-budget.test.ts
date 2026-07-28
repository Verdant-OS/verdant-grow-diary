import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import {
  collectImageFiles,
  MAX_IMAGE_BYTES,
  validateImageBudget,
} from "../../scripts/validate-public-image-budget.mjs";

describe("public image budget", () => {
  it("keeps every checked-in public raster within the shipped budget", () => {
    const root = resolve(process.cwd(), "public");
    expect(collectImageFiles(root).length).toBeGreaterThan(0);
    expect(() => validateImageBudget(root)).not.toThrow();
    expect(MAX_IMAGE_BYTES).toBe(500 * 1024);
  });
});
