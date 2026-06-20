import { describe, it, expect } from "vitest";
import {
  buildSensorIngestAuditCsvFilename,
  AUDIT_CSV_FILENAME,
  AUDIT_CSV_FILENAME_BASE,
} from "@/lib/sensorIngestAuditReportCsvExport";

describe("buildSensorIngestAuditCsvFilename — deterministic & sanitized", () => {
  it("returns the base default filename with no filters", () => {
    expect(buildSensorIngestAuditCsvFilename()).toBe(AUDIT_CSV_FILENAME);
    expect(AUDIT_CSV_FILENAME).toBe(`${AUDIT_CSV_FILENAME_BASE}.csv`);
  });

  it("ignores the 'all' provider sentinel", () => {
    expect(buildSensorIngestAuditCsvFilename({ provider: "all" })).toBe(
      AUDIT_CSV_FILENAME,
    );
  });

  it("includes a sanitized provider", () => {
    expect(buildSensorIngestAuditCsvFilename({ provider: "EcoWitt" })).toBe(
      "verdant-sensor-ingest-audit_provider-ecowitt.csv",
    );
  });

  it("drops unsafe provider strings (spaces, slashes, etc.)", () => {
    expect(
      buildSensorIngestAuditCsvFilename({ provider: "ecowitt/secret token" }),
    ).toBe(AUDIT_CSV_FILENAME);
  });

  it("includes from and to dates", () => {
    expect(
      buildSensorIngestAuditCsvFilename({
        capturedFromIso: "2026-06-01T00:00:00Z",
        capturedToIso: "2026-06-19T23:59:00Z",
      }),
    ).toBe("verdant-sensor-ingest-audit_from-2026-06-01_to-2026-06-19.csv");
  });

  it("includes only the present date when one is missing", () => {
    expect(
      buildSensorIngestAuditCsvFilename({ capturedFromIso: "2026-06-01" }),
    ).toBe("verdant-sensor-ingest-audit_from-2026-06-01.csv");
    expect(
      buildSensorIngestAuditCsvFilename({ capturedToIso: "2026-06-19" }),
    ).toBe("verdant-sensor-ingest-audit_to-2026-06-19.csv");
  });

  it("omits an invalid date entirely", () => {
    expect(
      buildSensorIngestAuditCsvFilename({
        capturedFromIso: "not-a-date",
        capturedToIso: "2026-06-19",
      }),
    ).toBe("verdant-sensor-ingest-audit_to-2026-06-19.csv");
  });

  it("combines provider + window deterministically", () => {
    expect(
      buildSensorIngestAuditCsvFilename({
        provider: "ecowitt",
        capturedFromIso: "2026-06-01T00:00:00Z",
        capturedToIso: "2026-06-19T00:00:00Z",
      }),
    ).toBe(
      "verdant-sensor-ingest-audit_provider-ecowitt_from-2026-06-01_to-2026-06-19.csv",
    );
  });

  it("never includes the device/station search text", () => {
    const name = buildSensorIngestAuditCsvFilename({
      provider: "ecowitt",
      deviceStationQuery: "Greenhouse A",
    });
    expect(name).not.toMatch(/Greenhouse/i);
    expect(name).not.toMatch(/device/);
  });

  it("never embeds secret-like values", () => {
    const name = buildSensorIngestAuditCsvFilename({
      provider: "Bearer abc123",
      capturedFromIso: "passkey",
      capturedToIso: "AA:BB:CC:DD:EE:FF",
      deviceStationQuery: "sk_live_abc1234567890123",
    });
    expect(name).toBe(AUDIT_CSV_FILENAME);
  });
});
