import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const VITE = read("vite.config.ts");
const VERCEL = JSON.parse(read("vercel.json")) as {
  cleanUrls?: boolean;
  rewrites?: Array<{ source?: string; destination?: string }>;
};

describe("Founder static social document build contract", () => {
  it("captures every public SEO document from the production SSR bundle", () => {
    const packageJson = read("package.json");
    expect(packageJson).toContain(
      "capture-ssr-head-snapshots-with-server.mjs dist .output/server/index.mjs",
    );
    expect(VITE).toContain("tanstackStart");
    expect(VITE).toContain('server: { entry: "server" }');
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.some((document) => document.path === "/founder")).toBe(true);
  });

  it("uses a filesystem-first static entry for /founder before the SPA fallback", () => {
    expect(VERCEL.cleanUrls).toBe(true);
    expect(
      STATIC_PUBLIC_SEO_DOCUMENTS.find((document) => document.path === "/founder")?.fileName,
    ).toBe("founder/index.html");
    expect(VERCEL.rewrites?.[0]).toEqual({
      source: "/((?!assets/|~oauth).*)",
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
