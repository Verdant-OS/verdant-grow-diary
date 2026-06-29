/**
 * demoEvidenceChainFixture — read-only loader for the One-Tent Evidence
 * Chain demo fixture (fixtures/demo-evidence-chain.json).
 *
 * Strict safety envelope:
 *   - No I/O. No React. No Supabase. No fetch. No AI calls.
 *   - Demo readings are always labeled "demo"; never "live".
 *   - Evidence refs are built through the real adapters
 *     (`buildSensorSnapshotEvidenceRefs`, `forwardAlertRefsToActionQueue`),
 *     never hand-typed, never inferred from prose/timestamps/metric/nearest.
 *   - Forbidden fields (raw_payload, tokens, prompts, model output) are
 *     rejected by the underlying adapters.
 *   - Fixture rows are minimal: id / metric / value / source / captured_at /
 *     tent_id / plant_id / grow_id / status. No payload internals.
 */
import fixtureJson from "../../fixtures/demo-evidence-chain.json";
import { buildSensorSnapshotEvidenceRefs } from "@/lib/sensorSnapshotEvidenceRefRules";
import {
  forwardAlertRefsToActionQueue,
} from "@/lib/originatingTimelineEventForwardRules";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

export interface DemoEvidenceChainFixture {
  grow: {
    id: string;
    name: string;
    stage: string;
    is_archived: boolean;
    started_at: string;
    harvested_at: string;
  };
  tent: { id: string; grow_id: string; name: string };
  plant: {
    id: string;
    tent_id: string;
    grow_id: string;
    name: string;
    strain: string;
  };
  reading: {
    id: string;
    tent_id: string;
    plant_id: string;
    metric: string;
    value: number;
    unit: string;
    source: "demo";
    captured_at: string;
  };
  snapshot: {
    ts: string;
    source: "demo";
    tent_id: string;
    metric_refs: Record<string, string>;
  };
  alert: {
    id: string;
    grow_id: string;
    tent_id: string;
    plant_id: string;
    metric: string;
    status: string;
    risk_level: string;
    reason: string;
    created_at: string;
    originating_timeline_events: OriginatingTimelineEventRef[];
  };
  action: {
    id: string;
    grow_id: string;
    tent_id: string;
    plant_id: string;
    source: string;
    action_type: string;
    status: "pending_approval";
    risk_level: string;
    suggested_change: string;
    reason: string;
    created_at: string;
    updated_at: string;
    originating_timeline_events: OriginatingTimelineEventRef[];
  };
}

export class DemoEvidenceChainFixtureError extends Error {}

export function loadDemoEvidenceChainFixture(): DemoEvidenceChainFixture {
  const raw = fixtureJson as Record<string, unknown>;

  // Build the alert's originating ref through the real helper. Never hand-type.
  const alertRefs = buildSensorSnapshotEvidenceRefs(
    (raw.alert as { _ref_seed?: unknown })._ref_seed as never,
  );
  if (alertRefs.length !== 1) {
    throw new DemoEvidenceChainFixtureError(
      "Demo fixture alert ref must resolve to exactly one safe evidence ref.",
    );
  }

  // Forward the alert refs into the action_queue row via the real forwarder.
  const actionRefs = forwardAlertRefsToActionQueue({
    originating_timeline_events: alertRefs,
  });
  if (actionRefs.length !== 1) {
    throw new DemoEvidenceChainFixtureError(
      "Demo fixture action ref must resolve to exactly one safe evidence ref.",
    );
  }

  const reading = raw.reading as DemoEvidenceChainFixture["reading"];
  if (reading.source !== "demo") {
    throw new DemoEvidenceChainFixtureError(
      "Demo reading source must be 'demo', never 'live'.",
    );
  }

  // Refs must point at an id present in the readings set.
  if (alertRefs[0].id !== reading.id || actionRefs[0].id !== reading.id) {
    throw new DemoEvidenceChainFixtureError(
      "Demo fixture refs must point at the seeded reading id.",
    );
  }

  const grow = raw.grow as DemoEvidenceChainFixture["grow"];
  const tent = raw.tent as DemoEvidenceChainFixture["tent"];
  const plant = raw.plant as DemoEvidenceChainFixture["plant"];
  const snapshot = raw.snapshot as DemoEvidenceChainFixture["snapshot"];
  const alertRaw = raw.alert as Record<string, unknown>;
  const actionRaw = raw.action_queue_item as Record<string, unknown>;

  return {
    grow,
    tent,
    plant,
    reading,
    snapshot,
    alert: {
      id: alertRaw.id as string,
      grow_id: alertRaw.grow_id as string,
      tent_id: alertRaw.tent_id as string,
      plant_id: alertRaw.plant_id as string,
      metric: alertRaw.metric as string,
      status: alertRaw.status as string,
      risk_level: alertRaw.risk_level as string,
      reason: alertRaw.reason as string,
      created_at: alertRaw.created_at as string,
      originating_timeline_events: alertRefs,
    },
    action: {
      id: actionRaw.id as string,
      grow_id: actionRaw.grow_id as string,
      tent_id: actionRaw.tent_id as string,
      plant_id: actionRaw.plant_id as string,
      source: actionRaw.source as string,
      action_type: actionRaw.action_type as string,
      status: actionRaw.status as "pending_approval",
      risk_level: actionRaw.risk_level as string,
      suggested_change: actionRaw.suggested_change as string,
      reason: actionRaw.reason as string,
      created_at: actionRaw.created_at as string,
      updated_at: actionRaw.updated_at as string,
      originating_timeline_events: actionRefs,
    },
  };
}
