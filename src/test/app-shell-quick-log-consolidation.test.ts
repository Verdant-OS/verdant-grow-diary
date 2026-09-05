/**
 * AppShell Quick Log consolidation guard.
 *
 * Verdant exposes a single grower-facing logging entry point: Quick Log.
 * Header + and mobile FAB both open the grower QuickLog sheet (Field Edition
 * first). This static guard ensures the duplicate CTA does not return and
 * that entry does not reopen the legacy 8-type preset menu.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_SHELL_SRC = readFileSync(
  resolve(__dirname, "../..", "src/components/AppShell.tsx"),
  "utf8",
);

const QUICK_LOG_SRC = readFileSync(
  resolve(__dirname, "../..", "src/components/QuickLog.tsx"),
  "utf8",
);

describe("AppShell — Quick Log is the single grower-facing logging CTA", () => {
  it("renders exactly one consolidated Quick Log entry point in the header", () => {
    // The standalone duplicate "Quick log" Button must be gone.
    expect(APP_SHELL_SRC).not.toMatch(/>\s*Quick log\s*</);
    // Header opens grower QuickLog directly — not the legacy GlobalFastAdd menu.
    expect(APP_SHELL_SRC).not.toMatch(/GlobalFastAddButton/);
    const headerCtaMatches = APP_SHELL_SRC.match(/data-testid="header-quick-log-trigger"/g) ?? [];
    expect(headerCtaMatches.length).toBe(1);
  });

  it("does not surface the legacy 'Fast Add' grower-facing label", () => {
    expect(APP_SHELL_SRC).not.toMatch(/\bFast Add\b/);
  });

  it("header and FAB share openGrowerQuickLog into the existing Quick Log sheet", () => {
    expect(APP_SHELL_SRC).toContain("openGrowerQuickLog");
    expect(APP_SHELL_SRC).toContain("PLANT_QUICKLOG_PREFILL_EVENT");
    expect(APP_SHELL_SRC).toContain("<QuickLog");
    expect(APP_SHELL_SRC).toMatch(/data-testid="header-quick-log-trigger"/);
    expect(APP_SHELL_SRC).toMatch(/data-testid="mobile-quick-log-fab"/);
    expect(APP_SHELL_SRC).toMatch(/aria-label="Open Quick Log"/);
    expect(QUICK_LOG_SRC).toContain("requestedActivityId={prefill?.activityId ?? null}");
    expect(QUICK_LOG_SRC).toContain(
      "requestedNote={prefill?.activityId ? (prefill.note ?? null) : null}",
    );
  });

  it("does not open the legacy Choose-what-to-log preset menu from AppShell", () => {
    expect(APP_SHELL_SRC).not.toMatch(/Choose what you want to log/);
    expect(APP_SHELL_SRC).not.toMatch(/global-fast-add-menu/);
    expect(APP_SHELL_SRC).not.toMatch(/FAST_ADD_ACTIONS/);
  });

  it("remounts Quick Log after close so child activity drafts cannot leak into a new session", () => {
    expect(APP_SHELL_SRC).toContain("key={legacyQuickLogSession}");
    expect(APP_SHELL_SRC).toContain("setLegacyQuickLogSession((session) => session + 1)");
  });

  it("introduces no Supabase writes, alerts, or Action Queue behavior", () => {
    for (const t of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(APP_SHELL_SRC).not.toContain(t);
    }
    expect(APP_SHELL_SRC).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
    expect(APP_SHELL_SRC).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
  });

  it("contains no device-control / automation / token leakage", () => {
    expect(APP_SHELL_SRC).not.toMatch(/service_role/i);
    expect(APP_SHELL_SRC).not.toMatch(/raw_payload/i);
    expect(APP_SHELL_SRC).not.toMatch(/Bearer\s+ey/);
    expect(APP_SHELL_SRC).not.toMatch(/sk_live_/);
    expect(APP_SHELL_SRC).not.toMatch(/mqtt:\/\//i);
    expect(APP_SHELL_SRC).not.toMatch(/\bpump\.on\b/);
    expect(APP_SHELL_SRC).not.toMatch(/\bautopilot\b/i);
  });
});
