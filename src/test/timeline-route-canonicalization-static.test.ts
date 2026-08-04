/**
 * Slice 7 — Repo-wide /logs link guard.
 *
 * Narrowly-scoped static scan that prevents user-facing Dashboard, mobile,
 * and sidebar nav from regressing back to the legacy /logs route.
 *
 * The /logs route still exists in file routes as a redirect alias to /timeline,
 * and the logsPath helper still exists in src/lib/routes.ts for source
 * compatibility, but the helper itself emits canonical /timeline URLs.
 *
 * Read-only. No React render, no fetch, no Supabase, no schema work.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractMountedAppRoutePaths,
  getRouteAliasRedirectTarget,
  readAllRouteModuleSources,
} from "./helpers/routeManifestSyncHarness";
import {
  readDesktopGrowerNavigationSource,
  readMobileGrowerNavigationSource,
} from "@/test/utils/growerNavigationSource";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const DASHBOARD = read("src/pages/Dashboard.tsx");
const MOBILE = readMobileGrowerNavigationSource();
const SIDEBAR = readDesktopGrowerNavigationSource();
const APP = readAllRouteModuleSources();

const USER_FACING = [
  ["Dashboard", DASHBOARD] as const,
  ["MobileNav", MOBILE] as const,
  ["AppSidebar", SIDEBAR] as const,
];

describe("Slice 7: user-facing nav never points at the legacy /logs path", () => {
  it.each(USER_FACING)('%s contains no to="/logs" link', (_name, source) => {
    expect(source).not.toMatch(/to=\{?\s*["'`]\/logs(?:["'`?])/);
  });

  it.each(USER_FACING)('%s contains no href="/logs" link', (_name, source) => {
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

describe("Slice 7: /logs remains a legacy redirect alias in file routes", () => {
  it("File routes register a scope-preserving /logs alias to /timeline", () => {
    expect(extractMountedAppRoutePaths()).toContain("/logs");
    expect(getRouteAliasRedirectTarget("/logs")).toBe("/timeline");
  });

  it("File routes still mount the canonical /timeline route", () => {
    expect(extractMountedAppRoutePaths()).toContain("/timeline");
    expect(APP).toMatch(/Timeline|@\/pages\/Timeline|pages\/Timeline/);
  });
});
