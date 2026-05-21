/**
 * Tests for production launch readiness: robots.txt, sitemap.xml,
 * docs/launch-checklist.md, and README references.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const ROBOTS = read("public/robots.txt");
const SITEMAP = read("public/sitemap.xml");
const CHECKLIST = read("docs/launch-checklist.md");
const README = read("README.md");

describe("robots.txt", () => {
  it("exists", () => {
    expect(existsSync(resolve(root, "public/robots.txt"))).toBe(true);
  });

  it("allows all user agents", () => {
    expect(ROBOTS).toMatch(/User-agent:\s*\*/);
    expect(ROBOTS).toMatch(/Allow:\s*\//);
  });

  it("references the production sitemap", () => {
    expect(ROBOTS).toMatch(
      /Sitemap:\s*https:\/\/verdantgrowdiary\.com\/sitemap\.xml/,
    );
  });
});

describe("sitemap.xml", () => {
  it("exists", () => {
    expect(existsSync(resolve(root, "public/sitemap.xml"))).toBe(true);
  });

  it("uses the production domain", () => {
    expect(SITEMAP).toMatch(/https:\/\/verdantgrowdiary\.com\//);
  });

  it("includes only safe public routes (/ and /welcome)", () => {
    expect(SITEMAP).toMatch(
      /<loc>https:\/\/verdantgrowdiary\.com\/<\/loc>/,
    );
    expect(SITEMAP).toMatch(
      /<loc>https:\/\/verdantgrowdiary\.com\/welcome<\/loc>/,
    );
  });

  it("excludes private authenticated routes", () => {
    const privatePaths = [
      "/dashboard",
      "/grows",
      "/plants",
      "/tents",
      "/sensors",
      "/logs",
      "/timeline",
      "/tasks",
      "/cameras",
      "/alerts",
      "/actions",
      "/doctor",
      "/settings",
      "/diagnostics",
      "/auth",
    ];
    for (const p of privatePaths) {
      expect(SITEMAP).not.toMatch(
        new RegExp(`<loc>https://verdantgrowdiary\\.com${p}(/|<)`),
      );
    }
  });

  it("does not introduce service_role or external-control strings", () => {
    expect(SITEMAP).not.toMatch(/service_role/);
    expect(SITEMAP).not.toMatch(/external[-_ ]control/i);
  });
});

describe("docs/launch-checklist.md", () => {
  it("exists", () => {
    expect(existsSync(resolve(root, "docs/launch-checklist.md"))).toBe(true);
  });

  it("covers DNS, SSL, auth, and private-route protection", () => {
    expect(CHECKLIST).toMatch(/DNS/);
    expect(CHECKLIST).toMatch(/SSL/);
    expect(CHECKLIST).toMatch(/verdantgrowdiary\.com/);
    expect(CHECKLIST).toMatch(/Auth route/i);
    expect(CHECKLIST).toMatch(/Private routes require authentication/i);
    expect(CHECKLIST).toMatch(/robots\.txt/);
    expect(CHECKLIST).toMatch(/sitemap\.xml/);
    expect(CHECKLIST).toMatch(/brand logo/i);
    expect(CHECKLIST).toMatch(/mobile/i);
  });

  it("does not introduce service_role or external-control strings", () => {
    expect(CHECKLIST).not.toMatch(/service_role/);
    expect(CHECKLIST).not.toMatch(/external[-_ ]control/i);
  });
});

describe("README references", () => {
  it("references robots.txt, sitemap.xml, and the launch checklist", () => {
    expect(README).toMatch(/public\/robots\.txt/);
    expect(README).toMatch(/public\/sitemap\.xml/);
    expect(README).toMatch(/docs\/launch-checklist\.md/);
  });
});
