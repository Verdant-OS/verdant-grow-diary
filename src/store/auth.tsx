import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import {
  flushPendingOAuthSignupAcquisition,
  type SignupAcquisitionRpcClient,
} from "@/lib/oauthSignupAcquisitionRules";
import { flushPendingReferralRedeem, type ReferralRedeemClient } from "@/lib/referralRedeem";

interface Ctx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
const AuthCtx = createContext<Ctx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

/**
 * Last auth identity AuthProvider successfully resolved in this tab.
 * Survives remount / refresh so same-user first resolve does not re-fire the
 * privacy fence. Missing key = unknown → fail closed (wipe). Empty string =
 * resolved signed-out. Cleared with other `verdant:auth:` keys on safe sign-out.
 */
export const AUTH_LAST_RESOLVED_IDENTITY_STORAGE_KEY =
  "verdant:auth:last-resolved-identity:v1" as const;

/** Stored value for a resolved signed-out identity (null user id). */
const SIGNED_OUT_IDENTITY_SENTINEL = "" as const;

function readPersistedLastResolvedIdentity(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(AUTH_LAST_RESOLVED_IDENTITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePersistedLastResolvedIdentity(userId: string | null): void {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      AUTH_LAST_RESOLVED_IDENTITY_STORAGE_KEY,
      userId ?? SIGNED_OUT_IDENTITY_SENTINEL,
    );
  } catch {
    /* fail closed on the next mount if persistence is unavailable */
  }
}

/** True only when a persisted key exists and equals the next resolved id. */
function persistedIdentityMatchesNext(nextUserId: string | null): boolean {
  const persisted = readPersistedLastResolvedIdentity();
  if (persisted === null) return false;
  if (nextUserId === null) return persisted === SIGNED_OUT_IDENTITY_SENTINEL;
  return persisted === nextUserId;
}

interface AuthProviderProps {
  children: ReactNode;
  /**
   * Synchronous identity-transition fence. The app uses this to remove
   * private query cache entries before consumers can observe the next user.
   */
  onBeforeAuthIdentityChange?: (previousUserId: string | null, nextUserId: string | null) => void;
}

export function AuthProvider({ children, onBeforeAuthIdentityChange }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // `undefined` means the initial auth identity has not resolved yet. Keep it
  // distinct from a resolved signed-out `null` so the first null session still
  // runs the privacy fence and clears state left by an expired prior session.
  const currentUserIdRef = useRef<string | null | undefined>(undefined);
  const sessionUserId = session?.user.id ?? null;

  const applySession = useCallback(
    (nextSession: Session | null) => {
      const previousUserId = currentUserIdRef.current;
      const nextUserId = nextSession?.user.id ?? null;
      const identityChangedInMemory = previousUserId === undefined || previousUserId !== nextUserId;
      // Skip the fence only when a prior resolve in this tab already recorded
      // the same id (same-user refresh / remount). No key → fail closed.
      if (identityChangedInMemory && !persistedIdentityMatchesNext(nextUserId)) {
        // This callback must remain before both the identity ref and React
        // state update. Query cache removal is synchronous, so no render can
        // expose the next owner while the previous owner's rows remain.
        onBeforeAuthIdentityChange?.(previousUserId ?? null, nextUserId);
      }
      writePersistedLastResolvedIdentity(nextUserId);
      currentUserIdRef.current = nextUserId;
      setSession(nextSession);
    },
    [onBeforeAuthIdentityChange],
  );

  useEffect(() => {
    let disposed = false;
    // Every session-bearing event bumps this; only the newest reconciliation
    // may act on its answer, so a slower read never overrides a later event.
    let reconcileSeq = 0;

    // The auth client relays SIGNED_IN / TOKEN_REFRESHED between same-origin
    // tabs over a BroadcastChannel and hands the OTHER tab's session to this
    // listener without saving it. With `storage: sessionStorage` this tab may
    // hold nothing: getUser(), REST and edge calls then run signed-out while
    // `user` claims otherwise (measured on the deploy branch, 2026-09-03).
    // So confirm the client holds a session at all; if it holds none, the
    // relayed identity is dropped again. The read resolves in microtasks,
    // ahead of the render React schedules for the first apply, so no render
    // commits the relayed identity.
    //
    // The event is still applied synchronously first: the identity fence must
    // run before React commits, and /auth navigates the moment
    // signInWithPassword resolves, which auth-js only does after this
    // callback returns. The read is never awaited inside the callback.
    // INITIAL_SESSION and a null session are the client's own answers.
    const reconcileWithClientSession = async (seq: number) => {
      let held: Session | null;
      try {
        const { data } = await supabase.auth.getSession();
        held = data?.session ?? null;
      } catch {
        // The client cannot read its own store: a client fault, not a
        // cross-tab signal. Keep the delivered session; a later event still
        // corrects it (see the initial-read failure contract below).
        return;
      }
      if (disposed || seq !== reconcileSeq) return;
      if (held === null) applySession(null);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      applySession(s);
      if (s !== null && event !== "INITIAL_SESSION") {
        void reconcileWithClientSession(++reconcileSeq);
      }
    });
    supabase.auth
      .getSession()
      .then(({ data }) => {
        applySession(data.session);
      })
      .catch(() => {
        // A rejected initial session read (network failure, corrupt storage)
        // must resolve to signed-out instead of leaving the apex and every
        // AppShell route on a permanent loading screen. onAuthStateChange
        // still delivers the real session if one materializes later.
        applySession(null);
      })
      .finally(() => {
        setLoading(false);
      });
    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    if (!sessionUserId) return;
    void flushPendingOAuthSignupAcquisition(supabase as unknown as SignupAcquisitionRpcClient);
  }, [sessionUserId]);

  // Verified referral conversion: once a CONFIRMED session exists, hand the
  // referee's code claim to the redeem-referral edge fn (server re-verifies
  // identity, confirmation, and environment; the client grants nothing).
  const sessionUserForRedeem = session?.user ?? null;
  useEffect(() => {
    if (!sessionUserForRedeem?.id) return;
    void flushPendingReferralRedeem(
      supabase as unknown as ReferralRedeemClient,
      sessionUserForRedeem,
    );
    // Keyed by user id (not the object) so a token refresh does not re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserForRedeem?.id]);

  return (
    <AuthCtx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          // supabase.auth.signOut() resolves with `{ error }` and does not throw
          // on the common failure path. Propagate so performSafeSignOut can
          // return ok:false + SIGN_OUT_FAILURE_MESSAGE (auth hardening #588).
          // Never rethrow the raw error object — it may carry token/session text.
          const { error } = await supabase.auth.signOut();
          if (error) {
            throw new Error("sign_out_failed");
          }
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
