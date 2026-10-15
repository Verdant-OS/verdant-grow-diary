import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESKTOP_QUICK_LOG_FAB_BOTTOM_REM,
  DESKTOP_QUICK_LOG_FAB_HEIGHT_REM,
  MOBILE_QUICK_LOG_FAB_BOTTOM_REM,
  MOBILE_QUICK_LOG_FAB_HEIGHT_REM,
  QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS,
  QUICK_LOG_FAB_CONTENT_GAP_REM,
  desktopQuickLogContentClearanceRem,
  mobileQuickLogContentClearanceRem,
} from "@/lib/quickLogFabClearanceRules";

const APP_SHELL = readFileSync(resolve(__dirname, "../components/AppShell.tsx"), "utf8");
const QUICK_LOG_V2_FAB = readFileSync(
  resolve(__dirname, "../components/QuickLogV2Fab.tsx"),
  "utf8",
);

function formatClearanceRem(rem: number): string {
  return `${rem}rem`;
}

describe("quickLogFabClearanceRules", () => {
  it("derives mobile content clearance from FAB offset, height, and gap", () => {
    expect(mobileQuickLogContentClearanceRem()).toBe(
      MOBILE_QUICK_LOG_FAB_BOTTOM_REM +
        MOBILE_QUICK_LOG_FAB_HEIGHT_REM +
        QUICK_LOG_FAB_CONTENT_GAP_REM,
    );
    expect(mobileQuickLogContentClearanceRem()).toBe(9.5);
  });

  it("derives desktop content clearance from FAB offset, height, and gap", () => {
    expect(desktopQuickLogContentClearanceRem()).toBe(
      DESKTOP_QUICK_LOG_FAB_BOTTOM_REM +
        DESKTOP_QUICK_LOG_FAB_HEIGHT_REM +
        QUICK_LOG_FAB_CONTENT_GAP_REM,
    );
    expect(desktopQuickLogContentClearanceRem()).toBe(5.25);
  });

  it("keeps Tailwind clearance utilities aligned with calculated rem totals", () => {
    const mobileRem = formatClearanceRem(mobileQuickLogContentClearanceRem());
    const desktopRem = formatClearanceRem(desktopQuickLogContentClearanceRem());
    expect(QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS).toBe(
      `pb-[calc(${mobileRem}+env(safe-area-inset-bottom))] md:pb-[calc(${desktopRem}+env(safe-area-inset-bottom))]`,
    );
  });

  it("pins AppShell mobile FAB offset to the mobile bottom constant", () => {
    expect(APP_SHELL).toContain(
      `bottom-[calc(${MOBILE_QUICK_LOG_FAB_BOTTOM_REM}rem+env(safe-area-inset-bottom))]`,
    );
    expect(APP_SHELL).toMatch(/data-testid="mobile-quick-log-fab"[\s\S]{0,400}\bh-14\b/);
  });

  it("pins QuickLogV2Fab desktop offset to the desktop bottom constant", () => {
    expect(QUICK_LOG_V2_FAB).toContain(`md:bottom-${DESKTOP_QUICK_LOG_FAB_BOTTOM_REM * 4}`);
  });
});
