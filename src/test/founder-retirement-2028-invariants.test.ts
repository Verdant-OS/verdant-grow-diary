/**
 * #2028: Founder Lifetime is no longer sold and /founder is retired. Source
 * invariants for the permanent redirect, canonical URLs, sitemap entries and
 * llms.txt. Live HTTP behaviour is measured separately, never here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  VERDANT_SITE_ORIGIN,
} from "@/lib/build/staticPublicSeoDocuments";
import { getRoutesByAccess } from "@/lib/appRouteManifest";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("#2028 Founder page retirement", () => {
  it("permanently redirects /founder to /pricing and keeps the query", () => {
    expect(
      resolveHostRouting({ pathname: "/founder", search: "?utm_source=founder_share" }),
    ).toMatchObject({
      kind: "redirect",
      status: 308,
      location: "/pricing?utm_source=founder_share",
    });
  });

  it("publishes no /founder document or canonical, and lists it only as a redirect", () => {
    for (const doc of STATIC_PUBLIC_OUTPUT_DOCUMENTS) {
      expect(doc.path).not.toBe("/founder");
      expect(new URL(doc.metadata.url).pathname).not.toBe("/founder");
    }
    expect(getRoutesByAccess("redirect").map((route) => route.path)).toContain("/founder");
    expect(getRoutesByAccess("public").map((route) => route.path)).not.toContain("/founder");
  });

  it("keeps /founder out of the sitemap and Founder Lifetime out of llms.txt", () => {
    const locs = [...read("public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain(`${VERDANT_SITE_ORIGIN}/pricing`);
    expect(locs.filter((loc) => new URL(loc).pathname.startsWith("/founder"))).toEqual([]);
    const llms = read("public/llms.txt");
    expect(llms).not.toMatch(/founder lifetime/i);
    expect(llms).not.toMatch(/\]\(\/founder/);
  });
});
