import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";

const ROOT = resolve(process.cwd());
const ROBOTS = readFileSync(resolve(ROOT, "public/robots.txt"), "utf8");
const SITEMAP = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
const VERCEL = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf8"));
const ORIGIN = "https://verdantgrowdiary.com";

describe("cultivar crawl and redirect directives", () => {
  it("lists every canonical cultivar URL once and never lists /strains aliases", () => {
    const locations = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    for (const path of [
      "/cultivars",
      ...VERDANT_CULTIVARS.map((cultivar) => `/cultivars/${cultivar.slug}`),
    ]) {
      expect(locations.filter((location) => location === `${ORIGIN}${path}`)).toHaveLength(1);
    }
    expect(locations.some((location) => new URL(location).pathname.startsWith("/strains"))).toBe(
      false,
    );
  });

  it("keeps cultivar pages and their social cards crawlable", () => {
    const disallows = ROBOTS.split(/\r?\n/)
      .filter((line) => /^Disallow:/i.test(line.trim()))
      .map((line) => line.replace(/^Disallow:\s*/i, "").trim());
    for (const publicPath of ["/cultivars", "/cultivars/oreoz", "/og/cultivars/oreoz.png"]) {
      expect(
        disallows.some((rule) => rule && publicPath.startsWith(rule.replace(/\*$/, ""))),
        `${publicPath} is blocked by robots.txt`,
      ).toBe(false);
    }
  });

  it("explicitly allows Slack and LinkedIn social crawlers", () => {
    expect(ROBOTS).toMatch(/User-agent:\s*Slackbot\s+Allow:\s*\//i);
    expect(ROBOTS).toMatch(/User-agent:\s*LinkedInBot\s+Allow:\s*\//i);
  });

  it("uses permanent HTTP redirects for legacy /strains URLs", () => {
    expect(VERCEL.redirects).toContainEqual({
      source: "/strains",
      destination: "/cultivars",
      permanent: true,
    });
    expect(VERCEL.redirects).toContainEqual({
      source: "/strains/:slug",
      destination: "/cultivars/:slug",
      permanent: true,
    });
    expect(VERCEL.rewrites).toContainEqual({
      source: "/cultivars/:slug",
      destination: "/cultivars/:slug.html",
    });
  });
});
