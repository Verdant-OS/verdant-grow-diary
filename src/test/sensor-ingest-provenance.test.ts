import { describe, expect, it } from "vitest";
import {
  CANONICAL_SENSOR_SOURCES,
  NON_CANONICAL_SOURCE_ALIASES,
  SENSOR_PROVENANCE_EXAMPLES,
  assertCanonicalSensorSource,
  isCanonicalSensorSource,
  isNonCanonicalSourceAlias,
} from "@/constants/sensorIngestProvenance";
import { SENSOR_SOURCE_KINDS } from "@/constants/sensorSourceLabels";

describe("sensor ingest provenance safety", () => {
  it("keeps canonical sensor sources aligned with UI source labels", () => {
    expect(CANONICAL_SENSOR_SOURCES).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
    ]);
    expect(CANONICAL_SENSOR_SOURCES).toEqual(SENSOR_SOURCE_KINDS);
  });

  it("accepts only canonical source labels", () => {
    for (const source of CANONICAL_SENSOR_SOURCES) {
      expect(isCanonicalSensorSource(source)).toBe(true);
      expect(assertCanonicalSensorSource(source)).toBe(source);
    }

    expect(isCanonicalSensorSource("mqtt")).toBe(false);
    expect(isCanonicalSensorSource("api")).toBe(false);
    expect(isCanonicalSensorSource("home_assistant")).toBe(false);
    expect(isCanonicalSensorSource("pi_bridge")).toBe(false);
    expect(isCanonicalSensorSource("unknown")).toBe(false);
    expect(assertCanonicalSensorSource("mqtt")).toBeNull();
  });

  it("keeps transports, vendors, bridge names, and app names out of source", () => {
    for (const alias of NON_CANONICAL_SOURCE_ALIASES) {
      expect(isCanonicalSensorSource(alias)).toBe(false);
      expect(isNonCanonicalSourceAlias(alias)).toBe(true);
    }
  });

  it("shows provenance examples using canonical source plus raw payload metadata", () => {
    for (const example of SENSOR_PROVENANCE_EXAMPLES) {
      expect(isCanonicalSensorSource(example.source)).toBe(true);
      expect(example.raw_payload.source_app).toBeTruthy();
      expect(example.raw_payload.transport).toBeTruthy();
      expect(JSON.stringify(example.raw_payload)).not.toContain("service_role");
      expect(JSON.stringify(example.raw_payload)).not.toContain("passkey");
      expect(JSON.stringify(example.raw_payload)).not.toContain("Authorization");
    }

    const mqttExample = SENSOR_PROVENANCE_EXAMPLES.find(
      (example) => example.raw_payload.transport === "mqtt",
    );
    expect(mqttExample?.source).toBe("live");
  });

  it("does not include health shortcuts in the provenance model", () => {
    const serialized = JSON.stringify(SENSOR_PROVENANCE_EXAMPLES);

    expect(serialized).not.toContain("treat_as_healthy");
    expect(serialized).not.toContain("healthy");
  });
});
