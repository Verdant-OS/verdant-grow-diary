/**
 * diaryEntryAuditFormatting — pure helpers for rendering diary audit rows.
 * No React, no clock reads, no Supabase. Injectable formatting only.
 */
import type { DiaryEntryAuditFieldChange, DiaryEntryAuditRow } from "@/hooks/useDiaryEntryAuditTrail";

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  note: "Note",
  photo_url: "Photo",
  stage: "Stage",
  entry_at: "Entry time",
  grow_id: "Grow",
  plant_id: "Plant",
  tent_id: "Tent",
  details: "Details",
};

export function formatAuditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABELS[field] ?? field;
}

/**
 * Render an audit field value for display. Never invents a value:
 * null/undefined always render as "—".
 */
export function formatAuditFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length === 0 ? "—" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface AuditFieldChangeRow {
  field: string;
  label: string;
  from: string;
  to: string;
}

export function buildFieldChangeRows(
  changed_fields: Record<string, DiaryEntryAuditFieldChange> | null | undefined,
): AuditFieldChangeRow[] {
  if (!changed_fields) return [];
  return Object.entries(changed_fields)
    .map(([field, change]) => ({
      field,
      label: formatAuditFieldLabel(field),
      from: formatAuditFieldValue(change?.from),
      to: formatAuditFieldValue(change?.to),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function summarizeAuditRow(row: DiaryEntryAuditRow): string {
  if (row.action === "delete") return "Entry deleted";
  const count = Object.keys(row.changed_fields ?? {}).length;
  if (count === 0) return "Entry updated";
  if (count === 1) return "1 field edited";
  return `${count} fields edited`;
}
