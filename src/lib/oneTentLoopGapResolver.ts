/**
 * One-Tent Loop Gap Resolver — pure, deterministic.
 *
 * Given the evaluated loop rows (from `evaluateLoop`), pick exactly one
 * "top real-data gap" that is currently blocking or weakening the
 * Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot →
 * AI Doctor → Alert → Action Queue → Follow-up loop.
 *
 * Safety envelope:
 *  - Never labels missing / stale / invalid / unknown / demo-only as
 *    healthy, verified, OK, or success.
 *  - Never exposes raw IDs, raw payloads, tokens, bridge secrets, or
 *    service_role.
 *  - Deterministic. No I/O, no clock, no randomness.
 *  - Does not create logs, alerts, actions, AI results, or device commands.
 */
import type {
  EvidenceProvenance,
  LoopStepId,
  LoopStepRow,
  LoopStepStatus,
} from "./oneTentLoopProofRules";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OneTentLoopGapStepKey = LoopStepId | "plant-context" | "none";

export type OneTentLoopGapStatus = LoopStepStatus | "resolved";

export type OneTentLoopGapEvidenceKind = EvidenceProvenance | "resolved";

export type OneTentLoopGapEvidenceState =
  | "present"
  | "missing"
  | "weak"
  | "stale"
  | "invalid"
  | "demo_only"
  | "unknown"
  | "blocked";

export interface OneTentLoopGapEvidenceChecklistItem {
  kind: "loop-step";
  step_key: LoopStepId;
  label: string;
  state: OneTentLoopGapEvidenceState;
  why_it_matters: string;
  source_label?: string;
  provenance?: EvidenceProvenance;
}

export interface OneTentLoopGap {
  /** Step this gap is anchored to (or "none" when no blocking gap). */
  step_key: OneTentLoopGapStepKey;
  /** Short human title, safe to render. */
  title: string;
  /** Status the gap inherits from its anchor row. */
  status: OneTentLoopGapStatus;
  /**
   * Priority number. Lower is more urgent. `Number.POSITIVE_INFINITY`
   * indicates "no blocking gap".
   */
  priority: number;
  /** Why resolving this gap matters for the loop. */
  why_it_matters: string;
  /** Where the operator/grower would go to resolve it. */
  where_to_resolve: string;
  /** A single next observation the operator can look for. */
  suggested_next_observation: string;
  /** Safety-conscious framing that never claims certainty. */
  safety_note: string;
  /** Provenance/evidence kind for this gap. */
  evidence_kind: OneTentLoopGapEvidenceKind;
  /** Optional sanitized source label (e.g. manual, stale, demo). */
  source_label?: string;
  /** Loop steps blocked or weakened downstream. */
  blocked_downstream_steps: readonly LoopStepId[];
  /** True whenever the gap represents real-data missing/weak/unsafe evidence. */
  is_real_data_gap: boolean;
  /** Read-only per-step evidence checklist scoped to this gap. */
  evidence_checklist: readonly OneTentLoopGapEvidenceChecklistItem[];
}


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Base priority order: lower = higher urgency.
 */
const BASE_PRIORITY: Record<LoopStepId, number> = {
  grow: 1,
  tent: 2,
  plant: 3,
  "quick-log": 4,
  timeline: 5,
  "sensor-snapshot": 6,
  "ai-doctor": 7,
  alert: 8,
  "action-queue": 9,
  "follow-up": 10,
};

/**
 * Downstream steps blocked or weakened when a given step is missing/weak.
 */
const DOWNSTREAM_MAP: Record<LoopStepId, readonly LoopStepId[]> = {
  grow: [
    "tent",
    "plant",
    "quick-log",
    "timeline",
    "sensor-snapshot",
    "ai-doctor",
    "alert",
    "action-queue",
    "follow-up",
  ],
  tent: [
    "plant",
    "sensor-snapshot",
    "ai-doctor",
    "alert",
    "action-queue",
    "follow-up",
  ],
  plant: ["quick-log", "timeline", "ai-doctor", "follow-up"],
  "quick-log": ["timeline", "ai-doctor", "follow-up"],
  timeline: ["ai-doctor", "follow-up"],
  "sensor-snapshot": ["ai-doctor", "alert", "action-queue", "follow-up"],
  "ai-doctor": ["alert", "action-queue", "follow-up"],
  alert: ["action-queue", "follow-up"],
  "action-queue": ["follow-up"],
  "follow-up": [],
};

const STATUS_TITLE_SUFFIX: Record<LoopStepStatus, string> = {
  passed: "verified from evidence",
  needs_review: "needs review",
  missing: "missing",
  blocked: "blocked",
  stale: "stale reading",
  invalid: "invalid telemetry",
  demo_only: "demo data only",
};

const STATUS_WHY: Record<LoopStepStatus, string> = {
  passed:
    "Evidence present. No blocking gap detected for this step from the current app state.",
  needs_review:
    "Evidence exists but is incomplete or ambiguous, so this step cannot be treated as fully proven.",
  missing:
    "No supporting record was found, so the loop cannot be proven end-to-end from current app state.",
  blocked:
    "A safety fence prevents this step from being counted as proof (for example an Action Queue item without approval-required, or an executable device command marker).",
  stale:
    "The latest reading is too old to be trusted as current sensor truth for the loop.",
  invalid:
    "The latest reading failed shape / range / source validation and cannot be treated as sensor truth.",
  demo_only:
    "Only demo or seeded data is available. Demo data is not real proof of the loop.",
};

const STATUS_NEXT_OBS: Record<LoopStepStatus, string> = {
  passed:
    "Continue observing the loop; no additional observation is required for this step.",
  needs_review:
    "Look for a more complete record (matching plant/tent/grow scope, timestamped, source-labeled).",
  missing:
    "Look for the next real record that would satisfy this step (with grow/tent/plant scope and a timestamp).",
  blocked:
    "Look for a corrected record that satisfies the safety fence (approval-required, no device command, correct scope).",
  stale:
    "Look for a fresher reading with an explicit source label and captured_at timestamp.",
  invalid:
    "Look for a well-formed reading (known metric, known source, sensible range, parseable captured_at).",
  demo_only:
    "Look for a real, source-labeled record (live, manual, or csv) rather than demo/seeded data.",
};

const STATUS_SAFETY: Record<LoopStepStatus, string> = {
  passed:
    "Read-only view. Verified from current evidence; nothing new was recorded.",
  needs_review:
    "Read-only view. Not healthy — this step is only partially evidenced.",
  missing:
    "Read-only view. Missing evidence is not proof of plant condition. Nothing will be created or automated by viewing this page.",
  blocked:
    "Read-only view. A safety fence has fired. Do not bypass it; investigate the underlying record.",
  stale:
    "Read-only view. Stale telemetry must never be shown as current sensor truth.",
  invalid:
    "Read-only view. Invalid telemetry is never healthy and never accurate.",
  demo_only:
    "Read-only view. Demo-only data is not proof of the real One-Tent Loop.",
};

const STATUS_TO_EVIDENCE_KIND: Record<LoopStepStatus, EvidenceProvenance> = {
  passed: "direct",
  needs_review: "inferred",
  missing: "missing",
  blocked: "missing",
  stale: "stale",
  invalid: "invalid",
  demo_only: "demo_only",
};

// ---------------------------------------------------------------------------
// Where-to-resolve copy (never links to write actions)
// ---------------------------------------------------------------------------

const WHERE_BY_STEP: Record<OneTentLoopGapStepKey, string> = {
  grow: "Open the Grows page and confirm an active grow exists for this scope.",
  tent: "Open the Tent page for this grow and confirm a tent is set up.",
  plant: "Open the Plants page for this tent and confirm a plant is present.",
  "quick-log":
    "Open Daily Check / Quick Log for this plant and confirm a recent entry.",
  timeline:
    "Open the Timeline filtered to this plant/tent and confirm the entry linked correctly.",
  "sensor-snapshot":
    "Open the Sensors page for this tent and confirm a fresh, source-labeled reading.",
  "ai-doctor":
    "Open the AI Doctor page for this plant and confirm the latest session context.",
  alert: "Open the Alerts page and confirm a persisted alert row exists.",
  "action-queue":
    "Open the Action Queue and confirm the item is approval-required with no device command.",
  "follow-up":
    "Open the plant's Timeline / Daily Check and look for a follow-up entry after the loop step.",
  "plant-context":
    "Open the Plant details page and confirm stage, medium, and pot size are recorded.",
  none: "No blocking gap. Continue observing the loop as normal.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize any potentially-untrusted string field before echoing it back.
 * Strips whitespace, trims to a reasonable length, and blocks anything that
 * looks like a secret marker or HTML tag. Returns null when unsafe/empty.
 */
function sanitizeShortLabel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 80) return null;
  if (/[<>]/.test(trimmed)) return null;
  const forbidden = /(service_role|bridge_token|api_key|access_token|secret)/i;
  if (forbidden.test(trimmed)) return null;
  return trimmed;
}

function firstSourceLabel(row: LoopStepRow): string | undefined {
  const fromRow = sanitizeShortLabel(row.source);
  if (fromRow) return fromRow;
  const ref = row.evidence_refs?.[0];
  const fromRef = sanitizeShortLabel(ref?.source);
  return fromRef ?? undefined;
}

/**
 * Return the effective priority for a row, applying the nuance rules.
 * Non-blocking (passed & not demo_only) rows return Infinity.
 */
function priorityForRow(row: LoopStepRow): number {
  const base = BASE_PRIORITY[row.id];
  switch (row.status) {
    case "passed":
      return Number.POSITIVE_INFINITY;
    case "missing":
    case "blocked":
      return base;
    case "stale":
    case "invalid":
      // Stale/invalid telemetry outranks missing AI Doctor: base is already 6
      // for sensor-snapshot, which is < 7 for ai-doctor. Nudge sensor slightly
      // higher (lower number) so it beats a plain "missing" AI-Doctor tie.
      if (row.id === "sensor-snapshot") return base - 0.25;
      return base;
    case "demo_only":
      // Demo-only anywhere counts as a real-data gap.
      if (row.id === "sensor-snapshot") return base - 0.1;
      return base;
    case "needs_review":
      // Needs-review is a softer gap than missing at the same step.
      return base + 0.5;
  }
}

/**
 * A row is a real-data gap if it is not a clean pass.
 */
function isRealDataGap(row: LoopStepRow): boolean {
  return row.status !== "passed";
}

function buildGapFromRow(row: LoopStepRow, priority: number): OneTentLoopGap {
  const status = row.status;
  const title = `${row.label} — ${STATUS_TITLE_SUFFIX[status]}`;
  return {
    step_key: row.id,
    title,
    status,
    priority,
    why_it_matters: STATUS_WHY[status],
    where_to_resolve: WHERE_BY_STEP[row.id],
    suggested_next_observation: STATUS_NEXT_OBS[status],
    safety_note: STATUS_SAFETY[status],
    evidence_kind: STATUS_TO_EVIDENCE_KIND[status],
    source_label: firstSourceLabel(row),
    blocked_downstream_steps: DOWNSTREAM_MAP[row.id],
    is_real_data_gap: isRealDataGap(row),
    evidence_checklist: [],
  };
}

/**
 * Detect an unsafe Action Queue row (device command or non-approval status).
 * Promotes its priority to sit above missing follow-up.
 */
function actionQueueSafetyGap(row: LoopStepRow): OneTentLoopGap | null {
  if (row.id !== "action-queue") return null;
  if (row.status !== "blocked") return null;
  // Safety-anchored gap: sits between action-queue base (9) and follow-up (10).
  const priority = 8.5;
  return {
    step_key: "action-queue",
    title: "Action Queue — safety fence fired",
    status: "blocked",
    priority,
    why_it_matters:
      "An Action Queue item is not approval-required, or carries a device-command marker. Verdant treats this as a safety block, not proof.",
    where_to_resolve: WHERE_BY_STEP["action-queue"],
    suggested_next_observation:
      "Look for the same item with approval_required=true and no device_command marker.",
    safety_note:
      "Read-only view. Do not bypass the safety fence. Verdant will not auto-execute device commands.",
    evidence_kind: "missing",
    source_label: firstSourceLabel(row),
    blocked_downstream_steps: DOWNSTREAM_MAP["action-queue"],
    is_real_data_gap: true,
    evidence_checklist: [],
  };
}


/**
 * Optional plant-context gap: plant row is passed but the plant lacks
 * stage/medium/pot-size context. Ranks below Quick Log so it never
 * outranks missing Grow/Tent/Plant/Quick Log.
 */
function plantContextGap(rows: readonly LoopStepRow[]): OneTentLoopGap | null {
  const plant = rows.find((r) => r.id === "plant");
  if (!plant) return null;
  if (plant.status !== "passed" && plant.status !== "needs_review") return null;
  // Look for plant needs_review or "missing" style hints in missing_info.
  const missing = plant.missing_info ?? [];
  const hasContextMiss = missing.some((m) =>
    /(stage|medium|pot|pot size|pot_size)/i.test(m),
  );
  if (!hasContextMiss && plant.status !== "needs_review") return null;
  return {
    step_key: "plant-context",
    title: "Plant context — stage/medium/pot size incomplete",
    status: "needs_review",
    // Sits after quick-log (4) but before timeline (5) so it does not
    // outrank missing Grow/Tent/Plant/Quick Log.
    priority: 4.5,
    why_it_matters:
      "Plant context (stage, medium, pot size) shapes AI Doctor guidance and cultivation defaults. Without it, downstream context is weaker.",
    where_to_resolve: WHERE_BY_STEP["plant-context"],
    suggested_next_observation:
      "Look for stage, medium, and pot size fields populated on the Plant details page.",
    safety_note:
      "Read-only view. Missing plant context is not proof of plant condition.",
    evidence_kind: "inferred",
    blocked_downstream_steps: ["ai-doctor", "follow-up"],
    is_real_data_gap: true,
    evidence_checklist: [],
  };
}


// ---------------------------------------------------------------------------
// Evidence checklist builder
// ---------------------------------------------------------------------------

const CHECKLIST_STEP_ORDER: readonly LoopStepId[] = [
  "grow",
  "tent",
  "plant",
  "quick-log",
  "timeline",
  "sensor-snapshot",
  "ai-doctor",
  "alert",
  "action-queue",
];

const CHECKLIST_WHY: Record<LoopStepId, string> = {
  grow: "The grow anchors every downstream loop step. Without it, no scope exists.",
  tent: "The tent scopes environment targets and sensor snapshots for this grow.",
  plant: "The plant scopes Quick Log entries, AI Doctor context, and follow-up.",
  "quick-log": "Quick Log is plant memory; the loop cannot be proven without recent entries.",
  timeline: "Timeline linkage confirms Quick Log became persistent plant memory.",
  "sensor-snapshot": "Sensor snapshot is the truth signal that AI Doctor and Alerts read from.",
  "ai-doctor": "AI Doctor reasoning depends on real sensor and log evidence, not guesses.",
  alert: "Alerts turn sensor truth into a persisted, reviewable signal.",
  "action-queue": "Action Queue items must stay approval-required. No device command.",
  "follow-up": "Follow-up proves the loop closed with a real observation after action.",
};

function stateFromStatus(status: LoopStepStatus): OneTentLoopGapEvidenceState {
  switch (status) {
    case "passed":
      return "present";
    case "needs_review":
      return "weak";
    case "missing":
      return "missing";
    case "blocked":
      return "blocked";
    case "stale":
      return "stale";
    case "invalid":
      return "invalid";
    case "demo_only":
      return "demo_only";
  }
}

/**
 * Downstream weakening rule:
 * When the top gap is caused by weak/unsafe telemetry or missing evidence,
 * downstream checklist items must never appear as `present`. Cascade to
 * `blocked` for hard-blocking statuses, otherwise `weak`.
 */
function downstreamOverride(
  gapStatus: OneTentLoopGapStatus,
): OneTentLoopGapEvidenceState | null {
  switch (gapStatus) {
    case "missing":
    case "invalid":
    case "blocked":
      return "blocked";
    case "stale":
    case "demo_only":
    case "needs_review":
      return "weak";
    default:
      return null;
  }
}

/**
 * Build a per-step evidence checklist scoped to a given gap. Never marks a
 * downstream item as `present` when the top gap represents weak or missing
 * telemetry. Never echoes raw IDs, payloads, or secret markers.
 */
export function buildOneTentLoopGapEvidenceChecklist(
  rows: readonly LoopStepRow[],
  gap: OneTentLoopGap,
): OneTentLoopGapEvidenceChecklistItem[] {
  if (gap.step_key === "none") return [];
  const rowById = new Map<LoopStepId, LoopStepRow>();
  for (const r of rows) rowById.set(r.id, r);
  const downstream = new Set<LoopStepId>(gap.blocked_downstream_steps);
  const override = downstreamOverride(gap.status);

  const items: OneTentLoopGapEvidenceChecklistItem[] = [];
  for (const stepId of CHECKLIST_STEP_ORDER) {
    const row = rowById.get(stepId);
    let state: OneTentLoopGapEvidenceState = row
      ? stateFromStatus(row.status)
      : "unknown";
    if (
      row &&
      override &&
      downstream.has(stepId) &&
      state === "present" &&
      stepId !== (gap.step_key as LoopStepId)
    ) {
      state = override;
    }
    const sourceLabel = row ? firstSourceLabel(row) : undefined;
    const item: OneTentLoopGapEvidenceChecklistItem = {
      kind: "loop-step",
      step_key: stepId,
      label: row?.label ?? stepId,
      state,
      why_it_matters: CHECKLIST_WHY[stepId],
    };
    if (sourceLabel) item.source_label = sourceLabel;
    if (row?.provenance) item.provenance = row.provenance;
    items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------


/**
 * Rank every gap-eligible row into a stable priority-sorted list.
 * Exported for tests and text-report use. Deterministic.
 */
export function rankOneTentLoopGaps(
  rows: readonly LoopStepRow[],
): OneTentLoopGap[] {
  const gaps: OneTentLoopGap[] = [];

  for (const row of rows) {
    const pri = priorityForRow(row);
    if (!Number.isFinite(pri)) continue;
    gaps.push(buildGapFromRow(row, pri));
  }

  // Extra safety-anchored gap for unsafe Action Queue rows.
  const aq = rows.find((r) => r.id === "action-queue");
  if (aq) {
    const safety = actionQueueSafetyGap(aq);
    if (safety) {
      // Replace any generic action-queue gap of lower urgency with the
      // safety-anchored one, then add. Keep both to preserve evidence.
      gaps.push(safety);
    }
  }

  // Optional plant-context gap. When present, it supersedes any generic
  // "plant needs_review" gap so plant context never outranks Quick Log.
  const ctx = plantContextGap(rows);
  if (ctx) {
    for (let i = gaps.length - 1; i >= 0; i -= 1) {
      if (gaps[i].step_key === "plant" && gaps[i].status === "needs_review") {
        gaps.splice(i, 1);
      }
    }
    gaps.push(ctx);
  }

  // Deterministic sort: priority asc, then step order asc, then title asc.
  gaps.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ai = a.step_key === "plant-context" ? 3.5 : BASE_PRIORITY[a.step_key as LoopStepId] ?? 99;
    const bi = b.step_key === "plant-context" ? 3.5 : BASE_PRIORITY[b.step_key as LoopStepId] ?? 99;
    if (ai !== bi) return ai - bi;
    return a.title.localeCompare(b.title);
  });

  // Attach per-gap evidence checklist so downstream weakening reflects the
  // gap's own status.
  for (const g of gaps) {
    (g as { evidence_checklist: readonly OneTentLoopGapEvidenceChecklistItem[] })
      .evidence_checklist = buildOneTentLoopGapEvidenceChecklist(rows, g);
  }


  return gaps;
}


/**
 * Resolve the single top real-data gap for the loop, or a "no blocking gap"
 * result when every step is a clean pass (or acceptable).
 */
export function resolveTopOneTentLoopGap(
  rows: readonly LoopStepRow[],
): OneTentLoopGap {
  const ranked = rankOneTentLoopGaps(rows);
  if (ranked.length === 0) {
    return {
      step_key: "none",
      title: "No blocking real-data gap found",
      status: "resolved",
      priority: Number.POSITIVE_INFINITY,
      why_it_matters:
        "Every loop step has direct evidence in the current app state. Continue observing the loop.",
      where_to_resolve: WHERE_BY_STEP.none,
      suggested_next_observation:
        "Watch for the next Quick Log, sensor snapshot, alert, and follow-up as the loop continues.",
      safety_note:
        "Read-only view. This is a snapshot of current evidence, not a certainty claim about plant health.",
      evidence_kind: "resolved",
      blocked_downstream_steps: [],
      is_real_data_gap: false,
      evidence_checklist: [],
    };
  }
  return ranked[0];
}


/**
 * Render the top gap as sanitized plain text for inclusion in the copyable
 * proof report. Never emits raw IDs, payloads, or secrets.
 */
export function buildOneTentLoopTopGapTextBlock(
  gap: OneTentLoopGap,
): string {
  const lines: string[] = [];
  lines.push("Top real-data gap:");
  lines.push(`- Step: ${gap.step_key}`);
  lines.push(`- Title: ${gap.title}`);
  lines.push(`- Status: ${gap.status}`);
  lines.push(`- Priority: ${Number.isFinite(gap.priority) ? gap.priority : "n/a"}`);
  lines.push(`- Evidence kind: ${gap.evidence_kind}`);
  if (gap.source_label) lines.push(`- Source label: ${gap.source_label}`);
  lines.push(`- Why it matters: ${gap.why_it_matters}`);
  lines.push(`- Where to resolve: ${gap.where_to_resolve}`);
  lines.push(`- Suggested next observation: ${gap.suggested_next_observation}`);
  lines.push(`- Safety note: ${gap.safety_note}`);
  lines.push(`- Real data gap: ${gap.is_real_data_gap ? "yes" : "no"}`);
  if (gap.blocked_downstream_steps.length > 0) {
    lines.push("- Blocked / weakened downstream:");
    for (const step of gap.blocked_downstream_steps) {
      lines.push(`    - ${step}`);
    }
  } else {
    lines.push("- Blocked / weakened downstream: none");
  }
  if (gap.evidence_checklist.length > 0) {
    lines.push("- Evidence checklist for this gap:");
    for (const item of gap.evidence_checklist) {
      const src = item.source_label ? ` · source=${item.source_label}` : "";
      lines.push(
        `    - ${item.label} [${item.state}]${src} — ${item.why_it_matters}`,
      );
    }
  } else {
    lines.push("- Evidence checklist for this gap: none");
  }

  return lines.join("\n");
}
