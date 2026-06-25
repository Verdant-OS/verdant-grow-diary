/**
 * Pure tests for the expanded `deriveProviderLabel` mapping.
 *
 * Provider labels are presentation-only — never promote anything to
 * Live, never change the strict resolver, never widen trust.
 */
import { describe, it, expect } from "vitest";
import { deriveProviderLabel } from "@/constants/sensorProviderLabels";

describe("deriveProviderLabel", () => {
  it("hides the chip for null / empty / live / unavailable", () => {
    expect(deriveProviderLabel(null)).toBeNull();
    expect(deriveProviderLabel(undefined)).toBeNull();
    expect(deriveProviderLabel("")).toBeNull();
    expect(deriveProviderLabel("   ")).toBeNull();
    expect(deriveProviderLabel("live")).toBeNull();
    expect(deriveProviderLabel("LIVE")).toBeNull();
    expect(deriveProviderLabel("unavailable")).toBeNull();
  });

  it("maps recognised vendor keys to friendly labels", () => {
    expect(deriveProviderLabel("ecowitt")).toBe("EcoWitt");
    expect(deriveProviderLabel("ECOWITT")).toBe("EcoWitt");
    expect(deriveProviderLabel("mqtt")).toBe("MQTT");
    expect(deriveProviderLabel("home_assistant")).toBe("Home Assistant");
    expect(deriveProviderLabel("home-assistant")).toBe("Home Assistant");
    expect(deriveProviderLabel("pi_bridge")).toBe("Pi Bridge");
    expect(deriveProviderLabel("raspberry_pi")).toBe("Raspberry Pi");
    expect(deriveProviderLabel("spider_farmer")).toBe("Spider Farmer");
    expect(deriveProviderLabel("spider_farmer_ggs")).toBe("Spider Farmer GGS");
    expect(deriveProviderLabel("manual")).toBe("Manual");
    expect(deriveProviderLabel("csv")).toBe("CSV");
    expect(deriveProviderLabel("demo")).toBe("Demo");
    expect(deriveProviderLabel("stale")).toBe("Stale");
    expect(deriveProviderLabel("invalid")).toBe("Invalid");
  });

  it("falls back to title-cased, sanitised label for unknown providers", () => {
    expect(deriveProviderLabel("my_new_bridge")).toBe("My New Bridge");
    expect(deriveProviderLabel("custom-source")).toBe("Custom Source");
    expect(deriveProviderLabel("Foo_Bar")).toBe("Foo Bar");
  });

  it("never includes 'Live' in any rendered label", () => {
    for (const src of [
      "ecowitt",
      "mqtt",
      "home_assistant",
      "pi_bridge",
      "spider_farmer_ggs",
      "demo",
      "stale",
      "invalid",
      "my_new_bridge",
    ]) {
      const v = deriveProviderLabel(src);
      expect(v).not.toBeNull();
      expect(v!.toLowerCase()).not.toContain("live");
    }
  });

  it("strips suspicious characters and caps length", () => {
    const out = deriveProviderLabel("secret$$$key!!");
    expect(out).not.toBeNull();
    expect(out!).not.toMatch(/[$!]/);
    const huge = deriveProviderLabel("a".repeat(80));
    expect(huge).not.toBeNull();
    expect(huge!.length).toBeLessThanOrEqual(32);
  });
});
