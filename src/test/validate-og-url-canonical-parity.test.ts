/**
 * Unit tests for scripts/validate-og-url-canonical-parity.mjs.
 *
 * Locks the contract that every built static document's og:url and
 * twitter:url tags must be byte-identical to its <link rel="canonical">
 * href. Crawlers reattribute per-route social cards to og:url when it
 * disagrees with the canonical, silently poisoning the preview.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collectHtmlFiles,
  extractCanonicalHrefs,
  extractUrlMetaTags,
  validateDocument,
  validateOgUrlCanonicalParity,
} from "../../scripts/validate-og-url-canonical-parity.mjs";

const CANONICAL = "https://verdantgrowdiary.com/guides/vpd";

const okDoc = (url = CANONICAL) => `<!doctype html><html><head>
  <link rel="canonical" href="${url}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:url" content="${url}">
</head><body></body></html>`;

describe("extractCanonicalHrefs", () => {
  it("returns the canonical href when present", () => {
    expect(extractCanonicalHrefs(okDoc())).toEqual([CANONICAL]);
  });
  it("returns every canonical link (so callers can flag duplicates)", () => {
    const html = `<link rel="canonical" href="${CANONICAL}"><link rel="canonical" href="${CANONICAL}/x">`;
    expect(extractCanonicalHrefs(html)).toEqual([CANONICAL, `${CANONICAL}/x`]);
  });
  it("returns empty when no canonical is present", () => {
    expect(extractCanonicalHrefs(`<html><head></head></html>`)).toEqual([]);
  });
});

describe("extractUrlMetaTags", () => {
  it("extracts og:url and twitter:url values", () => {
    expect(extractUrlMetaTags(okDoc())).toEqual([
      { tag: "og:url", url: CANONICAL },
      { tag: "twitter:url", url: CANONICAL },
    ]);
  });
  it("handles content-first attribute ordering", () => {
    const html = `<meta content="${CANONICAL}" property="og:url">`;
    expect(extractUrlMetaTags(html)).toEqual([{ tag: "og:url", url: CANONICAL }]);
  });
  it("ignores other og:* / twitter:* tags", () => {
    const html = `<meta property="og:title" content="X"><meta name="twitter:card" content="summary_large_image">`;
    expect(extractUrlMetaTags(html)).toEqual([]);
  });
});

describe("validateDocument", () => {
  it("passes when og:url and twitter:url both match the canonical", () => {
    expect(validateDocument({ file: "a.html", html: okDoc() })).toEqual([]);
  });

  it("passes when twitter:url is omitted (only og:url is required by parity)", () => {
    const html = `<link rel="canonical" href="${CANONICAL}"><meta property="og:url" content="${CANONICAL}">`;
    expect(validateDocument({ file: "a.html", html })).toEqual([]);
  });

  it("flags og:url mismatch", () => {
    const html = `<link rel="canonical" href="${CANONICAL}"><meta property="og:url" content="https://verdantgrowdiary.com/">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("og:url");
    expect(issues[0].message).toContain("does not match canonical");
  });

  it("flags twitter:url mismatch even when og:url matches", () => {
    const html = `<link rel="canonical" href="${CANONICAL}"><meta property="og:url" content="${CANONICAL}"><meta name="twitter:url" content="${CANONICAL}/other">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("twitter:url");
  });

  it("is byte-identical (trailing slash counts as a mismatch)", () => {
    const html = `<link rel="canonical" href="${CANONICAL}"><meta property="og:url" content="${CANONICAL}/">`;
    expect(validateDocument({ file: "a.html", html })).toHaveLength(1);
  });

  it("flags og:url/twitter:url declared without any canonical to compare against", () => {
    const html = `<meta property="og:url" content="${CANONICAL}">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("canonical");
  });

  it("flags duplicate canonical links (parity check is ambiguous)", () => {
    const html = `<link rel="canonical" href="${CANONICAL}"><link rel="canonical" href="${CANONICAL}/x"><meta property="og:url" content="${CANONICAL}">`;
    const issues = validateDocument({ file: "a.html", html });
    expect(issues).toHaveLength(1);
    expect(issues[0].tag).toBe("canonical");
    expect(issues[0].message).toContain("exactly one");
  });

  it("passes silently when a document has no canonical and no url tags", () => {
    expect(validateDocument({ file: "a.html", html: `<html></html>` })).toEqual([]);
  });
});

describe("validateOgUrlCanonicalParity (dist walk)", () => {
  let dist: string;

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), "og-url-parity-"));
    mkdirSync(join(dist, "guides"), { recursive: true });
    writeFileSync(join(dist, "index.html"), okDoc("https://verdantgrowdiary.com/"));
    writeFileSync(join(dist, "guides", "vpd.html"), okDoc());
    writeFileSync(
      join(dist, "guides", "broken.html"),
      `<link rel="canonical" href="${CANONICAL}"><meta property="og:url" content="https://verdantgrowdiary.com/">`,
    );
  });

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it("collects every .html file under dist", () => {
    expect(collectHtmlFiles(dist).sort()).toHaveLength(3);
  });

  it("returns issues for mismatched documents with dist-relative paths", () => {
    const { issues, documents, comparisons } = validateOgUrlCanonicalParity(dist);
    expect(documents).toBe(3);
    expect(comparisons).toBe(5); // 2 + 2 + 1
    expect(issues).toHaveLength(1);
    expect(issues[0].file.replace(/\\/g, "/")).toBe("guides/broken.html");
    expect(issues[0].tag).toBe("og:url");
  });
});
