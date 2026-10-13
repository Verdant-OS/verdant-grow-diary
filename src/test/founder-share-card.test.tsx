import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Founder share card", () => {
  it("is not mounted as a public sales surface", () => {
    expect(existsSync(resolve(__dirname, "../components/FounderShareCard.tsx"))).toBe(false);
    expect(existsSync(resolve(__dirname, "../pages/Founder.tsx"))).toBe(false);
  });
});
