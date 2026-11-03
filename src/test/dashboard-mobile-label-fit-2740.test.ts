/**
 * Issue #2740 — dashboard labels fit or wrap at 360, 393, and 430px, and the
 * shell reserves bottom space for the floating Quick Log button.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DashboardMobileLayout } from "@/lib/dashboardMobileLayoutRules";
import {
  QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS,
  mainContentFabClearanceCss,
} from "@/lib/quickLogFabClearanceRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PANEL = read("src/components/DashboardDailyGrowCheckPanel.tsx");
const DISCLOSURE = read("src/components/DashboardDataSourceDisclosure.tsx");
const DASHBOARD = read("src/pages/Dashboard.tsx");
const APP_SHELL = read("src/components/AppShell.tsx");

describe("Issue #2740 dashboard labels at 360, 393, and 430px", () => {
  it("stacks the grow-check row at each checked width", () => {
    for (const width of DashboardMobileLayout.checkedWidthsPx) {
      expect(DashboardMobileLayout.stacksAt(width)).toBe(true);
    }
    expect(DashboardMobileLayout.stacksAt(431)).toBe(false);
  });

  it("wraps the method label instead of truncating it", () => {
    expect(DashboardMobileLayout.growCheckMethodClass).not.toMatch(/\btruncate\b/);
    expect(DashboardMobileLayout.growCheckMethodClass).toMatch(/break-words/);
    expect(PANEL).toContain(DashboardMobileLayout.growCheckRowClass);
    expect(PANEL).toContain(DashboardMobileLayout.growCheckMethodClass);
    expect(PANEL).toMatch(/max-\[431px\]:flex-col max-\[431px\]:items-stretch/);
    expect(PANEL).not.toMatch(/dashboard-daily-grow-check-panel-row-method"[\s\S]{0,120}truncate/);
  });

  it("lets the filter label use the full row and wrap through 430px", () => {
    expect(DashboardMobileLayout.growCheckFilterTriggerClass).toMatch(/basis-full/);
    expect(DashboardMobileLayout.growCheckFilterTriggerClass).toMatch(/line-clamp-none!/);
    expect(DashboardMobileLayout.growCheckFilterTriggerClass).not.toMatch(/w-\[180px\]/);
    expect(PANEL).toContain(DashboardMobileLayout.growCheckFilterTriggerClass);
  });

  it("lets the account and environment sentences wrap", () => {
    expect(DISCLOSURE).toContain(DashboardMobileLayout.disclosureDescriptionClass);
    expect(DASHBOARD).toContain(DashboardMobileLayout.environmentSubtitleClass);
    expect(DASHBOARD).toContain(DashboardMobileLayout.environmentCopyClass);
    expect(DASHBOARD).toMatch(/Latest reading per tent with honest source labels\./);
  });

  it("reserves shell bottom space for the floating button above a shorter padding utility", () => {
    const main = APP_SHELL.match(/<main[\s\S]*?className=\{`([^`]*)`\}/)?.[1] ?? "";
    expect(main).toContain("QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS");
    expect(QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS).toContain("9.5rem");
    expect(APP_SHELL).toContain('data-testid="main-content-fab-clearance"');
    expect(APP_SHELL).toContain("mainContentFabClearanceCss()");
    expect(mainContentFabClearanceCss()).toContain(
      "#main-content{padding-bottom:calc(9.5rem + env(safe-area-inset-bottom))}",
    );
  });
});
