/**
 * Public Quick Log Starter — route / manifest / SEO-surface registration.
 *
 * Pins every list the /quick-log route must live in: App.tsx mounting
 * (public block, OUTSIDE AppShell), the route manifest (access "public"),
 * the mobile-e2e public list, sitemap.xml, llms.txt, and robots.txt
 * non-disallowal. Registration style mirrors pricing.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_ROUTES } from "@/lib/appRouteManifest";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("App.tsx mounting", () => {
  it("lazy-imports the starter page", () => {
    expect(APP).toMatch(
      /const QuickLogStarter = lazy\(\(\) => import\("\.\/pages\/QuickLogStarter"\)\);/,
    );
  });

  it("mounts the literal /quick-log route", () => {
    expect(APP).toMatch(/<Route path="\/quick-log" element={<QuickLogStarter \/>} \/>/);
  });

  it("mounts it OUTSIDE the AppShell-protected block", () => {
    const routeIdx = APP.indexOf('path="/quick-log"');
    const shellIdx = APP.indexOf("<Route element={<AppShell />}>");
    expect(routeIdx).toBeGreaterThan(-1);
    expect(shellIdx).toBeGreaterThan(-1);
    expect(routeIdx, "starter route must precede the AppShell block").toBeLessThan(shellIdx);
  });
});

describe("route manifest", () => {
  it("registers /quick-log as public with an honest local-draft description", () => {
    const entry = APP_ROUTES.find((r) => r.path === "/quick-log");
    expect(entry).toBeDefined();
    expect(entry?.access).toBe("public");
    expect(entry?.description).toMatch(/local draft/i);
    expect(entry?.description).toMatch(/this device/i);
    expect(entry?.showInNav).toBeUndefined();
  });
});

describe("mobile e2e public coverage", () => {
  it("PUBLIC_MOBILE_ROUTES includes /quick-log", () => {
    const spec = readFileSync(resolve(ROOT, "e2e/auth-route-protection-mobile.spec.ts"), "utf8");
    expect(spec).toMatch(/"\/quick-log",/);
  });
});

describe("SEO surface files", () => {
  it("sitemap.xml lists the starter URL", () => {
    const sitemap = readFileSync(resolve(ROOT, "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://verdantgrowdiary.com/quick-log</loc>");
  });

  it("llms.txt lists the starter page honestly", () => {
    const llms = readFileSync(resolve(ROOT, "public/llms.txt"), "utf8");
    expect(llms).toContain("(/quick-log)");
    expect(llms).toMatch(/stays on your device/i);
  });

  it("robots.txt does not disallow /quick-log", () => {
    const robots = readFileSync(resolve(ROOT, "public/robots.txt"), "utf8");
    const disallowed = robots
      .split("\n")
      .filter((l) => l.trim().toLowerCase().startsWith("disallow:"))
      .map((l) => l.split(":")[1]?.trim() ?? "");
    for (const prefix of disallowed) {
      if (prefix.length === 0) continue;
      expect(
        "/quick-log".startsWith(prefix),
        `robots.txt Disallow prefix "${prefix}" must not cover /quick-log`,
      ).toBe(false);
    }
  });
});
