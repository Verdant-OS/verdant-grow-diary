import { describe, it, expect } from "vitest";
import {
  buildManualSaveSuccessLine,
  mapManualSaveErrorToUserMessage,
} from "@/lib/manualSensorSaveConfirmation";

describe("buildManualSaveSuccessLine", () => {
  it("formats temp + RH in operator-friendly units and labels source Manual", () => {
    const tempC = (78.4 - 32) * (5 / 9);
    const line = buildManualSaveSuccessLine({
      metrics: [
        { metric: "temperature_c", value: tempC },
        { metric: "humidity_pct", value: 61 },
      ],
    });
    expect(line).toContain("Manual snapshot saved:");
    expect(line).toContain("78°F");
    expect(line).toContain("61% RH");
    expect(line).toContain("Source: Manual.");
  });

  it("uses a stable order (temp, RH, VPD, CO2, soil, PPFD)", () => {
    const line = buildManualSaveSuccessLine({
      metrics: [
        { metric: "humidity_pct", value: 55 },
        { metric: "co2_ppm", value: 800 },
        { metric: "temperature_c", value: 23.8 },
      ],
    });
    const tempIdx = line.indexOf("°F");
    const rhIdx = line.indexOf("% RH");
    const co2Idx = line.indexOf("ppm CO");
    expect(tempIdx).toBeGreaterThan(-1);
    expect(rhIdx).toBeGreaterThan(tempIdx);
    expect(co2Idx).toBeGreaterThan(rhIdx);
  });

  it("never injects metrics that were not saved", () => {
    const line = buildManualSaveSuccessLine({
      metrics: [{ metric: "humidity_pct", value: 50 }],
    });
    expect(line).not.toContain("°F");
    expect(line).not.toContain("kPa");
    expect(line).not.toContain("ppm");
  });

  it("handles empty metrics deterministically", () => {
    expect(buildManualSaveSuccessLine({ metrics: [] })).toBe(
      "Manual snapshot saved: (no metrics). Source: Manual.",
    );
  });
});

describe("mapManualSaveErrorToUserMessage", () => {
  it("returns a generic message for empty/unknown errors", () => {
    expect(mapManualSaveErrorToUserMessage(undefined)).toMatch(
      /could not be saved/i,
    );
    expect(mapManualSaveErrorToUserMessage(new Error(""))).toMatch(
      /could not be saved/i,
    );
  });

  it("redacts secret-shaped error text", () => {
    const cases = [
      "Bearer abcdefghijklmnop",
      "JWT verification failed: eyJhbGciOiJI.aaaaaaaaaa.bbbbbbbbbb",
      "service_role key missing",
      "SUPABASE_SERVICE_ROLE_KEY not set",
      "Invalid api_key sb_secret_abcdefghijkl",
    ];
    for (const msg of cases) {
      const out = mapManualSaveErrorToUserMessage(new Error(msg));
      expect(out).not.toContain("Bearer");
      expect(out).not.toContain("eyJ");
      expect(out).not.toContain("service_role");
      expect(out).not.toContain("SUPABASE_");
      expect(out).not.toContain("sb_secret");
      expect(out).toMatch(/could not be saved/i);
    }
  });

  it("preserves short, safe upstream validator messages", () => {
    const msg = "Select a real tent before saving a manual sensor reading.";
    expect(mapManualSaveErrorToUserMessage(new Error(msg))).toBe(msg);
  });
});
