/**
 * Tests for production SEO, social preview, and browser metadata.
 *
 * Verifies index.html title/description/canonical, Open Graph and Twitter
 * tags, robots, theme color, favicon, and the public site.webmanifest.
 * Also re-asserts that the public landing page never queries private tables
 * and that no service_role / external-control strings leaked in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const HTML = read("index.html");
const MANIFEST_PATH = resolve(root, "public/site.webmanifest");
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const LANDING = read("src/pages/Landing.tsx");

const PROD = "https://verdantgrowdiary.com";
const DESC =
  "Grow logs, sensor-aware insights, environment alerts, and cautious AI coaching for serious cultivators.";

function meta(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]+)"\\s*/?>`, "i");
  return html.match(re)?.[1] ?? null;
}

describe("index.html — primary SEO", () => {
  it("title is Verdant Grow Diary", () => {
    expect(HTML).toMatch(/<title>\s*Verdant Grow Diary\s*<\/title>/);
  });

  it("description matches the production copy", () => {
    expect(meta(HTML, "name", "description")).toBe(DESC);
  });

  it("bakes exactly one root self-canonical", () => {
    // This assertion was previously inverted: it required NO canonical at all,
    // because one baked canonical would have made /welcome, /pricing, etc.
    // declare themselves duplicates of the homepage. That was correct only
    // while the prerender pass was still deferred.
    //
    // It has since shipped, and buildStaticSocialRouteHtml REPLACES an existing
    // canonical rather than appending one, so all 60+ prerendered routes
    // overwrite this tag with their own. What kept the shell tag reaching real
    // pages is gone; what it now reaches is "/" (never prerendered, and until
    // now shipping to non-JS crawlers with no canonical whatsoever) and unknown
    // URLs, which static SPA hosting answers with this shell at HTTP 200.
    //
    // The invariant this depends on — every sitemap URL except "/" is
    // prerendered — is enforced in root-canonical-seo.test.ts. Do not relax
    // this without reading that file.
    const tags = HTML.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi) ?? [];
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('href="https://verdantgrowdiary.com"');
  });

  it("robots is index, follow", () => {
    expect(meta(HTML, "name", "robots")).toMatch(/index/);
    expect(meta(HTML, "name", "robots")).toMatch(/follow/);
  });

  it("theme color is Verdant dark green", () => {
    expect(meta(HTML, "name", "theme-color")).toBe("#0d1a12");
  });
});

describe("index.html — Open Graph", () => {
  it("og:title / description / url / type / site_name / image are set", () => {
    expect(meta(HTML, "property", "og:title")).toBe("Verdant Grow Diary");
    expect(meta(HTML, "property", "og:description")).toBe(DESC);
    expect(meta(HTML, "property", "og:url")).toBe(PROD);
    expect(meta(HTML, "property", "og:type")).toBe("website");
    expect(meta(HTML, "property", "og:site_name")).toBe("Verdant Grow Diary");
    expect(meta(HTML, "property", "og:image")).toMatch(/\/brand\/verdant-logo-512\.png$/);
  });
});

describe("index.html — Twitter card", () => {
  it("twitter card / title / description / image are set", () => {
    expect(meta(HTML, "name", "twitter:card")).toBe("summary_large_image");
    expect(meta(HTML, "name", "twitter:title")).toBe("Verdant Grow Diary");
    expect(meta(HTML, "name", "twitter:description")).toBe(DESC);
    expect(meta(HTML, "name", "twitter:image")).toMatch(/\/brand\/verdant-logo-512\.png$/);
  });
});

describe("index.html — structured data", () => {
  it("ships valid Organization + WebSite JSON-LD", () => {
    const m = HTML.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const data = JSON.parse(m![1]);
    const nodes: Array<{ "@type"?: string; url?: string }> = data["@graph"] ?? [data];
    const types = nodes.map((n) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
    for (const n of nodes) {
      expect(n.url).toBe(PROD);
    }
  });
});

describe("favicon and manifest", () => {
  it("primary favicon is the lightweight inline SVG (not the 2.38 MB brand PNG)", () => {
    expect(HTML).toMatch(/<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/favicon\.svg"/);
    const svg = resolve(root, "public/favicon.svg");
    expect(existsSync(svg)).toBe(true);
    // The whole point of the swap: the per-route favicon must be tiny.
    expect(readFileSync(svg, "utf8").length).toBeLessThan(4096);
  });

  it("apple-touch-icon uses a bounded purpose-built 180px logo", () => {
    expect(HTML).toMatch(
      /<link\s+rel="apple-touch-icon"\s+sizes="180x180"\s+href="\/brand\/verdant-logo-180\.png"/,
    );
    const icon = resolve(root, "public/brand/verdant-logo-180.png");
    expect(existsSync(icon)).toBe(true);
    expect(statSync(icon).size).toBeLessThan(100 * 1024);
  });

  it("links to /site.webmanifest", () => {
    expect(HTML).toMatch(/<link\s+rel="manifest"\s+href="\/site\.webmanifest"/);
  });

  it("does not regress browser icon discovery to the full source logo", () => {
    const browserIcons = HTML.match(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g) ?? [];
    expect(browserIcons.join("\n")).not.toContain("/brand/verdant-logo.png");
  });

  it("legacy /favicon.ico is no longer shipped", () => {
    expect(existsSync(resolve(root, "public/favicon.ico"))).toBe(false);
  });

  it("site.webmanifest has the expected production fields", () => {
    expect(MANIFEST.name).toBe("Verdant Grow Diary");
    expect(MANIFEST.short_name).toBe("Verdant");
    expect(MANIFEST.start_url).toBe("/");
    expect(MANIFEST.display).toBe("standalone");
    expect(MANIFEST.background_color).toBe("#0d1a12");
    expect(MANIFEST.theme_color).toBe("#0d1a12");
    expect(Array.isArray(MANIFEST.icons)).toBe(true);
    expect(MANIFEST.icons.length).toBeGreaterThan(0);
    for (const icon of MANIFEST.icons) {
      expect(icon.src).toMatch(/^\/brand\//);
      expect(icon.src).not.toBe("/brand/verdant-logo.png");
      const abs = resolve(root, "public", icon.src.replace(/^\//, ""));
      expect(existsSync(abs)).toBe(true);
      expect(statSync(abs).size, `${icon.src} should stay below 40 KiB`).toBeLessThan(40 * 1024);
    }
    expect(MANIFEST.icons).toEqual([
      {
        src: "/brand/verdant-logo-192.webp",
        sizes: "192x192",
        type: "image/webp",
        purpose: "any",
      },
      {
        src: "/brand/verdant-logo-512.webp",
        sizes: "512x512",
        type: "image/webp",
        purpose: "any",
      },
    ]);
  });
});

describe("safety: SEO changes did not expose private data", () => {
  it("landing page still does not query private tables", () => {
    const privateTables = [
      "grows",
      "plants",
      "tents",
      "sensor_readings",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "diary_entries",
    ];
    for (const t of privateTables) {
      expect(LANDING).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
    expect(LANDING).not.toMatch(/@\/integrations\/supabase\/client/);
  });

  it("index.html introduces no service_role / external-control strings", () => {
    expect(HTML).not.toMatch(/service_role/);
    expect(HTML).not.toMatch(/external[-_ ]control/i);
    expect(HTML).not.toMatch(/device[-_ ]command/i);
  });
});
