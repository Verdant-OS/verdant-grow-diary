/**
 * Mobile Quick Log single-FAB regression.
 *
 * Problem: on mobile the dashboard rendered both the AppShell floating "+"
 * button AND <QuickLogV2Fab />, giving two stacked Quick Log entry points.
 * One path also routed manual sensor saves through a flow that could leak
 * demo tent ids like "t1" into Postgres (`invalid input syntax for type
 * uuid: "t1"`).
 *
 * These static-scan tests lock in:
 *   - exactly one mobile Quick Log FAB (AppShell), aria-label "Open Quick Log"
 *   - Tent Detail routes use that FAB to open tent-scoped V2 logging
 *   - QuickLogV2Fab is hidden on mobile (desktop-only)
 *   - desktop Quick Log behavior is preserved (md:inline-flex)
 *   - the UUID guard on manual sensor saves remains in place
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const APP_SHELL = read("components/AppShell.tsx");
const QUICK_LOG_FAB = read("components/QuickLogV2Fab.tsx");
const INSERT_HOOK = read("hooks/useInsertSensorReading.ts");
const TENT_DETAIL = read("pages/TentDetail.tsx");

describe("mobile Quick Log — single FAB", () => {
  it("AppShell mobile + button uses aria-label 'Open Quick Log'", () => {
    expect(APP_SHELL).toMatch(/aria-label="Open Quick Log"/);
  });

  it("AppShell mobile FAB is guarded by md:hidden", () => {
    expect(APP_SHELL).toMatch(/data-testid="mobile-quick-log-fab"[\s\S]{0,400}md:hidden/);
  });

  it("QuickLogV2Fab Button is hidden on mobile (hidden md:inline-flex)", () => {
    expect(QUICK_LOG_FAB).toMatch(/hidden\s+md:inline-flex/);
  });

  it("QuickLogV2Fab still renders on desktop (md: classes preserved)", () => {
    expect(QUICK_LOG_FAB).toMatch(/md:bottom-/);
  });

  it("routes the AppShell mobile FAB into tent-scoped V2 logging on Tent Detail", () => {
    expect(APP_SHELL).toMatch(/resolveMobileQuickLogTarget\(location\.pathname\)/);
    expect(APP_SHELL).toMatch(/mobileQuickLogTarget[\s\S]{0,300}setOpenScopedLog\(true\)/);
    expect(APP_SHELL).toMatch(
      /mobileQuickLogTarget\s*\?[\s\S]{0,250}<QuickLogV2Sheet[\s\S]{0,250}defaultTargetKey=\{mobileQuickLogTarget\}/,
    );
  });
});

describe("manual sensor save — UUID guard regression", () => {
  it("useInsertSensorReading rejects non-UUID tent_id (covers 't1' bug)", () => {
    expect(INSERT_HOOK).toMatch(/isUuid\(p\.tent_id\)/);
    expect(INSERT_HOOK).toMatch(/Select a real tent/);
  });
});

describe("Tent Detail Quick Log — one fixed entry point", () => {
  it("keeps the tent-scoped V2 Quick Log entry point", () => {
    expect(TENT_DETAIL).toMatch(
      /<QuickLogV2Fab\s+defaultTargetKey=\{tent\?\.id\s*\?\s*`tent:\$\{tent\.id\}`\s*:\s*null\}/,
    );
    expect(TENT_DETAIL.match(/<QuickLogV2Fab\b/g) ?? []).toHaveLength(1);
  });

  it("does not restore the legacy lower-left Quick Log overlay", () => {
    expect(TENT_DETAIL).not.toMatch(/tent-detail-quick-log-fab/);
    expect(TENT_DETAIL).not.toMatch(/<QuickLogModal\b/);
    expect(TENT_DETAIL).not.toMatch(/fixed\s+bottom-20\s+left-4/);
  });
});
