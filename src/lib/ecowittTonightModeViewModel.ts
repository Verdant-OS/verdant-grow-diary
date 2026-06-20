/**
 * EcoWitt Tonight Mode — pure deterministic view model.
 *
 * Summarizes the local-only EcoWitt Live Bring-Up evaluator state into a
 * single operator-facing status. Does NOT query sensors, call Supabase,
 * write data, call models, create alerts, create Action Queue items, or
 * control devices. No Date.now(). No browser APIs. No persistence.
 *
 * This module is presenter-only and must remain pure.
 */

import type {
  LiveSourceTruthGateResult,
  LiveSourceTruthVerdict,
} from "./liveSourceTruthGateRules";
import type { EcowittEvidenceUnitWarning } from "./ecowittLiveEvidenceUnitWarningRules";
import type { EcowittPerPlantResult } from "./ecowittLiveEvidenceMultiPlantRules";

// ============================================================
// Types
// ============================================================

export type EcowittTonightModeStatus =
  | "blocked"
  | "needs_review"
  | "ready_for_export"
  | "live_proof_supported";

export type EcowittTonightChecklistStatus =
  | "done"
  | "missing"
  | "blocked"
  | "needs_review";

export interface EcowittTonightChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly status: EcowittTonightChecklistStatus;
  readonly helper: string;
}

export type EcowittTonightGateState = "passed" | "blocked" | "unknown";

export interface EcowittTonightOptionalGate {
  readonly state: EcowittTonightGateState;
  readonly blocker_message?: string | null;
}

export interface EcowittTonightModeInput {
  readonly evaluator_result?: LiveSourceTruthGateResult | null;
  readonly overall_verdict?: LiveSourceTruthVerdict | null;
  readonly plant_results?: readonly EcowittPerPlantResult[] | null;
  readonly unit_warnings?: readonly EcowittEvidenceUnitWarning[] | null;
  readonly form_warnings?: readonly string[] | null;
  readonly required_next_steps?: readonly string[] | null;
  readonly export_ready?: boolean | null;
  readonly snapshot_exported?: boolean | null;
  readonly timestamp_gate?: EcowittTonightOptionalGate | null;
  readonly device_identity_gate?: EcowittTonightOptionalGate | null;
  readonly network_gate?: EcowittTonightOptionalGate | null;
}

export interface EcowittTonightModeViewModel {
  readonly status: EcowittTonightModeStatus;
  readonly headline: string;
  readonly summary: string;
  readonly top_blockers: readonly string[];
  readonly next_best_action: string;
  readonly checklist_items: readonly EcowittTonightChecklistItem[];
  readonly can_export_snapshot: boolean;
  readonly can_claim_live_proof: boolean;
  readonly safety_note: string;
}

// ============================================================
// Constants
// ============================================================

const SAFETY_NOTE =
  "Tonight Mode summarizes local operator evidence only. It does not query sensors, write data, prove calibration, create alerts, create Action Queue items, or perform device control.";

const VERDICT_NEXT_ACTION: Readonly<Record<LiveSourceTruthVerdict, string>> = {
  verified_live:
    "Export the evidence snapshot and repeat the check after 10–15 minutes.",
  unverified_live:
    "Add controller/app comparison values for enabled metrics.",
  not_live_proof:
    "Replace demo/manual/imported evidence with real live EcoWitt evidence before claiming live proof.",
  stale:
    "Enter a recent captured_at value and confirm the device is sending current data.",
  invalid:
    "Fix missing, malformed, or suspicious evidence before trusting the reading.",
  mismatch:
    "Check units, channel mapping, and backend/controller values.",
};

const VERDICT_HEADLINE: Readonly<Record<LiveSourceTruthVerdict, string>> = {
  verified_live: "Local evidence supports live proof — operator review still required.",
  unverified_live: "Live source detected, controller comparison incomplete.",
  not_live_proof: "Submitted evidence does not prove live sensor truth.",
  stale: "Submitted evidence is too old to prove live conditions.",
  invalid: "Submitted evidence is missing, malformed, or suspicious.",
  mismatch: "Backend and controller disagree beyond tolerance.",
};

// ============================================================
// Helpers
// ============================================================

function dedupeStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function gateState(
  g: EcowittTonightOptionalGate | null | undefined,
): EcowittTonightGateState {
  if (!g) return "unknown";
  if (g.state === "passed" || g.state === "blocked") return g.state;
  return "unknown";
}

// ============================================================
// Main builder
// ============================================================

export function buildEcowittTonightModeViewModel(
  input: EcowittTonightModeInput,
): EcowittTonightModeViewModel {
  const result = input.evaluator_result ?? null;
  const unitWarnings = input.unit_warnings ?? [];
  const formWarnings = input.form_warnings ?? [];
  const requiredNextSteps = input.required_next_steps ?? [];
  const plantResults = input.plant_results ?? [];
  const exportReady = input.export_ready === true;
  const snapshotExported = input.snapshot_exported === true;

  const blockingUnitWarnings = unitWarnings.filter(
    (w) => w.severity === "blocks_live_proof",
  );
  const nonBlockingUnitWarnings = unitWarnings.filter(
    (w) => w.severity !== "blocks_live_proof",
  );

  const tsState = gateState(input.timestamp_gate);
  const idState = gateState(input.device_identity_gate);
  const netState = gateState(input.network_gate);

  // -------- Status --------
  let status: EcowittTonightModeStatus;
  let canClaimLiveProof = false;
  let canExportSnapshot = false;

  if (!result) {
    status = "blocked";
  } else {
    canExportSnapshot = exportReady;
    const verdict = result.verdict;
    if (verdict === "verified_live") {
      const allPlantsVerified =
        plantResults.length === 0 ||
        plantResults.every((p) => p.result.verdict === "verified_live");
      const tsOk = tsState !== "blocked";
      const idOk = idState !== "blocked";
      const noBlockers =
        blockingUnitWarnings.length === 0 &&
        formWarnings.length === 0 &&
        allPlantsVerified &&
        tsOk &&
        idOk;
      if (noBlockers) {
        status = "live_proof_supported";
        canClaimLiveProof = true;
      } else {
        status = "needs_review";
      }
    } else if (
      verdict === "invalid" ||
      verdict === "mismatch" ||
      verdict === "stale"
    ) {
      status = exportReady ? "ready_for_export" : "blocked";
    } else {
      // unverified_live, not_live_proof
      status = exportReady ? "ready_for_export" : "needs_review";
    }
  }

  // -------- Headline + summary --------
  let headline: string;
  let summary: string;
  if (!result) {
    headline = "Tonight Mode is blocked — no evaluator result yet.";
    summary =
      "Enter EcoWitt/MQTT/backend evidence in the form below and choose Evaluate evidence. Until then, no value on this page should be treated as live proof.";
  } else if (status === "live_proof_supported") {
    headline = VERDICT_HEADLINE.verified_live;
    summary =
      "Local evidence supports live proof. Export the snapshot, capture screenshots, and repeat the check before treating this as a stable result.";
  } else {
    headline = VERDICT_HEADLINE[result.verdict];
    summary = result.summary;
  }

  // -------- Top blockers --------
  const blockerSources: string[] = [];
  if (result) {
    for (const l of result.limitations) blockerSources.push(l);
    for (const w of result.warnings) blockerSources.push(w);
  }
  for (const w of formWarnings) blockerSources.push(`Form: ${w}`);
  for (const w of unitWarnings) {
    const prefix =
      w.severity === "blocks_live_proof"
        ? `Unit mismatch blocks live proof for ${w.metric_key}`
        : `Unit warning for ${w.metric_key}`;
    blockerSources.push(`${prefix}: ${w.message}`);
  }
  for (const s of requiredNextSteps) blockerSources.push(s);
  if (input.timestamp_gate?.state === "blocked" && input.timestamp_gate.blocker_message) {
    blockerSources.push(input.timestamp_gate.blocker_message);
  }
  if (
    input.device_identity_gate?.state === "blocked" &&
    input.device_identity_gate.blocker_message
  ) {
    blockerSources.push(input.device_identity_gate.blocker_message);
  }
  if (input.network_gate?.state === "blocked" && input.network_gate.blocker_message) {
    blockerSources.push(input.network_gate.blocker_message);
  }
  const top_blockers = dedupeStable(blockerSources).slice(0, 3);

  // -------- Next best action --------
  let next_best_action: string;
  if (!result) {
    next_best_action =
      "Enter EcoWitt/MQTT/backend evidence and evaluate it locally.";
  } else if (status === "live_proof_supported") {
    next_best_action =
      "Export the evidence snapshot and repeat the check after 10–15 minutes.";
  } else {
    next_best_action = VERDICT_NEXT_ACTION[result.verdict];
  }

  // -------- Checklist --------
  const checklist_items: EcowittTonightChecklistItem[] = [
    {
      id: "network-checked",
      label: "Network checked",
      status:
        netState === "passed"
          ? "done"
          : netState === "blocked"
            ? "blocked"
            : "missing",
      helper:
        "Confirm the EcoWitt gateway and operator workstation are on the same local network before trusting bring-up.",
    },
    {
      id: "evidence-entered",
      label: "Evidence entered",
      status: result ? "done" : "missing",
      helper:
        "Operator-entered EcoWitt/MQTT/backend evidence must be present before any verdict is meaningful.",
    },
    {
      id: "timestamp-sane",
      label: "Timestamp sane",
      status:
        result && (result.verdict === "stale" || result.verdict === "invalid")
          ? "blocked"
          : tsState === "passed"
            ? "done"
            : "needs_review",
      helper:
        "captured_at must be recent and not in the future. Confirm device clock and operator-entered now.",
    },
    {
      id: "device-identity-confirmed",
      label: "Device identity confirmed",
      status: idState === "passed" ? "done" : idState === "blocked" ? "blocked" : "needs_review",
      helper:
        "Confirm tent_id, gateway MAC/serial, and channel mapping match the physical device before trusting readings.",
    },
    {
      id: "controller-comparison-complete",
      label: "Controller comparison complete",
      status: !result
        ? "missing"
        : result.verdict === "verified_live"
          ? "done"
          : result.verdict === "unverified_live"
            ? "needs_review"
            : "missing",
      helper:
        "Add controller/app comparison values for enabled metrics to support live proof.",
    },
    {
      id: "unit-warnings-clear",
      label: "Unit warnings clear",
      status:
        blockingUnitWarnings.length > 0
          ? "blocked"
          : nonBlockingUnitWarnings.length > 0
            ? "needs_review"
            : "done",
      helper:
        "Backend and controller units/scales must agree before comparing values.",
    },
    {
      id: "source-truth-evaluated",
      label: "Source truth evaluated",
      status: result ? "done" : "missing",
      helper:
        "The local Live Source Truth Gate must have produced a verdict.",
    },
    {
      id: "snapshot-exported",
      label: "Snapshot exported",
      status: snapshotExported ? "done" : "missing",
      helper:
        "Download the local JSON evidence snapshot for tonight's operator record. This is not database proof.",
    },
  ];

  // -------- Fallback blockers --------
  let finalBlockers = top_blockers;
  if (finalBlockers.length === 0 && status !== "live_proof_supported" && !result) {
    finalBlockers = ["Enter EcoWitt/MQTT/backend evidence and evaluate it locally."];
  }

  return Object.freeze({
    status,
    headline,
    summary,
    top_blockers: Object.freeze(finalBlockers),
    next_best_action,
    checklist_items: Object.freeze(checklist_items),
    can_export_snapshot: canExportSnapshot,
    can_claim_live_proof: canClaimLiveProof,
    safety_note: SAFETY_NOTE,
  });
}
