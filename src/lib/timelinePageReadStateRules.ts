/**
 * Pure read-state rules for the global Timeline page.
 *
 * The page reads two required plant-memory sources (`diary_entries` and
 * `grow_events`) plus a few supplemental sources. A successful response is
 * safe to render only when it belongs to the exact active owner/grow/date
 * scope. Results from the previous scope must never unlock Timeline content
 * or the Timeline -> Sensors continuation while a new scope is loading.
 */

export const TIMELINE_CORE_READ_SOURCES = ["diary_entries", "grow_events"] as const;

export const TIMELINE_SUPPLEMENTAL_READ_SOURCES = [
  "diary_photos",
  "action_queue_events",
  "alert_events",
] as const;

export type TimelineCoreReadSource = (typeof TIMELINE_CORE_READ_SOURCES)[number];
export type TimelineSupplementalReadSource = (typeof TIMELINE_SUPPLEMENTAL_READ_SOURCES)[number];
export type TimelineReadSource = TimelineCoreReadSource | TimelineSupplementalReadSource;

export interface TimelinePageReadKeyInput {
  ownerId: string | null | undefined;
  growId: string | null | undefined;
  /** Applied, already-validated date bound. Empty means unbounded. */
  startDate?: string | null;
  /** Applied, already-validated date bound. Empty means unbounded. */
  endDate?: string | null;
}

/**
 * Stable, collision-safe identity for one Timeline read scope.
 *
 * JSON tuple encoding avoids delimiter collisions in IDs. Optional bounds are
 * normalized to null so omitted and explicitly-unbounded calls share a key.
 */
export function buildTimelinePageReadKey(input: TimelinePageReadKeyInput): string | null {
  const ownerId = normalizeRequiredKeyPart(input?.ownerId);
  const growId = normalizeRequiredKeyPart(input?.growId);
  if (!ownerId || !growId) return null;

  const startDate = normalizeOptionalKeyPart(input?.startDate);
  const endDate = normalizeOptionalKeyPart(input?.endDate);
  return `timeline:${JSON.stringify([ownerId, growId, startDate, endDate])}`;
}

/**
 * Required Timeline reads move together as one core state. `readKey` may be
 * null while a requested scope is not yet complete, but it can never match an
 * active scope until it is a non-empty string.
 */
export type TimelineCoreReadState =
  | { status: "idle"; readKey?: null }
  | { status: "loading" | "error" | "success"; readKey: string | null };

export type TimelinePageReadViewKind =
  | "loading"
  | "grows_error"
  | "no_grows"
  | "scope_error"
  | "timeline_error"
  | "ready_empty"
  | "ready";

export type TimelinePageRetryTarget = "grows" | "timeline" | null;

export interface TimelinePageReadView {
  kind: TimelinePageReadViewKind;
  /** True only after current-scope core evidence has loaded successfully. */
  showTimelineContent: boolean;
  /**
   * True only when the exact current core read succeeded with at least one
   * evidence row. This is the safety fence for the Timeline -> Sensors step.
   */
  showSensorsNextStep: boolean;
  /** Current-scope core evidence is visible while linked context finishes. */
  showSupplementalLoading: boolean;
  retryTarget: TimelinePageRetryTarget;
  /** Current-scope supplemental sources that could not be loaded. */
  partialSources: TimelineSupplementalReadSource[];
}

export interface BuildTimelinePageReadViewInput {
  growsLoading: boolean;
  /** Error object or boolean error flag. `false`, null, and undefined mean no error. */
  growsError?: unknown;
  /** Must be a finite, non-negative integer to be considered confirmed. */
  growCount: unknown;
  /** True only after the settled grow list proves a URL scope is unavailable. */
  hasInvalidScope?: boolean;
  /** Exact key returned by `buildTimelinePageReadKey` for the active page scope. */
  activeReadKey: string | null | undefined;
  coreRead: TimelineCoreReadState | null | undefined;
  /** Count of required, merged Timeline evidence for the core read. */
  evidenceCount: unknown;
  supplementalLoading?: boolean;
  partialSources?: ReadonlyArray<TimelineSupplementalReadSource | null | undefined> | null;
}

const LOADING_VIEW: TimelinePageReadView = Object.freeze({
  kind: "loading",
  showTimelineContent: false,
  showSensorsNextStep: false,
  showSupplementalLoading: false,
  retryTarget: null,
  partialSources: [],
});

const GROWS_ERROR_VIEW: TimelinePageReadView = Object.freeze({
  kind: "grows_error",
  showTimelineContent: false,
  showSensorsNextStep: false,
  showSupplementalLoading: false,
  retryTarget: "grows",
  partialSources: [],
});

const NO_GROWS_VIEW: TimelinePageReadView = Object.freeze({
  kind: "no_grows",
  showTimelineContent: false,
  showSensorsNextStep: false,
  showSupplementalLoading: false,
  retryTarget: null,
  partialSources: [],
});

const TIMELINE_ERROR_VIEW: TimelinePageReadView = Object.freeze({
  kind: "timeline_error",
  showTimelineContent: false,
  showSensorsNextStep: false,
  showSupplementalLoading: false,
  retryTarget: "timeline",
  partialSources: [],
});

const SCOPE_ERROR_VIEW: TimelinePageReadView = Object.freeze({
  kind: "scope_error",
  showTimelineContent: false,
  showSensorsNextStep: false,
  showSupplementalLoading: false,
  retryTarget: null,
  partialSources: [],
});

/**
 * Resolve one fail-closed page view.
 *
 * Precedence:
 *  1. an explicit grow-list error is never presented as loading/empty;
 *  2. grow loading must settle before an empty list is trusted;
 *  3. only an exact zero is a confirmed no-grows state;
 *  4. missing selection, idle core reads, and stale-scope results stay loading;
 *  5. only exact current-scope success can render content or the next step.
 */
export function buildTimelinePageReadView(
  input: BuildTimelinePageReadViewInput,
): TimelinePageReadView {
  if (hasErrorSignal(input?.growsError)) return freshView(GROWS_ERROR_VIEW);
  if (input?.growsLoading === true) return freshView(LOADING_VIEW);

  const growCount = normalizeCount(input?.growCount);
  if (growCount === null) return freshView(GROWS_ERROR_VIEW);
  if (growCount === 0) return freshView(NO_GROWS_VIEW);
  if (input?.hasInvalidScope === true) return freshView(SCOPE_ERROR_VIEW);

  const activeReadKey = normalizeReadKey(input?.activeReadKey);
  if (!activeReadKey) return freshView(LOADING_VIEW);

  const coreRead = input?.coreRead;
  if (!coreRead || coreRead.status === "idle") return freshView(LOADING_VIEW);

  const loadedReadKey = normalizeReadKey(coreRead.readKey);
  if (!loadedReadKey || loadedReadKey !== activeReadKey) return freshView(LOADING_VIEW);

  if (coreRead.status === "loading") return freshView(LOADING_VIEW);
  if (coreRead.status === "error") return freshView(TIMELINE_ERROR_VIEW);
  if (coreRead.status !== "success") return freshView(TIMELINE_ERROR_VIEW);

  const evidenceCount = normalizeCount(input?.evidenceCount);
  if (evidenceCount === null) return freshView(TIMELINE_ERROR_VIEW);

  const partialSources = mergeTimelinePartialSources(input?.partialSources);
  if (evidenceCount === 0) {
    return {
      kind: "ready_empty",
      showTimelineContent: true,
      showSensorsNextStep: false,
      showSupplementalLoading: input?.supplementalLoading === true,
      retryTarget: null,
      partialSources,
    };
  }

  return {
    kind: "ready",
    showTimelineContent: true,
    showSensorsNextStep: true,
    showSupplementalLoading: input?.supplementalLoading === true,
    retryTarget: null,
    partialSources,
  };
}

/**
 * Fail-closed detector for the required Supabase-style result objects.
 * A missing/malformed result is treated as a read failure; a valid result must
 * expose `error: null` exactly and an array payload. PostgREST list reads
 * return `[]` for a real empty result; `null` is not confirmed emptiness.
 */
export function hasTimelineRequiredReadError(...results: readonly unknown[]): boolean {
  if (results.length === 0) return true;
  return results.some((result) => {
    if (!isRecord(result) || !("error" in result) || !("data" in result)) return true;
    return result.error !== null || !Array.isArray(result.data);
  });
}

/**
 * Stable canonical ordering + dedupe for supplemental partial-read labels.
 * Canonical ordering keeps UI copy deterministic even when async reads finish
 * in different orders.
 */
export function mergeTimelinePartialSources(
  ...groups: ReadonlyArray<
    | TimelineSupplementalReadSource
    | ReadonlyArray<TimelineSupplementalReadSource | null | undefined>
    | null
    | undefined
  >
): TimelineSupplementalReadSource[] {
  const seen = new Set<TimelineSupplementalReadSource>();
  for (const group of groups) {
    const candidates = Array.isArray(group) ? group : [group];
    for (const candidate of candidates) {
      if (isTimelineSupplementalReadSource(candidate)) seen.add(candidate);
    }
  }
  return TIMELINE_SUPPLEMENTAL_READ_SOURCES.filter((source) => seen.has(source));
}

function isTimelineSupplementalReadSource(value: unknown): value is TimelineSupplementalReadSource {
  return (
    typeof value === "string" &&
    (TIMELINE_SUPPLEMENTAL_READ_SOURCES as readonly string[]).includes(value)
  );
}

function normalizeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeRequiredKeyPart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalKeyPart(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return normalizeRequiredKeyPart(value);
}

function normalizeReadKey(value: unknown): string | null {
  return normalizeRequiredKeyPart(value);
}

function hasErrorSignal(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freshView(view: TimelinePageReadView): TimelinePageReadView {
  return { ...view, partialSources: [...view.partialSources] };
}
