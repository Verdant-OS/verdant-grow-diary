/**
 * verdant-seo-sitemap-robots.test.ts
 *
 * Sitemap/robots discovery hardening for the public /guides surface:
 *  - every guide URL (hub + all slugs) is present in public/sitemap.xml,
 *  - no protected app route appears in the sitemap,
 *  - robots.txt advertises the sitemap and never disallows /guides,
 *  - every /guides* sitemap URL resolves to a manifest route that is
 *    explicitly public,
 *  - neither file carries device-control/autopilot promises.
 *
 * Static reads only. No network, no product changes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VERDANT_GUIDE_SLUGS, VERDANT_SITE_ORIGIN } from "@/constants/verdantSeoContent";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const REPO = resolve(__dirname, "../..");
const SITEMAP = readFileSync(resolve(REPO, "public/sitemap.xml"), "utf8");
const ROBOTS = readFileSync(resolve(REPO, "public/robots.txt"), "utf8");

/** All <loc> values in the sitemap. */
const SITEMAP_LOCS = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

/** All Disallow path rules in robots.txt (comments stripped). */
const DISALLOW_RULES = ROBOTS.split(/\r?\n/)
  .map((l) => l.replace(/#.*$/, "").trim())
  .filter((l) => /^Disallow:/i.test(l))
  .map((l) => l.replace(/^Disallow:\s*/i, "").trim())
  .filter((rule) => rule.length > 0);

/** The 8 required guide URLs, pinned literally per the SEO plan. */
const REQUIRED_GUIDE_URLS = [
  "https://verdantgrowdiary.com/guides",
  "https://verdantgrowdiary.com/guides/grow-diary-app",
  "https://verdantgrowdiary.com/guides/grow-log-app-vs-grow-journal",
  "https://verdantgrowdiary.com/guides/grow-room-vpd-tracker",
  "https://verdantgrowdiary.com/guides/ac-infinity-data-logging",
  "https://verdantgrowdiary.com/guides/spider-farmer-data-logging",
  "https://verdantgrowdiary.com/guides/sensor-truth-grow-room",
  "https://verdantgrowdiary.com/guides/ai-grow-doctor",
];

function manifestEntryFor(pathname: string) {
  const segs = pathname.split("/").filter(Boolean);
  for (const entry of APP_ROUTES) {
    if (entry.path === "*") continue;
    const patSegs = entry.path.split("/").filter(Boolean);
    if (patSegs.length !== segs.length) continue;
    if (patSegs.every((p, i) => p.startsWith(":") || p === segs[i])) {
      return entry;
    }
  }
  return null;
}

describe("sitemap.xml exposes the /guides surface", () => {
  it("contains every required guide URL (literal contract)", () => {
    for (const url of REQUIRED_GUIDE_URLS) {
      expect(SITEMAP_LOCS, `sitemap missing ${url}`).toContain(url);
    }
  });

  it("contains a URL for every guide slug in the shared constants", () => {
    for (const slug of VERDANT_GUIDE_SLUGS) {
      const url = `${VERDANT_SITE_ORIGIN}/guides/${slug}`;
      expect(SITEMAP_LOCS, `sitemap missing constant-derived ${url}`).toContain(url);
    }
  });

  it("shared slug constants and the literal contract agree (no drift)", () => {
    const derived = new Set(VERDANT_GUIDE_SLUGS.map((s) => `${VERDANT_SITE_ORIGIN}/guides/${s}`));
    for (const url of REQUIRED_GUIDE_URLS.filter((u) => u !== `${VERDANT_SITE_ORIGIN}/guides`)) {
      expect(derived.has(url), `slug constants no longer include ${url}`).toBe(true);
    }
  });

  it("includes no protected app routes", () => {
    for (const path of ["/dashboard", "/diary", "/settings", "/admin"]) {
      for (const loc of SITEMAP_LOCS) {
        const pathname = loc.replace(VERDANT_SITE_ORIGIN, "");
        expect(
          pathname === path || pathname.startsWith(`${path}/`),
          `sitemap exposes protected route: ${loc}`,
        ).toBe(false);
      }
    }
  });

  it("every /guides* sitemap URL resolves to an explicitly-public manifest route", () => {
    const guideLocs = SITEMAP_LOCS.filter((loc) => loc.startsWith(`${VERDANT_SITE_ORIGIN}/guides`));
    expect(guideLocs.length).toBeGreaterThanOrEqual(REQUIRED_GUIDE_URLS.length);
    for (const loc of guideLocs) {
      const pathname = loc.replace(VERDANT_SITE_ORIGIN, "");
      const entry = manifestEntryFor(pathname);
      expect(entry, `sitemap URL has no manifest route: ${loc}`).toBeTruthy();
      expect(entry!.access, `sitemap URL is not public: ${loc}`).toBe("public");
    }
  });
});

describe("robots.txt keeps /guides crawlable", () => {
  it("advertises the sitemap", () => {
    expect(ROBOTS).toContain("Sitemap: https://verdantgrowdiary.com/sitemap.xml");
  });

  it("has no Disallow rule that blocks /guides", () => {
    for (const rule of DISALLOW_RULES) {
      expect(
        "/guides" === rule || "/guides".startsWith(rule.replace(/\*$/, "")),
        `robots.txt Disallow rule "${rule}" blocks /guides`,
      ).toBe(false);
    }
  });

  it("has no Disallow rule that blocks any guide slug", () => {
    for (const slug of VERDANT_GUIDE_SLUGS) {
      const path = `/guides/${slug}`;
      for (const rule of DISALLOW_RULES) {
        expect(
          path === rule || path.startsWith(rule.replace(/\*$/, "")),
          `robots.txt Disallow rule "${rule}" blocks ${path}`,
        ).toBe(false);
      }
    }
  });
});

describe("sitemap/robots carry no forbidden device-control language", () => {
  const FORBIDDEN = [
    "autopilot",
    "fully automated grow control",
    "ai controls your equipment",
    "automatic device control",
    "autonomous device control",
    "hands-free grow control",
    "set-and-forget automation",
  ];
  it("sitemap.xml is clean", () => {
    const lower = SITEMAP.toLowerCase();
    for (const phrase of FORBIDDEN) {
      expect(lower.includes(phrase), `sitemap contains "${phrase}"`).toBe(false);
    }
  });
  it("robots.txt is clean", () => {
    const lower = ROBOTS.toLowerCase();
    for (const phrase of FORBIDDEN) {
      expect(lower.includes(phrase), `robots contains "${phrase}"`).toBe(false);
    }
  });
});
