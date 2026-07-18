import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TENTS = readFileSync(resolve(process.cwd(), "src/pages/Tents.tsx"), "utf8");
const BROWSER_PROOF = readFileSync(
  resolve(process.cwd(), "e2e/tents-mobile-overflow.spec.ts"),
  "utf8",
);

describe("Tents mobile card layout contract", () => {
  it("wraps footer content and gives the plant-assessment status a full-width row", () => {
    expect(TENTS).toMatch(/mt-auto flex min-w-0 flex-wrap/);
    expect(TENTS).toMatch(/basis-full min-w-0/);
    expect(TENTS).not.toMatch(/mt-auto flex items-center justify-between/);
  });

  it("uses a unique plant-count status id for every tent card", () => {
    expect(TENTS).toContain("data-testid={`tent-plant-count-status-${t.id}`}");
    expect(TENTS).not.toContain('data-testid="tent-plant-count-status"');
  });

  it("shrinks and breaks user-controlled tent names and brands", () => {
    expect(TENTS).toMatch(/min-w-0[^"]*break-words/);
    expect(TENTS).toMatch(/\[overflow-wrap:anywhere\]/);
  });

  it("has a real-browser overflow proof at 320px, 360px, and 390px", () => {
    expect(BROWSER_PROOF).toMatch(/width:\s*320/);
    expect(BROWSER_PROOF).toMatch(/width:\s*360/);
    expect(BROWSER_PROOF).toMatch(/width:\s*390/);
    expect(BROWSER_PROOF).toContain(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    );
    expect(BROWSER_PROOF).toContain('"UnbrokenTentName".repeat(18)');
  });
});
