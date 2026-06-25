/**
 * Operator Mode diary dataset — small typed fixture for narrow regression
 * tests. Represents a labeled One-Tent Loop walkthrough with explicit
 * source labels so test assertions can prove that real/manual/imported
 * records never get relabeled as "live" or "demo".
 *
 * Pure data. No I/O. No Supabase reads/writes.
 */
import type { ProofSourceLabel } from "@/lib/oneTentProofRecordExportRules";

export type OperatorEntryKind =
  | "watering"
  | "feeding"
  | "observation"
  | "photo"
  | "sensor_snapshot"
  | "action_outcome";

export interface OperatorDiaryEntry {
  id: string;
  plantId: string;
  kind: OperatorEntryKind;
  occurredAt: string;
  sourceLabel: ProofSourceLabel;
  note: string;
}

export interface OperatorSensorReading {
  id: string;
  tentId: string;
  plantId: string | null;
  metric: "temperature_c" | "humidity_pct" | "vpd_kpa";
  value: number;
  unit: string;
  capturedAt: string;
  sourceLabel: ProofSourceLabel;
}

export interface OperatorReportEvent {
  id: string;
  growId: string;
  kind: "action_outcome" | "alert";
  occurredAt: string;
  sourceLabel: ProofSourceLabel;
  summary: string;
}

export interface OperatorDiaryDataset {
  grow: { id: string; name: string };
  tent: { id: string; name: string; stage: string };
  plants: ReadonlyArray<{ id: string; name: string; strain: string }>;
  diaryEntries: ReadonlyArray<OperatorDiaryEntry>;
  sensorReadings: ReadonlyArray<OperatorSensorReading>;
  reportEvents: ReadonlyArray<OperatorReportEvent>;
}

export const OPERATOR_DIARY_DATASET: OperatorDiaryDataset = {
  grow: { id: "grow-op-1", name: "Operator Demo Grow" },
  tent: { id: "tent-op-1", name: "Tent A", stage: "veg" },
  plants: [
    { id: "plant-op-1", name: "Northern Lights #1", strain: "Northern Lights" },
    { id: "plant-op-2", name: "Blue Dream #2", strain: "Blue Dream" },
  ],
  diaryEntries: [
    {
      id: "diary-op-1",
      plantId: "plant-op-1",
      kind: "watering",
      occurredAt: "2026-06-04T08:00:00.000Z",
      sourceLabel: "manual",
      note: "500ml pH 6.2",
    },
    {
      id: "diary-op-2",
      plantId: "plant-op-2",
      kind: "feeding",
      occurredAt: "2026-06-04T09:00:00.000Z",
      sourceLabel: "manual",
      note: "Half-strength veg nutes",
    },
    {
      id: "diary-op-3",
      plantId: "plant-op-1",
      kind: "observation",
      occurredAt: "2026-06-04T10:00:00.000Z",
      sourceLabel: "csv",
      note: "Imported note from CSV: tip burn on lower fan leaf.",
    },
    {
      id: "diary-op-4",
      plantId: "plant-op-2",
      kind: "photo",
      occurredAt: "2026-06-04T11:00:00.000Z",
      sourceLabel: "manual",
      note: "Top-down canopy shot",
    },
    {
      id: "diary-op-demo-1",
      plantId: "plant-op-1",
      kind: "observation",
      occurredAt: "2026-06-01T08:00:00.000Z",
      sourceLabel: "demo",
      note: "Demo sample note — never present in real-data assertions.",
    },
  ],
  sensorReadings: [
    {
      id: "snap-op-1",
      tentId: "tent-op-1",
      plantId: null,
      metric: "humidity_pct",
      value: 62,
      unit: "%",
      capturedAt: "2026-06-04T10:05:00.000Z",
      sourceLabel: "manual",
    },
  ],
  reportEvents: [
    {
      id: "report-op-1",
      growId: "grow-op-1",
      kind: "action_outcome",
      occurredAt: "2026-06-04T12:00:00.000Z",
      sourceLabel: "manual",
      summary: "Lowered humidity to 60% after grower adjustment.",
    },
  ],
};

/** Convenience selector: entries excluding demo-labeled rows. */
export function realDiaryEntries(
  ds: OperatorDiaryDataset = OPERATOR_DIARY_DATASET,
): ReadonlyArray<OperatorDiaryEntry> {
  return ds.diaryEntries.filter((e) => e.sourceLabel !== "demo");
}

/** Convenience selector: demo-labeled entries only. */
export function demoDiaryEntries(
  ds: OperatorDiaryDataset = OPERATOR_DIARY_DATASET,
): ReadonlyArray<OperatorDiaryEntry> {
  return ds.diaryEntries.filter((e) => e.sourceLabel === "demo");
}
