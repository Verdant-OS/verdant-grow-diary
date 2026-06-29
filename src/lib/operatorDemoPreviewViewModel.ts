/**
 * operatorDemoPreviewViewModel — pure view model for the protected operator
 * Demo Preview page (One-Tent Evidence Chain walkthrough).
 *
 * Read-only. No I/O. No React. No Supabase. No AI. No automation.
 * All evidence refs come from the real fixture loader / adapters; nothing is
 * inferred from timestamps or prose. Demo-labeled fixture only.
 */
import {
  loadDemoEvidenceChainFixture,
  type DemoEvidenceChainFixture,
} from "@/lib/demoEvidenceChainFixture";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";
import { formatGrowDisplayLabel } from "@/lib/growDisplayLabel";

export interface OperatorDemoPreviewSensorReading {
  metric: string;
  valueLabel: string;
  sourceLabel: "Demo";
  capturedAtLabel: string;
}

export interface OperatorDemoPreviewAlertSection {
  title: string;
  statusLabel: string;
  evidenceRefs: OriginatingTimelineEventRef[];
}

export interface OperatorDemoPreviewActionSection {
  title: string;
  statusLabel: string;
  evidenceRefs: OriginatingTimelineEventRef[];
}

export interface OperatorDemoPreviewPostGrow {
  eligible: boolean;
  growStageLabel: string;
  archived: boolean;
  harvestedAtLabel: string | null;
}

export interface OperatorDemoPreviewViewModel {
  sourceLabel: "demo";
  growLabel: string;
  plantLabel: string;
  sensorReading: OperatorDemoPreviewSensorReading;
  alert: OperatorDemoPreviewAlertSection;
  action: OperatorDemoPreviewActionSection;
  postGrow: OperatorDemoPreviewPostGrow;
  safetyNotes: string[];
}

function metricLabel(metric: string): string {
  const m = metric.trim().toLowerCase();
  switch (m) {
    case "vpd":
      return "VPD";
    case "temp":
    case "temperature":
      return "Temperature";
    case "rh":
    case "humidity":
      return "Humidity";
    case "co2":
      return "CO2";
    default:
      return metric;
  }
}

function statusLabel(raw: string): string {
  if (!raw) return "Unknown";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function actionStatusLabel(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "pending_approval" || v === "pending approval") {
    return "Pending approval";
  }
  return statusLabel(raw);
}

export function buildOperatorDemoPreviewViewModel(
  fixture: DemoEvidenceChainFixture = loadDemoEvidenceChainFixture(),
): OperatorDemoPreviewViewModel {
  const { grow, plant, reading, alert, action } = fixture;

  const eligible =
    grow.is_archived === true &&
    typeof grow.harvested_at === "string" &&
    grow.harvested_at.length > 0 &&
    grow.stage === "harvest";

  return {
    sourceLabel: "demo",
    growLabel: formatGrowDisplayLabel(grow.name, grow.id),
    plantLabel: plant.name,
    sensorReading: {
      metric: metricLabel(reading.metric),
      valueLabel: `${reading.value} ${reading.unit}`,
      sourceLabel: "Demo",
      capturedAtLabel: reading.captured_at,
    },
    alert: {
      title: alert.reason,
      statusLabel: statusLabel(alert.status),
      evidenceRefs: alert.originating_timeline_events,
    },
    action: {
      title: action.suggested_change,
      statusLabel: actionStatusLabel(action.status),
      evidenceRefs: action.originating_timeline_events,
    },
    postGrow: {
      eligible,
      growStageLabel: statusLabel(grow.stage),
      archived: grow.is_archived === true,
      harvestedAtLabel:
        typeof grow.harvested_at === "string" && grow.harvested_at.length > 0
          ? grow.harvested_at
          : null,
    },
    safetyNotes: [
      "Demo data is not live telemetry.",
      "Evidence is linked through the persisted fixture ref, not inferred.",
      "No equipment command is sent. Grower approval is required.",
      "This fixture represents an eligible post-grow state for walkthrough purposes.",
    ],
  };
}
