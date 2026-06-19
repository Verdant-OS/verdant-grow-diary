import { calibrateSoilMoisture } from "@/lib/soilMoistureCalibrationRules";
import {
  selectSoilMoistureCalibration,
  type SoilMoistureCalibrationCandidate,
  type SoilMoistureCalibrationContext,
  type SoilMoistureCalibrationSource,
  type SoilMoistureCalibrationSelection,
} from "@/lib/soilMoistureCalibrationSelectionRules";

export type SoilMoistureRawSource = "live" | "manual" | "csv" | "demo" | "stale" | "invalid";

export interface SoilMoistureReadingViewModelInput {
  rawSoilMoisture: number | null | undefined;
  rawSource: SoilMoistureRawSource | string | null | undefined;
  context: SoilMoistureCalibrationContext;
  calibrations: readonly SoilMoistureCalibrationCandidate[] | null | undefined;
}

export interface SoilMoistureReadingViewModel {
  rawValue: number | null;
  calibratedValue: number | null;
  primaryValueKind: "raw" | "calibrated";
  primaryLine: string;
  rawLine: string | null;
  calibrationLine: string;
  rawSourceLine: string;
  calibrationSourceLine: string | null;
  selection: SoilMoistureCalibrationSelection;
}

const RAW_SOURCES: readonly SoilMoistureRawSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
];

const CALIBRATION_SOURCE_LABELS: Record<SoilMoistureCalibrationSource, string> = {
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
};

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeRawSource(
  source: SoilMoistureReadingViewModelInput["rawSource"],
): SoilMoistureRawSource {
  const normalized = typeof source === "string" ? source.toLowerCase() : "";
  return (RAW_SOURCES as readonly string[]).includes(normalized)
    ? (normalized as SoilMoistureRawSource)
    : "invalid";
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${Object.is(value, -0) ? 0 : value}%`;
}

function calibrationLabel(source: SoilMoistureCalibrationSource): string {
  return `${CALIBRATION_SOURCE_LABELS[source]} dry/wet baseline · confidence limited`;
}

export function buildSoilMoistureReadingViewModel(
  input: SoilMoistureReadingViewModelInput,
): SoilMoistureReadingViewModel {
  const rawValue = finiteNumber(input.rawSoilMoisture);
  const rawSource = normalizeRawSource(input.rawSource);
  const selection = selectSoilMoistureCalibration(input.context, input.calibrations);

  if (selection.status !== "selected") {
    const calibrationLine =
      selection.status === "unavailable"
        ? "Calibration unavailable — invalid baseline"
        : "Calibration: Not applied";
    return {
      rawValue,
      calibratedValue: null,
      primaryValueKind: "raw",
      primaryLine: `Soil moisture: ${formatPercent(rawValue)} raw`,
      rawLine: null,
      calibrationLine,
      rawSourceLine: `Raw source: ${rawSource}`,
      calibrationSourceLine: selection.source ? `Calibration source: ${selection.source}` : null,
      selection,
    };
  }

  const result = calibrateSoilMoisture(
    rawValue,
    selection.calibration.dryRaw,
    selection.calibration.wetRaw,
  );

  if (!result.ok) {
    return {
      rawValue,
      calibratedValue: null,
      primaryValueKind: "raw",
      primaryLine: `Soil moisture: ${formatPercent(rawValue)} raw`,
      rawLine: null,
      calibrationLine:
        result.reason === "identical_points"
          ? "Calibration unavailable — invalid baseline"
          : "Calibration unavailable — invalid raw reading",
      rawSourceLine: `Raw source: ${rawSource}`,
      calibrationSourceLine: `Calibration source: ${selection.source}`,
      selection,
    };
  }

  return {
    rawValue,
    calibratedValue: result.calibratedValue,
    primaryValueKind: "calibrated",
    primaryLine: `Soil moisture: ${formatPercent(result.calibratedValue)} calibrated`,
    rawLine: `Raw reading: ${formatPercent(rawValue)}`,
    calibrationLine: `Calibration: ${calibrationLabel(selection.source)}`,
    rawSourceLine: `Raw source: ${rawSource}`,
    calibrationSourceLine: `Calibration source: ${selection.source}`,
    selection,
  };
}
