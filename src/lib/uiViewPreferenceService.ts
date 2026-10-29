/**
 * uiViewPreferenceService — account-backed home view preference (I/O layer).
 *
 * Storage: the signed-in user's own auth metadata, written with the public
 * auth client (`auth.updateUser({ data })`) and read back with `auth.getUser()`.
 * No table, column, RLS policy, migration or auth-configuration change. The
 * value grants nothing; both views read the same records and entitlements.
 *
 * Honesty rules:
 *  - The default (Simple) is shown only when no explicit choice is known. A
 *    grower with no choice known on this device waits (bounded) for the account
 *    answer so an Advanced choice from another device is not flashed as Simple.
 *  - A failed account read keeps the last value this device confirmed, labelled
 *    as such; it never resets an explicit choice to the default.
 *  - A failed write is reported. The chosen view stays for this session so the
 *    grower is not bounced, the cache is left untouched, and nothing claims the
 *    choice was saved.
 *  - One in-flight read per user; a late answer for a previous user is dropped.
 *  - Saves are sequenced per user: only the latest save may settle the pending
 *    choice, so a slow earlier write cannot clear a newer one.
 *  - Sign-out forgets the in-memory account state (the device cache stays), so
 *    the next sign-in in the same tab reads the account again.
 */
import {
  DEFAULT_UI_VIEW,
  isUiView,
  readUiViewFromMetadata,
  resolveUiView,
  resolveUiViewReadStatus,
  UI_VIEW_METADATA_KEY,
  UI_VIEW_METADATA_SET_AT_KEY,
  uiViewCacheKey,
  type UiView,
  type UiViewReadStatus,
  type UiViewResolution,
  type UiViewSaveStatus,
} from "@/lib/uiViewPreferenceRules";
import { withCriticalReadDeadline } from "@/lib/boundedReadRules";

interface AuthUserShape {
  id?: string;
  user_metadata?: unknown;
}

type AuthUserResponse = Promise<{
  data: { user: AuthUserShape | null } | null;
  error: unknown | null;
}>;

/** The two auth-client calls this service needs; the Supabase client satisfies it. */
export interface UiViewAuthClient {
  getUser(): AuthUserResponse;
  updateUser(attributes: { data: Record<string, unknown> }): AuthUserResponse;
}

/** Fail open to "unavailable" when a client (or a test double) lacks the auth surface. */
export function resolveUiViewAuthClient(candidate: unknown): UiViewAuthClient | null {
  const auth = (candidate as { auth?: unknown } | null | undefined)?.auth as
    Partial<UiViewAuthClient> | undefined;
  if (!auth || typeof auth.getUser !== "function" || typeof auth.updateUser !== "function") {
    return null;
  }
  return auth as UiViewAuthClient;
}

export const UI_VIEW_ACCOUNT_READ_TIMEOUT_MS = 4_000;

interface UserViewState {
  /** `undefined` until the account read settles. */
  account: UiView | null | undefined;
  accountUnavailable: boolean;
  cache: UiView | null;
  /** Explicit choice made this session; held even when the account write failed. */
  pending: UiView | null;
  save: UiViewSaveStatus;
}

export interface UiViewSnapshot extends UiViewResolution {
  status: UiViewReadStatus;
  save: UiViewSaveStatus;
}

const states = new Map<string, UserViewState>();
const inFlightReads = new Map<string, Promise<void>>();
const saveSequence = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
let generation = 0;

/** Monotonic change counter; a stable primitive for useSyncExternalStore. */
export function getUiViewPreferenceVersion(): number {
  return version;
}

/**
 * Bumped whenever settled account state is forgotten (sign-out). Hooks key
 * their read effect on it so a mounted surface reads the account again.
 */
export function getUiViewPreferenceGeneration(): number {
  return generation;
}

function emit(): void {
  version += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a listener failure must not stop the others */
    }
  }
}

export function subscribeUiViewPreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCache(userId: string): UiView | null {
  const key = uiViewCacheKey(userId);
  const storage = safeStorage();
  if (!key || !storage) return null;
  try {
    const value = storage.getItem(key);
    return isUiView(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, view: UiView | null): void {
  const key = uiViewCacheKey(userId);
  const storage = safeStorage();
  if (!key || !storage) return;
  try {
    if (view) storage.setItem(key, view);
    else storage.removeItem(key);
  } catch {
    /* the cache is a convenience; the account value is the record */
  }
}

function stateFor(userId: string): UserViewState {
  let state = states.get(userId);
  if (!state) {
    state = {
      account: undefined,
      accountUnavailable: false,
      cache: readCache(userId),
      pending: null,
      save: { kind: "idle" },
    };
    states.set(userId, state);
  }
  return state;
}

function patch(userId: string, next: Partial<UserViewState>): void {
  states.set(userId, { ...stateFor(userId), ...next });
  emit();
}

const SIGNED_OUT_SNAPSHOT: UiViewSnapshot = {
  view: DEFAULT_UI_VIEW,
  source: "default",
  explicit: false,
  status: "ready",
  save: { kind: "idle" },
};

/**
 * Pure read of the current snapshot for a user. `sessionMetadata` is the
 * signed-in user object's metadata, which already carries the account copy as
 * of sign-in and is refreshed in-tab by a successful write.
 */
export function getUiViewSnapshot(
  userId: string | null | undefined,
  sessionMetadata: unknown,
): UiViewSnapshot {
  if (!userId) return SIGNED_OUT_SNAPSHOT;
  const state = stateFor(userId);
  if (state.pending) {
    return {
      view: state.pending,
      source: "account",
      explicit: true,
      status: "ready",
      save: state.save,
    };
  }
  const input = {
    account: state.account,
    session: readUiViewFromMetadata(sessionMetadata),
    cache: state.cache,
    accountUnavailable: state.accountUnavailable,
  };
  return {
    ...resolveUiView(input),
    status: resolveUiViewReadStatus(input),
    save: state.save,
  };
}

/**
 * Read the account's explicit choice once per user (callers may invoke on every
 * render; the read is deduplicated). The answer updates the cache: an explicit
 * value is cached, a confirmed absence clears a stale cache.
 */
export function ensureUiViewPreferenceLoaded(
  client: UiViewAuthClient | null,
  userId: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const existing = inFlightReads.get(userId);
  if (existing) return existing;
  const state = stateFor(userId);
  if (state.account !== undefined) return Promise.resolve();
  if (!client) {
    patch(userId, { accountUnavailable: true });
    return Promise.resolve();
  }

  const read = (async () => {
    try {
      const { data, error } = await withCriticalReadDeadline(
        client.getUser(),
        options.timeoutMs ?? UI_VIEW_ACCOUNT_READ_TIMEOUT_MS,
      );
      if (error || !data?.user) {
        patch(userId, { accountUnavailable: true });
        return;
      }
      // A late answer for another identity must not land on this user.
      if (typeof data.user.id === "string" && data.user.id !== userId) {
        patch(userId, { accountUnavailable: true });
        return;
      }
      const account = readUiViewFromMetadata(data.user.user_metadata);
      writeCache(userId, account);
      patch(userId, { account, accountUnavailable: false, cache: account });
    } catch {
      patch(userId, { accountUnavailable: true });
    } finally {
      inFlightReads.delete(userId);
    }
  })();
  inFlightReads.set(userId, read);
  return read;
}

/** Re-run a failed account read (for example after the network returns). */
export function retryUiViewPreferenceRead(
  client: UiViewAuthClient | null,
  userId: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  patch(userId, { account: undefined, accountUnavailable: false });
  return ensureUiViewPreferenceLoaded(client, userId, options);
}

/**
 * Persist an explicit choice to the account. Success requires the server's
 * read-back to carry the new value; anything else is reported as a failure and
 * the choice is held for this session only.
 */
export async function saveUiViewPreference(
  client: UiViewAuthClient | null,
  userId: string,
  view: UiView,
  now: () => string = () => new Date().toISOString(),
): Promise<boolean> {
  if (!isUiView(view)) return false;
  patch(userId, { pending: view, save: { kind: "saving", view } });
  if (!client) {
    patch(userId, { save: { kind: "failed", view, message: "auth_unavailable" } });
    return false;
  }
  const seq = (saveSequence.get(userId) ?? 0) + 1;
  saveSequence.set(userId, seq);
  // Only the latest save for this user may settle the pending choice. An
  // earlier write that completes later would otherwise clear a newer choice or
  // report its own outcome over the grower's current one.
  const isLatest = () => saveSequence.get(userId) === seq;
  try {
    const { data, error } = await client.updateUser({
      data: { [UI_VIEW_METADATA_KEY]: view, [UI_VIEW_METADATA_SET_AT_KEY]: now() },
    });
    const confirmed = !error && readUiViewFromMetadata(data?.user?.user_metadata) === view;
    if (!confirmed) {
      if (isLatest()) patch(userId, { save: { kind: "failed", view, message: "unconfirmed" } });
      return false;
    }
    if (!isLatest()) {
      // The account now holds this value, but a newer choice is in flight and
      // owns the pending state; it will write over this one.
      patch(userId, { account: view, accountUnavailable: false });
      return true;
    }
    writeCache(userId, view);
    patch(userId, {
      account: view,
      accountUnavailable: false,
      cache: view,
      pending: null,
      save: { kind: "saved", view },
    });
    return true;
  } catch {
    if (isLatest()) patch(userId, { save: { kind: "failed", view, message: "write_failed" } });
    return false;
  }
}

/**
 * Forget settled in-memory account state (one user, or every user when
 * `userId` is omitted). The per-user device cache is kept: it is the last
 * confirmed value and the honest fallback until the account answers again.
 * Called on sign-out so a re-sign-in in the same tab reads the account afresh.
 */
export function forgetUiViewPreferenceState(userId?: string): void {
  if (userId) {
    states.delete(userId);
    inFlightReads.delete(userId);
    saveSequence.delete(userId);
  } else {
    states.clear();
    inFlightReads.clear();
    saveSequence.clear();
  }
  generation += 1;
  emit();
}

/** Test seam: forget every in-memory state (the local cache is cleared by the caller). */
export function resetUiViewPreferenceStoreForTest(): void {
  states.clear();
  inFlightReads.clear();
  saveSequence.clear();
  emit();
}
