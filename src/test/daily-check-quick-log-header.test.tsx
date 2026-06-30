/**
 * Static assertions for the Quick Log page header alignment on /daily-check.
 *
 * Presenter-only. No rendering, no Supabase, no writes. Reads the source of
 * DailyCheck.tsx and verifies copy + DOM order so the grower's "Quick Log"
 * promise matches the page they land on.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve("src/pages/DailyCheck.tsx"), "utf8");

describe("DailyCheck Quick Log header alignment", () => {
  it("uses 'Quick Log' as the page H1 title", () => {
    expect(SRC).toMatch(/title="Quick Log"/);
  });

  it("uses the grower-friendly Quick Log subtitle", () => {
    expect(SRC).toMatch(
      /description="Log a short observation, photo, or manual sensor snapshot for today\."/,
    );
  });

  it("does not use 'Daily Grow Check' as the PageHeader title", () => {
    expect(SRC).not.toMatch(/title="Daily Grow Check"/);
  });

  it("renders 'Add plant note' fast-path before the guided-check launcher", () => {
    const note = SRC.indexOf("Add plant note");
    const guided = SRC.indexOf("Or run the guided check");
    expect(note).toBeGreaterThan(-1);
    expect(guided).toBeGreaterThan(-1);
    expect(note).toBeLessThan(guided);
  });

  it("renders 'Add sensor snapshot' fast-path before the guided-check launcher", () => {
    const snap = SRC.indexOf("Add sensor snapshot");
    const guided = SRC.indexOf("Or run the guided check");
    expect(snap).toBeGreaterThan(-1);
    expect(guided).toBeGreaterThan(-1);
    expect(snap).toBeLessThan(guided);
  });

  it("includes the 'Or run the guided check' heading above the wizard", () => {
    expect(SRC).toMatch(/Or run the guided check/);
    const guidedHeading = SRC.indexOf("Or run the guided check");
    const progress = SRC.indexOf('data-testid="daily-grow-check-progress"');
    expect(progress).toBeGreaterThan(guidedHeading);
  });

  it("preserves the fast-path 'Choose today's check' section", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose"/);
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-quicklog"/);
    expect(SRC).toMatch(/data-testid="daily-grow-check-choose-snapshot"/);
  });

  it("preserves the guided wizard launcher (progress + step cards)", () => {
    expect(SRC).toMatch(/data-testid="daily-grow-check-progress"/);
    expect(SRC).toMatch(/Step 1 · Select Current Tent \/ Plant/);
  });

  it("preserves safety copy around what a check means and source labeling", () => {
    expect(SRC).toMatch(
      /Logging a check does not mean the plant is healthy/,
    );
    expect(SRC).toMatch(/Saved as <strong>manual<\/strong>, not live sensor data/);
  });
});
