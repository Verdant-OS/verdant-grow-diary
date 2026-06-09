/**
 * Static safety scans for mobile Dashboard / AppShell layout.
 *
 * Goals (PR #47):
 *   - mobile Quick Log FAB does not sit at the same low offset as the
 *     bottom nav (would overlap)
 *   - AppShell main content has bottom padding so fixed nav/FAB does not
 *     cover readable content
 *   - PageHeader allows wrapping so narrow mobile screens do not produce
 *     one-word-per-line layouts or header overlap with actions
 *   - Dashboard does not relabel saved account data as "LIVE DATA"
 *
 * Pure file-content scans. No rendering, no network.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const APP_SHELL = read("src/components/AppShell.tsx");
const QUICK_LOG_FAB = read("src/components/QuickLogV2Fab.tsx");
const PAGE_HEADER = read("src/components/PageHeader.tsx");
const DASHBOARD = read("src/pages/Dashboard.tsx");
const DISCLOSURE = read("src/components/DashboardDataSourceDisclosure.tsx");

describe("AppShell mobile layout safety", () => {
  it("main content reserves bottom padding for fixed nav/FAB on mobile", () => {
    expect(APP_SHELL).toMatch(/pb-(2[0-9]|28|24|32)/);
  });

  it("mobile floating Quick Log button sits above the bottom nav", () => {
    // Bottom nav is h-16 fixed at bottom-0 → FAB must clear ~64px.
    expect(APP_SHELL).toMatch(/md:hidden[\s\S]{0,400}bottom-(?:1[6-9]|2[0-9])/);
  });
});

describe("QuickLogV2Fab mobile safety", () => {
  it("FAB raises above bottom nav on mobile and resets on desktop", () => {
    expect(QUICK_LOG_FAB).toMatch(/bottom-(?:1[6-9]|2[0-9])/);
    expect(QUICK_LOG_FAB).toMatch(/md:bottom-/);
  });

  it("FAB does not hard-code an overlapping low offset without responsive guard", () => {
    // No bare `bottom-6` / `bottom-4` without a md: counterpart on mobile.
    const hasBareLow = /className="[^"]*\bbottom-(?:4|6)\b[^"]*"/.test(
      QUICK_LOG_FAB,
    );
    const hasResponsive = /md:bottom-/.test(QUICK_LOG_FAB);
    expect(hasBareLow && !hasResponsive).toBe(false);
  });
});

describe("PageHeader wrap safety", () => {
  it("allows wrapping and respects min-w-0 to avoid one-word-per-line layouts", () => {
    expect(PAGE_HEADER).toMatch(/flex-wrap/);
    expect(PAGE_HEADER).toMatch(/min-w-0/);
    expect(PAGE_HEADER).toMatch(/break-words/);
  });
});

describe("Dashboard source-label copy safety", () => {
  it("Dashboard does not use 'LIVE DATA' wording for saved account data", () => {
    expect(DASHBOARD).not.toMatch(/LIVE DATA/);
  });

  it("DashboardDataSourceDisclosure prefers 'Saved' wording over 'Live data from your grow backend'", () => {
    expect(DISCLOSURE).not.toMatch(/Live data from your grow backend/);
    expect(DISCLOSURE).toMatch(/Saved data/);
    expect(DISCLOSURE).toMatch(/Loaded from your Verdant account\./);
  });

  it("DashboardDataSourceDisclosure keeps Demo / Mixed / Unavailable copy honest", () => {
    expect(DISCLOSURE).toMatch(/Demo data/);
    expect(DISCLOSURE).toMatch(/Mixed data/);
    expect(DISCLOSURE).toMatch(/Unavailable/);
  });
});
