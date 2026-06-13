/**
 * csv-source-allow-list-audit — static documentation tests that freeze the
 * deployed trigger's accepted source/metric list as discovered by
 * `scripts/audit-csv-source-allow-list.ts` against production on 2026-06-13.
 *
 * Audit-only. No DB I/O here. No persistence enablement. No UI changes.
 *
 * If the deployed `validate_sensor_reading` trigger changes its allow-list,
 * re-run the script and update these constants in the same PR that flips
 * any persistence behavior.
 */
import { describe, expect, it } from "vitest";
import {
  ADAPTER_CANONICAL_SOURCE,
  buildRegistryCsvInsertRows,
} from "@/lib/registryCsvInsertRowsAdapter";
import { PREVIEW_PERSISTENCE_ENABLED } from "@/lib/sensorImportPreviewCopy";
import {
  CSV_SOURCE_AC_INFINITY,
  csvSourceTagFor,
} from "@/lib/csvSensorImportRules";

/** Sources verified against the deployed trigger on 2026-06-13. */
const DEPLOYED_ACCEPTED_SOURCES = [
  "manual",
  "pi_bridge",
  "sim",
  "webhook_generic",
  "node_red_bridge",
  "esp32_arduino",
  "esp32_arduino_sht31",
  "esp32_esphome",
  "esp32_mqtt_bridge",
  "home_assistant_bridge",
  "ha_forwarded",
  "ecowitt",
  "mqtt",
  "csv",
  "webhook",
] as const;

/** Metrics accepted by the deployed trigger (verified 2026-06-13). */
const DEPLOYED_ACCEPTED_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "ph",
  "ec",
  "ppfd",
] as const;

describe("csv source allow-list audit (deployed trigger)", () => {
  it("registry adapter emits the deployed-accepted canonical source 'csv'", () => {
    expect(ADAPTER_CANONICAL_SOURCE).toBe("csv");
    expect(DEPLOYED_ACCEPTED_SOURCES).toContain(ADAPTER_CANONICAL_SOURCE);
  });

  it("every adapter-emitted metric is in the deployed metric allow-list", () => {
    const rows = buildRegistryCsvInsertRows({
      sourceAppId: "spider_farmer",
      headers: [
        "Time",
        "Temperature(°F)",
        "Humidity(%)",
        "VPD(kPa)",
        "CO2(ppm)",
        "PPFD(umol/m2/s)",
      ],
      rows: [
        ["2026-06-12T10:00:00Z", "75", "55", "1.1", "850", "600"],
      ],
      tentId: "tent-1",
      growId: null,
      importBatchId: "batch-1",
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(DEPLOYED_ACCEPTED_METRICS).toContain(r.metric);
      expect(r.source).toBe("csv");
      expect(r.quality).toBe("ok");
    }
  });

  it("documents legacy AC Infinity writer source as REJECTED by deployed trigger", () => {
    // The in-repo writer still emits csv_import_ac_infinity. The deployed
    // trigger rejects it (confirmed by audit script 2026-06-13). This test
    // freezes that mismatch so the next slice can fix the writer or the
    // allow-list, not silently regress.
    const legacy = csvSourceTagFor("ac_infinity");
    expect(legacy).toBe(CSV_SOURCE_AC_INFINITY);
    expect(legacy).toBe("csv_import_ac_infinity");
    expect(DEPLOYED_ACCEPTED_SOURCES).not.toContain(
      legacy as (typeof DEPLOYED_ACCEPTED_SOURCES)[number],
    );
  });

  it("keeps Spider Farmer and Vivosun persistence gate disabled", () => {
    expect(PREVIEW_PERSISTENCE_ENABLED.has("ac_infinity")).toBe(true);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("spider_farmer")).toBe(false);
    expect(PREVIEW_PERSISTENCE_ENABLED.has("vivosun")).toBe(false);
  });
});
