import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const VITE = read("vite.config.ts");
const VERCEL = JSON.parse(read("vercel.json")) as {
  rewrites?: Array<{ source?: string; destination?: string }>;
};

describe("Founder static social document build contract", () => {
  it("emits founder.html from the Vite-built index asset", () => {
    expect(VITE).toContain("staticSocialRouteDocuments()");
    expect(VITE).toContain("buildStaticSocialRouteHtml(indexAsset.source, FOUNDER_SOCIAL_META)");
    expect(VITE).toContain('fileName: "founder.html"');
    expect(VITE).toContain('apply: "build"');
  });

  it("routes /founder to its static entry before the SPA fallback", () => {
    expect(VERCEL.rewrites?.[0]).toEqual({
      source: "/founder",
      destination: "/founder.html",
    });
    expect(VERCEL.rewrites?.[1]).toEqual({
      source: "/((?!assets/).*)",
      destination: "/index.html",
    });
  });

  it("introduces no redirect, external destination, or private route", () => {
    const routes = JSON.stringify(VERCEL.rewrites ?? []);
    expect(routes).not.toMatch(/https?:\/\//);
    expect(routes).not.toMatch(/\/operator|\/admin|\/internal/);
    expect(routes).not.toMatch(/service_role|secret|token/i);
  });
});
