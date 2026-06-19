export type SoilMoistureCalibrationSource = "manual" | "csv" | "demo";

export interface SoilMoistureCalibrationCandidate {
  id: string;
  growId: string | null | undefined;
  tentId: string | null | undefined;
  plantId?: string | null | undefined;
  deviceId?: string | null | undefined;
  dryRaw: number | null | undefined;
  wetRaw: number | null | undefined;
  source: SoilMoistureCalibrationSource | string | null | undefined;
  isActive: boolean | null | undefined;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
}

export interface SoilMoistureCalibrationContext {
  growId: string | null | undefined;
  tentId: string | null | undefined;
  plantId?: string | null | undefined;
  deviceId?: string | null | undefined;
}

export type SoilMoistureCalibrationSelectionReason =
  | "missing_context"
  | "no_matching_calibration"
  | "invalid_baseline";

export type SoilMoistureCalibrationMatchScope = "plant" | "tent";

export type SoilMoistureCalibrationSelection =
  | {
      status: "selected";
      reason: "selected";
      calibration: SoilMoistureCalibrationCandidate;
      source: SoilMoistureCalibrationSource;
      matchScope: SoilMoistureCalibrationMatchScope;
    }
  | {
      status: "unavailable";
      reason: "invalid_baseline";
      calibration: SoilMoistureCalibrationCandidate;
      source: SoilMoistureCalibrationSource;
      matchScope: SoilMoistureCalibrationMatchScope;
    }
  | {
      status: "not_applied";
      reason: Exclude<SoilMoistureCalibrationSelectionReason, "invalid_baseline">;
      calibration: null;
      source: null;
      matchScope: null;
    };

const VALID_CALIBRATION_SOURCES: readonly SoilMoistureCalibrationSource[] = [
  "manual",
  "csv",
  "demo",
];

function cleanId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCalibrationSource(
  source: SoilMoistureCalibrationCandidate["source"],
): SoilMoistureCalibrationSource | null {
  const normalized = typeof source === "string" ? source.toLowerCase() : "";
  return (VALID_CALIBRATION_SOURCES as readonly string[]).includes(normalized)
    ? (normalized as SoilMoistureCalibrationSource)
    : null;
}

function hasValidBaseline(calibration: SoilMoistureCalibrationCandidate): boolean {
  const dry = calibration.dryRaw;
  const wet = calibration.wetRaw;
  return (
    typeof dry === "number" &&
    Number.isFinite(dry) &&
    typeof wet === "number" &&
    Number.isFinite(wet) &&
    dry !== wet
  );
}

function contextMatches(
  context: SoilMoistureCalibrationContext,
  calibration: SoilMoistureCalibrationCandidate,
): boolean {
  const growId = cleanId(context.growId);
  const tentId = cleanId(context.tentId);
  if (!growId || !tentId) return false;
  if (cleanId(calibration.growId) !== growId) return false;
  if (cleanId(calibration.tentId) !== tentId) return false;

  const contextPlantId = cleanId(context.plantId);
  const calibrationPlantId = cleanId(calibration.plantId);
  if (contextPlantId) {
    if (calibrationPlantId && calibrationPlantId !== contextPlantId) {
      return false;
    }
  } else if (calibrationPlantId) {
    return false;
  }

  const contextDeviceId = cleanId(context.deviceId);
  const calibrationDeviceId = cleanId(calibration.deviceId);
  if (contextDeviceId) {
    if (calibrationDeviceId && calibrationDeviceId !== contextDeviceId) {
      return false;
    }
  } else if (calibrationDeviceId) {
    return false;
  }

  return true;
}

function matchScope(
  calibration: SoilMoistureCalibrationCandidate,
): SoilMoistureCalibrationMatchScope {
  return cleanId(calibration.plantId) ? "plant" : "tent";
}

function specificityScore(calibration: SoilMoistureCalibrationCandidate): number {
  let score = 0;
  if (cleanId(calibration.plantId)) score += 100;
  if (cleanId(calibration.deviceId)) score += 10;
  return score;
}

function createdTime(calibration: SoilMoistureCalibrationCandidate): number {
  const raw = calibration.createdAt ?? calibration.updatedAt ?? null;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareCalibrationSpecificity(
  a: SoilMoistureCalibrationCandidate,
  b: SoilMoistureCalibrationCandidate,
): number {
  const scoreDelta = specificityScore(b) - specificityScore(a);
  if (scoreDelta !== 0) return scoreDelta;
  const timeDelta = createdTime(b) - createdTime(a);
  if (timeDelta !== 0) return timeDelta;
  return a.id.localeCompare(b.id);
}

export function selectSoilMoistureCalibration(
  context: SoilMoistureCalibrationContext,
  calibrations: readonly SoilMoistureCalibrationCandidate[] | null | undefined,
): SoilMoistureCalibrationSelection {
  if (!cleanId(context.growId) || !cleanId(context.tentId)) {
    return {
      status: "not_applied",
      reason: "missing_context",
      calibration: null,
      source: null,
      matchScope: null,
    };
  }

  const applicable = (calibrations ?? [])
    .filter((calibration) => calibration.isActive === true)
    .filter((calibration) => normalizeCalibrationSource(calibration.source))
    .filter((calibration) => contextMatches(context, calibration))
    .slice()
    .sort(compareCalibrationSpecificity);

  const best = applicable[0] ?? null;
  if (!best) {
    return {
      status: "not_applied",
      reason: "no_matching_calibration",
      calibration: null,
      source: null,
      matchScope: null,
    };
  }

  const source = normalizeCalibrationSource(best.source);
  if (!source || !hasValidBaseline(best)) {
    return {
      status: "unavailable",
      reason: "invalid_baseline",
      calibration: best,
      source: source ?? "manual",
      matchScope: matchScope(best),
    };
  }

  return {
    status: "selected",
    reason: "selected",
    calibration: best,
    source,
    matchScope: matchScope(best),
  };
}
