/**
 * sensorIngestAuditReportQueryParams — pure helpers that serialize and
 * parse the operator audit report's filter state from the URL.
 *
 * Hard constraints:
 *   - No I/O. No fetch. No Supabase.
 *   - Device/station search is sanitized: rejected entirely when it
 *     looks like a MAC, IP, JWT, Bearer token, passkey, or any other
 *     secret-like value.
 *   - Invalid params silently fall back to safe defaults. Never throws.
 *   - Caller is responsible for gating writes behind operator mode.
 */
import {
  AUDIT_REPORT_PAGE_SIZES,
  AUDIT_REPORT_DEFAULT_PAGE_SIZE,
  type AuditReportPageSize,
} from "@/lib/sensorIngestAuditReportRules";

export const AUDIT_URL_PARAM_PROVIDER = "audit_provider";
export const AUDIT_URL_PARAM_FROM = "audit_from";
export const AUDIT_URL_PARAM_TO = "audit_to";
export const AUDIT_URL_PARAM_DEVICE = "audit_q";
export const AUDIT_URL_PARAM_PAGE_SIZE = "audit_n";
export const AUDIT_URL_OPERATOR_PARAM = "operator";
export const AUDIT_URL_OPERATOR_VALUE = "1";

export const AUDIT_DEVICE_QUERY_MAX = 64;

export const AUDIT_URL_PARAMS = [
  AUDIT_URL_PARAM_PROVIDER,
  AUDIT_URL_PARAM_FROM,
  AUDIT_URL_PARAM_TO,
  AUDIT_URL_PARAM_DEVICE,
  AUDIT_URL_PARAM_PAGE_SIZE,
] as const;

// Same unsafe-shape heuristics used for raw payload/device display id.
const UNSAFE_DEVICE_QUERY_PATTERNS: RegExp[] = [
  /\b[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2}){5}\b/,
  /\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b/,
  /^[A-Fa-f0-9]{16,}$/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/,
  /Bearer\s+/i,
  /passkey/i,
  /token/i,
  /api[_-]?key/i,
];

export interface AuditUrlState {
  provider: string; // "all" or lowercased provider key
  fromDateInput: string; // "" or "YYYY-MM-DDTHH:mm"
  toDateInput: string;
  deviceQuery: string;
  pageSize: AuditReportPageSize;
}

export const AUDIT_URL_DEFAULT_STATE: AuditUrlState = {
  provider: "all",
  fromDateInput: "",
  toDateInput: "",
  deviceQuery: "",
  pageSize: AUDIT_REPORT_DEFAULT_PAGE_SIZE,
};

function isValidDatetimeLocal(v: string): boolean {
  // Accept YYYY-MM-DD or YYYY-MM-DDTHH:mm (optionally with seconds).
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v)) return false;
  const t = Date.parse(v.includes("T") ? v : `${v}T00:00:00`);
  return Number.isFinite(t);
}

export function isSafeDeviceQuery(raw: string): boolean {
  if (!raw) return true;
  if (raw.length > AUDIT_DEVICE_QUERY_MAX) return false;
  for (const re of UNSAFE_DEVICE_QUERY_PATTERNS) {
    if (re.test(raw)) return false;
  }
  return true;
}

export function hasAuditUrlState(params: URLSearchParams): boolean {
  return AUDIT_URL_PARAMS.some((key) => params.has(key));
}

export function parseAuditUrlState(
  params: URLSearchParams | Record<string, string | null | undefined>,
): AuditUrlState {
  const get = (k: string): string => {
    if (params instanceof URLSearchParams) return params.get(k) ?? "";
    const v = (params as Record<string, string | null | undefined>)[k];
    return typeof v === "string" ? v : "";
  };

  const providerRaw = get(AUDIT_URL_PARAM_PROVIDER).trim().toLowerCase();
  const provider = providerRaw && /^[a-z0-9_.-]{1,32}$/.test(providerRaw) ? providerRaw : "all";

  const fromRaw = get(AUDIT_URL_PARAM_FROM).trim();
  const toRaw = get(AUDIT_URL_PARAM_TO).trim();
  const fromDateInput = isValidDatetimeLocal(fromRaw) ? fromRaw : "";
  const toDateInput = isValidDatetimeLocal(toRaw) ? toRaw : "";

  const deviceRaw = get(AUDIT_URL_PARAM_DEVICE);
  const deviceQuery = isSafeDeviceQuery(deviceRaw) ? deviceRaw : "";

  const sizeNum = Number(get(AUDIT_URL_PARAM_PAGE_SIZE));
  const pageSize: AuditReportPageSize =
    (AUDIT_REPORT_PAGE_SIZES as ReadonlyArray<number>).includes(sizeNum)
      ? (sizeNum as AuditReportPageSize)
      : AUDIT_REPORT_DEFAULT_PAGE_SIZE;

  return { provider, fromDateInput, toDateInput, deviceQuery, pageSize };
}

/**
 * Serialize state into a flat record. Empty/default values are omitted
 * so URLs stay tidy. Unsafe device queries are dropped.
 */
export function serializeAuditUrlState(state: AuditUrlState): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.provider && state.provider !== "all") {
    out[AUDIT_URL_PARAM_PROVIDER] = state.provider.toLowerCase();
  }
  if (state.fromDateInput && isValidDatetimeLocal(state.fromDateInput)) {
    out[AUDIT_URL_PARAM_FROM] = state.fromDateInput;
  }
  if (state.toDateInput && isValidDatetimeLocal(state.toDateInput)) {
    out[AUDIT_URL_PARAM_TO] = state.toDateInput;
  }
  if (state.deviceQuery && isSafeDeviceQuery(state.deviceQuery)) {
    out[AUDIT_URL_PARAM_DEVICE] = state.deviceQuery;
  }
  if (state.pageSize !== AUDIT_REPORT_DEFAULT_PAGE_SIZE) {
    out[AUDIT_URL_PARAM_PAGE_SIZE] = String(state.pageSize);
  }
  return out;
}

/**
 * Apply audit state to an existing URLSearchParams, returning a NEW
 * instance with `operator=1` preserved. Other unrelated params pass
 * through untouched. Unsafe/empty values are deleted.
 */
export function applyAuditUrlState(
  current: URLSearchParams,
  state: AuditUrlState,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const desired = serializeAuditUrlState(state);

  for (const k of AUDIT_URL_PARAMS) {
    next.delete(k);
  }
  for (const [k, v] of Object.entries(desired)) {
    next.set(k, v);
  }
  // Operator mode flag is preserved (we copied `current`). If it was
  // already present we leave it; we never inject it on its own here.
  return next;
}

export function buildOperatorAuditSearchParams(
  current: URLSearchParams,
  state: AuditUrlState,
): URLSearchParams {
  const next = applyAuditUrlState(current, {
    ...state,
    deviceQuery: isSafeDeviceQuery(state.deviceQuery) ? state.deviceQuery : "",
  });
  next.set(AUDIT_URL_OPERATOR_PARAM, AUDIT_URL_OPERATOR_VALUE);
  return next;
}

export function buildOperatorAuditLink(input: {
  origin: string;
  pathname: string;
  currentSearchParams: URLSearchParams;
  state: AuditUrlState;
}): string {
  const next = buildOperatorAuditSearchParams(input.currentSearchParams, input.state);
  const query = next.toString();
  return `${input.origin}${input.pathname}${query ? `?${query}` : ""}`;
}
