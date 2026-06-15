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

describe("mobile Quick Log — single FAB", () => {
  it("AppShell mobile + button uses aria-label 'Open Quick Log'", () => {
    expect(APP_SHELL).toMatch(/aria-label="Open Quick Log"/);
  });

  it("AppShell mobile FAB is guarded by md:hidden", () => {
    expect(APP_SHELL).toMatch(/md:hidden[\s\S]{0,400}data-testid="mobile-quick-log-fab"/);
  });

  it("QuickLogV2Fab Button is hidden on mobile (hidden md:inline-flex)", () => {
    expect(QUICK_LOG_FAB).toMatch(/hidden\s+md:inline-flex/);
  });

  it("QuickLogV2Fab still renders on desktop (md: classes preserved)", () => {
    expect(QUICK_LOG_FAB).toMatch(/md:bottom-/);
  });
});

describe("manual sensor save — UUID guard regression", () => {
  it("useInsertSensorReading rejects non-UUID tent_id (covers 't1' bug)", () => {
    expect(INSERT_HOOK).toMatch(/isUuid\(p\.tent_id\)/);
    expect(INSERT_HOOK).toMatch(/Select a real tent/);
  });
});
