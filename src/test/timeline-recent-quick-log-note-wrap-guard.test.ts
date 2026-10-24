/**
 * Regression guard for #2126: Recent Quick Logs (and sibling history lanes)
 * share Row() note rendering — long unbroken notes must stay wrap-safe in source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PANELS = readFileSync(resolve(__dirname, "../components/QuickLogHistoryPanels.tsx"), "utf8");

describe("Quick Log history note wrap guard (#2126)", () => {
  it("pins overflow-wrap on the note summary body inside history cards", () => {
    expect(PANELS).toContain('data-testid="quicklog-history-note-summary"');
    expect(PANELS).toMatch(
      /data-testid="quicklog-history-note-summary"[\s\S]{0,500}\[overflow-wrap:anywhere\]/,
    );
    expect(PANELS).toMatch(
      /row\.noteBody[\s\S]{0,400}whitespace-pre-wrap[\s\S]{0,120}\[overflow-wrap:anywhere\]/,
    );
  });
});
