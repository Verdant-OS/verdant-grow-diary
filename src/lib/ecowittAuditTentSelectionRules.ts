/**
 * ecowittAuditTentSelectionRules — pure helpers for the EcoWitt ingest
 * audit page tent selection (URL <-> state) and the local dev-sender
 * command builder.
 *
 * Safety:
 *   - Pure, deterministic, no React, no I/O, no Supabase imports.
 *   - No fake live data. Returns null when context is missing.
 *   - Operator-safe fallback copy when the requested tent is invalid.
 */

export const ECOWITT_AUDIT_TENT_QUERY_PARAM = "tentId";

export const ECOWITT_AUDIT_INVALID_TENT_COPY =
  "The requested tent could not be selected. Choose a tent to view EcoWitt ingest evidence.";
export const ECOWITT_AUDIT_EMPTY_FOR_TENT_COPY =
  "No EcoWitt ingest records found for the selected tent.";

const MAX_TENT_ID_LENGTH = 200;

export interface EcowittAuditAvailableTent {
  id: string;
}

function normalizeTentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_TENT_ID_LENGTH) return null;
  return trimmed;
}

function toSearchParams(
  search: string | URLSearchParams | null | undefined,
): URLSearchParams {
  if (search == null) return new URLSearchParams();
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  try {
    return new URLSearchParams(search);
  } catch {
    return new URLSearchParams();
  }
}

export function readEcowittAuditTentIdFromSearch(
  search: string | URLSearchParams | null | undefined,
): string | null {
  const params = toSearchParams(search);
  return normalizeTentId(params.get(ECOWITT_AUDIT_TENT_QUERY_PARAM));
}

/** Returns a new URLSearchParams with `tentId` set/removed; preserves other params. */
export function applyEcowittAuditTentIdToSearch(
  search: string | URLSearchParams | null | undefined,
  tentId: string | null | undefined,
): URLSearchParams {
  const next = toSearchParams(search);
  const normalized = normalizeTentId(tentId);
  if (normalized == null) {
    next.delete(ECOWITT_AUDIT_TENT_QUERY_PARAM);
  } else {
    next.set(ECOWITT_AUDIT_TENT_QUERY_PARAM, normalized);
  }
  return next;
}

export type EcowittAuditSelectionSource =
  | "url"
  | "default-first-tent"
  | "none";

export interface EcowittAuditTentSelection {
  selectedTentId: string | null;
  source: EcowittAuditSelectionSource;
  /** True when ?tentId=<x> was provided but did not match an available tent. */
  invalidRequested: boolean;
  /** Operator-safe copy to render when the requested tent was invalid. */
  invalidCopy: string | null;
}

export interface ResolveEcowittAuditSelectedTentInput {
  urlTentId: string | null;
  availableTents: ReadonlyArray<EcowittAuditAvailableTent>;
  /**
   * Optional explicit user selection (after dropdown change). Wins over
   * URL when present and valid.
   */
  userSelectedTentId?: string | null;
}

/**
 * Deterministic tent resolution for the EcoWitt audit page.
 *
 * Precedence:
 *   1. Explicit user selection (if valid).
 *   2. URL tentId (if valid).
 *   3. First available tent.
 *   4. None.
 *
 * Never silently swaps an invalid URL tentId for another tent without
 * flagging `invalidRequested` so the UI can disclose the fallback.
 */
export function resolveEcowittAuditSelectedTent(
  input: ResolveEcowittAuditSelectedTentInput,
): EcowittAuditTentSelection {
  const tents = Array.isArray(input.availableTents) ? input.availableTents : [];
  const isAvailable = (id: string | null): boolean =>
    !!id && tents.some((t) => t && t.id === id);

  const userId = normalizeTentId(input.userSelectedTentId);
  if (userId && isAvailable(userId)) {
    return {
      selectedTentId: userId,
      source: "url",
      invalidRequested: false,
      invalidCopy: null,
    };
  }

  const urlId = normalizeTentId(input.urlTentId);
  if (urlId && isAvailable(urlId)) {
    return {
      selectedTentId: urlId,
      source: "url",
      invalidRequested: false,
      invalidCopy: null,
    };
  }

  const invalidRequested = urlId != null && !isAvailable(urlId);

  if (tents.length > 0) {
    return {
      selectedTentId: tents[0].id,
      source: "default-first-tent",
      invalidRequested,
      invalidCopy: invalidRequested ? ECOWITT_AUDIT_INVALID_TENT_COPY : null,
    };
  }

  return {
    selectedTentId: null,
    source: "none",
    invalidRequested,
    invalidCopy: invalidRequested ? ECOWITT_AUDIT_INVALID_TENT_COPY : null,
  };
}

/** Build the EcoWitt audit deep-link path for a given tent id. */
export function buildEcowittAuditHref(tentId: string | null | undefined): string {
  const normalized = normalizeTentId(tentId);
  if (!normalized) return "/sensors/ecowitt-audit";
  const params = new URLSearchParams();
  params.set(ECOWITT_AUDIT_TENT_QUERY_PARAM, normalized);
  return `/sensors/ecowitt-audit?${params.toString()}`;
}

/**
 * Build a tent-scoped dev sender command. The script reads `VERDANT_TENT_ID`
 * from env, so prepending it scopes the copied command to the selected tent.
 *
 * Falls back to the unscoped command when no tent id is provided so the
 * operator always sees something safe to run.
 */
export function buildEcowittAuditDevSenderCommand(
  baseCommand: string,
  tentId: string | null | undefined,
): string {
  const trimmedBase = typeof baseCommand === "string" ? baseCommand.trim() : "";
  if (!trimmedBase) return "";
  const normalized = normalizeTentId(tentId);
  if (!normalized) return trimmedBase;
  return `VERDANT_TENT_ID=${normalized} ${trimmedBase}`;
}
