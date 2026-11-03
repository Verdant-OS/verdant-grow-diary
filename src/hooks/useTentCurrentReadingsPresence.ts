/**
 * useTentCurrentReadingsPresence — does the assigned tent have a current sensor
 * reading? Spec: docs/specs/ai-doctor-readiness-single-summary.md §10 (D2).
 *
 * Read-only. Uses the same two windows the Plant Detail readiness card reads, so
 * React Query shares the cache when both are mounted. Loading or failed reads
 * report "unknown"; only a current snapshot reports "present". No writes, no model
 * calls, no alerts and no Action Queue access.
 */
import { useMemo } from "react";
import { useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import {
  AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
  AI_DOCTOR_CURRENT_SENSOR_SOURCES,
  AI_DOCTOR_MANUAL_SENSOR_SOURCES,
  buildAiDoctorCurrentSensorSnapshot,
  mergeAiDoctorCurrentSensorWindows,
} from "@/lib/aiDoctorCurrentSensorSnapshotRules";

export type TentCurrentReadingsPresence = "present" | "absent" | "unknown";

const NO_ROWS: never[] = [];

export function useTentCurrentReadingsPresence(tentId: string): TentCurrentReadingsPresence {
  const mixed = useSensorReadingsByTents(
    [tentId],
    AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
    AI_DOCTOR_CURRENT_SENSOR_SOURCES,
  );
  const manual = useSensorReadingsByTents(
    [tentId],
    AI_DOCTOR_CURRENT_SENSOR_ROW_CAP,
    AI_DOCTOR_MANUAL_SENSOR_SOURCES,
  );
  const mixedStatus = mixed.statusByTent[tentId] ?? "loading";
  const manualStatus = manual.statusByTent[tentId] ?? "loading";
  const mixedRows = mixed.byTent[tentId] ?? NO_ROWS;
  const manualRows = manual.byTent[tentId] ?? NO_ROWS;
  return useMemo(() => {
    if (mixedStatus !== "success" || manualStatus !== "success") return "unknown";
    const snapshot = buildAiDoctorCurrentSensorSnapshot(
      mergeAiDoctorCurrentSensorWindows(mixedRows, manualRows),
    );
    return snapshot ? "present" : "absent";
  }, [mixedStatus, manualStatus, mixedRows, manualRows]);
}
