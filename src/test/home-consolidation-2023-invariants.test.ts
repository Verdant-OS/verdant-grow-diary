/**
 * #2023: `/` is the only home page. Source-level invariants for the permanent
 * redirect, canonical URLs, sitemap entries, llms.txt and signup query
 * behaviour. Live HTTP behaviour is measured separately, never here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import {
  buildAttributedLandingPath,
  resolvePaidAcquisitionSource,
} from "@/lib/paidAcquisitionAttributionRules";
import { getRoutesByAccess } from "@/lib/appRouteManifest";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

function redirectOf(pathAndQuery: string) {
  const url = new URL(pathAndQuery, VERDANT_SITE_ORIGIN);
  return resolveHostRouting({ pathname: url.pathname, search: url.search });
}

describe("#2023 home consolidation", () => {
  it("/demo is a permanent 308 straight to /", () => {
    expect(redirectOf("/demo")).toMatchObject({ kind: "redirect", status: 308, location: "/" });
  });

  it.each(["/welcome", "/features"])("%s is served as its own page, not redirected", (path) => {
    expect(redirectOf(path)).toMatchObject({ kind: "continue", location: null });
  });

  it("keeps signup attribution and return-to on the /welcome landing page", () => {
    const attributed = buildAttributedLandingPath({ source: "operator_outreach" });
    expect(attributed.startsWith("/welcome?")).toBe(true);
    const decision = redirectOf(`${attributed}&redirectTo=%2Ftimeline`);
    expect(decision).toMatchObject({ kind: "continue", location: null });
    const landed = new URL(`${attributed}&redirectTo=%2Ftimeline`, VERDANT_SITE_ORIGIN);
    expect(landed.pathname).toBe("/welcome");
    expect(landed.searchParams.get("redirectTo")).toBe("/timeline");
    expect(resolvePaidAcquisitionSource(landed.searchParams)).toBe("operator_outreach");
  });

  it("publishes / as the canonical home, with /welcome and /features self-canonical", () => {
    const home = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find((doc) => doc.path === "/");
    expect(home?.metadata.url).toBe(`${VERDANT_SITE_ORIGIN}/`);
    for (const path of ["/welcome", "/features"]) {
      const doc = STATIC_PUBLIC_OUTPUT_DOCUMENTS.find((candidate) => candidate.path === path);
      expect(doc?.metadata.url).toBe(`${VERDANT_SITE_ORIGIN}${path}`);
    }
  });

  it("lists /, /welcome and /features in the sitemap", () => {
    const locs = [...read("public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain(`${VERDANT_SITE_ORIGIN}/`);
    expect(locs).toContain(`${VERDANT_SITE_ORIGIN}/welcome`);
    expect(locs).toContain(`${VERDANT_SITE_ORIGIN}/features`);
  });

  it("points llms.txt Home at / and lists /welcome as a public page", () => {
    const llms = read("public/llms.txt");
    expect(llms).toContain("- [Home](/):");
    expect(llms).toContain("](/welcome)");
    expect(getRoutesByAccess("public").map((route) => route.path)).toContain("/welcome");
    expect(getRoutesByAccess("redirect").map((route) => route.path)).not.toContain("/welcome");
  });
});
