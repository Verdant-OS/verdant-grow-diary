import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ANALYTICS_FILES = [
  resolve(__dirname, "../../src/hooks/useGoogleAnalyticsPageViews.ts"),
  resolve(__dirname, "../../src/constants/analytics.ts"),
];

function readAll(paths: string[]): string {
  return paths.map((p) => readFileSync(p, "utf8")).join("\n");
}

describe("Google Analytics static safety", () => {
  const combined = readAll(ANALYTICS_FILES);

  it("does not reference Supabase service_role", () => {
    expect(combined).not.toMatch(/service_role/i);
  });

  it("does not reference bridge tokens", () => {
    expect(combined).not.toMatch(/bridge[-_]?token/i);
  });

  it("does not reference raw_payload", () => {
    expect(combined).not.toMatch(/raw_payload/i);
  });

  it("does not reference sensor_readings mutations", () => {
    expect(combined).not.toMatch(/sensor_readings\s*(insert|update|delete)/i);
  });

  it("does not reference action_queue mutations", () => {
    expect(combined).not.toMatch(/action_queue\s*(insert|update|delete)/i);
  });

  it("does not reference alerts mutations", () => {
    expect(combined).not.toMatch(/alerts\s*(insert|update|delete)/i);
  });

  it("does not reference AI / model calls", () => {
    expect(combined).not.toMatch(/ai[-_]?doctor|ai[-_]?coach|gpt|claude|openai/i);
  });

  it("does not reference device-control terms", () => {
    const terms = ["pump", "fan", "light", "heater", "humidifier", "dehumidifier", "dosing", "irrigation", "relay", "gpio", "mqtt publish"];
    for (const term of terms) {
      expect(combined).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
    }
  });

  it("does not send private IDs in event params", () => {
    expect(combined).not.toMatch(/grow_id|plant_id|tent_id|user_id/i);
  });

  it("does not log raw sensor payloads", () => {
    expect(combined).not.toMatch(/sensor.*payload|payload.*sensor/i);
  });
});
