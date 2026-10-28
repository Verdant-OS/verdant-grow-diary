import { describe, expect, it } from "vitest";
import {
  DESKTOP_QUICK_LOG_FAB_BOTTOM_REM,
  DESKTOP_QUICK_LOG_FAB_HEIGHT_REM,
  MOBILE_QUICK_LOG_FAB_BOTTOM_REM,
  MOBILE_QUICK_LOG_FAB_HEIGHT_REM,
  QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS,
  QUICK_LOG_FAB_PAGE_BODY_CLEARANCE_CLASS,
  desktopQuickLogContentClearanceRem,
  mobileQuickLogContentClearanceRem,
} from "@/lib/quickLogFabClearanceRules";

describe("quickLogFabClearanceRules — clearance math and Tailwind contracts (#2205)", () => {
  it("derives main #main-content padding calc strings from computed clearance rem values", () => {
    const mobileRem = mobileQuickLogContentClearanceRem();
    const desktopRem = desktopQuickLogContentClearanceRem();
    expect(QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS).toBe(
      `pb-[calc(${mobileRem}rem+env(safe-area-inset-bottom))] md:pb-[calc(${desktopRem}rem+env(safe-area-inset-bottom))]`,
    );
  });

  it("documents the mobile FAB top edge as bottom offset plus button height (8.5rem)", () => {
    expect(MOBILE_QUICK_LOG_FAB_BOTTOM_REM + MOBILE_QUICK_LOG_FAB_HEIGHT_REM).toBe(8.5);
    expect(mobileQuickLogContentClearanceRem()).toBeGreaterThan(
      MOBILE_QUICK_LOG_FAB_BOTTOM_REM + MOBILE_QUICK_LOG_FAB_HEIGHT_REM,
    );
  });

  it("documents the desktop FAB top edge as bottom offset plus button height (4.25rem)", () => {
    expect(DESKTOP_QUICK_LOG_FAB_BOTTOM_REM + DESKTOP_QUICK_LOG_FAB_HEIGHT_REM).toBe(4.25);
    expect(desktopQuickLogContentClearanceRem()).toBeGreaterThan(
      DESKTOP_QUICK_LOG_FAB_BOTTOM_REM + DESKTOP_QUICK_LOG_FAB_HEIGHT_REM,
    );
  });

  it("keeps inner page-body padding separate from main safe-area padding", () => {
    expect(QUICK_LOG_FAB_PAGE_BODY_CLEARANCE_CLASS).toBe("pb-24 md:pb-6");
  });
});
