/**
 * Static wiring guard: AppShell must consume shared clearance rules so padding
 * cannot drift from FAB geometry without updating quickLogFabClearanceRules.ts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_SHELL_SRC = readFileSync(resolve(__dirname, "../components/AppShell.tsx"), "utf8");

describe("AppShell — Quick Log FAB clearance wiring (#2205)", () => {
  it("imports clearance classes from quickLogFabClearanceRules instead of duplicating padding", () => {
    expect(APP_SHELL_SRC).toContain('from "@/lib/quickLogFabClearanceRules"');
    expect(APP_SHELL_SRC).toContain("QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS");
    expect(APP_SHELL_SRC).toContain("QUICK_LOG_FAB_PAGE_BODY_CLEARANCE_CLASS");
    expect(APP_SHELL_SRC).toContain('data-testid="app-shell-page-content"');
  });

  it("keeps mobile FAB geometry aligned with clearance rule constants", () => {
    expect(APP_SHELL_SRC).toContain("bottom-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(APP_SHELL_SRC).toMatch(/data-testid="mobile-quick-log-fab"[\s\S]{0,120}\bh-14\b/);
  });

  it("does not restore the pre-#2205 desktop-only main bottom padding (md:pb-9)", () => {
    expect(APP_SHELL_SRC).not.toMatch(/\bmd:pb-9\b/);
  });
});
