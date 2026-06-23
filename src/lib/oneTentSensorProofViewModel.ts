/**
 * oneTentSensorProofViewModel — pure adapter that joins the EcoWitt
 * row-level live proof with the EcoWitt ingest-audit proof and renders
 * them as sanitized evidence for the One-Tent Live Proof page/report.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no time except via inputs.
 *  - Never echoes raw payloads, secrets, tokens, bridge ids, owning
 *    auth ids, MACs, or other internal identifiers.
 *  - Never marks missing/blocked/stale sensor proof as a positive outcome.
 *  - Always uses "current proof window" language; never claims an
 *    unbounded window or a fully-verified outcome.
 */

import type { EcowittLiveProofViewModel } from "@/lib/ecowittLiveProofViewModel";
import type { EcowittIngestAuditProofViewModel } from "@/lib/ecowittIngestAuditProofRules";

export type OneTentSensorProofStatus =
  | "present"
  | "live_only"
  | "audit_only"
  | "stale"
  | "invalid"
  | "blocked"
  | "missing"
  | "loading"
  | "unavailable";

export type OneTentSensorProofTone = "ok" | "warn" | "neutral";

export interface OneTentSensorProofLimitation {
  id: string;
  text: string;
}

export interface OneTentSensorProofViewModel {
  sensorProofStatus: OneTentSensorProofStatus;
  tone: OneTentSensorProofTone;
  headline: string;
  liveRowProofLabel: string;
  auditProofLabel: string;
  proofWindowLabel: string;
  limitations: readonly OneTentSensorProofLimitation[];
  reportLines: readonly string[];
  operatorShortcutHref: string;
  operatorShortcutLabel: string;
}

export interface BuildOneTentSensorProofInput {
  /** Caller-resolved tent id; null when no tent is selected. */
  tentId: string | null | undefined;
  /** Output of `buildEcowittLiveProofViewModel`, or null when not yet built. */
  liveProof: EcowittLiveProofViewModel | null | undefined;
  /** Output of `buildEcowittIngestAuditProof`, or null when not yet built. */
  auditProof: EcowittIngestAuditProofViewModel | null | undefined;
}

const PROOF_WINDOW_LABEL = "last 24 hours";
const OPERATOR_SHORTCUT_HREF = "/sensors?operator=1";
const OPERATOR_SHORTCUT_LABEL = "Open Sensors Operator Proof";

function liveLabel(
  liveProof: EcowittLiveProofViewModel | null | undefined,
): { label: string; kind: "ok" | "stale" | "invalid" | "limited" | "missing" } {
  if (!liveProof) {
    return {
      label: "EcoWitt row-level proof not found in this view.",
      kind: "missing",
    };
  }
  switch (liveProof.candidateStatus) {
    case "live_confirmed":
      return {
        label: "EcoWitt live row proof confirmed in current view.",
        kind: "ok",
      };
    case "stale":
      return { label: "EcoWitt proof stale.", kind: "stale" };
    case "invalid":
      return { label: "EcoWitt proof invalid.", kind: "invalid" };
    case "unknown":
    case "limited":
      return {
        label: "EcoWitt row-level proof limited in this view.",
        kind: "limited",
      };
    case "not_ecowitt":
    case null:
    default:
      return {
        label: "No EcoWitt row-level proof found in this view.",
        kind: "missing",
      };
  }
}

function auditLabel(
  auditProof: EcowittIngestAuditProofViewModel | null | undefined,
): {
  label: string;
  kind: "ok" | "rejected" | "empty" | "blocked" | "loading" | "missing";
} {
  if (!auditProof) {
    return {
      label: "EcoWitt audit proof blocked or unavailable.",
      kind: "blocked",
    };
  }
  switch (auditProof.status) {
    case "loaded":
      if (auditProof.hasRejected) {
        return {
          label:
            "EcoWitt ingest audit shows rejected or omitted rows in the current proof window.",
          kind: "rejected",
        };
      }
      if (auditProof.insertedCount > 0) {
        return {
          label:
            "EcoWitt ingest audit proof loaded for the current proof window.",
          kind: "ok",
        };
      }
      return {
        label:
          "EcoWitt ingest audit rows observed in the current proof window.",
        kind: "ok",
      };
    case "no_audit_rows":
      return {
        label:
          "No EcoWitt ingest audit rows found in the current proof window.",
        kind: "empty",
      };
    case "blocked":
    case "unavailable":
    case "error":
      return {
        label: "EcoWitt audit proof blocked or unavailable.",
        kind: "blocked",
      };
    case "loading":
      return {
        label: "Loading EcoWitt ingest audit proof…",
        kind: "loading",
      };
    default:
      return {
        label: "EcoWitt audit proof blocked or unavailable.",
        kind: "blocked",
      };
  }
}

export function buildOneTentSensorProofViewModel(
  input: BuildOneTentSensorProofInput,
): OneTentSensorProofViewModel {
  const tentId = input.tentId ?? null;
  if (!tentId) {
    return {
      sensorProofStatus: "unavailable",
      tone: "neutral",
      headline: "Sensor proof unavailable",
      liveRowProofLabel:
        "EcoWitt row-level proof not found in this view.",
      auditProofLabel: "EcoWitt audit proof blocked or unavailable.",
      proofWindowLabel: PROOF_WINDOW_LABEL,
      limitations: Object.freeze([
        {
          id: "no-tent",
          text: "Select a tent to evaluate sensor proof in the current proof window.",
        },
      ]),
      reportLines: Object.freeze([
        "Sensor proof: unavailable (no tent selected).",
      ]),
      operatorShortcutHref: OPERATOR_SHORTCUT_HREF,
      operatorShortcutLabel: OPERATOR_SHORTCUT_LABEL,
    };
  }

  const live = liveLabel(input.liveProof);
  const audit = auditLabel(input.auditProof);

  let sensorProofStatus: OneTentSensorProofStatus;
  let tone: OneTentSensorProofTone;
  let headline: string;

  if (audit.kind === "loading") {
    sensorProofStatus = "loading";
    tone = "neutral";
    headline = "Loading sensor proof…";
  } else if (live.kind === "invalid") {
    sensorProofStatus = "invalid";
    tone = "warn";
    headline = "Sensor proof invalid";
  } else if (live.kind === "stale") {
    sensorProofStatus = "stale";
    tone = "warn";
    headline = "Sensor proof stale";
  } else if (live.kind === "ok" && audit.kind === "ok") {
    sensorProofStatus = "present";
    tone = "ok";
    headline = "Sensor proof present in current proof window";
  } else if (live.kind === "ok") {
    sensorProofStatus = "live_only";
    tone = "neutral";
    headline = "Sensor proof limited (row-level only)";
  } else if (audit.kind === "ok" || audit.kind === "rejected") {
    sensorProofStatus = "audit_only";
    tone = audit.kind === "rejected" ? "warn" : "neutral";
    headline = "Sensor proof limited (ingest-audit only)";
  } else if (audit.kind === "blocked") {
    sensorProofStatus = "blocked";
    tone = "neutral";
    headline = "Sensor proof blocked or unavailable";
  } else {
    sensorProofStatus = "missing";
    tone = "neutral";
    headline = "No sensor proof in this view";
  }

  const limitations: OneTentSensorProofLimitation[] = [];
  if (audit.kind === "blocked") {
    limitations.push({
      id: "audit-blocked",
      text: "Ingest-audit proof is blocked or unavailable with current read permissions.",
    });
  }
  if (audit.kind === "empty") {
    limitations.push({
      id: "audit-empty",
      text: "No EcoWitt ingest audit rows in the current proof window.",
    });
  }
  if (audit.kind === "rejected") {
    limitations.push({
      id: "audit-rejected",
      text: "Rejected or omitted rows were recorded in the current proof window.",
    });
  }
  if (live.kind === "missing") {
    limitations.push({
      id: "live-missing",
      text: "No EcoWitt row-level proof found in currently loaded sensor readings.",
    });
  }
  if (live.kind === "limited") {
    limitations.push({
      id: "live-limited",
      text: "Row-level proof is limited; not enough recent EcoWitt readings to confirm live ingest.",
    });
  }
  if (live.kind === "stale") {
    limitations.push({
      id: "live-stale",
      text: "Latest EcoWitt reading is older than the freshness window.",
    });
  }
  if (live.kind === "invalid") {
    limitations.push({
      id: "live-invalid",
      text: "Latest EcoWitt reading failed a sensor-truth check.",
    });
  }

  const reportLines: string[] = [
    `Sensor proof status: ${sensorProofStatus}.`,
    `Row-level: ${live.label}`,
    `Ingest-audit: ${audit.label}`,
    `Proof window: ${PROOF_WINDOW_LABEL}.`,
  ];
  if (limitations.length > 0) {
    reportLines.push("Limitations:");
    for (const l of limitations) {
      reportLines.push(`- ${l.text}`);
    }
  }
  reportLines.push(
    "This proof reflects sensor evidence visible to the current user.",
  );

  return {
    sensorProofStatus,
    tone,
    headline,
    liveRowProofLabel: live.label,
    auditProofLabel: audit.label,
    proofWindowLabel: PROOF_WINDOW_LABEL,
    limitations: Object.freeze(limitations),
    reportLines: Object.freeze(reportLines),
    operatorShortcutHref: OPERATOR_SHORTCUT_HREF,
    operatorShortcutLabel: OPERATOR_SHORTCUT_LABEL,
  };
}

/**
 * Extra markdown block to splice into the One-Tent Live Proof report.
 * Caller appends to the existing report markdown.
 */
export function buildOneTentSensorProofReportSection(
  vm: OneTentSensorProofViewModel,
): string {
  const md: string[] = [];
  md.push("## Sensor proof");
  for (const line of vm.reportLines) {
    md.push(line.startsWith("- ") ? line : `- ${line}`);
  }
  return md.join("\n");
}
