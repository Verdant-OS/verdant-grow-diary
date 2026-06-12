/**
 * aiDoctorCheckInReceiptView — pure plain-text receipt formatter for the
 * AI Doctor Check-In preview.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no fetch, no clipboard access.
 *  - Deterministic for a given viewModel + timestamp.
 *  - Never includes secrets, tokens, raw payloads, or internal env values.
 *  - Source note is always appended.
 */
import type { AiDoctorCheckInPreviewView } from "./aiDoctorCheckInPreviewViewModel";

export interface AiDoctorCheckInReceiptInput {
  view: AiDoctorCheckInPreviewView;
  plantName?: string | null;
  plantId?: string | null;
  stage?: string | null;
  now?: Date;
}

export interface AiDoctorCheckInReceiptOutput {
  title: string;
  generatedAt: string;
  plantName: string | null;
  plantId: string | null;
  stage: string | null;
  body: string;
}

export function formatAiDoctorCheckInReceipt(
  input: AiDoctorCheckInReceiptInput,
): AiDoctorCheckInReceiptOutput {
  const view = input.view;
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();

  const lines: string[] = [];
  lines.push("AI Doctor Check-In Preview");
  lines.push("=".repeat(40));
  lines.push(`Generated: ${generatedAt}`);

  if (input.plantName) {
    lines.push(`Plant: ${input.plantName}`);
  }
  if (input.plantId) {
    lines.push(`Plant ID: ${input.plantId}`);
  }
  if (input.stage) {
    lines.push(`Stage: ${input.stage}`);
  }

  lines.push("");
  lines.push("Summary");
  lines.push("-".repeat(20));
  lines.push(view.summary);

  if (view.likelyIssue) {
    lines.push("");
    lines.push("Likely Issue");
    lines.push("-".repeat(20));
    lines.push(view.likelyIssue);
  }

  lines.push("");
  lines.push(`Confidence: ${view.confidenceBand} (${view.confidence.toFixed(2)})`);

  lines.push("");
  lines.push("Evidence");
  lines.push("-".repeat(20));
  if (view.evidence.length > 0) {
    for (const item of view.evidence) {
      lines.push(`• ${item}`);
    }
  } else {
    lines.push("No evidence collected for this preview.");
  }

  lines.push("");
  lines.push("Missing Information");
  lines.push("-".repeat(20));
  if (view.missingInformation.length > 0) {
    for (const item of view.missingInformation) {
      lines.push(`• ${item}`);
    }
  } else {
    lines.push("No critical missing information detected.");
  }

  lines.push("");
  lines.push("Immediate Action");
  lines.push("-".repeat(20));
  lines.push(view.immediateAction);

  lines.push("");
  lines.push("What Not To Do");
  lines.push("-".repeat(20));
  if (view.whatNotToDo.length > 0) {
    for (const item of view.whatNotToDo) {
      lines.push(`• ${item}`);
    }
  } else {
    lines.push("—");
  }

  lines.push("");
  lines.push("24-Hour Follow-Up");
  lines.push("-".repeat(20));
  lines.push(view.followUp24h);

  lines.push("");
  lines.push("3-Day Recovery Plan");
  lines.push("-".repeat(20));
  lines.push(view.recoveryPlan3Day);

  lines.push("");
  lines.push(`Risk Level: ${view.riskLevel}`);

  lines.push("");
  lines.push("-".repeat(40));
  lines.push("Preview only — not saved.");
  lines.push("No live AI model was called.");

  return {
    title: "AI Doctor Check-In Preview",
    generatedAt,
    plantName: input.plantName ?? null,
    plantId: input.plantId ?? null,
    stage: input.stage ?? null,
    body: lines.join("\n"),
  };
}
