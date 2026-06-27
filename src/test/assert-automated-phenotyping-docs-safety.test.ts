import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  scanText,
  TARGET_FILE,
  ALLOW_MARKER,
} from "../../scripts/assert-automated-phenotyping-docs-safety.mjs";

describe("assert-automated-phenotyping-docs-safety", () => {
  it("real protocol file has no violations", () => {
    const text = readFileSync(TARGET_FILE, "utf8");
    const violations = scanText(text);
    if (violations.length) {
      // Surface details on failure
      // eslint-disable-next-line no-console
      console.error(violations);
    }
    expect(violations).toEqual([]);
  });

  it("safe text passes", () => {
    const safe = `
# Safe doc
- No visible concern
- Visible concern
- Uncertain
- Needs human review
- Retake Photo
- Accepted as Supporting Evidence
- Rejected
`;
    expect(scanText(safe)).toEqual([]);
  });

  it("banned label outside allow block fails", () => {
    const bad = `Plants are marked Healthy_Leaf today.`;
    const v = scanText(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].phrase).toBe("Healthy_Leaf");
  });

  it("banned phrase inside allowed line passes", () => {
    const ok = `- "Healthy_Leaf" <!-- ${ALLOW_MARKER} -->`;
    expect(scanText(ok)).toEqual([]);
  });

  it("case-insensitive detection catches lowercase variants", () => {
    const bad = `we auto-release approved phenos`;
    const v = scanText(bad);
    expect(v.some((x) => x.phrase === "auto-release")).toBe(true);
  });

  it("certainty wording variants fail", () => {
    const bad = `This pheno is guaranteed healthy and AI selected.`;
    const v = scanText(bad);
    const phrases = v.map((x) => x.phrase);
    expect(phrases).toContain("guaranteed healthy");
    expect(phrases).toContain("AI selected");
  });

  it("standalone Healthy/Stressed flagged with word boundary", () => {
    const bad = `Status: Healthy. Plant looks Stressed.`;
    const phrases = scanText(bad).map((x) => x.phrase);
    expect(phrases).toContain("Healthy");
    expect(phrases).toContain("Stressed");
  });

  it("word-boundary avoids false positives inside larger words", () => {
    const ok = `Unhealthy is not the same token. Distressed plants noted.`;
    // "Unhealthy" must not match "Healthy"; "Distressed" must not match "Stressed".
    const phrases = scanText(ok).map((x) => x.phrase);
    expect(phrases).not.toContain("Healthy");
    expect(phrases).not.toContain("Stressed");
  });

  it("safer labels do not trip the scanner", () => {
    const ok = `Label set: No visible concern, Visible concern, Uncertain.`;
    expect(scanText(ok)).toEqual([]);
  });

  it("reports line numbers", () => {
    const bad = `line one\nline two has Pest_Damage here\nline three`;
    const v = scanText(bad);
    expect(v[0].line).toBe(2);
  });
});
