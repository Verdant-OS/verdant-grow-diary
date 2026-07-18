import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CANONICAL_ORIGIN,
  extractSitemapLocs,
  extractRobotsSitemapUrls,
  validateAbsoluteCanonicalUrl,
  checkSitemapCanonicalParity,
  // @ts-expect-error — .mjs module, no d.ts
} from "../../scripts/check-sitemap-canonical-parity.mjs";

function makeCanonicalHtml(path: string): string {
  return `<!doctype html><html><head><link rel="canonical" href="${CANONICAL_ORIGIN}${path}" /></head><body/></html>`;
}

function scaffoldDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "sitemap-canonical-parity-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const sitemapXml = (paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  paths
    .map((p) => `  <url><loc>${CANONICAL_ORIGIN}${p}</loc></url>`)
    .join("\n") +
  `\n</urlset>`;

const robotsWithSitemap = `User-agent: *\nAllow: /\n\nSitemap: ${CANONICAL_ORIGIN}/sitemap.xml\n`;

describe("check-sitemap-canonical-parity", () => {
  it("passes when sitemap, canonicals and robots agree", () => {
    const distDir = scaffoldDist({
      "index.html": `<!doctype html><html><head></head><body/></html>`,
      "welcome.html": makeCanonicalHtml("/welcome"),
      "pricing.html": makeCanonicalHtml("/pricing"),
    });
    const res = checkSitemapCanonicalParity({
      distDir,
      sitemapXml: sitemapXml(["/welcome", "/pricing"]),
      robotsTxt: robotsWithSitemap,
    });
    expect(res.issues).toEqual([]);
    expect(res.sitemapCount).toBe(2);
    expect(res.canonicalCount).toBe(2);
    expect(res.robotsSitemapCount).toBe(1);
  });

  it("flags a sitemap URL with no matching canonical document", () => {
    const distDir = scaffoldDist({
      "welcome.html": makeCanonicalHtml("/welcome"),
    });
    const res = checkSitemapCanonicalParity({
      distDir,
      sitemapXml: sitemapXml(["/welcome", "/orphan-route"]),
      robotsTxt: robotsWithSitemap,
    });
    expect(res.issues.some((i) => i.message.includes("no matching"))).toBe(true);
  });

  it("flags a canonical that is missing from the sitemap", () => {
    const distDir = scaffoldDist({
      "welcome.html": makeCanonicalHtml("/welcome"),
      "secret.html": makeCanonicalHtml("/secret"),
    });
    const res = checkSitemapCanonicalParity({
      distDir,
      sitemapXml: sitemapXml(["/welcome"]),
      robotsTxt: robotsWithSitemap,
    });
    expect(
      res.issues.some((i) => i.message.includes("not listed in public/sitemap.xml")),
    ).toBe(true);
  });

  it("rejects sitemap URLs on the wrong origin or with query strings", () => {
    const distDir = scaffoldDist({});
    const bad =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `<url><loc>http://verdantgrowdiary.com/welcome</loc></url>\n` +
      `<url><loc>${CANONICAL_ORIGIN}/pricing?ref=x</loc></url>\n` +
      `<url><loc>https://evil.example.com/welcome</loc></url>\n` +
      `</urlset>`;
    const res = checkSitemapCanonicalParity({
      distDir,
      sitemapXml: bad,
      robotsTxt: robotsWithSitemap,
    });
    const msgs = res.issues.map((i) => i.message).join("\n");
    expect(msgs).toMatch(/must be https/);
    expect(msgs).toMatch(/must have no query/);
    expect(msgs).toMatch(/must live on/);
  });

  it("requires a robots.txt Sitemap: directive that resolves to /sitemap.xml on the canonical origin", () => {
    const distDir = scaffoldDist({
      "welcome.html": makeCanonicalHtml("/welcome"),
    });
    const res = checkSitemapCanonicalParity({
      distDir,
      sitemapXml: sitemapXml(["/welcome"]),
      robotsTxt: `User-agent: *\nAllow: /\n`,
    });
    expect(
      res.issues.some((i) => i.message.includes("no Sitemap: directive")),
    ).toBe(true);

    const res2 = checkSitemapCanonicalParity({
      distDir,
      sitemapXml: sitemapXml(["/welcome"]),
      robotsTxt: `User-agent: *\nAllow: /\nSitemap: https://other.example.com/sitemap.xml\n`,
    });
    expect(
      res2.issues.some((i) => i.message.includes("must live on")),
    ).toBe(true);
  });

  it("extractSitemapLocs / extractRobotsSitemapUrls / validateAbsoluteCanonicalUrl", () => {
    expect(extractSitemapLocs(sitemapXml(["/a", "/b"]))).toEqual([
      `${CANONICAL_ORIGIN}/a`,
      `${CANONICAL_ORIGIN}/b`,
    ]);
    expect(
      extractRobotsSitemapUrls(
        `# comment\nSitemap: ${CANONICAL_ORIGIN}/sitemap.xml\nsitemap: ${CANONICAL_ORIGIN}/other.xml\n`,
      ),
    ).toEqual([`${CANONICAL_ORIGIN}/sitemap.xml`, `${CANONICAL_ORIGIN}/other.xml`]);
    expect(validateAbsoluteCanonicalUrl("not a url", "x")).toMatch(/absolute URL/);
    expect(
      validateAbsoluteCanonicalUrl(`${CANONICAL_ORIGIN}/ok`, "x"),
    ).toBeNull();
  });
});
