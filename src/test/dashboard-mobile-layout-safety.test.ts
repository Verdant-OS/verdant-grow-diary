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
const DAILY_GROW_CHECK_PANEL = read("src/components/DashboardDailyGrowCheckPanel.tsx");
const DISCLOSURE = read("src/components/DashboardDataSourceDisclosure.tsx");

describe("AppShell mobile layout safety", () => {
  it("does not conceal oversized route content at the application root", () => {
    const shellRoot = APP_SHELL.match(
      /<div className="relative isolate flex min-h-screen w-full[^"]*"/,
    )?.[0];

    expect(shellRoot).toBeTruthy();
    expect(shellRoot).not.toMatch(/overflow-x-(?:clip|hidden)/);
  });

  it("main content reserves bottom padding for fixed nav/FAB on mobile", () => {
    expect(APP_SHELL).toMatch(/pb-(2[0-9]|28|24|32)/);
  });

  it("mobile floating Quick Log button sits above the bottom nav", () => {
    // Bottom nav is fixed at the safe-area edge. The shell FAB must clear the
    // full nav plus the device inset rather than relying on a fixed low offset.
    expect(APP_SHELL).toMatch(
      /bottom-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\][\s\S]{0,400}md:hidden/,
    );
  });
});

describe("QuickLogV2Fab mobile safety", () => {
  it("FAB raises above bottom nav on mobile and resets on desktop", () => {
    expect(QUICK_LOG_FAB).toMatch(/bottom-(?:1[6-9]|2[0-9])/);
    expect(QUICK_LOG_FAB).toMatch(/md:bottom-/);
  });

  it("FAB does not hard-code an overlapping low offset without responsive guard", () => {
    // No bare `bottom-6` / `bottom-4` without a md: counterpart on mobile.
    const hasBareLow = /className="[^"]*\bbottom-(?:4|6)\b[^"]*"/.test(QUICK_LOG_FAB);
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

  it("stacks the title and actions until the desktop breakpoint", () => {
    expect(PAGE_HEADER).toMatch(/flex min-w-0 flex-col gap-4 lg:flex-row/);
    expect(PAGE_HEADER).toMatch(
      /flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:shrink-0/,
    );
    expect(PAGE_HEADER).not.toMatch(/gap-4 sm:flex-row/);
  });
});

describe("Dashboard Daily Grow Check narrow-screen safety", () => {
  it("stacks row content below 390px so the action group can wrap inside the row", () => {
    expect(DAILY_GROW_CHECK_PANEL).toMatch(/max-\[389px\]:flex-col max-\[389px\]:items-stretch/);
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
