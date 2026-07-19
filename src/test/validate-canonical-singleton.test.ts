import { describe, expect, it } from "vitest";
import {
  extractCanonicalTags,
  validateDocument,
} from "../../scripts/validate-canonical-singleton.mjs";

const wrap = (head: string) => `<!doctype html><html><head>${head}</head><body></body></html>`;

describe("validate-canonical-singleton", () => {
  it("extracts a single canonical tag with its href", () => {
    const tags = extractCanonicalTags(
      wrap(`<link rel="canonical" href="https://verdantgrowdiary.com/x" />`),
    );
    expect(tags).toEqual([
      { tag: expect.stringContaining("canonical"), href: "https://verdantgrowdiary.com/x" },
    ]);
  });

  it("accepts a document with exactly one canonical + href", () => {
    const html = wrap(`<link rel="canonical" href="https://verdantgrowdiary.com/x" />`);
    expect(validateDocument({ file: "x.html", html })).toEqual([]);
  });

  it("flags a document missing a canonical", () => {
    const html = wrap(`<title>x</title>`);
    const issues = validateDocument({ file: "x.html", html });
    expect(issues.map((i) => i.message).join()).toMatch(/no <link rel="canonical">/);
  });

  it("skips the SPA fallback when no canonical is present", () => {
    const html = wrap(`<title>x</title>`);
    expect(
      validateDocument({ file: "index.html", html, isSpaFallback: true }),
    ).toEqual([]);
  });

  it("flags a document declaring two canonical tags", () => {
    const html = wrap(
      `<link rel="canonical" href="https://verdantgrowdiary.com/a" />` +
        `<link rel="canonical" href="https://verdantgrowdiary.com/b" />`,
    );
    const issues = validateDocument({ file: "x.html", html });
    expect(issues.map((i) => i.message).join()).toMatch(/2 <link rel="canonical"> tags/);
  });

  it("flags a canonical tag missing an href attribute", () => {
    const html = wrap(`<link rel="canonical" />`);
    const issues = validateDocument({ file: "x.html", html });
    expect(issues.map((i) => i.message).join()).toMatch(/missing an href/);
  });

  it("flags a canonical tag with an empty href", () => {
    const html = wrap(`<link rel="canonical" href="" />`);
    const issues = validateDocument({ file: "x.html", html });
    expect(issues.map((i) => i.message).join()).toMatch(/empty href/);
  });

  it("accepts single-quoted attributes", () => {
    const html = wrap(`<link rel='canonical' href='https://verdantgrowdiary.com/x' />`);
    expect(validateDocument({ file: "x.html", html })).toEqual([]);
  });
});
