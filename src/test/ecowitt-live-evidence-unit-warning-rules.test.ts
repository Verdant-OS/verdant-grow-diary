/**
 * EcoWitt Live Evidence unit-warning rules tests — pure deterministic.
 */
import { describe, it, expect } from "vitest";
import { detectEcowittEvidenceUnitWarnings } from "@/lib/ecowittLiveEvidenceUnitWarningRules";
import {
  createInitialEcowittLiveEvidenceFormState,
  type EcowittLiveEvidenceMetricRow,
} from "@/lib/ecowittLiveEvidenceFormRules";

function row(
  patch: Partial<EcowittLiveEvidenceMetricRow> & {
    key: EcowittLiveEvidenceMetricRow["key"];
  },
): EcowittLiveEvidenceMetricRow {
  const base = createInitialEcowittLiveEvidenceFormState().metric_rows.find(
    (r) => r.key === patch.key,
  )!;
  return { ...base, enabled: true, ...patch };
}

describe("detectEcowittEvidenceUnitWarnings", () => {
  it("returns no warnings for aligned units and values", () => {
    const rows = [
      row({
        key: "temp_f",
        backend_value: "72",
        controller_value: "72",
        backend_unit: "F",
        controller_unit: "F",
      }),
    ];
    expect(detectEcowittEvidenceUnitWarnings(rows)).toEqual([]);
  });

  it("flags F vs C for temperature as blocks_live_proof", () => {
    const rows = [
      row({
        key: "temp_f",
        backend_value: "72",
        controller_value: "22",
        backend_unit: "F",
        controller_unit: "C",
      }),
    ];
    const ws = detectEcowittEvidenceUnitWarnings(rows);
    expect(ws.length).toBeGreaterThan(0);
    expect(ws[0].severity).toBe("blocks_live_proof");
    expect(ws[0].message.toLowerCase()).toMatch(/fahrenheit|celsius/);
  });

  it("flags % vs fraction for humidity as blocks_live_proof", () => {
    const rows = [
      row({
        key: "humidity_pct",
        backend_value: "55",
        controller_value: "0.55",
        backend_unit: "%",
        controller_unit: "frac",
      }),
    ];
    const ws = detectEcowittEvidenceUnitWarnings(rows);
    expect(ws.some((w) => w.severity === "blocks_live_proof")).toBe(true);
  });

  it("flags humidity scale mismatch 0.55 vs 55 even without units", () => {
    const rows = [
      row({
        key: "humidity_pct",
        backend_value: "0.55",
        controller_value: "55",
      }),
    ];
    const ws = detectEcowittEvidenceUnitWarnings(rows);
    expect(ws.length).toBeGreaterThan(0);
    expect(ws[0].message).toMatch(/different scales/);
  });

  it("flags soil moisture scale mismatch 0.32 vs 32", () => {
    const rows = [
      row({
        key: "soil_moisture_pct",
        backend_value: "0.32",
        controller_value: "32",
      }),
    ];
    const ws = detectEcowittEvidenceUnitWarnings(rows);
    expect(ws.length).toBeGreaterThan(0);
  });

  it("flags mS/cm vs µS/cm EC mismatch", () => {
    const rows = [
      row({
        key: "soil_ec_ms_cm",
        backend_value: "1.4",
        controller_value: "1400",
        backend_unit: "mS/cm",
        controller_unit: "µS/cm",
      }),
    ];
    const ws = detectEcowittEvidenceUnitWarnings(rows);
    expect(ws.some((w) => w.severity === "blocks_live_proof")).toBe(true);
  });

  it("warns when temp unit missing and values look like Celsius shown as Fahrenheit", () => {
    const rows = [
      row({
        key: "temp_f",
        backend_value: "24",
        controller_value: "24",
      }),
    ];
    const ws = detectEcowittEvidenceUnitWarnings(rows);
    expect(ws.length).toBeGreaterThan(0);
    expect(ws[0].message.toLowerCase()).toMatch(/celsius/);
  });

  it("ignores disabled rows", () => {
    const rows = [
      {
        ...row({
          key: "temp_f",
          backend_value: "72",
          controller_value: "22",
          backend_unit: "F",
          controller_unit: "C",
        }),
        enabled: false,
      },
    ];
    expect(detectEcowittEvidenceUnitWarnings(rows)).toEqual([]);
  });
});
