/**
 * One-Tent Loop Proof — pure rules.
 *
 * Deterministic per-step evaluators that turn caller-supplied evidence into
 * a typed proof row. No I/O, no React, no Supabase, no fetch, no AI calls,
 * no clock (all "now" is injected).
 *
 * Safety envelope (rules layer):
 *  - Never classifies missing / stale / invalid / unknown / demo-only
 *    telemetry as healthy.
 *  - Never invents evidence. Missing data becomes "missing" with a
 *    populated `missing_info` list — not a silent pass.
 *  - Never rewrites the grower's data; only reads what the caller passed.
 *  - Action Queue rows must be approval-required. Any executable-device
 *    command marker flips the row to `blocked` with an unsafe flag.
 *  - Raw payloads / bridge tokens / service keys must never appear in the
 *    output — the caller is responsible for stripping them before calling,
 *    and rules never re-emit unknown fields.
 */

// ---------------------------------------------------------------------------
// Public status model
// ---------------------------------------------------------------------------

export const LOOP_STEP_STATUSES = [
  "passed",
  "needs_review",
  "missing",
  "blocked",
  "stale",
  "invalid",
  "demo_only",
] as const;

export type LoopStepStatus = (typeof LOOP_STEP_STATUSES)[number];

export const LOOP_STEP_IDS = [
  "grow",
  "tent",
  "plant",
  "quick-log",
  "timeline",
  "sensor-snapshot",
  "ai-doctor",
  "alert",
  "action-queue",
  "follow-up",
] as const;

export type LoopStepId = (typeof LOOP_STEP_IDS)[number];

export type EvidenceRefKind = "direct" | "inferred";

export interface EvidenceRef {
  label: string;
  timestamp?: string;
  /** Provenance label (e.g. "live", "manual", "csv", "demo", "stale", "invalid", "grow", "tent", "plant", "diary", "alert", "action-queue", "ai-doctor"). */
  source?: string;
  deep_link?: string;
  kind: EvidenceRefKind;
}

export type EvidenceProvenance =
  | "direct"
  | "inferred"
  | "missing"
  | "stale"
  | "invalid"
  | "demo_only";

export interface MissingEvidenceDrilldown {
  /** Plain, user-facing "what is missing". Never raw IDs / payloads / secrets. */
  what_is_missing: string;
  /** Why it matters for the One-Tent Loop. */
  why_it_matters: string;
  /** Where the grower/operator would normally record or review it. */
  where_to_record: string;
}

export interface LoopStepRow {
  id: LoopStepId;
  label: string;
  status: LoopStepStatus;
  evidence: string[];
  missing_info: string[];
  safety_note: string;
  /** Sensor source label when relevant. Preserved for backward compatibility. */
  source?: string;
  deep_link?: string;
  /** Overall provenance for the step's evidence, per the allowed vocabulary. */
  provenance?: EvidenceProvenance;
  /** Structured evidence references (label + timestamp + source + link). */
  evidence_refs?: EvidenceRef[];
  /** Drilldown copy — populated when status is missing / blocked / needs_review / stale / invalid / demo_only. */
  drilldown?: MissingEvidenceDrilldown;
}

// ---------------------------------------------------------------------------
// Evidence input shapes
// ---------------------------------------------------------------------------

export interface GrowEvidence {
  id: string;
  name: string | null;
  stage?: string | null;
  status?: string | null;
}

export interface TentEvidence {
  id: string;
  name: string | null;
  grow_id: string | null;
  has_environment_target?: boolean;
}

export interface PlantEvidence {
  id: string;
  name: string | null;
  stage?: string | null;
  medium?: string | null;
  pot_size?: string | null;
  tent_id?: string | null;
}

export interface QuickLogEvidence {
  id: string;
  entry_at: string | null;
  entry_type?: string | null;
  has_note?: boolean;
  has_photo?: boolean;
  has_action_context?: boolean;
  plant_id?: string | null;
  tent_id?: string | null;
}

export interface TimelineEvidence {
  event_count: number;
  latest_entry_id?: string | null;
  linked_directly?: boolean;
}

export type SensorSourceLabel =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export interface SensorSnapshotEvidence {
  source: SensorSourceLabel | null;
  captured_at: string | null;
  confidence?: number | null;
  metric?: string | null;
}

export interface AiDoctorEvidence {
  session_id: string | null;
  created_at: string | null;
  had_plant_stage: boolean;
  had_medium: boolean;
  had_pot_size: boolean;
  had_recent_log: boolean;
  had_recent_photo: boolean;
  had_recent_sensor_snapshot: boolean;
  had_alerts: boolean;
}

export interface AlertEvidence {
  id: string;
  metric: string | null;
  severity: string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
}

export interface ActionQueueEvidence {
  id: string;
  status: string | null;
  approval_required: boolean;
  has_device_command: boolean;
  reason?: string | null;
  risk_level?: string | null;
  linked_alert_id?: string | null;
}

export interface FollowUpEvidence {
  id: string;
  kind: "diary" | "completion" | "outcome";
  entry_at: string | null;
}

export interface LoopEvidence {
  grow: GrowEvidence | null;
  tent: TentEvidence | null;
  plant: PlantEvidence | null;
  latest_quick_log: QuickLogEvidence | null;
  timeline: TimelineEvidence | null;
  latest_sensor_snapshot: SensorSnapshotEvidence | null;
  latest_ai_doctor: AiDoctorEvidence | null;
  latest_alert: AlertEvidence | null;
  latest_action_queue: ActionQueueEvidence | null;
  latest_follow_up: FollowUpEvidence | null;
  /** Optional injected clock for stale checks. Milliseconds since epoch. */
  now_ms?: number;
}

// ---------------------------------------------------------------------------
// Freshness constants (see docs/sensor-truth-rules.md)
// ---------------------------------------------------------------------------

export const LIVE_STALE_MINUTES = 15;
export const MANUAL_STALE_HOURS = 24;

function minutesSince(iso: string | null | undefined, now_ms: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now_ms - t) / 60000;
}

// ---------------------------------------------------------------------------
// Per-step evaluators (pure)
// ---------------------------------------------------------------------------

export function evaluateGrow(g: GrowEvidence | null): LoopStepRow {
  if (!g) {
    return {
      id: "grow",
      label: "Grow",
      status: "missing",
      evidence: [],
      missing_info: ["No active grow found."],
      safety_note: "Downstream loop steps stay blocked until a grow exists.",
      deep_link: "/grows",
    };
  }
  const ev: string[] = [`Grow name: ${g.name ?? "(unnamed)"}`];
  if (g.stage) ev.push(`Stage: ${g.stage}`);
  if (g.status) ev.push(`Status: ${g.status}`);
  return {
    id: "grow",
    label: "Grow",
    status: "passed",
    evidence: ev,
    missing_info: [],
    safety_note: "Ownership enforced server-side.",
    deep_link: `/grows/${g.id}`,
  };
}

export function evaluateTent(
  t: TentEvidence | null,
  grow: GrowEvidence | null,
): LoopStepRow {
  if (!grow) {
    return {
      id: "tent",
      label: "Tent",
      status: "blocked",
      evidence: [],
      missing_info: ["Grow missing — tent evaluation blocked."],
      safety_note: "No fabricated tent context.",
    };
  }
  if (!t) {
    return {
      id: "tent",
      label: "Tent",
      status: "missing",
      evidence: [],
      missing_info: ["No tent linked to the active grow."],
      safety_note: "Environment targets are not inferred.",
      deep_link: "/tents",
    };
  }
  const ev: string[] = [`Tent name: ${t.name ?? "(unnamed)"}`];
  const missing: string[] = [];
  if (t.has_environment_target === true) {
    ev.push("Environment target present.");
  } else if (t.has_environment_target === false) {
    missing.push("Environment target not set for this tent.");
  }
  return {
    id: "tent",
    label: "Tent",
    status: missing.length > 0 ? "needs_review" : "passed",
    evidence: ev,
    missing_info: missing,
    safety_note: "Tent membership cannot be self-granted from the client.",
    deep_link: `/tents/${t.id}`,
  };
}

export function evaluatePlant(
  p: PlantEvidence | null,
  tent: TentEvidence | null,
): LoopStepRow {
  if (!tent) {
    return {
      id: "plant",
      label: "Plant",
      status: "blocked",
      evidence: [],
      missing_info: ["Tent missing — plant evaluation blocked."],
      safety_note: "No fabricated plant context.",
    };
  }
  if (!p) {
    return {
      id: "plant",
      label: "Plant",
      status: "missing",
      evidence: [],
      missing_info: ["No plant linked to the tent."],
      safety_note: "Plant stage is not inferred.",
      deep_link: "/plants",
    };
  }
  const ev: string[] = [`Plant name: ${p.name ?? "(unnamed)"}`];
  const missing: string[] = [];
  if (p.stage) ev.push(`Stage: ${p.stage}`);
  else missing.push("Stage unknown.");
  if (p.medium) ev.push(`Medium: ${p.medium}`);
  else missing.push("Medium unknown.");
  if (p.pot_size) ev.push(`Pot size: ${p.pot_size}`);
  else missing.push("Pot size unknown.");
  return {
    id: "plant",
    label: "Plant",
    status: missing.length > 0 ? "needs_review" : "passed",
    evidence: ev,
    missing_info: missing,
    safety_note: "Missing plant context is surfaced, never guessed.",
    deep_link: `/plants/${p.id}`,
  };
}

export function evaluateQuickLog(
  q: QuickLogEvidence | null,
  plant: PlantEvidence | null,
): LoopStepRow {
  if (!plant) {
    return {
      id: "quick-log",
      label: "Quick Log",
      status: "blocked",
      evidence: [],
      missing_info: ["Plant missing — Quick Log evaluation blocked."],
      safety_note: "Quick Log entries are user-initiated only.",
    };
  }
  if (!q) {
    return {
      id: "quick-log",
      label: "Quick Log",
      status: "missing",
      evidence: [],
      missing_info: ["No Quick Log entries recorded yet."],
      safety_note: "Verdant does not fabricate diary entries.",
      deep_link: "/daily-check",
    };
  }
  const ev: string[] = [];
  if (q.entry_at) ev.push(`Latest entry at: ${q.entry_at}`);
  if (q.entry_type) ev.push(`Entry type: ${q.entry_type}`);
  const ctx: string[] = [];
  if (q.has_note) ctx.push("note");
  if (q.has_photo) ctx.push("photo");
  if (q.has_action_context) ctx.push("action context");
  ev.push(ctx.length > 0 ? `Includes: ${ctx.join(", ")}.` : "No note/photo/action context on latest entry.");
  return {
    id: "quick-log",
    label: "Quick Log",
    status: "passed",
    evidence: ev,
    missing_info: ctx.length === 0 ? ["Latest entry has no note, photo, or action context."] : [],
    safety_note: "Manual snapshots are never labeled Live.",
    deep_link: "/timeline",
  };
}

export function evaluateTimeline(
  tl: TimelineEvidence | null,
  quickLog: QuickLogEvidence | null,
): LoopStepRow {
  if (!quickLog) {
    return {
      id: "timeline",
      label: "Timeline",
      status: "blocked",
      evidence: [],
      missing_info: ["No Quick Log entry — timeline linkage cannot be proven."],
      safety_note: "Empty timeline is not fabricated.",
    };
  }
  if (!tl || tl.event_count <= 0) {
    return {
      id: "timeline",
      label: "Timeline",
      status: "missing",
      evidence: [],
      missing_info: ["Timeline has no visible events for this scope."],
      safety_note: "Malformed entries surface as limited data, not hidden.",
      deep_link: "/timeline",
    };
  }
  const linked = tl.linked_directly === true
    ? "direct"
    : tl.latest_entry_id && tl.latest_entry_id === quickLog.id
      ? "direct"
      : "inferred";
  return {
    id: "timeline",
    label: "Timeline",
    status: "passed",
    evidence: [
      `Timeline event count: ${tl.event_count}.`,
      `Latest Quick Log linkage: ${linked}.`,
    ],
    missing_info: [],
    safety_note: "Source badges preserved (manual / demo / live / csv).",
    deep_link: "/timeline",
  };
}

export function evaluateSensorSnapshot(
  s: SensorSnapshotEvidence | null,
  now_ms: number,
): LoopStepRow {
  if (!s || !s.source) {
    return {
      id: "sensor-snapshot",
      label: "Sensor Snapshot",
      status: "missing",
      evidence: [],
      missing_info: ["No sensor snapshot available."],
      safety_note: "Missing telemetry is never shown as healthy.",
      deep_link: "/sensors",
    };
  }
  if (s.source === "invalid") {
    return {
      id: "sensor-snapshot",
      label: "Sensor Snapshot",
      status: "invalid",
      evidence: [`Source: invalid`, s.captured_at ? `Captured: ${s.captured_at}` : "Captured: unknown"],
      missing_info: ["Reading is invalid; excluded from healthy status."],
      safety_note: "Invalid telemetry is never shown as healthy.",
      source: "invalid",
    };
  }
  if (s.source === "demo") {
    return {
      id: "sensor-snapshot",
      label: "Sensor Snapshot",
      status: "demo_only",
      evidence: [`Source: demo`, s.captured_at ? `Captured: ${s.captured_at}` : "Captured: unknown"],
      missing_info: ["Demo data only — never shown as healthy."],
      safety_note: "Demo readings never seed real alerts or Action Queue items.",
      source: "demo",
    };
  }
  const mins = minutesSince(s.captured_at, now_ms);
  const isLive = s.source === "live";
  const isManualish = s.source === "manual" || s.source === "csv";
  const staleMinutes = isLive ? LIVE_STALE_MINUTES : MANUAL_STALE_HOURS * 60;
  const stale = mins !== null && mins > staleMinutes;
  const ev: string[] = [
    `Source: ${s.source}`,
    s.captured_at ? `Captured: ${s.captured_at}` : "Captured: unknown",
  ];
  if (typeof s.confidence === "number") ev.push(`Confidence: ${s.confidence.toFixed(2)}`);
  if (s.metric) ev.push(`Metric: ${s.metric}`);
  if (s.source === "stale" || stale) {
    return {
      id: "sensor-snapshot",
      label: "Sensor Snapshot",
      status: "stale",
      evidence: ev,
      missing_info: ["Reading is stale; excluded from healthy status."],
      safety_note: "Stale readings are never shown as healthy.",
      source: s.source,
    };
  }
  if (isManualish) {
    return {
      id: "sensor-snapshot",
      label: "Sensor Snapshot",
      status: "needs_review",
      evidence: ev,
      missing_info: [],
      safety_note: "Manual reading — not labeled Live.",
      source: s.source,
    };
  }
  // isLive && fresh
  return {
    id: "sensor-snapshot",
    label: "Sensor Snapshot",
    status: "passed",
    evidence: ev,
    missing_info: [],
    safety_note: "Live reading only when source=live and captured_at is fresh.",
    source: "live",
  };
}

export function evaluateAiDoctor(a: AiDoctorEvidence | null): LoopStepRow {
  if (!a || !a.session_id) {
    return {
      id: "ai-doctor",
      label: "AI Doctor",
      status: "missing",
      evidence: [],
      missing_info: ["No AI Doctor session recorded yet."],
      safety_note: "Viewing this proof page does not trigger a model call.",
      deep_link: "/doctor",
    };
  }
  const contextChecks: [boolean, string][] = [
    [a.had_plant_stage, "plant stage"],
    [a.had_medium, "medium"],
    [a.had_pot_size, "pot size"],
    [a.had_recent_log, "recent Quick Log"],
    [a.had_recent_photo, "recent photo"],
    [a.had_recent_sensor_snapshot, "recent sensor snapshot"],
    [a.had_alerts, "alerts"],
  ];
  const missing = contextChecks.filter(([had]) => !had).map(([, name]) => `Missing context: ${name}.`);
  const ev: string[] = [];
  if (a.created_at) ev.push(`Session created: ${a.created_at}`);
  ev.push(`Context present: ${contextChecks.filter(([h]) => h).length}/${contextChecks.length}.`);
  return {
    id: "ai-doctor",
    label: "AI Doctor",
    status: missing.length > 0 ? "needs_review" : "passed",
    evidence: ev,
    missing_info: missing,
    safety_note: "AI Doctor stays cautious when context is weak.",
    deep_link: "/doctor",
  };
}

export function evaluateAlert(a: AlertEvidence | null): LoopStepRow {
  if (!a) {
    return {
      id: "alert",
      label: "Alert",
      status: "missing",
      evidence: [],
      missing_info: ["No persisted alert found."],
      safety_note: "Alerts are not auto-created by this proof page.",
      deep_link: "/alerts",
    };
  }
  const ev: string[] = [];
  if (a.metric) ev.push(`Metric: ${a.metric}`);
  if (a.severity) ev.push(`Severity: ${a.severity}`);
  if (a.reason) ev.push(`Reason: ${a.reason}`);
  if (a.status) ev.push(`Status: ${a.status}`);
  if (a.created_at) ev.push(`Created: ${a.created_at}`);
  return {
    id: "alert",
    label: "Alert",
    status: "passed",
    evidence: ev,
    missing_info: [],
    safety_note: "Alerts derived from stale/invalid data must be labeled as such.",
    deep_link: `/alerts/${a.id}`,
  };
}

export function evaluateActionQueue(a: ActionQueueEvidence | null): LoopStepRow {
  if (!a) {
    return {
      id: "action-queue",
      label: "Approval-Required Action Queue",
      status: "missing",
      evidence: [],
      missing_info: ["No Action Queue item found for this scope."],
      safety_note: "Approval required. No device command. Nothing auto-created.",
      deep_link: "/action-queue",
    };
  }
  if (a.has_device_command) {
    return {
      id: "action-queue",
      label: "Approval-Required Action Queue",
      status: "blocked",
      evidence: [`Status: ${a.status ?? "unknown"}`],
      missing_info: ["Executable device command detected — unsafe."],
      safety_note: "No device command permitted on Action Queue rows.",
    };
  }
  if (!a.approval_required) {
    return {
      id: "action-queue",
      label: "Approval-Required Action Queue",
      status: "blocked",
      evidence: [`Status: ${a.status ?? "unknown"}`],
      missing_info: ["Row is not approval-required — unsafe."],
      safety_note: "Action Queue must remain approval-required.",
    };
  }
  const ev: string[] = [`Status: ${a.status ?? "pending_approval"}`, "Approval required."];
  if (a.risk_level) ev.push(`Risk: ${a.risk_level}`);
  if (a.reason) ev.push(`Reason: ${a.reason}`);
  if (a.linked_alert_id) ev.push("Linked to originating alert.");
  ev.push("No device command.");
  return {
    id: "action-queue",
    label: "Approval-Required Action Queue",
    status: "passed",
    evidence: ev,
    missing_info: [],
    safety_note: "Approval required. Grower decides. No device command.",
    deep_link: `/action-queue/${a.id}`,
  };
}

export function evaluateFollowUp(f: FollowUpEvidence | null): LoopStepRow {
  if (!f) {
    return {
      id: "follow-up",
      label: "Follow-up / outcome",
      status: "missing",
      evidence: [],
      missing_info: ["Follow-up not recorded yet."],
      safety_note: "Loop closes only after grower-recorded follow-up.",
    };
  }
  return {
    id: "follow-up",
    label: "Follow-up / outcome",
    status: "passed",
    evidence: [
      `Kind: ${f.kind}`,
      f.entry_at ? `Recorded at: ${f.entry_at}` : "Recorded at: unknown",
    ],
    missing_info: [],
    safety_note: "Follow-up preserved as plant memory.",
  };
}

// ---------------------------------------------------------------------------
// Compose full loop
// ---------------------------------------------------------------------------

export function evaluateLoop(input: LoopEvidence): LoopStepRow[] {
  const now_ms =
    typeof input.now_ms === "number" && Number.isFinite(input.now_ms)
      ? input.now_ms
      : Date.parse("2026-06-09T00:00:00.000Z");
  const grow = evaluateGrow(input.grow);
  const tent = evaluateTent(input.tent, input.grow);
  const plant = evaluatePlant(input.plant, input.tent);
  const quickLog = evaluateQuickLog(input.latest_quick_log, input.plant);
  const timeline = evaluateTimeline(input.timeline, input.latest_quick_log);
  const sensor = evaluateSensorSnapshot(input.latest_sensor_snapshot, now_ms);
  const ai = evaluateAiDoctor(input.latest_ai_doctor);
  const alert = evaluateAlert(input.latest_alert);
  const aq = evaluateActionQueue(input.latest_action_queue);
  const followUp = evaluateFollowUp(input.latest_follow_up);
  return [grow, tent, plant, quickLog, timeline, sensor, ai, alert, aq, followUp];
}
