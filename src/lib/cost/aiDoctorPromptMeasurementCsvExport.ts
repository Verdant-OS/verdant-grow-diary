/**
 * aiDoctorPromptMeasurementCsvExport — pure CSV serializer for captured
 * AI Doctor prompt measurements.
 *
 * Hard rules:
 *  - Deterministic column order.
 *  - No prompt text, no diary content, no raw provider response.
 *  - Safe CSV escaping for commas, quotes, newlines.
 *  - Arrays rendered pipe-delimited.
 *  - Empty/null/undefined → blank cell.
 */

import type { CapturedAiDoctorPromptMeasurement } from "./aiDoctorPromptMeasurementCaptureStore";
import {
  assertExportHeadersSafe,
  assertExportSafe,
} from "../exportRedactionRules";

export const AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS = [
  "recordedAt",
  "promptName",
  "domain",
  "status",
  "errorCode",
  "summaryByteSize",
  "estimatedPromptTokens",
  "providerPromptTokens",
  "providerCompletionTokens",
  "providerTotalTokens",
  "rawHistoryFallback",
  "rawHistoryEventCount",
  "staleSummaryUsed",
  "missingSummaryUsed",
  "summaryErrored",
  "includedWindows",
  "sourceTags",
] as const;

export type AiDoctorPromptMeasurementCsvColumn =
  (typeof AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS)[number];

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "boolean") s = value ? "true" : "false";
  else if (typeof value === "number") s = Number.isFinite(value) ? String(value) : "";
  else s = String(value);
  if (s === "") return "";
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function pipeJoin(arr: readonly string[] | undefined): string {
  if (!arr || arr.length === 0) return "";
  return arr.map((v) => String(v).replace(/\|/g, "/")).join("|");
}

function rowFor(c: CapturedAiDoctorPromptMeasurement): readonly unknown[] {
  const m = c.measurement;
  const meta = c.metadata;
  const ptk = m.providerReportedTokens;
  return [
    m.recordedAt,
    m.promptName,
    m.domain,
    m.status,
    m.errorCode ?? "",
    m.summaryByteSize,
    m.estimatedPromptTokens,
    ptk ? ptk.promptTokens : null,
    ptk ? ptk.completionTokens : null,
    ptk ? ptk.totalTokens : null,
    m.rawHistoryFallback,
    meta.rawHistoryEventCount,
    meta.staleSummaryUsed,
    meta.missingSummaryUsed,
    meta.summaryErrored,
    pipeJoin(meta.includedWindows),
    pipeJoin(meta.sourceTags),
  ];
}

/** Serialize captured measurements to a CSV string. Header always present. */
export function serializeAiDoctorPromptMeasurementsToCsv(
  captured: readonly CapturedAiDoctorPromptMeasurement[],
): string {
  assertExportHeadersSafe(
    AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS,
    "ai-doctor-prompt-measurement-csv",
  );
  const header = AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS.join(",");
  const lines = [header];
  for (const c of captured) {
    lines.push(rowFor(c).map(escapeCell).join(","));
  }
  const out = lines.join("\n") + "\n";
  assertExportSafe(out, "ai-doctor-prompt-measurement-csv");
  return out;
}

export const AI_DOCTOR_PROMPT_MEASUREMENT_CSV_FILENAME =
  "verdant-ai-doctor-prompt-measurements.csv";
