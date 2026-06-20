/**
 * One-Tent Loop Internal Proof View Model.
 *
 * Pure, deterministic readiness/proof presenter for Verdant's V0 loop:
 *
 *   Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot
 *        → AI Doctor → Alert → Approval-Required Action Queue
 *
 * Hard rules:
 *   - Pure data. No Supabase, no fetch, no model calls, no Edge Functions.
 *   - No `Date.now()`. Timestamp comes from injected `now` or a stable default.
 *   - Stable step ordering. Arrays are produced in a fixed order.
 *   - Never claims live sensor proof. Live validation is reported as blocked
 *     until real tent/controller readings are available.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OneTentLoopProofStatus =
  | "ready"
  | "partial"
  | "blocked"
  | "not_started";

export interface OneTentLoopProofStep {
  id: string;
  label: string;
  status: OneTentLoopProofStatus;
  evidence: string[];
  missing_pieces: string[];
  safety_notes: string[];
  next_fix: string;
}

export interface OneTentLoopProofViewModel {
  title: string;
  subtitle: string;
  badges: string[];
  steps: OneTentLoopProofStep[];
  blocked_summary: string[];
  safety_summary: string[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Constants — defined once, then frozen into the view model
// ---------------------------------------------------------------------------

const DEFAULT_GENERATED_AT = "2026-06-09T00:00:00.000Z";

const BADGES: readonly string[] = [
  "Internal proof checklist",
  "Read-only",
  "No live data queries",
  "No database writes",
  "No model calls",
  "No device control",
];

const SAFETY_SUMMARY: readonly string[] = [
  "Demo, manual, live, stale, and invalid data must stay clearly labeled.",
  "Bad or unknown telemetry must not be classified as healthy.",
  "AI Doctor must stay cautious when context is weak.",
  "Alerts must not create Action Queue items automatically.",
  "Action Queue remains approval-required — grower decides.",
  "No blind automation. No device control in this loop.",
];

const BLOCKED_SUMMARY: readonly string[] = [
  "Real EcoWitt/MQTT live-data validation is blocked until actual tent readings are available.",
  "End-to-end live sensor proof should wait until the grower is physically able to verify the tent/controller readings.",
  "Do not use ghost, default, or demo numbers to pass the loop.",
];

interface StepSeed {
  id: string;
  label: string;
  status: OneTentLoopProofStatus;
  evidence: readonly string[];
  missing_pieces: readonly string[];
  safety_notes: readonly string[];
  next_fix: string;
}

const STEP_SEEDS: readonly StepSeed[] = [
  {
    id: "grow",
    label: "Grow",
    status: "ready",
    evidence: [
      "Grow create/list/detail routes wired (/grows, /grows/:growId).",
      "Grow ownership scoped via RLS on grows table.",
    ],
    missing_pieces: [],
    safety_notes: [
      "Client never holds privileged credentials; ownership enforced server-side.",
    ],
    next_fix: "No fix needed for V0 loop coverage.",
  },
  {
    id: "tent",
    label: "Tent",
    status: "ready",
    evidence: [
      "Tent create/list/detail routes wired (/tents, /tents/:id).",
      "Tents are linked to a grow and ownership is enforced.",
    ],
    missing_pieces: [],
    safety_notes: [
      "Tent membership cannot be self-granted from the client.",
    ],
    next_fix: "No fix needed for V0 loop coverage.",
  },
  {
    id: "plant",
    label: "Plant",
    status: "ready",
    evidence: [
      "Plant create/list/detail routes wired (/plants, /plants/:id).",
      "Plants are linked to a tent and inherit grow ownership.",
    ],
    missing_pieces: [],
    safety_notes: [
      "Plant context cannot leak across owners; verified by RLS.",
    ],
    next_fix: "No fix needed for V0 loop coverage.",
  },
  {
    id: "quick-log",
    label: "Quick Log",
    status: "ready",
    evidence: [
      "Quick log entry (watering, feeding, photo, note) is reachable from plant detail.",
      "Logs are timestamped, owner-scoped, and written through validated paths.",
    ],
    missing_pieces: [],
    safety_notes: [
      "Quick log entries are user-initiated only; nothing auto-fills sensor readings.",
    ],
    next_fix: "No fix needed for V0 loop coverage.",
  },
  {
    id: "timeline",
    label: "Timeline",
    status: "ready",
    evidence: [
      "Timeline route renders combined plant events (/timeline).",
      "Events render with source labels (manual, demo, csv, etc.).",
    ],
    missing_pieces: [],
    safety_notes: [
      "Demo and CSV events stay labeled; live events are only labeled live when source=live.",
    ],
    next_fix: "No fix needed for V0 loop coverage.",
  },
  {
    id: "sensor-snapshot",
    label: "Sensor Snapshot",
    status: "partial",
    evidence: [
      "Snapshot view model labels live / manual / demo / csv / stale / invalid sources.",
      "Stale and invalid readings are never rendered as healthy.",
    ],
    missing_pieces: [
      "Verified real EcoWitt/MQTT readings flowing end-to-end into a snapshot.",
      "Grower-confirmed comparison against the physical tent/controller.",
    ],
    safety_notes: [
      "Unknown or malformed telemetry must stay flagged, not classified as healthy.",
      "Live label is reserved for source=live with a fresh captured_at.",
    ],
    next_fix:
      "Wait for real tent/controller readings before claiming live sensor proof.",
  },
  {
    id: "ai-doctor",
    label: "AI Doctor",
    status: "partial",
    evidence: [
      "Phase 1 view model, context compiler, confidence adapter, and golden cases are tested.",
      "Static read-only preview is mounted at /internal/ai-doctor-phase1-preview.",
    ],
    missing_pieces: [
      "End-to-end multimodal diagnosis against real plant + sensor + photo context.",
      "Live model call wired through the AI credit ledger with refund-on-failure.",
    ],
    safety_notes: [
      "AI Doctor must stay cautious when context is weak.",
      "Never sound certain from a single photo or single reading.",
    ],
    next_fix:
      "Keep AI Doctor cautious; wire the live model path only after credit metering and confidence gates are proven.",
  },
  {
    id: "alert",
    label: "Alert",
    status: "partial",
    evidence: [
      "Alerts route, detail route, and source labels render.",
      "Resolved/dismissed alerts do not silently regenerate Action Queue items.",
    ],
    missing_pieces: [
      "End-to-end alert generation from verified live sensor breach.",
      "Grower-confirmed handoff from alert into a suggested (not auto-run) action.",
    ],
    safety_notes: [
      "Alerts must not auto-create Action Queue items.",
      "Alerts derived from stale or invalid readings must be labeled as such.",
    ],
    next_fix:
      "Defer live alert proof until real tent readings exist; keep alert→action handoff user-initiated.",
  },
  {
    id: "approval-required-action-queue",
    label: "Approval-Required Action Queue",
    status: "partial",
    evidence: [
      "Action Queue route, detail route, and pending_approval status render.",
      "Items render with reason, risk level, and a disabled-until-approved state.",
    ],
    missing_pieces: [
      "End-to-end approval flow tied to a verified live alert.",
      "Audit trail for approve/dismiss decisions tied to grow/tent/plant context.",
    ],
    safety_notes: [
      "Action Queue is approval-required — grower decides, Verdant does not perform changes.",
      "No device control. No automation. No background command dispatch.",
    ],
    next_fix:
      "Keep Action Queue strictly approval-required; never wire a background runner without an explicit, tested safety phase.",
  },
];

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function normalizeGeneratedAt(now?: string | Date): string {
  if (now === undefined || now === null) return DEFAULT_GENERATED_AT;
  if (now instanceof Date) {
    if (Number.isNaN(now.getTime())) return DEFAULT_GENERATED_AT;
    return now.toISOString();
  }
  if (typeof now === "string" && now.length > 0) {
    const parsed = new Date(now);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return DEFAULT_GENERATED_AT;
}

function buildStep(seed: StepSeed): OneTentLoopProofStep {
  // Spread into fresh arrays so callers cannot mutate the seed.
  return Object.freeze({
    id: seed.id,
    label: seed.label,
    status: seed.status,
    evidence: Object.freeze([...seed.evidence]) as unknown as string[],
    missing_pieces: Object.freeze([...seed.missing_pieces]) as unknown as string[],
    safety_notes: Object.freeze([...seed.safety_notes]) as unknown as string[],
    next_fix: seed.next_fix,
  }) as OneTentLoopProofStep;
}

/**
 * Pure deterministic builder. Same `now` → same output.
 */
export function buildOneTentLoopProofViewModel(
  now?: string | Date,
): OneTentLoopProofViewModel {
  const steps: OneTentLoopProofStep[] = STEP_SEEDS.map(buildStep);
  const vm: OneTentLoopProofViewModel = {
    title: "One-Tent Loop — Internal Proof Checklist",
    subtitle:
      "This page documents readiness. It does not validate live sensor data, run AI diagnosis, create alerts, create Action Queue items, or perform actions.",
    badges: Object.freeze([...BADGES]) as unknown as string[],
    steps: Object.freeze(steps) as unknown as OneTentLoopProofStep[],
    blocked_summary: Object.freeze([...BLOCKED_SUMMARY]) as unknown as string[],
    safety_summary: Object.freeze([...SAFETY_SUMMARY]) as unknown as string[],
    generated_at: normalizeGeneratedAt(now),
  };
  return Object.freeze(vm) as OneTentLoopProofViewModel;
}

/** Canonical step order — exported for tests and consumers. */
export const ONE_TENT_LOOP_PROOF_STEP_IDS: readonly string[] = STEP_SEEDS.map(
  (s) => s.id,
);
