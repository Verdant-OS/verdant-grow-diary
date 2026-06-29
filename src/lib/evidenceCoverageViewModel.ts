/**
 * evidenceCoverageViewModel — pure, deterministic view model for the
 * Evidence Coverage Panel v1 + Category Breakdown v1.
 *
 * Strict safety envelope:
 *  - Pure. No I/O. No React. No Supabase. No fetch.
 *  - Read-only diagnostics. Never infers missing evidence.
 *  - Counts only. No row IDs, no provider payloads,
 *    no tokens/prompts/completions, no model outputs.
 *
 * Inputs are row-like objects carrying the JSON column
 * `originating_timeline_events`. Classification is delegated to
 * {@link adaptOriginatingTimelineEventsColumn} so the panel mirrors the
 * exact rules used by EvidenceLinkageBadges.
 */
import {
  adaptOriginatingTimelineEventsColumn,
  FORBIDDEN_REF_FIELDS,
} from "@/lib/originatingTimelineEventAdapter";

export interface EvidenceCoverageRowInput {
  readonly originating_timeline_events?: unknown;
  /** Safe alert category label (e.g. "vpd", "temp"). */
  readonly metric?: unknown;
  /** Safe action category label (e.g. "adjust_vpd"). */
  readonly action_type?: unknown;
}

export interface EvidenceCoverageBucket {
  readonly total: number;
  readonly linked: number;
  readonly fallbackOnly: number;
  readonly invalidRefs: number;
  readonly linkedPct: number;
}

export interface EvidenceCoverageBreakdownRow {
  readonly label: string;
  readonly total: number;
  readonly linked: number;
  readonly fallbackOnly: number;
  readonly invalidRefs: number;
  readonly linkedPct: number;
}

export interface EvidenceCoverageViewModel {
  readonly alerts: EvidenceCoverageBucket;
  readonly actions: EvidenceCoverageBucket;
  readonly overall: EvidenceCoverageBucket;
  readonly alertsByCategory: readonly EvidenceCoverageBreakdownRow[];
  readonly actionsByCategory: readonly EvidenceCoverageBreakdownRow[];
  readonly notes: readonly string[];
}

const EMPTY_BUCKET: EvidenceCoverageBucket = Object.freeze({
  total: 0,
  linked: 0,
  fallbackOnly: 0,
  invalidRefs: 0,
  linkedPct: 0,
});

/** Factual diagnostic notes. No inference, no overclaiming. */
export const EVIDENCE_COVERAGE_NOTES: readonly string[] = Object.freeze([
  "Read-only evidence coverage.",
  "Fallback-only means no safe linked evidence refs were persisted.",
  "Invalid refs are ignored by the adapter and do not render badges.",
  "This panel does not infer missing evidence.",
]);

export const UNCATEGORIZED_LABEL = "Uncategorized" as const;

const FORBIDDEN_LABEL_TOKENS = [
  "raw_payload",
  "rawpayload",
  "payload",
  "service_role",
  "bridge_token",
  "api_token",
  "api_key",
  "access_token",
  "refresh_token",
  "jwt",
  "secret",
  "prompt",
  "completion",
  "model_output",
];

/** Conservative label sanitizer: short, alphanum + safe punctuation only. */
function normalizeLabel(raw: unknown): string {
  if (typeof raw !== "string") return UNCATEGORIZED_LABEL;
  const trimmed = raw.trim();
  if (!trimmed) return UNCATEGORIZED_LABEL;
  // Strip anything that isn't a safe label character.
  const safe = trimmed.replace(/[^A-Za-z0-9 _.\-]/g, "").slice(0, 48);
  if (!safe) return UNCATEGORIZED_LABEL;
  // Reject anything resembling a UUID or long opaque id.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(safe)) return UNCATEGORIZED_LABEL;
  if (/^[A-Za-z0-9]{24,}$/.test(safe)) return UNCATEGORIZED_LABEL;
  const lower = safe.toLowerCase();
  for (const tok of FORBIDDEN_LABEL_TOKENS) {
    if (lower.includes(tok)) return UNCATEGORIZED_LABEL;
  }
  return safe;
}

function hasRawRefs(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  return true;
}

function classifyRow(row: EvidenceCoverageRowInput): {
  linked: boolean;
  fallbackOnly: boolean;
  invalidRefs: boolean;
} {
  const raw = row?.originating_timeline_events;
  const safeRefs = adaptOriginatingTimelineEventsColumn(raw);
  if (safeRefs.length > 0) {
    return { linked: true, fallbackOnly: false, invalidRefs: false };
  }
  if (hasRawRefs(raw)) {
    return { linked: false, fallbackOnly: true, invalidRefs: true };
  }
  return { linked: false, fallbackOnly: true, invalidRefs: false };
}

function roundPct(linked: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((linked / total) * 100);
}

function bucketFor(rows: readonly EvidenceCoverageRowInput[] | null | undefined): EvidenceCoverageBucket {
  if (!Array.isArray(rows) || rows.length === 0) return EMPTY_BUCKET;
  let linked = 0;
  let fallbackOnly = 0;
  let invalidRefs = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      fallbackOnly += 1;
      continue;
    }
    const c = classifyRow(row);
    if (c.linked) linked += 1;
    if (c.fallbackOnly) fallbackOnly += 1;
    if (c.invalidRefs) invalidRefs += 1;
  }
  const total = rows.length;
  return {
    total,
    linked,
    fallbackOnly,
    invalidRefs,
    linkedPct: roundPct(linked, total),
  };
}

function combine(a: EvidenceCoverageBucket, b: EvidenceCoverageBucket): EvidenceCoverageBucket {
  const total = a.total + b.total;
  const linked = a.linked + b.linked;
  const fallbackOnly = a.fallbackOnly + b.fallbackOnly;
  const invalidRefs = a.invalidRefs + b.invalidRefs;
  return {
    total,
    linked,
    fallbackOnly,
    invalidRefs,
    linkedPct: roundPct(linked, total),
  };
}

function breakdownFor(
  rows: readonly EvidenceCoverageRowInput[] | null | undefined,
  labelKey: "metric" | "action_type",
): EvidenceCoverageBreakdownRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const acc = new Map<
    string,
    { total: number; linked: number; fallbackOnly: number; invalidRefs: number }
  >();
  for (const row of rows) {
    const label = normalizeLabel(
      row && typeof row === "object" ? (row as Record<string, unknown>)[labelKey] : null,
    );
    const cur = acc.get(label) ?? {
      total: 0,
      linked: 0,
      fallbackOnly: 0,
      invalidRefs: 0,
    };
    cur.total += 1;
    if (!row || typeof row !== "object") {
      cur.fallbackOnly += 1;
    } else {
      const c = classifyRow(row);
      if (c.linked) cur.linked += 1;
      if (c.fallbackOnly) cur.fallbackOnly += 1;
      if (c.invalidRefs) cur.invalidRefs += 1;
    }
    acc.set(label, cur);
  }
  const out: EvidenceCoverageBreakdownRow[] = [];
  for (const [label, v] of acc) {
    out.push({
      label,
      total: v.total,
      linked: v.linked,
      fallbackOnly: v.fallbackOnly,
      invalidRefs: v.invalidRefs,
      linkedPct: roundPct(v.linked, v.total),
    });
  }
  out.sort((a, b) => {
    if (a.fallbackOnly !== b.fallbackOnly) return b.fallbackOnly - a.fallbackOnly;
    if (a.invalidRefs !== b.invalidRefs) return b.invalidRefs - a.invalidRefs;
    if (a.total !== b.total) return b.total - a.total;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
  return out;
}

export interface BuildEvidenceCoverageInput {
  readonly alerts?: readonly EvidenceCoverageRowInput[] | null;
  readonly actions?: readonly EvidenceCoverageRowInput[] | null;
}

export function buildEvidenceCoverageViewModel(
  input: BuildEvidenceCoverageInput,
): EvidenceCoverageViewModel {
  const alerts = bucketFor(input?.alerts ?? null);
  const actions = bucketFor(input?.actions ?? null);
  const overall = combine(alerts, actions);
  const alertsByCategory = breakdownFor(input?.alerts ?? null, "metric");
  const actionsByCategory = breakdownFor(input?.actions ?? null, "action_type");
  return {
    alerts,
    actions,
    overall,
    alertsByCategory,
    actionsByCategory,
    notes: EVIDENCE_COVERAGE_NOTES,
  };
}

export const EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL: EvidenceCoverageViewModel = Object.freeze({
  alerts: EMPTY_BUCKET,
  actions: EMPTY_BUCKET,
  overall: EMPTY_BUCKET,
  alertsByCategory: Object.freeze([]) as readonly EvidenceCoverageBreakdownRow[],
  actionsByCategory: Object.freeze([]) as readonly EvidenceCoverageBreakdownRow[],
  notes: EVIDENCE_COVERAGE_NOTES,
});
