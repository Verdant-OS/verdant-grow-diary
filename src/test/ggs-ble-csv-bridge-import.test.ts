/**
 * The receive-only bridge CSV must pass the existing environment import.
 * The fixture is synthetic. It does not prove controller behavior.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseEnvironmentCSVText } from "@/lib/csvParser";
import { deriveCsvRowValidationHints } from "@/lib/csvRowValidationRules";
import { buildSensorReadingInserts } from "@/lib/environmentCsvImportPersistence";
import {
  emptyRepresentativeMapping,
  previewRepresentativeCsv,
} from "@/lib/representativeCsvSensorPreviewRules";

const FIXTURE = "tools/ggs-ble-csv-bridge/fixtures/synthetic-zone1-snapshot.csv";
const BRIDGE = "tools/ggs-ble-csv-bridge/ggs_ble_csv_bridge.py";

describe("GGS status CSV on the existing import path", () => {
  it("parses one snapshot row with source csv and the device VPD", () => {
    const text = readFileSync(FIXTURE, "utf8");
    const parsed = parseEnvironmentCSVText(text);

    expect(parsed.errors).toEqual([]);
    expect(parsed.skippedRows).toEqual([]);
    expect(parsed.validRows).toHaveLength(1);

    const row = parsed.validRows[0];
    expect(row.source_tag).toBe("csv");
    expect(row.source_app).toBeUndefined();
    expect(row.temperature_c).toBe(21.5);
    expect(row.humidity_pct).toBe(55);
    expect(row.vpd_kpa).toBe(1.25);
    expect(row.vpd_source).toBe("csv");
    expect(row.captured_at).toBe("2026-11-13T17:39:19.000Z");
    expect(row.raw_payload.source).toBe("csv");
    expect(row.raw_payload.source_app).toBe("spider_farmer_ggs");
    expect(row.raw_payload.transport).toBe("ble");
    expect(row.raw_payload.time_basis).toBe("receive");
    expect(row.raw_payload.tent_id).toBe("synthetic-tent-alpha");
    expect(row.raw_payload.device_alias).toBe("synthetic-alias-a");
    expect(row.raw_payload.reading_flags).toBe("");
    expect(JSON.stringify(row.raw_payload)).not.toContain("synthetic-token");

    const mapping = {
      ...emptyRepresentativeMapping(),
      timestamp: "timestamp",
      air_temp: { column: "temp_c", unit: "C" as const },
      humidity: { column: "humidity" },
      vpd: { column: "vpd" },
    };
    const preview = previewRepresentativeCsv(text, { mapping });
    const hints = deriveCsvRowValidationHints({ row: preview.rows[0], mapping });
    expect(hints.canonicalPreviewable).toBe(true);
    expect(hints.severity).not.toBe("invalid");
    expect(hints.fieldStates.timestamp).toBe("mapped_parsed");
    expect(hints.fieldStates.air_temp).toBe("mapped_parsed");
    expect(hints.fieldStates.humidity).toBe("mapped_parsed");
    expect(hints.fieldStates.vpd).toBe("mapped_parsed");

    const inserts = buildSensorReadingInserts(parsed.validRows, {
      user_id: "synthetic-user",
      grow_id: "synthetic-grow",
      tent_id: row.raw_payload.tent_id,
    });
    expect(inserts.map((insert) => insert.source)).toEqual(["csv", "csv", "csv"]);
    expect(inserts.map((insert) => insert.metric)).toEqual([
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
    ]);
    expect(inserts.every((insert) => insert.tent_id === "synthetic-tent-alpha")).toBe(true);
    expect(inserts.every((insert) => insert.raw_payload.source_app == null)).toBe(true);
    expect(inserts[2].raw_payload.vpd_source).toBe("csv");
    expect(inserts[0].raw_payload.raw_row.source_app).toBe("spider_farmer_ggs");
    expect(inserts[0].raw_payload.raw_row.transport).toBe("ble");
  });

  it("keeps the listener free of characteristic writes", () => {
    // @source-scan-justified: the listener is Python with no TypeScript export, so the receive-only call list is pinned by reading that file.
    const bridge = readFileSync(BRIDGE, "utf8").toLowerCase();
    for (const token of [
      "write_gatt_char",
      "write_gatt_descriptor",
      "read_gatt_char",
      "read_gatt_descriptor",
      ".write(",
      "ff02",
    ]) {
      expect(bridge).not.toContain(token);
    }
    expect(bridge.split("start_notify(").length - 1).toBe(1);
    expect(bridge).toContain("start_notify(status_notify");
  });
});
