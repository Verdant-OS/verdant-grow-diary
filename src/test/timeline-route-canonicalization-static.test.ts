/**
 * Slice 7 — Repo-wide /logs link guard.
 *
 * Narrowly-scoped static scan that prevents user-facing Dashboard, mobile,
 * and sidebar nav from regressing back to the legacy /logs route.
 *
 * The /logs route still exists in App.tsx as a redirect alias to /timeline,
 * and the logsPath helper still exists in src/lib/routes.ts for backward
 * compatibility — both are explicitly allowed here.
 *
 * Read-only. No React render, no fetch, no Supabase, no schema work.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const DASHBOARD = read("src/pages/Dashboard.tsx");
const MOBILE = read("src/components/MobileNav.tsx");
const SIDEBAR = read("src/components/AppSidebar.tsx");
const APP = read("src/App.tsx");

const USER_FACING = [
  ["Dashboard", DASHBOARD] as const,
  ["MobileNav", MOBILE] as const,
  ["AppSidebar", SIDEBAR] as const,
];

describe("Slice 7: user-facing nav never points at the legacy /logs path", () => {
  it.each(USER_FACING)("%s contains no to=\"/logs\" link", (_name, source) => {
    expect(source).not.toMatch(/to=\{?\s*["'`]\/logs(?:["'`?])/);
  });

  it.each(USER_FACING)("%s contains no href=\"/logs\" link", (_name, source) => {
    expect(source).not.toMatch(/href=\{?\s*["'`]\/logs(?:["'`?])/);
  });

  it("Dashboard does not import or call logsPath", () => {
    const importLine =
      DASHBOARD.match(/import\s*\{[^}]*\}\s*from\s*["']@\/lib\/routes["']/)?.[0] ?? "";
    expect(importLine).not.toContain("logsPath");
    expect(DASHBOARD).not.toMatch(/\blogsPath\s*\(/);
  });

  it("MobileNav Timeline item targets /timeline", () => {
    const timelineItem = MOBILE.match(/\{[^}]*label:\s*"Timeline"[^}]*\}/);
    expect(timelineItem?.[0], "MobileNav must define a Timeline nav item").toBeTruthy();
    expect(timelineItem?.[0]).toMatch(/to:\s*"\/timeline"/);
  });

  it("AppSidebar Timeline item targets /timeline", () => {
    const timelineItem = SIDEBAR.match(/\{[^}]*label:\s*"Timeline"[^}]*\}/);
    expect(timelineItem?.[0], "AppSidebar must define a Timeline nav item").toBeTruthy();
    expect(timelineItem?.[0]).toMatch(/to:\s*"\/timeline"/);
  });
});

describe("Slice 7: /logs remains a legacy redirect alias in App.tsx", () => {
  it("App.tsx registers a /logs route that <Navigate>s to /timeline", () => {
    expect(APP).toMatch(/path=["']\/logs["']/);
    expect(APP).toMatch(
      /<Route[^>]*path=["']\/logs["'][^>]*element=\{\s*<Navigate\s+to=["']\/timeline["']\s+replace\s*\/>\s*\}/,
    );
  });

  it("App.tsx still mounts the canonical /timeline route", () => {
    expect(APP).toMatch(/<Route[^>]*path=["']\/timeline["']/);
  });
});
