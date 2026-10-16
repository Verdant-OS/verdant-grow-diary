import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS,
  desktopQuickLogContentClearanceRem,
  mobileQuickLogContentClearanceRem,
} from "@/lib/quickLogFabClearanceRules";

const APP_SHELL = readFileSync(resolve(__dirname, "../components/AppShell.tsx"), "utf8");

describe("Quick Log FAB content clearance", () => {
  it("reserves enough space for the mobile button above the bottom nav", () => {
    expect(mobileQuickLogContentClearanceRem()).toBeGreaterThanOrEqual(9.5);
  });

  it("reserves enough space for the desktop Quick Log button", () => {
    expect(desktopQuickLogContentClearanceRem()).toBeGreaterThanOrEqual(5.25);
  });

  it("applies that clearance on the signed-in main column", () => {
    expect(QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS).toContain("9.5rem");
    expect(APP_SHELL).toContain("QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS");
    expect(APP_SHELL).toContain('paddingBottom: "calc(9.5rem + env(safe-area-inset-bottom))"');
    expect(APP_SHELL).not.toMatch(/md:pb-9/);
  });
});
