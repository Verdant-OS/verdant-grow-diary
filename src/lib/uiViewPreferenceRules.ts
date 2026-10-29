/**
 * uiViewPreferenceRules — pure rules for the grower's home view choice.
 *
 * Simple View is the initial default for every signed-in grower who has not
 * made an explicit choice. An explicit choice (Simple or Advanced) is stored on
 * the account so phone and desktop agree; a per-user local cache only avoids a
 * flash before the account read settles and never outranks the account value.
 *
 * Safety:
 *  - This is a display preference. It grants nothing: both views read the same
 *    records under the same RLS and the same entitlements.
 *  - No schema, RLS, migration or auth-configuration change. The account copy
 *    lives in the user's own auth metadata under one namespaced key.
 *  - Guidance (hints) is a separate preference; nothing here reads or writes it.
 *  - Unknown or malformed stored values read as "no explicit choice", never as
 *    a choice the grower did not make.
 */

export type UiView = "simple" | "advanced";

export const DEFAULT_UI_VIEW: UiView = "simple";

/** Namespaced key inside the account's own user metadata. */
export const UI_VIEW_METADATA_KEY = "verdant_ui_view" as const;
/** Companion ISO timestamp so a later device write wins on read-back audits. */
export const UI_VIEW_METADATA_SET_AT_KEY = "verdant_ui_view_set_at" as const;

/** Per-user local cache key. Opaque enum value only; never grow data. */
export function uiViewCacheKey(userId: string): string | null {
  if (typeof userId !== "string" || !/^[A-Za-z0-9_\-:.]{1,128}$/.test(userId)) return null;
  return `verdant:uiView:${userId}`;
}

export function isUiView(value: unknown): value is UiView {
  return value === "simple" || value === "advanced";
}

/** Null when the account carries no explicit, valid choice. */
export function readUiViewFromMetadata(metadata: unknown): UiView | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[UI_VIEW_METADATA_KEY];
  return isUiView(value) ? value : null;
}

export type UiViewSource = "account" | "session" | "cache" | "default";

export type UiViewReadStatus =
  /** Neither the session user nor the cache carries a choice; the account read is pending. */
  | "loading"
  /** The account answered (explicit choice or confirmed absence). */
  | "ready"
  /** The account could not be read; the shown view is the best honest fallback. */
  | "unavailable";

export interface UiViewResolution {
  view: UiView;
  /** Where the shown value came from. "default" means no explicit choice is known. */
  source: UiViewSource;
  /** True only when an explicit grower choice backs the shown view. */
  explicit: boolean;
}

export interface ResolveUiViewInput {
  /** Explicit choice read from the account (getUser). `undefined` = not read yet. */
  account: UiView | null | undefined;
  /** Explicit choice carried by the signed-in session's user object, if any. */
  session: UiView | null;
  /** Last value this device confirmed for this user, if any. */
  cache: UiView | null;
  /** True when the account read failed or timed out. */
  accountUnavailable: boolean;
}

/**
 * Precedence: a settled account read wins; otherwise the session's own copy,
 * then the per-user cache, then the default. The default is never "explicit".
 */
export function resolveUiView(input: ResolveUiViewInput): UiViewResolution {
  if (input.account !== undefined && !input.accountUnavailable) {
    if (input.account) return { view: input.account, source: "account", explicit: true };
    return { view: DEFAULT_UI_VIEW, source: "default", explicit: false };
  }
  if (input.session) return { view: input.session, source: "session", explicit: true };
  if (input.cache) return { view: input.cache, source: "cache", explicit: true };
  return { view: DEFAULT_UI_VIEW, source: "default", explicit: false };
}

/**
 * Whether the home surface may render yet. A grower with no explicit choice
 * known on this device waits for the account answer (bounded by the store)
 * so an Advanced choice made on another device is not flashed as Simple.
 */
export function resolveUiViewReadStatus(input: ResolveUiViewInput): UiViewReadStatus {
  if (input.account !== undefined && !input.accountUnavailable) return "ready";
  if (input.accountUnavailable) return "unavailable";
  if (input.session || input.cache) return "ready";
  return "loading";
}

export const UI_VIEW_COPY = {
  simpleLabel: "Simple view",
  advancedLabel: "Advanced view",
  switchToAdvanced: "Switch to Advanced view",
  switchToSimple: "Switch to Simple view",
  simpleDescription: "Your plants, one button to add an observation, and your recent entries.",
  advancedDescription: "The full dashboard: environment, alerts, sensors and every tool.",
  saving: "Saving your view choice…",
  savedToAccount: "Saved to your account. Your other devices will use it too.",
  saveFailed:
    "Couldn't save this choice to your account. You'll see this view for now; try again to keep it.",
  accountUnavailable:
    "Couldn't check your account for a saved view. Showing the last choice known on this device.",
  loading: "Checking your saved view…",
} as const;

export type UiViewSaveStatus =
  | { kind: "idle" }
  | { kind: "saving"; view: UiView }
  | { kind: "saved"; view: UiView }
  | { kind: "failed"; view: UiView; message: string };

export function uiViewSaveStatusCopy(status: UiViewSaveStatus): string | null {
  switch (status.kind) {
    case "saving":
      return UI_VIEW_COPY.saving;
    case "saved":
      return UI_VIEW_COPY.savedToAccount;
    case "failed":
      return UI_VIEW_COPY.saveFailed;
    default:
      return null;
  }
}
