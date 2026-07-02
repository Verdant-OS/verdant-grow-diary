/**
 * actionQueueUrlStateRules — pure helpers that parse and serialize the
 * /actions URL query state (search, status filter, trace filter, page,
 * page size).
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Safe parsing with defaults. Invalid values never throw and never
 *    leak into UI state.
 *  - URL never carries raw payload bytes, UUIDs from internal back-pointer
 *    tokens, service keys, bridge tokens, or hidden metadata. The only
 *    user-supplied value persisted is the search query, capped at a
 *    short length.
 *  - Default values are NOT written to the URL so a fresh /actions stays
 *    clean.
 */

import {
  ACTION_QUEUE_DEFAULT_PAGE,
  ACTION_QUEUE_DEFAULT_PAGE_SIZE,
  ACTION_QUEUE_PAGE_SIZE_OPTIONS,
  clampPageSize,
  type ActionQueuePageSize,
} from "@/lib/actionQueuePaginationRules";

export type ActionQueueStatusUrlValue =
  | "all"
  | "pending"
  | "simulated"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export type ActionQueueTraceUrlValue = "all" | "failed";

export interface ActionQueueUrlState {
  q: string;
  status: ActionQueueStatusUrlValue;
  trace: ActionQueueTraceUrlValue;
  page: number;
  pageSize: ActionQueuePageSize;
}

export const ACTION_QUEUE_URL_DEFAULTS: ActionQueueUrlState = {
  q: "",
  status: "all",
  trace: "all",
  page: ACTION_QUEUE_DEFAULT_PAGE,
  pageSize: ACTION_QUEUE_DEFAULT_PAGE_SIZE,
};

const STATUS_VALUES: readonly ActionQueueStatusUrlValue[] = [
  "all",
  "pending",
  "simulated",
  "approved",
  "rejected",
  "completed",
  "cancelled",
];

const TRACE_VALUES: readonly ActionQueueTraceUrlValue[] = ["all", "failed"];

/** Max characters persisted from the search box. Prevents URL bloat. */
export const ACTION_QUEUE_URL_QUERY_MAX_LEN = 80;

export const ACTION_QUEUE_URL_KEYS = {
  q: "q",
  status: "status",
  trace: "trace",
  page: "page",
  pageSize: "pageSize",
} as const;

function safeStatus(raw: string | null): ActionQueueStatusUrlValue {
  if (raw && (STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as ActionQueueStatusUrlValue;
  }
  return ACTION_QUEUE_URL_DEFAULTS.status;
}

function safeTrace(raw: string | null): ActionQueueTraceUrlValue {
  if (raw && (TRACE_VALUES as readonly string[]).includes(raw)) {
    return raw as ActionQueueTraceUrlValue;
  }
  return ACTION_QUEUE_URL_DEFAULTS.trace;
}

function safePageSize(raw: string | null): ActionQueuePageSize {
  if (raw == null) return ACTION_QUEUE_URL_DEFAULTS.pageSize;
  const n = Number.parseInt(raw, 10);
  return clampPageSize(n);
}

function safePage(raw: string | null): number {
  if (raw == null) return ACTION_QUEUE_URL_DEFAULTS.page;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return ACTION_QUEUE_URL_DEFAULTS.page;
  return n;
}

/* eslint-disable no-control-regex -- safeQuery deliberately matches C0 control chars + DEL to strip them from the query string */
function safeQuery(raw: string | null): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, ACTION_QUEUE_URL_QUERY_MAX_LEN);
  return trimmed;
}
/* eslint-enable no-control-regex */

/**
 * Parse a URLSearchParams-like instance into the deterministic
 * `ActionQueueUrlState`. Other params present in the URL are ignored
 * (preserved by callers via the original params object).
 */
export function parseActionQueueUrlState(
  params: URLSearchParams | null | undefined,
): ActionQueueUrlState {
  if (!params) return { ...ACTION_QUEUE_URL_DEFAULTS };
  return {
    q: safeQuery(params.get(ACTION_QUEUE_URL_KEYS.q)),
    status: safeStatus(params.get(ACTION_QUEUE_URL_KEYS.status)),
    trace: safeTrace(params.get(ACTION_QUEUE_URL_KEYS.trace)),
    page: safePage(params.get(ACTION_QUEUE_URL_KEYS.page)),
    pageSize: safePageSize(params.get(ACTION_QUEUE_URL_KEYS.pageSize)),
  };
}

/**
 * Write the state into a copy of the provided params, deleting keys
 * that match defaults so a clean /actions stays clean. Other params
 * on the input are preserved untouched.
 */
export function serializeActionQueueUrlState(
  base: URLSearchParams,
  state: ActionQueueUrlState,
): URLSearchParams {
  const out = new URLSearchParams(base);
  const setOrDelete = (key: string, value: string, def: string) => {
    if (value === def || value === "") out.delete(key);
    else out.set(key, value);
  };
  setOrDelete(ACTION_QUEUE_URL_KEYS.q, state.q, ACTION_QUEUE_URL_DEFAULTS.q);
  setOrDelete(
    ACTION_QUEUE_URL_KEYS.status,
    state.status,
    ACTION_QUEUE_URL_DEFAULTS.status,
  );
  setOrDelete(
    ACTION_QUEUE_URL_KEYS.trace,
    state.trace,
    ACTION_QUEUE_URL_DEFAULTS.trace,
  );
  const pageStr = String(state.page);
  setOrDelete(
    ACTION_QUEUE_URL_KEYS.page,
    pageStr,
    String(ACTION_QUEUE_URL_DEFAULTS.page),
  );
  const sizeStr = String(state.pageSize);
  setOrDelete(
    ACTION_QUEUE_URL_KEYS.pageSize,
    sizeStr,
    String(ACTION_QUEUE_URL_DEFAULTS.pageSize),
  );
  return out;
}

export function isValidPageSizeChoice(n: number): boolean {
  return (ACTION_QUEUE_PAGE_SIZE_OPTIONS as readonly number[]).includes(n);
}
