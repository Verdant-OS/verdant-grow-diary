/**
 * verdant-guides-glossary-head-invariants.test
 *
 * Regression fence for the head-tag contract of the /guides hub, every
 * /guides/:slug page, and /glossary. These routes are the primary SEO
 * surface for grower-intent search; a silent drift in robots, canonical,
 * og:*, twitter:*, or the presence of these routes in the pre-rendered
 * document registry mislabels the whole content cluster for crawlers.
 *
 * This suite guards:
 *   - Every guide slug + /guides + /glossary is registered in
 *     STATIC_PUBLIC_SEO_DOCUMENTS so non-JS crawlers get real head tags.
 *   - Per-route metadata self-references (canonical/og:url point at the
 *     route itself, not the homepage).
 *   - Global head invariants from public-route-head-invariants.config
 *     (robots values, og:type, twitter:site/creator absence) also apply
 *     to guide + glossary routes when their static HTML is emitted.
 *   - Guide+glossary titles/descriptions stay non-empty, unique, and
 *     within crawlable length windows.
 *
 * No React render, no network. Pure data checks against project
 * source of truth.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STATIC_PUBLIC_SEO_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import {
  VERDANT_SEO_GUIDES,
  VERDANT_GUIDE_SLUGS,
} from "@/constants/verdantSeoContent";
import { buildStaticSocialRouteHtml } from "@/lib/build/staticSocialRouteHtml";
import {
  extractHead,
  diffRouteHead,
} from "../../scripts/validate-static-route-head-fidelity.mjs";
import {
  ALLOWED_ROBOTS_DIRECTIVES,
  DEFAULT_ROBOTS_DIRECTIVE,
  EXPECTED_OG_TYPE,
  EXPECTED_TWITTER_CREATOR,
  EXPECTED_TWITTER_SITE,
} from "../../scripts/public-route-head-invariants.config.mjs";

const REPO = resolve(__dirname, "../..");
const INDEX_HTML = readFileSync(resolve(REPO, "index.html"), "utf8");

const GUIDE_HUB_PATH = "/guides";
const GLOSSARY_PATH = "/glossary";

const REGISTRY_BY_PATH = new Map(
  STATIC_PUBLIC_SEO_DOCUMENTS.map((doc) => [doc.path, doc]),
);

function guidePath(slug: string): string {
  return `/guides/${slug}`;
}

const TARGET_PATHS: ReadonlyArray<string> = [
  GUIDE_HUB_PATH,
  GLOSSARY_PATH,
  ...VERDANT_GUIDE_SLUGS.map(guidePath),
];

describe("Guides + glossary head-tag registry coverage", () => {
  it.each(TARGET_PATHS)(
    "%s is registered in STATIC_PUBLIC_SEO_DOCUMENTS",
    (path) => {
      expect(REGISTRY_BY_PATH.has(path)).toBe(true);
    },
  );

  it("every registered guide + glossary route has a route-local filename", () => {
    for (const path of TARGET_PATHS) {
      const doc = REGISTRY_BY_PATH.get(path)!;
      expect(doc.fileName).toBe(`${path.slice(1)}.html`);
    }
  });

  it("every guide slug in the content module has a matching static doc", () => {
    // Guards against a new guide added to VERDANT_SEO_GUIDES without
    // being wired into the static SEO registry.
    for (const guide of VERDANT_SEO_GUIDES) {
      const doc = REGISTRY_BY_PATH.get(guidePath(guide.slug));
      expect(doc, `missing static doc for /guides/${guide.slug}`).toBeTruthy();
      expect(doc!.metadata.title).toBe(guide.title);
      expect(doc!.metadata.description).toBe(guide.description);
      expect(doc!.metadata.url).toBe(`${VERDANT_SITE_ORIGIN}${guidePath(guide.slug)}`);
    }
  });
});

describe("Guides + glossary head-tag content contract", () => {
  it.each(TARGET_PATHS)("%s canonical / og:url self-references the route", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    expect(doc.metadata.url).toBe(`${VERDANT_SITE_ORIGIN}${path}`);
  });

  it.each(TARGET_PATHS)("%s title contains the Verdant brand suffix", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    expect(doc.metadata.title).toMatch(/Verdant/);
    expect(doc.metadata.title.trim().length).toBeGreaterThan(0);
    // Google truncates around 60–70 chars; keep a soft ceiling with headroom.
    expect(doc.metadata.title.length).toBeLessThanOrEqual(80);
  });

  it.each(TARGET_PATHS)("%s description is non-empty and within crawl window", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    expect(doc.metadata.description.trim().length).toBeGreaterThan(20);
    // Google typically renders up to ~160 chars in SERP; allow a small margin.
    expect(doc.metadata.description.length).toBeLessThanOrEqual(220);
  });

  it("guide + glossary titles are unique across the cluster", () => {
    const titles = TARGET_PATHS.map((p) => REGISTRY_BY_PATH.get(p)!.metadata.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("guide + glossary descriptions are unique across the cluster", () => {
    const descs = TARGET_PATHS.map(
      (p) => REGISTRY_BY_PATH.get(p)!.metadata.description,
    );
    expect(new Set(descs).size).toBe(descs.length);
  });

  it.each(TARGET_PATHS)("%s og:image is an absolute https URL", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    expect(doc.metadata.image).toMatch(/^https:\/\//);
  });

  it.each(TARGET_PATHS)("%s declares a non-empty og:image:alt", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    expect(doc.metadata.imageAlt.trim().length).toBeGreaterThan(0);
  });

  it.each(TARGET_PATHS)("%s robots (if set) is on the allow-list", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    const robots = doc.metadata.robots ?? DEFAULT_ROBOTS_DIRECTIVE;
    expect(ALLOWED_ROBOTS_DIRECTIVES).toContain(robots);
    // Guides + glossary are indexable acquisition surfaces; noindex would
    // silently drop them from search.
    expect(robots).toBe("index, follow");
  });
});

describe("Guides + glossary pre-rendered head matches global invariants", () => {
  it.each(TARGET_PATHS)(
    "%s emitted HTML passes the same head-fidelity fence used in postbuild",
    (path) => {
      const doc = REGISTRY_BY_PATH.get(path)!;
      const html = buildStaticSocialRouteHtml(INDEX_HTML, doc.metadata);
      const diff = diffRouteHead(extractHead(html), {
        path: doc.path,
        fileName: doc.fileName,
        metadata: doc.metadata,
      });
      // Surface the exact mismatched fields when this fails.
      const mismatches = diff.mismatched.map((f: { label: string; expected: unknown; actual: unknown }) =>
        `${f.label}: expected=${JSON.stringify(f.expected)} actual=${JSON.stringify(f.actual)}`,
      );
      expect(mismatches, mismatches.join("\n")).toEqual([]);
      expect(diff.ok).toBe(true);
    },
  );

  it.each(TARGET_PATHS)("%s ships og:type=website (never article/profile drift)", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    const head = extractHead(buildStaticSocialRouteHtml(INDEX_HTML, doc.metadata));
    expect(head.ogType).toBe(EXPECTED_OG_TYPE);
  });

  it.each(TARGET_PATHS)("%s ships the expected robots directive", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    const head = extractHead(buildStaticSocialRouteHtml(INDEX_HTML, doc.metadata));
    expect(head.robots).toBe(doc.metadata.robots ?? DEFAULT_ROBOTS_DIRECTIVE);
  });

  it.each(TARGET_PATHS)("%s ships twitter:card=summary_large_image", (path) => {
    const doc = REGISTRY_BY_PATH.get(path)!;
    const head = extractHead(buildStaticSocialRouteHtml(INDEX_HTML, doc.metadata));
    expect(head.twitterCard).toBe("summary_large_image");
  });

  it.each(TARGET_PATHS)(
    "%s does not ship twitter:site/creator while no handle is configured",
    (path) => {
      const doc = REGISTRY_BY_PATH.get(path)!;
      const head = extractHead(buildStaticSocialRouteHtml(INDEX_HTML, doc.metadata));
      expect(head.twitterSite).toBe(EXPECTED_TWITTER_SITE);
      expect(head.twitterCreator).toBe(EXPECTED_TWITTER_CREATOR);
    },
  );

  it.each(TARGET_PATHS)(
    "%s canonical + og:url + twitter:image resolve to the route (no homepage drift)",
    (path) => {
      const doc = REGISTRY_BY_PATH.get(path)!;
      const head = extractHead(buildStaticSocialRouteHtml(INDEX_HTML, doc.metadata));
      const expectedUrl = `${VERDANT_SITE_ORIGIN}${path}`;
      expect(head.canonical).toBe(expectedUrl);
      expect(head.ogUrl).toBe(expectedUrl);
      // og:image / twitter:image must at least be absolute https.
      expect(head.ogImage).toMatch(/^https:\/\//);
      expect(head.twitterImage).toMatch(/^https:\/\//);
    },
  );
});
