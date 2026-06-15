/**
 * AppShell Quick Log consolidation guard.
 *
 * Verdant exposes a single grower-facing logging entry point: Quick Log.
 * The previous side-by-side "Fast Add" + "Quick log" header buttons have
 * been consolidated. This static guard ensures the duplicate CTA does
 * not return and that the consolidated Quick Log CTA still uses the
 * existing Quick Log sheet wiring (no new modal, no schema/write
 * changes).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_SHELL_SRC = readFileSync(
  resolve(__dirname, "../..", "src/components/AppShell.tsx"),
  "utf8",
);

const FAST_ADD_BTN_SRC = readFileSync(
  resolve(__dirname, "../..", "src/components/GlobalFastAddButton.tsx"),
  "utf8",
);

describe("AppShell — Quick Log is the single grower-facing logging CTA", () => {
  it("renders exactly one consolidated Quick Log entry point in the header", () => {
    // The standalone duplicate "Quick log" Button must be gone.
    expect(APP_SHELL_SRC).not.toMatch(/>\s*Quick log\s*</);
    // GlobalFastAddButton is the single header CTA (mobile FAB is separate).
    const headerCtaMatches =
      APP_SHELL_SRC.match(/<GlobalFastAddButton\b/g) ?? [];
    expect(headerCtaMatches.length).toBe(1);
  });

  it("does not surface the legacy 'Fast Add' grower-facing label", () => {
    // User-facing copy is consolidated to "Quick Log". The internal
    // component name may remain, but visible label/aria must not say
    // "Fast Add".
    expect(APP_SHELL_SRC).not.toMatch(/\bFast Add\b/);
    expect(FAST_ADD_BTN_SRC).not.toMatch(/>\s*Fast Add\s*</);
    expect(FAST_ADD_BTN_SRC).not.toMatch(/aria-label="Fast Add"/);
    expect(FAST_ADD_BTN_SRC).not.toMatch(/aria-label="Fast Add actions"/);
  });

  it("Quick Log CTA uses the existing wired Quick Log sheet, not a new modal", () => {
    // The consolidated CTA dispatches the existing PLANT_QUICKLOG_PREFILL_EVENT
    // that AppShell already listens for to open the QuickLog component.
    expect(APP_SHELL_SRC).toContain("PLANT_QUICKLOG_PREFILL_EVENT");
    expect(APP_SHELL_SRC).toContain("<QuickLog");
    // The mobile FAB remains as the mobile Quick Log entry point.
    expect(APP_SHELL_SRC).toMatch(/aria-label="Quick log"/);
  });

  it("introduces no Supabase writes, alerts, or Action Queue behavior", () => {
    for (const t of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(APP_SHELL_SRC).not.toContain(t);
      expect(FAST_ADD_BTN_SRC).not.toContain(t);
    }
    expect(APP_SHELL_SRC).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
    expect(APP_SHELL_SRC).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
  });

  it("contains no device-control / automation / token leakage", () => {
    const combined = APP_SHELL_SRC + "\n" + FAST_ADD_BTN_SRC;
    expect(combined).not.toMatch(/service_role/i);
    expect(combined).not.toMatch(/raw_payload/i);
    expect(combined).not.toMatch(/Bearer\s+ey/);
    expect(combined).not.toMatch(/sk_live_/);
    expect(combined).not.toMatch(/mqtt:\/\//i);
    expect(combined).not.toMatch(/\bpump\.on\b/);
    expect(combined).not.toMatch(/\bautopilot\b/i);
  });
});
