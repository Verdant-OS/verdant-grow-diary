/**
 * verdant-seo-og-images.test.tsx
 *
 * OpenGraph/Twitter image validity for the public /guides surface.
 *
 * Contract: "no broken OG image URL is ever emitted" — not "an image is
 * mandatory". Today usePageSeo defaults og:image/twitter:image to the
 * brand logo; these tests pin that whatever URL is emitted:
 *  - is an absolute https URL (or valid site-relative path),
 *  - is never empty and never a placeholder,
 *  - resolves, when same-origin, to a real file in public/,
 *  - has an image-like file extension,
 *  - twitter:image agrees with the same validity rules.
 *
 * Deliberately no live network fetches — same-origin URLs are resolved
 * to the public/ directory on disk so CI stays deterministic.
 *
 * Tests only. No product changes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuidesIndex from "@/pages/GuidesIndex";
import GuidePage from "@/pages/GuidePage";
import { VERDANT_GUIDE_SLUGS, VERDANT_SITE_ORIGIN } from "@/constants/verdantSeoContent";

const REPO = resolve(__dirname, "../..");
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

function renderGuides(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/:slug" element={<GuidePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function headContent(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute("content") ?? null;
}

/**
 * Validate one emitted image URL. Same-origin URLs must resolve to a real
 * public/ asset; external URLs must be https (no network check — CI stays
 * offline-deterministic).
 */
function expectValidImageUrl(url: string, label: string) {
  expect(url.trim().length, `${label} must not be empty`).toBeGreaterThan(0);
  expect(url, `${label} must not be a placeholder`).not.toMatch(/placeholder/i);
  expect(
    url.startsWith("https://") || url.startsWith("/"),
    `${label} must be absolute https or site-relative: ${url}`,
  ).toBe(true);

  const pathname = url.startsWith(VERDANT_SITE_ORIGIN)
    ? url.slice(VERDANT_SITE_ORIGIN.length)
    : url.startsWith("/")
      ? url
      : null;

  if (pathname !== null) {
    // Same-origin: the asset must exist in public/ and be non-empty.
    const assetPath = resolve(REPO, "public", pathname.replace(/^\//, ""));
    expect(
      existsSync(assetPath),
      `${label} points at missing local asset: ${url} → ${assetPath}`,
    ).toBe(true);
    expect(statSync(assetPath).size, `${label} local asset is empty: ${assetPath}`).toBeGreaterThan(
      0,
    );
    expect(pathname, `${label} should look like an image: ${url}`).toMatch(IMAGE_EXT);
  } else {
    // External: https only; content validity is a deployment concern, not a
    // unit-test concern (no flaky live fetches here).
    expect(url, `${label} external URL must be https: ${url}`).toMatch(/^https:\/\//);
  }
}

const ALL_GUIDE_PATHS = ["/guides", ...VERDANT_GUIDE_SLUGS.map((s) => `/guides/${s}`)];

afterEach(cleanup);

describe("/guides OpenGraph image validity", () => {
  for (const path of ALL_GUIDE_PATHS) {
    it(`${path}: emitted og:image is valid and unbroken`, () => {
      renderGuides(path);
      const og = headContent('meta[property="og:image"]');
      // Contract: an image is not mandatory — but IF emitted it must be valid.
      if (og === null) return;
      expectValidImageUrl(og, `${path} og:image`);
    });

    it(`${path}: emitted twitter:image is valid and unbroken`, () => {
      renderGuides(path);
      const tw = headContent('meta[name="twitter:image"]');
      if (tw === null) return;
      expectValidImageUrl(tw, `${path} twitter:image`);
    });

    it(`${path}: og:image and twitter:image agree when both are emitted`, () => {
      renderGuides(path);
      const og = headContent('meta[property="og:image"]');
      const tw = headContent('meta[name="twitter:image"]');
      if (og === null || tw === null) return;
      // Either identical, or independently-valid images (both already
      // validated above) — never one valid and one invented.
      if (og !== tw) {
        expectValidImageUrl(tw, `${path} twitter:image (diverged from og)`);
      }
      expect(tw).toBe(og);
    });
  }

  it("the default brand OG asset referenced by index.html exists", () => {
    const indexHtml = readFileSync(resolve(REPO, "index.html"), "utf8");
    const matches = [
      ...indexHtml.matchAll(
        /<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content="([^"]+)"/g,
      ),
    ].map((m) => m[1]);
    expect(matches.length).toBeGreaterThan(0);
    for (const url of matches) {
      expectValidImageUrl(url, "index.html social image");
    }
  });
});
