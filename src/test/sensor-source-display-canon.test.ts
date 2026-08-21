/**
 * Display-only sensor source/provenance canon.
 *
 * Imports the helper (no source-text regex contracts). Proves:
 *  - each canonical label renders distinctly
 *  - raw pi_bridge / home_assistant never appear as conflicting Source words
 *  - demo / stale / invalid are never labeled live
 */
import { describe, expect, it } from "vitest";
import {
  formatSensorSourceDisplayLabel,
  formatSensorSourceDisplayWithProvenance,
  resolveSensorSourceDisplayCanon,
} from "@/lib/sensorSourceDisplayCanon";
import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel";
import { SENSOR_SOURCES } from "@/lib/sensor/sensorSourceRules";

describe("resolveSensorSourceDisplayCanon", () => {
  it.each([
    ["live", "Live sensor", true],
    ["manual", "Manual reading", false],
    ["csv", "CSV import", false],
    ["demo", "Demo data", false],
    ["stale", "Stale data", false],
    ["invalid", "Invalid reading", false],
  ] as const)(
    "canonical %s → sourceLabel %s (healthyLive=%s)",
    (source, sourceLabel, isHealthyLive) => {
      const canon = resolveSensorSourceDisplayCanon(source);
      expect(canon.canonical).toBe(source);
      expect(canon.sourceLabel).toBe(sourceLabel);
      expect(canon.provenanceLabel).toBeNull();
      expect(canon.isHealthyLive).toBe(isHealthyLive);
      expect(formatSensorSourceDisplayLabel(source)).toBe(sourceLabel);
    },
  );

  it("covers every SENSOR_SOURCES entry exactly once in the canonical table", () => {
    expect([...SENSOR_SOURCES]).toEqual(["live", "manual", "csv", "demo", "stale", "invalid"]);
  });

  it("raw pi_bridge shows Live sensor Source with Pi bridge provenance — never the raw token as Source", () => {
    const canon = resolveSensorSourceDisplayCanon("pi_bridge");
    expect(canon.canonical).toBe("live");
    expect(canon.sourceLabel).toBe("Live sensor");
    expect(canon.provenanceLabel).toBe("Pi bridge");
    expect(canon.sourceLabel.toLowerCase()).not.toContain("pi_bridge");
    expect(canon.sourceLabel.toLowerCase()).not.toContain("pi bridge");
    expect(formatSensorSourceDisplayWithProvenance("pi_bridge")).toBe(
      "Live sensor · Pi bridge",
    );
    // Presenter helper used by Dashboard / plant tent / charts:
    expect(formatSensorSourceLabel({ source: "pi_bridge" })).toBe("Live sensor");
  });

  it("raw home_assistant never renders as a Live Source word", () => {
    const canon = resolveSensorSourceDisplayCanon("home_assistant");
    expect(canon.canonical).toBe("invalid");
    expect(canon.sourceLabel).toBe("Invalid reading");
    expect(canon.provenanceLabel).toBe("Home Assistant");
    expect(canon.isHealthyLive).toBe(false);
    expect(canon.sourceLabel.toLowerCase()).not.toContain("live");
    expect(canon.sourceLabel.toLowerCase()).not.toContain("home_assistant");
    expect(canon.sourceLabel.toLowerCase()).not.toContain("home assistant");
    expect(formatSensorSourceLabel({ source: "home_assistant" })).toBe("Invalid reading");
  });

  it.each(["demo", "stale", "invalid", "DEMO", "Stale", "INVALID"] as const)(
    "%s is never labeled live / healthy",
    (raw) => {
      const canon = resolveSensorSourceDisplayCanon(raw);
      expect(canon.isHealthyLive).toBe(false);
      expect(canon.canonical).not.toBe("live");
      expect(canon.sourceLabel.toLowerCase()).not.toMatch(/\blive\b/);
      expect(formatSensorSourceDisplayLabel(raw).toLowerCase()).not.toMatch(/\blive\b/);
    },
  );

  it("manual / csv never upgrade to live for display", () => {
    for (const raw of ["manual", "csv", "user", "import", "diary"] as const) {
      const canon = resolveSensorSourceDisplayCanon(raw);
      expect(canon.canonical).not.toBe("live");
      expect(canon.isHealthyLive).toBe(false);
      expect(canon.sourceLabel.toLowerCase()).not.toMatch(/\blive\b/);
    }
  });

  it("eco_witt / ecowitt stay out of the Source label", () => {
    for (const raw of ["eco_witt", "ecowitt"] as const) {
      const canon = resolveSensorSourceDisplayCanon(raw);
      expect(canon.sourceLabel.toLowerCase()).not.toContain("ecowitt");
      expect(canon.sourceLabel.toLowerCase()).not.toContain("eco_witt");
      expect(canon.provenanceLabel).toBe("EcoWitt");
    }
  });

  it("empty / missing / non-string collapse to Invalid reading", () => {
    for (const raw of [null, undefined, "", "   ", 42] as const) {
      const canon = resolveSensorSourceDisplayCanon(raw);
      expect(canon.canonical).toBe("invalid");
      expect(canon.sourceLabel).toBe("Invalid reading");
      expect(canon.isHealthyLive).toBe(false);
    }
  });
});

describe("formatSensorSourceLabel · display canon wiring", () => {
  it("keeps manual device-note formatting without live upgrade", () => {
    expect(
      formatSensorSourceLabel({
        source: "manual",
        deviceNote: "EcoWitt WH45 CO2/THP Monitor",
      }),
    ).toBe("Manual reading · EcoWitt WH45 CO2/THP Monitor");
  });

  it("keeps snapshot-layer specials", () => {
    expect(formatSensorSourceLabel({ source: "sim" })).toBe("Simulated");
    expect(formatSensorSourceLabel({ source: "diary" })).toBe("Diary snapshot");
    expect(formatSensorSourceLabel({ source: "unavailable" })).toBe("Unavailable");
    expect(formatSensorSourceLabel({ source: "unverified" })).toBe("Unverified source");
  });
});
