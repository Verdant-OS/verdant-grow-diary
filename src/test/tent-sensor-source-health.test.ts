/**
 * Unit tests for the sensor source health presenter rules and card wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildSensorSourceHealthView } from "@/lib/sensorSourceHealthRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "";

const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const CARD = read("src/components/TentSensorSourceHealthCard.tsx");

describe("sensorSourceHealthRules · buildSensorSourceHealthView", () => {
  it("returns hasSources=false for empty input", () => {
    expect(buildSensorSourceHealthView(null).hasSources).toBe(false);
    expect(buildSensorSourceHealthView([]).hasSources).toBe(false);
    expect(buildSensorSourceHealthView(undefined).hasSources).toBe(false);
  });

  it("groups readings by source and picks the latest ts for each", () => {
    const rows = [
      { ts: "2025-01-01T12:00:00Z", source: "manual" },
      { ts: "2025-01-01T11:00:00Z", source: "manual" },
      { ts: "2025-01-01T10:00:00Z", source: "pi_bridge" },
      { ts: "2025-01-01T09:00:00Z", source: "pi_bridge" },
    ];
    const view = buildSensorSourceHealthView(rows);
    expect(view.hasSources).toBe(true);
    expect(view.sources).toHaveLength(2);
    const manual = view.sources.find((s) => s.source === "manual");
    const pi = view.sources.find((s) => s.source === "pi_bridge");
    expect(manual?.lastSeenAt).toBe("2025-01-01T12:00:00Z");
    expect(pi?.lastSeenAt).toBe("2025-01-01T10:00:00Z");
  });

  it("marks sources older than 30 min as stale", () => {
    const now = new Date("2025-01-01T13:00:00Z").getTime();
    const rows = [
      { ts: "2025-01-01T12:50:00Z", source: "manual" }, // 10 min ago → fresh
      { ts: "2025-01-01T12:00:00Z", source: "pi_bridge" }, // 60 min ago → stale
    ];
    const view = buildSensorSourceHealthView(rows, now);
    const manual = view.sources.find((s) => s.source === "manual");
    const pi = view.sources.find((s) => s.source === "pi_bridge");
    expect(manual?.stale).toBe(false);
    expect(pi?.stale).toBe(true);
  });

  it("sorts entries freshest first", () => {
    const now = new Date("2025-06-01T00:00:00Z").getTime();
    const rows = [
      { ts: "2025-05-31T23:00:00Z", source: "esp32_arduino" },
      { ts: "2025-05-31T23:30:00Z", source: "manual" },
      { ts: "2025-05-31T22:00:00Z", source: "webhook_generic" },
    ];
    const view = buildSensorSourceHealthView(rows, now);
    expect(view.sources[0].source).toBe("manual");
    expect(view.sources[1].source).toBe("esp32_arduino");
    expect(view.sources[2].source).toBe("webhook_generic");
  });

  it("resolves human-readable labels via formatSensorSourceLabel", () => {
    const rows = [
      { ts: "2025-01-01T12:00:00Z", source: "pi_bridge" },
      { ts: "2025-01-01T12:00:00Z", source: "esp32_arduino" },
      { ts: "2025-01-01T12:00:00Z", source: "manual" },
    ];
    const view = buildSensorSourceHealthView(rows);
    const pi = view.sources.find((s) => s.source === "pi_bridge");
    const esp = view.sources.find((s) => s.source === "esp32_arduino");
    const manual = view.sources.find((s) => s.source === "manual");
    expect(pi?.label).toBe("Pi bridge");
    expect(esp?.label).toBe("ESP32");
    expect(manual?.label).toBe("Manual reading");
  });

  it("treats null/missing source as 'unavailable'", () => {
    const rows = [{ ts: "2025-01-01T12:00:00Z", source: null }, { ts: "2025-01-01T11:00:00Z" }];
    const view = buildSensorSourceHealthView(rows);
    expect(view.sources).toHaveLength(1);
    expect(view.sources[0].source).toBe("unavailable");
    expect(view.sources[0].label).toBe("Unavailable");
  });
});

describe("TentDetail · sensor source health card wiring", () => {
  it("imports and renders TentSensorSourceHealthCard", () => {
    expect(TENT_DETAIL).toContain("TentSensorSourceHealthCard");
    expect(TENT_DETAIL).toMatch(/from\s+["']@\/components\/TentSensorSourceHealthCard["']/);
  });

  it("card uses data-testid for testability", () => {
    expect(CARD).toContain('data-testid="tent-sensor-source-health-card"');
    expect(CARD).toContain('data-testid="tent-sensor-source-health-list"');
    expect(CARD).toContain('data-testid="tent-sensor-source-health-row"');
    expect(CARD).toContain('data-testid="tent-sensor-source-stale-badge"');
  });

  it("card does not create alerts or mutations", () => {
    const FORBIDDEN = ["INSERT", "UPDATE", "DELETE", "useMutation", "action_queue", "supabase"];
    for (const f of FORBIDDEN) {
      expect(CARD).not.toContain(f);
    }
  });
});
