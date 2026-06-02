/**
 * quickLogTimelineGroupingViewModel — pure presenter that groups a QuickLog
 * v2 action event (Water or Note) with its sibling manual environment event
 * into one coherent "memory card" when the pairing is unambiguous.
 *
 * Hard constraints (tests + static safety):
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - Display-only. Never mutates input events. Never merges stored rows.
 *  - No schema/RPC/write changes. No alerts. No Action Queue. No AI Doctor
 *    session writes. No device control. No "live/synced/connected/imported"
 *    wording — sources are honestly labeled "Manual".
 *  - Reuses the same scope predicate as AI Doctor readiness:
 *      action.plant_id === currentPlantId
 *      OR (env.plant_id === null AND env.tent_id === currentPlantTentId)
 *  - Pairing is *mutual nearest neighbour* inside the tight grouping
 *    window. If pairing is ambiguous (ties, multiple candidates that do
 *    not mutually prefer each other), events render separately. Separate
 *    display is safer than guessing.
 *  - A grouped environment event MUST NOT also render as a standalone
 *    card — callers iterate `entries` and never re-read claimed env rows.
 *  - Invalid/malformed environment telemetry is grouped only with its
 *    severity ("invalid"/"warning") visible on the card so it can never
 *    appear as clean, healthy context.
 */

import { QUICK_LOG_TIMELINE_GROUPING_WINDOW_MS } from "@/constants/quickLogTimelineGrouping";
import {
  filterQuickLogV2EnvironmentRowsByScope,
  quickLogV2EnvironmentRowToManualSnapshotRecord,
  type QuickLogV2EnvironmentRow,
  type QuickLogV2SnapshotScope,
} from "@/lib/quickLogV2ManualSnapshotAdapter";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";

export type QuickLogActionKind = "water" | "note";

export interface QuickLogActionEvent {
  /** grow_events.id of the action (Water or Note) parent event. */
  id: string;
  kind: QuickLogActionKind;
  /** Only "manual" actions are eligible — bridge/live actions never group. */
  source: string;
  plantId: string | null;
  tentId: string | null;
  /** ISO-8601 timestamp. */
  occurredAt: string;
  /** Optional display details — never invented, may be null/undefined. */
  noteText?: string | null;
  volumeMl?: number | null;
}

export type QuickLogTimelineEntry =
  | {
      kind: "grouped";
      /** Anchored at the action timestamp for stable ordering. */
      occurredAt: string;
      action: QuickLogActionEvent;
      environment: QuickLogV2EnvironmentRow;
      /** Pre-built manual snapshot card so the UI never duplicates logic. */
      environmentCard: ManualSnapshotTimelineCard;
      /** Always "Manual" — sources are not blended. */
      actionSourceLabel: "Manual";
      environmentSourceLabel: "Manual";
    }
  | {
      kind: "action";
      occurredAt: string;
      action: QuickLogActionEvent;
      actionSourceLabel: "Manual";
    }
  | {
      kind: "environment";
      occurredAt: string;
      environment: QuickLogV2EnvironmentRow;
      environmentCard: ManualSnapshotTimelineCard;
      environmentSourceLabel: "Manual";
    };

export interface GroupQuickLogTimelineArgs {
  actions: ReadonlyArray<QuickLogActionEvent>;
  environmentRows: ReadonlyArray<QuickLogV2EnvironmentRow>;
  scope: QuickLogV2SnapshotScope;
  /** Override only in tests. Defaults to the shared constant. */
  windowMs?: number;
}

const ACTION_KINDS: ReadonlySet<QuickLogActionKind> = new Set([
  "water",
  "note",
]);

function isEligibleAction(a: QuickLogActionEvent): boolean {
  if (!a || typeof a !== "object") return false;
  if (!ACTION_KINDS.has(a.kind)) return false;
  if (a.source !== "manual") return false;
  if (typeof a.tentId !== "string" || a.tentId.length === 0) return false;
  if (typeof a.occurredAt !== "string" || a.occurredAt.length === 0)
    return false;
  if (Number.isNaN(Date.parse(a.occurredAt))) return false;
  return true;
}

function actionMatchesScope(
  a: QuickLogActionEvent,
  scope: QuickLogV2SnapshotScope,
): boolean {
  if (scope.kind === "plant") {
    return a.plantId === scope.plantId;
  }
  return a.tentId === scope.tentId;
}

function envMatchesActionScope(
  env: QuickLogV2EnvironmentRow,
  action: QuickLogActionEvent,
): boolean {
  // Mirrors the AI Doctor readiness predicate so grouping never claims
  // an environment event that wouldn't satisfy plant-scoped readiness.
  if (env.tent_id !== action.tentId) return false;
  if (action.plantId !== null) {
    return env.plant_id === action.plantId || env.plant_id === null;
  }
  // Tent-only action: env must be tent-level too (no cross-plant grouping).
  return env.plant_id === null;
}

interface Candidate {
  actionIdx: number;
  envIdx: number;
  delta: number;
}

/**
 * Group QuickLog v2 action + sibling environment events using mutual
 * nearest-neighbour pairing inside the tight grouping window. Output is
 * deterministically ordered by occurredAt then id.
 */
export function groupQuickLogTimelineEntries(
  args: GroupQuickLogTimelineArgs,
): QuickLogTimelineEntry[] {
  const windowMs =
    typeof args.windowMs === "number" && args.windowMs >= 0
      ? args.windowMs
      : QUICK_LOG_TIMELINE_GROUPING_WINDOW_MS;

  const actions = (args.actions ?? [])
    .filter(isEligibleAction)
    .filter((a) => actionMatchesScope(a, args.scope));

  const envRows = filterQuickLogV2EnvironmentRowsByScope(
    args.environmentRows ?? [],
    args.scope,
  );

  // Build candidate pair list (within window AND scope-compatible per action).
  const candidates: Candidate[] = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const aMs = Date.parse(a.occurredAt);
    for (let j = 0; j < envRows.length; j++) {
      const e = envRows[j];
      if (!envMatchesActionScope(e, a)) continue;
      const eMs = Date.parse(e.occurred_at);
      const delta = Math.abs(aMs - eMs);
      if (delta > windowMs) continue;
      candidates.push({ actionIdx: i, envIdx: j, delta });
    }
  }

  // Mutual nearest-neighbour: for each action, the unique nearest env in
  // window; for each env, the unique nearest action in window. A pair is
  // accepted iff both sides uniquely prefer each other. Ties → no group.
  const bestPerAction = new Map<number, { envIdx: number; delta: number; tie: boolean }>();
  const bestPerEnv = new Map<number, { actionIdx: number; delta: number; tie: boolean }>();

  for (const c of candidates) {
    const a = bestPerAction.get(c.actionIdx);
    if (!a || c.delta < a.delta) {
      bestPerAction.set(c.actionIdx, {
        envIdx: c.envIdx,
        delta: c.delta,
        tie: false,
      });
    } else if (c.delta === a.delta && a.envIdx !== c.envIdx) {
      bestPerAction.set(c.actionIdx, { ...a, tie: true });
    }

    const e = bestPerEnv.get(c.envIdx);
    if (!e || c.delta < e.delta) {
      bestPerEnv.set(c.envIdx, {
        actionIdx: c.actionIdx,
        delta: c.delta,
        tie: false,
      });
    } else if (c.delta === e.delta && e.actionIdx !== c.actionIdx) {
      bestPerEnv.set(c.envIdx, { ...e, tie: true });
    }
  }

  const claimedEnv = new Set<number>();
  const claimedAction = new Set<number>();
  const entries: QuickLogTimelineEntry[] = [];

  // Stable iteration: by action index (input order).
  for (let i = 0; i < actions.length; i++) {
    const a = bestPerAction.get(i);
    if (!a || a.tie) continue;
    const e = bestPerEnv.get(a.envIdx);
    if (!e || e.tie) continue;
    if (e.actionIdx !== i) continue;
    // Mutual nearest neighbour ✅
    const action = actions[i];
    const env = envRows[a.envIdx];
    const record = quickLogV2EnvironmentRowToManualSnapshotRecord(env);
    if (!record) continue; // env has no usable telemetry → leave action standalone
    const envCard = buildManualSnapshotTimelineCard(record);
    entries.push({
      kind: "grouped",
      occurredAt: action.occurredAt,
      action,
      environment: env,
      environmentCard: envCard,
      actionSourceLabel: "Manual",
      environmentSourceLabel: "Manual",
    });
    claimedAction.add(i);
    claimedEnv.add(a.envIdx);
  }

  // Remaining actions → standalone action entries.
  for (let i = 0; i < actions.length; i++) {
    if (claimedAction.has(i)) continue;
    const action = actions[i];
    entries.push({
      kind: "action",
      occurredAt: action.occurredAt,
      action,
      actionSourceLabel: "Manual",
    });
  }

  // Remaining environment rows → standalone environment entries (those
  // with usable telemetry; otherwise skipped, matching adapter behaviour).
  for (let j = 0; j < envRows.length; j++) {
    if (claimedEnv.has(j)) continue;
    const env = envRows[j];
    const record = quickLogV2EnvironmentRowToManualSnapshotRecord(env);
    if (!record) continue;
    entries.push({
      kind: "environment",
      occurredAt: env.occurred_at,
      environment: env,
      environmentCard: buildManualSnapshotTimelineCard(record),
      environmentSourceLabel: "Manual",
    });
  }

  // Deterministic ordering: newest first by occurredAt, then stable id tie-break.
  entries.sort((a, b) => {
    const am = Date.parse(a.occurredAt);
    const bm = Date.parse(b.occurredAt);
    if (am !== bm) return bm - am;
    const aid = a.kind === "environment" ? a.environment.id : a.action.id;
    const bid = b.kind === "environment" ? b.environment.id : b.action.id;
    return aid.localeCompare(bid);
  });

  return entries;
}
