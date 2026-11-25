/**
 * Field notebook card reading tiles, built from the tent snapshot view the
 * Dashboard tent panel already renders (`buildTentSnapshotView`), so the card
 * and the panel under it never disagree on a value, its source or its age.
 *
 * Pure: no React, no Supabase, no clock (`nowMs` is injected).
 *
 * - One slot per shown TEMP, RH and VPD metric, in that order, all with the
 *   view's one verified capture time (the card shows VPD only when TEMP and
 *   RH share it).
 * - Zero is a real value.
 * - A stale, degraded or unverified metric keeps its value and is named by
 *   its own status ("Stale", "Historical", "Needs verification"), never by
 *   the live source.
 * - An invalid or unknown metric, a blank display, a view with no reading,
 *   or a view with no parseable capture time gives no slot: the tile stays
 *   empty rather than show an unverified number as healthy.
 * - A VPD from another capture (Tonight's canonical value the panel shows
 *   with its own source and age) gives no slot: the card pairs VPD with the
 *   TEMP and RH of one capture and labels it with that capture's source.
 *   The snapshot view names such a VPD's own source in its status label
 *   ("Manual · 2m ago"); a cohort metric's label is one plain word or null.
 *   An ok VPD the view marks `cohortInstant` (same capture instant and source
 *   as TEMP and RH, for example a Quick Log reading read back from its diary
 *   snapshot) is the same reading and keeps its slot, as the panel shows it.
 * - PPFD is not part of the tent snapshot view, so it never has a slot here.
 * - Sensors are receive-only; this reads a view model and writes nothing.
 */
import type { MetricView, TentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import type { ReadingSlot } from "@/lib/fieldNotebookViewModel";
import { formatAgeLabel } from "@/lib/sensorSnapshotFreshnessRules";

const SLOT_LABELS: Record<MetricView["key"], ReadingSlot["label"]> = {
  temp: "TEMP",
  rh: "RH",
  vpd: "VPD",
};

const SLOT_ORDER: readonly MetricView["key"][] = ["temp", "rh", "vpd"];

const UNSHOWN = "—";

function capturedMs(view: TentSnapshotView): number | null {
  if (!view.lastUpdatedIso) return null;
  const ms = Date.parse(view.lastUpdatedIso);
  return Number.isFinite(ms) ? ms : null;
}

const OTHER_CAPTURE_SEPARATOR = " · ";

function isOtherCaptureVpd(metric: MetricView): boolean {
  const label = metric.statusLabel;
  if (label === null || label === undefined) return false;
  if (metric.cohortInstant === true && metric.status === "ok") return false;
  return metric.status === "ok" || label.includes(OTHER_CAPTURE_SEPARATOR);
}

function slotFromMetric(
  metric: MetricView,
  view: TentSnapshotView,
  capturedAtMs: number,
  ageLabel: string | null,
): ReadingSlot | null {
  if (metric.status === "invalid" || metric.status === "unknown") return null;
  if (metric.key === "vpd" && isOtherCaptureVpd(metric)) return null;
  const display = (metric.display ?? "").trim();
  if (display === "" || display === UNSHOWN) return null;
  const source = metric.status === "ok" ? view.sourceLabel : (metric.statusLabel ?? null);
  return {
    label: SLOT_LABELS[metric.key],
    value: `${display}${metric.unit ?? ""}`,
    source,
    ageLabel,
    capturedAtMs,
  };
}

export function fieldNotebookReadingSlotsFromSnapshot(
  view: TentSnapshotView | null | undefined,
  nowMs: number,
): ReadingSlot[] {
  if (!view || !view.hasReading) return [];
  const capturedAtMs = capturedMs(view);
  if (capturedAtMs === null) return [];
  const ageLabel = formatAgeLabel(nowMs - capturedAtMs);
  const slots: ReadingSlot[] = [];
  for (const key of SLOT_ORDER) {
    const metric = view.metrics.find((m) => m.key === key);
    if (!metric) continue;
    const slot = slotFromMetric(metric, view, capturedAtMs, ageLabel);
    if (slot) slots.push(slot);
  }
  return slots;
}

export interface FieldNotebookTentSnapshot {
  tentId: string;
  view: TentSnapshotView | null | undefined;
}

/** Readings keyed by tent id. The first entry for a tent id wins. */
export function buildFieldNotebookReadingsByTent(
  tents: readonly FieldNotebookTentSnapshot[],
  nowMs: number,
): Record<string, ReadingSlot[]> {
  const byTent: Record<string, ReadingSlot[]> = {};
  for (const { tentId, view } of tents) {
    if (!tentId || Object.prototype.hasOwnProperty.call(byTent, tentId)) continue;
    byTent[tentId] = fieldNotebookReadingSlotsFromSnapshot(view, nowMs);
  }
  return byTent;
}
