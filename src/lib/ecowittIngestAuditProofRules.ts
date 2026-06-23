/**
 * ecowittIngestAuditProofRules — pure helpers for the read-only
 * EcoWitt Ingest Audit Proof surface.
 *
 * Hard constraints:
 *  - Pure, deterministic, no I/O, no React, no Supabase.
 *  - Never echoes user_id, bridge_token_id, MACs, raw payloads,
 *    or private env values; consumes only the narrow audit-counts
 *    column allowlist.
 *  - Counts and timestamps are scoped to the current proof window.
 *  - Never classifies missing audit proof as healthy.
 */

export const ECOWITT_AUDIT_PROOF_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ECOWITT_AUDIT_PROOF_WINDOW_LABEL = "last 24 hours";

export type EcowittIngestAuditProofStatus =
  | "loaded"
  | "no_audit_rows"
  | "unavailable"
  | "blocked"
  | "loading"
  | "error";

export type EcowittIngestAuditProofTone = "ok" | "warn" | "neutral";

/**
 * Narrow input row shape — only the audit-counts columns are consumed.
 * Private identifiers (user_id, bridge_token_id) are intentionally NOT
 * part of this shape so they cannot accidentally flow into rendering.
 */
export interface EcowittIngestAuditProofRow {
  source?: string | null;
  tent_id?: string | null;
  rows_received?: number | null;
  rows_inserted?: number | null;
  captured_at?: string | null;
  created_at?: string | null;
}

export interface BuildEcowittIngestAuditProofInput {
  status: EcowittIngestAuditProofStatus;
  tentId: string | null | undefined;
  /** Wall-clock; injectable for deterministic tests. */
  now?: Date;
}

export interface EcowittIngestAuditProofViewModel {
  status: EcowittIngestAuditProofStatus;
  tone: EcowittIngestAuditProofTone;
  headline: string;
  detail: string;
  windowLabel: string;
  receivedCount: number;
  insertedCount: number;
  rejectedCount: number;
  lastAcceptedAt: string | null;
  lastRejectedAt: string | null;
  /** True when rejected/omitted rows were observed in window. */
  hasRejected: boolean;
}

const EMPTY_COUNTS = {
  receivedCount: 0,
  insertedCount: 0,
  rejectedCount: 0,
  lastAcceptedAt: null as string | null,
  lastRejectedAt: null as string | null,
};

function toFiniteNonNegative(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

function isEcowittSource(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toLowerCase() === "ecowitt";
}

/**
 * Build the audit-proof view model. Pure.
 *
 * - When status is not "loaded", returns the appropriate empty/unavailable
 *   shape without inspecting rows.
 * - When status is "loaded", filters rows to EcoWitt source + current tent
 *   + current proof window before computing counts.
 */
export function buildEcowittIngestAuditProof(
  rows: readonly EcowittIngestAuditProofRow[] | null | undefined,
  input: BuildEcowittIngestAuditProofInput,
): EcowittIngestAuditProofViewModel {
  const tentId = input.tentId ?? null;
  const status = input.status;
  const windowLabel = ECOWITT_AUDIT_PROOF_WINDOW_LABEL;

  if (status === "loading") {
    return {
      status,
      tone: "neutral",
      headline: "Loading EcoWitt ingest audit proof…",
      detail: "This proof reflects ingest audit rows visible to the current user.",
      windowLabel,
      ...EMPTY_COUNTS,
      hasRejected: false,
    };
  }
  if (status === "unavailable" || !tentId) {
    return {
      status: "unavailable",
      tone: "neutral",
      headline: "EcoWitt ingest audit proof unavailable",
      detail: "Audit proof unavailable with current read permissions.",
      windowLabel,
      ...EMPTY_COUNTS,
      hasRejected: false,
    };
  }
  if (status === "blocked") {
    return {
      status,
      tone: "neutral",
      headline: "EcoWitt ingest audit proof unavailable",
      detail: "Audit proof unavailable with current read permissions.",
      windowLabel,
      ...EMPTY_COUNTS,
      hasRejected: false,
    };
  }
  if (status === "error") {
    return {
      status,
      tone: "warn",
      headline: "EcoWitt ingest audit proof unavailable",
      detail: "Audit proof unavailable with current read permissions.",
      windowLabel,
      ...EMPTY_COUNTS,
      hasRejected: false,
    };
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const windowStart = nowMs - ECOWITT_AUDIT_PROOF_WINDOW_MS;

  const safeRows = Array.isArray(rows) ? rows : [];
  const scoped = safeRows.filter((r) => {
    if (!r || typeof r !== "object") return false;
    if (!isEcowittSource(r.source)) return false;
    if ((r.tent_id ?? null) !== tentId) return false;
    const ms = parseMs(r.created_at) ?? parseMs(r.captured_at);
    if (ms === null) return false;
    return ms >= windowStart && ms <= nowMs + 60_000;
  });

  if (scoped.length === 0) {
    return {
      status: "no_audit_rows",
      tone: "neutral",
      headline: "No EcoWitt ingest audit rows in the current proof window",
      detail: "No EcoWitt ingest audit rows found in the current proof window.",
      windowLabel,
      ...EMPTY_COUNTS,
      hasRejected: false,
    };
  }

  let received = 0;
  let inserted = 0;
  let rejected = 0;
  let lastAcceptedMs: number | null = null;
  let lastAcceptedIso: string | null = null;
  let lastRejectedMs: number | null = null;
  let lastRejectedIso: string | null = null;

  for (const r of scoped) {
    const rec = toFiniteNonNegative(r.rows_received);
    const ins = toFiniteNonNegative(r.rows_inserted);
    const rej = Math.max(0, rec - ins);
    received += rec;
    inserted += ins;
    rejected += rej;

    const tsIso = r.created_at ?? r.captured_at ?? null;
    const tsMs = parseMs(tsIso);
    if (tsMs === null || !tsIso) continue;
    if (ins > 0 && (lastAcceptedMs === null || tsMs > lastAcceptedMs)) {
      lastAcceptedMs = tsMs;
      lastAcceptedIso = tsIso;
    }
    if (rej > 0 && (lastRejectedMs === null || tsMs > lastRejectedMs)) {
      lastRejectedMs = tsMs;
      lastRejectedIso = tsIso;
    }
  }

  const hasRejected = rejected > 0;
  const tone: EcowittIngestAuditProofTone = hasRejected
    ? "warn"
    : inserted > 0
      ? "ok"
      : "neutral";

  const headline = hasRejected
    ? "EcoWitt ingest audit shows rejected or omitted rows"
    : inserted > 0
      ? "EcoWitt ingest audit proof loaded"
      : "EcoWitt ingest audit rows observed";

  const detail = hasRejected
    ? "Rejected or omitted rows were recorded in the current proof window."
    : "Audit proof loaded for the current proof window.";

  return {
    status: "loaded",
    tone,
    headline,
    detail,
    windowLabel,
    receivedCount: received,
    insertedCount: inserted,
    rejectedCount: rejected,
    lastAcceptedAt: lastAcceptedIso,
    lastRejectedAt: lastRejectedIso,
    hasRejected,
  };
}
