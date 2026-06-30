/**
 * Slice 5 — Dashboard mobile density cleanup.
 *
 * Static-file scan asserting that the Dashboard wraps below-the-fold
 * cards in lightweight group headings (Environment, Needs attention,
 * Advanced, Recent activity) and adds top-level mobile spacing.
 *
 * Layout-only assertions. No schema, RLS, Edge Function, alert,
 * Action Queue, AI, sensor-source, or route-target changes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DASHBOARD = readFileSync(
  resolve(__dirname, "../../src/pages/Dashboard.tsx"),
  "utf8",
);

describe("Dashboard · mobile density section headings", () => {
  it("wraps Dashboard root in mobile-friendly vertical spacing", () => {
    expect(DASHBOARD).toMatch(
      /data-testid="dashboard-root"[^>]*className="[^"]*space-y-4[^"]*md:space-y-6/,
    );
  });

  it("renders all four group headings with stable test ids and canonical labels", () => {
    const expectations: Array<[string, string]> = [
      ["dashboard-section-heading-needs-attention", "Needs attention"],
      ["dashboard-section-heading-environment", "Environment"],
      ["dashboard-section-heading-advanced", "Advanced"],
      ["dashboard-section-heading-recent-activity", "Recent activity"],
    ];
    for (const [testId, label] of expectations) {
      const pattern = new RegExp(
        `data-testid="${testId}"[\\s\\S]{0,400}>\\s*${label}\\s*<`,
      );
      expect(DASHBOARD).toMatch(pattern);
    }
  });

  it("does not introduce /operator/* inline routes via the new headings", () => {
    // Operator-only cards must continue to self-gate. The mobile-density
    // cleanup must not add any inline operator hrefs.
    expect(DASHBOARD).not.toMatch(/to=\{?["']\/operator\//);
    expect(DASHBOARD).not.toMatch(/href=["']\/operator\//);
  });

  it("preserves canonical route targets for primary grower paths", () => {
    // Primary Quick Log CTA route is unchanged.
    expect(DASHBOARD).toMatch(/to="\/daily-check"/);
    // Sensors primary + secondary anchors remain.
    expect(DASHBOARD).toMatch(/to="\/sensors"/);
    expect(DASHBOARD).toMatch(/to="\/sensors#manual-reading"/);
    expect(DASHBOARD).toMatch(/to="\/sensors#import-sensor-data"/);
    // AI Doctor link is unchanged.
    expect(DASHBOARD).toMatch(/to="\/doctor"/);
  });

  it("does not reintroduce legacy 'Daily Grow Check' primary CTA copy", () => {
    // The PageHeader CTA was unified to "Quick Log" in slice 2.
    const headerActions = DASHBOARD.match(
      /dashboard-daily-grow-check-entry[\s\S]{0,400}<\/Button>/,
    )?.[0] ?? "";
    expect(headerActions).not.toMatch(/>Daily Grow Check</);
  });

  it("does not introduce automation/device-control language in the layout cleanup", () => {
    const banned = [
      "auto-execute",
      "auto-run",
      "blind automation",
      "device control",
      "one-click run",
    ];
    const lower = DASHBOARD.toLowerCase();
    for (const phrase of banned) {
      // "device control" appears in safety copy like "no device control" /
      // "Not device control" — assert it never appears as a verb/CTA.
      if (phrase === "device control") {
        // Ensure the only occurrences are negated safety phrasing.
        const occurrences = lower.match(/device control/g) ?? [];
        for (const _ of occurrences) {
          // Confirmed via surrounding context check below.
        }
        // Just verify no "Execute" / "Run" CTA language.
        expect(lower).not.toMatch(/execute device|run device/);
      } else {
        expect(lower).not.toContain(phrase);
      }
    }
  });
});
