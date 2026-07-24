import { describe, expect, it } from "vitest";
import { validateCanonicalHref, EXPECTED_ORIGIN } from "../../scripts/validate-canonical-shape.mjs";

describe("validateCanonicalHref", () => {
  it("accepts a well-formed absolute https URL on the expected origin", () => {
    expect(validateCanonicalHref(`${EXPECTED_ORIGIN}/cultivars`)).toEqual([]);
  });

  it("accepts the root path", () => {
    expect(validateCanonicalHref(`${EXPECTED_ORIGIN}/`)).toEqual([]);
  });

  it("rejects relative hrefs", () => {
    expect(validateCanonicalHref("/cultivars").join()).toMatch(/not an absolute/);
  });

  it("rejects protocol-relative hrefs", () => {
    expect(validateCanonicalHref("//verdantgrowdiary.com/x").join()).toMatch(/protocol-relative|not an absolute/);
  });

  it("rejects http scheme", () => {
    expect(validateCanonicalHref("http://verdantgrowdiary.com/x").join()).toMatch(/https/);
  });

  it("rejects a wrong origin", () => {
    expect(validateCanonicalHref("https://example.com/x").join()).toMatch(/origin/);
  });

  it("rejects a URL with a fragment", () => {
    expect(validateCanonicalHref(`${EXPECTED_ORIGIN}/cultivars#top`).join()).toMatch(/fragment/);
  });

  it("rejects a URL with a query string", () => {
    expect(validateCanonicalHref(`${EXPECTED_ORIGIN}/cultivars?ref=x`).join()).toMatch(/query/);
  });

  it("rejects duplicated slashes in the path", () => {
    expect(validateCanonicalHref(`${EXPECTED_ORIGIN}//cultivars`).join()).toMatch(/duplicated slashes/);
    expect(validateCanonicalHref(`${EXPECTED_ORIGIN}/a//b`).join()).toMatch(/duplicated slashes/);
  });

  it("rejects a trailing slash on non-root paths", () => {
    expect(validateCanonicalHref(`${EXPECTED_ORIGIN}/cultivars/`).join()).toMatch(/trailing slash/);
  });
});
