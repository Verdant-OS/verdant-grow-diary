/**
 * guidancePreferenceService — account-backed tips setting and tip state (I/O).
 *
 * Storage: the signed-in user's own auth metadata under one namespaced key
 * (`verdant_guidance`), written with `auth.updateUser({ data })` and confirmed
 * by the server's read-back, read once per user with `auth.getUser()`. No
 * table, column, RLS, migration or auth-configuration change. The value grants
 * nothing. Separate from the Simple/Advanced view preference.
 *
 * Honesty rules:
 *  - No device cache. Until the account answers, status is "loading"; after a
 *    failed read it is "unavailable" and the card stays hidden (What next? still
 *    works), so a tip dismissed elsewhere is not shown again here.
 *  - A failed write keeps the change for this session and reports it; nothing
 *    claims it was saved.
 *  - Writes are sequenced per user: only the latest may settle the session copy.
 *  - Sign-out forgets the in-memory state so a re-sign-in reads again.
 *  - Last write wins across devices: the whole object is written each time.
 */
import {
  DEFAULT_GUIDANCE_STATE,
  GUIDANCE_METADATA_KEY,
  readGuidanceFromMetadata,
  serializeGuidanceState,
  type GuidanceReadStatus,
  type GuidanceState,
} from "@/lib/simpleHomeGuidanceRules";
import type { UiViewAuthClient } from "@/lib/uiViewPreferenceService";
import { withCriticalReadDeadline } from "@/lib/boundedReadRules";

export const GUIDANCE_ACCOUNT_READ_TIMEOUT_MS = 4_000;

export type GuidanceSaveStatus =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed" };

interface UserGuidanceState {
  /** `undefined` until the account read settles; `null` = the account holds none. */
  account: GuidanceState | null | undefined;
  unavailable: boolean;
  /** This session's latest change, held even when the write failed. */
  pending: GuidanceState | null;
  save: GuidanceSaveStatus;
}

export interface GuidanceSnapshot {
  state: GuidanceState;
  status: GuidanceReadStatus;
  save: GuidanceSaveStatus;
}

const states = new Map<string, UserGuidanceState>();
const inFlightReads = new Map<string, Promise<void>>();
const saveSequence = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
let generation = 0;

export function getGuidanceVersion(): number {
  return version;
}

/** Bumped when sign-out forgets settled state; hooks re-read on it. */
export function getGuidanceGeneration(): number {
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

export function subscribeGuidance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function stateFor(userId: string): UserGuidanceState {
  let state = states.get(userId);
  if (!state) {
    state = { account: undefined, unavailable: false, pending: null, save: { kind: "idle" } };
    states.set(userId, state);
  }
  return state;
}

function patch(userId: string, next: Partial<UserGuidanceState>): void {
  states.set(userId, { ...stateFor(userId), ...next });
  emit();
}

const SIGNED_OUT: GuidanceSnapshot = {
  state: DEFAULT_GUIDANCE_STATE,
  status: "unavailable",
  save: { kind: "idle" },
};

export function getGuidanceSnapshot(userId: string | null | undefined): GuidanceSnapshot {
  if (!userId) return SIGNED_OUT;
  const s = stateFor(userId);
  if (s.pending) return { state: s.pending, status: "ready", save: s.save };
  if (s.account !== undefined && !s.unavailable) {
    return { state: s.account ?? DEFAULT_GUIDANCE_STATE, status: "ready", save: s.save };
  }
  return {
    state: DEFAULT_GUIDANCE_STATE,
    status: s.unavailable ? "unavailable" : "loading",
    save: s.save,
  };
}

/** Read the account copy once per user; repeated calls are deduplicated. */
export function ensureGuidanceLoaded(
  client: UiViewAuthClient | null,
  userId: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const existing = inFlightReads.get(userId);
  if (existing) return existing;
  if (stateFor(userId).account !== undefined) return Promise.resolve();
  if (!client) {
    patch(userId, { unavailable: true });
    return Promise.resolve();
  }
  const read = (async () => {
    try {
      const { data, error } = await withCriticalReadDeadline(
        client.getUser(),
        options.timeoutMs ?? GUIDANCE_ACCOUNT_READ_TIMEOUT_MS,
      );
      if (error || !data?.user || (typeof data.user.id === "string" && data.user.id !== userId)) {
        patch(userId, { unavailable: true });
        return;
      }
      patch(userId, {
        account: readGuidanceFromMetadata(data.user.user_metadata),
        unavailable: false,
      });
    } catch {
      patch(userId, { unavailable: true });
    } finally {
      inFlightReads.delete(userId);
    }
  })();
  inFlightReads.set(userId, read);
  return read;
}

export function retryGuidanceRead(
  client: UiViewAuthClient | null,
  userId: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  patch(userId, { account: undefined, unavailable: false });
  return ensureGuidanceLoaded(client, userId, options);
}

/**
 * Persist a new state. Success requires the server's read-back to carry the
 * same value; anything else is reported and the change is held for this session.
 */
export async function saveGuidanceState(
  client: UiViewAuthClient | null,
  userId: string,
  next: GuidanceState,
): Promise<boolean> {
  patch(userId, { pending: next, save: { kind: "saving" } });
  if (!client) {
    patch(userId, { save: { kind: "failed" } });
    return false;
  }
  const seq = (saveSequence.get(userId) ?? 0) + 1;
  saveSequence.set(userId, seq);
  const isLatest = () => saveSequence.get(userId) === seq;
  const payload = serializeGuidanceState(next);
  try {
    const { data, error } = await client.updateUser({ data: { [GUIDANCE_METADATA_KEY]: payload } });
    const echoed = readGuidanceFromMetadata(data?.user?.user_metadata);
    const confirmed =
      !error &&
      echoed !== null &&
      JSON.stringify(serializeGuidanceState(echoed)) === JSON.stringify(payload);
    if (!confirmed) {
      if (isLatest()) patch(userId, { save: { kind: "failed" } });
      return false;
    }
    // A newer save owns the session copy; a late answer from an older one must
    // not overwrite it, even if the newer save has already settled.
    if (!isLatest()) return true;
    patch(userId, { account: echoed, unavailable: false, pending: null, save: { kind: "saved" } });
    return true;
  } catch {
    if (isLatest()) patch(userId, { save: { kind: "failed" } });
    return false;
  }
}

/** Forget in-memory state (one user, or all). Called on sign-out. */
export function forgetGuidanceState(userId?: string): void {
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
