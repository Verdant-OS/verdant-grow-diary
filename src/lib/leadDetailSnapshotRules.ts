/**
 * Pure logic for the read-only Lead Detail Snapshot Card.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Composes outputs of the existing rule modules into a single view model.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import {
  recommendNextAction,
  type LeadNextAction,
} from "@/lib/leadNextActionRules";
import {
  scoreLeadQuality,
  type LeadQualityScore,
} from "@/lib/leadQualityScoreRules";
import { buildLeadActivityTimeline } from "@/lib/leadActivityRules";

export interface LeadDetailSnapshot {
  leadId: string;
  /** Trimmed lead name, falling back to email, then to "Unknown lead". */
  displayName: string;
  status: string;
  statusKnown: boolean;
  source: string;
  sourceKnown: boolean;
  leadType: string;
  leadTypeKnown: boolean;
  createdLabel: string;
  createdValid: boolean;
  nextAction: LeadNextAction;
  quality: LeadQualityScore;
  activityCount: number;
  warnings: string[];
  /** Indicates the snapshot was built from an empty/invalid lead input. */
  isFallback: boolean;
}

const KNOWN_STATUSES = new Set([
  "new",
  "reviewed",
  "contacted",
  "follow_up",
  "closed",
  "spam",
]);

function isMeaningful(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function safeName(lead: LeadRow): string {
  const n = lead.name?.trim();
  if (n) return n;
  const e = typeof lead.email === "string" ? lead.email.trim() : "";
  if (e) return e;
  return "Unknown lead";
}

function formatDateLabel(iso: string | null | undefined): {
  label: string;
  valid: boolean;
} {
  if (!iso) return { label: "Unknown date", valid: false };
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return { label: "Invalid date", valid: false };
  return { label: new Date(t).toISOString().slice(0, 10), valid: true };
}

function fallbackLead(id: string): LeadRow {
  return {
    id,
    created_at: "",
    updated_at: null,
    name: null,
    email: "",
    company: null,
    role: null,
    lead_type: "",
    source: "",
    message: null,
    status: "" as unknown as LeadRow["status"],
    operator_notes: null,
    contacted_at: null,
    follow_up_at: null,
  };
}

/**
 * Build the read-only snapshot view model for a single lead.
 *
 * Deterministic: same input always yields the same output (no Date.now()
 * unless `now` is supplied; tests pass a fixed `now`).
 *
 * When `lead` is null/undefined, returns a clearly labelled fallback
 * snapshot rather than throwing.
 */
export function buildLeadDetailSnapshot(
  lead: LeadRow | null | undefined,
  now: number = Date.now(),
): LeadDetailSnapshot {
  const isFallback = !lead;
  const source = lead ?? fallbackLead("unknown");

  const statusRaw = (source.status ?? "") as string;
  const statusKnown = KNOWN_STATUSES.has(statusRaw);
  const sourceKnown = isMeaningful(source.source);
  const leadTypeKnown = isMeaningful(source.lead_type);
  const { label: createdLabel, valid: createdValid } = formatDateLabel(
    source.created_at,
  );

  const nextAction = recommendNextAction(source, now);
  const quality = scoreLeadQuality(source, now);
  const activityCount = buildLeadActivityTimeline(source).length;

  const warnings: string[] = [];
  if (isFallback) warnings.push("No lead selected");
  if (!statusKnown) warnings.push("Unknown or missing status");
  if (!sourceKnown) warnings.push("Missing source");
  if (!leadTypeKnown) warnings.push("Missing lead type");
  if (!createdValid) warnings.push("Missing or invalid created_at");
  if (!isMeaningful(source.name) && !isFallback)
    warnings.push("Missing name");

  return {
    leadId: source.id,
    displayName: isFallback ? "No lead selected" : safeName(source),
    status: statusKnown ? statusRaw : "unknown",
    statusKnown,
    source: sourceKnown ? (source.source as string).trim() : "unknown",
    sourceKnown,
    leadType: leadTypeKnown ? (source.lead_type as string).trim() : "unknown",
    leadTypeKnown,
    createdLabel,
    createdValid,
    nextAction,
    quality,
    activityCount,
    warnings,
    isFallback,
  };
}
