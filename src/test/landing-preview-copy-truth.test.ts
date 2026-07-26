import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const LANDING = readFileSync(resolve(ROOT, "src/pages/Landing.tsx"), "utf8");
const NORMALIZED_LANDING = LANDING.replace(/\s+/g, " ");

describe("landing preview copy truth", () => {
  it("distinguishes the illustrative public tour from signed-in grow data", () => {
    expect(LANDING).toContain("<PublicOneTentTour");
    expect(NORMALIZED_LANDING).toContain(
      "Your signed-in diary starts with your own saved grow data; Verdant does not fill it with sample rows.",
    );
    expect(LANDING).not.toContain("there is no synthetic preview mode");
  });
});
