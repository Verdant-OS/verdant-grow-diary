import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const VITE = read("vite.config.ts");
const VERCEL = JSON.parse(read("vercel.json")) as {
  cleanUrls?: boolean;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

describe("Founder static social document build contract", () => {
  it("emits every static SEO document, including founder.html, from the Vite-built index asset", () => {
    expect(VITE).toContain("staticSocialRouteDocuments()");
    expect(VITE).toContain("STATIC_PUBLIC_SEO_DOCUMENTS");
    expect(VITE).toContain("for (const document of STATIC_PUBLIC_SEO_DOCUMENTS)");
    expect(VITE).toContain("buildStaticSocialRouteHtml(indexAsset.source, document.metadata)");
    expect(VITE).toContain("fileName: document.fileName");
    expect(VITE).toContain('apply: "build"');
  });

  it("routes /founder to its clean static entry before the SPA fallback", () => {
    expect(VERCEL.cleanUrls).toBe(true);
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
