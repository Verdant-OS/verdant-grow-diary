import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STATIC_PUBLIC_OUTPUT_DOCUMENTS,
  STATIC_PUBLIC_SEO_DOCUMENTS,
} from "@/lib/build/staticPublicSeoDocuments";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const VITE = read("vite.config.ts");
const VERCEL = JSON.parse(read("vercel.json")) as {
  cleanUrls?: boolean;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

describe("Founder static social document build contract", () => {
  it("prerenders every public SEO document through TanStack Start", () => {
    expect(VITE).toContain("TANSTACK_PUBLIC_PRERENDER_PATHS.map");
    expect(VITE).toContain("pages:");
    expect(VITE).toContain("prerender:");
    expect(VITE).toContain("enabled: true");
    expect(VITE).toContain("crawlLinks: false");
    expect(VITE).toContain("autoStaticPathsDiscovery: false");
    expect(VITE).toContain("failOnError: true");
    expect(STATIC_PUBLIC_OUTPUT_DOCUMENTS.length).toBeGreaterThan(
      STATIC_PUBLIC_SEO_DOCUMENTS.length,
    );
  });

  it("emits route OG images and the SEO manifest without replacing prerendered HTML", () => {
    expect(VITE).toContain("staticSeoAssets()");
    expect(VITE).not.toContain("buildStaticSocialRouteHtml");
    expect(VITE).not.toContain("staticSocialRouteDocuments");
  });

  it("keeps the MCP generator outside Windows builds", () => {
    expect(VITE).toMatch(/process\.platform\s*!==\s*["']win32["']\s*&&\s*mcpPlugin\(\)/);
  });

  it("uses a filesystem-first static entry for /founder before the SPA fallback", () => {
    expect(VERCEL.cleanUrls).toBe(true);
    expect(
      STATIC_PUBLIC_SEO_DOCUMENTS.find((document) => document.path === "/founder")?.fileName,
    ).toBe("founder/index.html");
    expect(VERCEL.rewrites?.[0]).toEqual({
      source: "/((?!assets/).*)",
      destination: "/",
    });
  });

  it("introduces no redirect, external destination, or private route", () => {
    const routes = JSON.stringify(VERCEL.rewrites ?? []);
    expect(routes).not.toMatch(/https?:\/\//);
    expect(routes).not.toMatch(/\/operator|\/admin|\/internal/);
    expect(routes).not.toMatch(/service_role|secret|token/i);
  });
});
