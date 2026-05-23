/**
 * Guardrail: Dashboard and AppShell must source their alert badge from the
 * real persisted alerts feed (`useAlertsList`), not the mock `useAlerts`
 * hook. Prevents a demo-vs-live mismatch where a grower sees "0 alerts" in
 * one place while a real persisted open alert exists.
 *
 * Static-only; no rendering. No automation, no device-control, no
 * action_queue mutation introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const APPSHELL = readFileSync(resolve(ROOT, "src/components/AppShell.tsx"), "utf8");

describe("Dashboard + AppShell · real persisted alert badge", () => {
  it("Dashboard does not import useAlerts from useMockData", () => {
    expect(DASHBOARD).not.toMatch(/useAlerts[^L][^a-zA-Z].*useMockData/);
    expect(DASHBOARD).not.toMatch(/import\s*\{[^}]*\buseAlerts\b[^}]*\}\s*from\s*["']@\/hooks\/useMockData["']/);
  });

  it("AppShell does not import useAlerts from useMockData", () => {
    expect(APPSHELL).not.toMatch(/import\s*\{[^}]*\buseAlerts\b[^}]*\}\s*from\s*["']@\/hooks\/useMockData["']/);
  });

  it("Dashboard uses useAlertsList for the alert badge", () => {
    expect(DASHBOARD).toMatch(/useAlertsList/);
  });

  it("AppShell uses useAlertsList for the alert badge", () => {
    expect(APPSHELL).toMatch(/from\s*["']@\/hooks\/useAlertsList["']/);
    expect(APPSHELL).toMatch(/useAlertsList\s*\(/);
  });

  it("both files filter on status = open", () => {
    expect(APPSHELL).toMatch(/status:\s*["']open["']/);
    expect(DASHBOARD).toMatch(/status:\s*["']open["']/);
    expect(DASHBOARD).toMatch(/a\.status\s*===\s*["']open["']/);
  });

  it("neither file introduces automation, device control, or unsafe surfaces", () => {
    for (const text of [DASHBOARD, APPSHELL]) {
      expect(text).not.toMatch(/service_role/i);
      expect(text).not.toMatch(/\bmqtt\b/i);
      expect(text).not.toMatch(/home_assistant|home assistant/i);
      expect(text).not.toMatch(/\bpi_bridge\b/i);
      expect(text).not.toMatch(/\bactuator\b/i);
      expect(text).not.toMatch(/device_command/i);
      expect(text).not.toMatch(/\bautopilot\b/i);
      expect(text).not.toMatch(/writeWateringTypedEvent/);
      expect(text).not.toMatch(/from\s*["']@\/pages\/Leads["']/);
    }
  });
});
