import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { SIGN_OUT_LOADING_LABEL } from "@/lib/authSessionExitRules";
import { getAuthSignOutOperation } from "@/lib/authSignOutOperationService";
import { runAuthOAuthBootstrap } from "@/lib/authOAuthBootstrapService";
import {
  flushPendingOAuthSignupAcquisition,
  type SignupAcquisitionRpcClient,
} from "@/lib/oauthSignupAcquisitionRules";
import { flushPendingReferralRedeem, type ReferralRedeemClient } from "@/lib/referralRedeem";
import {
  consumeOAuthHashSessionIfPresent,
  takeOAuthReturnHashStash,
  type OAuthHashStashHolder,
} from "@/lib/oauthHashSessionConsumeRules";

interface Ctx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  beginSignOutNavigation?: () => {
    isCurrent: () => boolean;
    finish: () => void;
  } | null;
  isSignOutNavigationPending?: () => boolean;
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
  // This operation outlives the dialog/route that started it. SIGNED_OUT can
  // unmount that route before the SDK finishes notifying its other listeners.
  const [signOutOperation] = useState(() => getAuthSignOutOperation(supabase.auth));
  const signOutStatus = useSyncExternalStore(
    signOutOperation.subscribe,
    signOutOperation.getSnapshot,
    () => "idle",
  );
  const signOutNavigationPending = signOutStatus !== "idle";
  const signOutNavigationRef = useRef<{ userId: string | null; observedSignedOut: boolean } | null>(
    null,
  );
  const isSignOutNavigationPending = useCallback(
    () => signOutOperation.getSnapshot() !== "idle",
    [signOutOperation],
  );
  const beginSignOutNavigation = useCallback(() => {
    const lease = signOutOperation.begin();
    if (!lease) return null;
    const operation = { userId: currentUserIdRef.current ?? null, observedSignedOut: false };
    signOutNavigationRef.current = operation;
    return {
      isCurrent: () => signOutNavigationRef.current === operation,
      finish: () => {
        if (signOutNavigationRef.current === operation) signOutNavigationRef.current = null;
        // Release only after the actual SDK operation settles, even if its
        // initiating provider or navigation intent has been superseded.
        lease.finish();
      },
    };
  }, [signOutOperation]);
  useEffect(
    () => () => {
      signOutNavigationRef.current = null;
    },
    [],
  );
  // `undefined` means the initial auth identity has not resolved yet. Keep it
  // distinct from a resolved signed-out `null` so the first null session still
  // runs the privacy fence and clears state left by an expired prior session.
  const currentUserIdRef = useRef<string | null | undefined>(undefined);
  const sessionUserId = session?.user.id ?? null;

  const reconcileSignOutWithHeldSession = useCallback((held: Session | null) => {
    const operation = signOutNavigationRef.current;
    if (held && operation && (operation.observedSignedOut || held.user.id !== operation.userId)) {
      // Relayed identities are not authority. Only this client's own session
      // may supersede the old UI continuation; the SDK lock remains held.
      signOutNavigationRef.current = null;
    }
  }, []);

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
      if (nextUserId === null && signOutNavigationRef.current)
        signOutNavigationRef.current.observedSignedOut = true;
      currentUserIdRef.current = nextUserId;
      setSession(nextSession);
    },
    [onBeforeAuthIdentityChange],
  );

  useEffect(() => {
    let disposed = false;
    // Every auth event bumps this; only the newest reconciliation
    // may act on its answer, so a slower read never overrides a later event.
    let reconcileSeq = 0;
    let oauthBootstrapPending = true;

    // Auth notifications are also relayed from other tabs without updating
    // this tab's sessionStorage. Publishing their payload even briefly can
    // erase private cache/search state or expose another tab's bearer. Only
    // this client's held-session answer may reach the identity fence or UI.
    const reconcileWithClientSession = async (seq: number) => {
      let held: Session | null;
      try {
        const { data, error } = await supabase.auth.getSession();
        held = data?.session;
        if (
          error ||
          held === undefined ||
          (held !== null &&
            (typeof held.user?.id !== "string" ||
              !held.user.id.trim() ||
              typeof held.access_token !== "string" ||
              !held.access_token.trim()))
        )
          throw new Error("held_session_unconfirmed");
      } catch {
        if (disposed || seq !== reconcileSeq) return;
        // An unreadable store cannot establish an authenticated identity.
        applySession(null);
        setLoading(false);
        return;
      }
      if (disposed || seq !== reconcileSeq) return;
      reconcileSignOutWithHeldSession(held);
      applySession(held);
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // Include INITIAL_SESSION: its snapshot may predate a newer local
      // sign-in. Read again, and invalidate every earlier in-flight answer.
      const seq = ++reconcileSeq;
      // INITIAL_SESSION can arrive while OAuth setSession is still waiting
      // for its user lookup. Neither that old held session nor a later event
      // may resolve bootstrap before the OAuth return has finished. The
      // post-consume read below confirms the final held session once.
      if (oauthBootstrapPending) return;
      // Auth.tsx navigates immediately after signInWithPassword resolves.
      // With no confirmed owner, keep that destination waiting for this read
      // instead of bouncing back to /auth. Existing owners keep their draft
      // mounted while an untrusted notification is being reconciled.
      if (currentUserIdRef.current == null) setLoading(true);
      // Do not await an auth call inside auth-js's own notification callback.
      void reconcileWithClientSession(seq);
    });

    // Google / managed OAuth returns to the public origin with
    // `#access_token=...&refresh_token=...`. The document-head wipe may
    // already have stashed and stripped that hash before first paint.
    // Consume in-memory tokens into a sessionStorage session BEFORE the
    // initial getSession so OAuthPostAuthRedirect can see `user` and honor
    // pending redirectTo. Fail closed: malformed hashes are cleared without
    // inventing a session. Never log the hash or tokens.
    void (async () => {
      try {
        await runAuthOAuthBootstrap(supabase.auth, async () => {
          if (typeof window !== "undefined") {
            const stashedHash = takeOAuthReturnHashStash(window as OAuthHashStashHolder);
            await consumeOAuthHashSessionIfPresent({
              hash: window.location.hash,
              stashedHash,
              pathname: window.location.pathname,
              search: window.location.search,
              setSession: async (tokens) => {
                const { error } = await supabase.auth.setSession(tokens);
                return { error };
              },
              replaceState: (url) => {
                window.history.replaceState(window.history.state, "", url);
              },
            });
          }
        });
      } catch {
        // Hash consume must never block auth bootstrap.
      }
      if (disposed) return;
      oauthBootstrapPending = false;
      // Bootstrap has the same generation fence: a late initial read must
      // never replace a newer confirmed sign-in, sign-out or failed read.
      await reconcileWithClientSession(++reconcileSeq);
    })();

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
    };
  }, [applySession, reconcileSignOutWithHeldSession]);

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
        loading: loading || signOutNavigationPending,
        beginSignOutNavigation,
        isSignOutNavigationPending,
        signOut: async () => {
          // supabase.auth.signOut() resolves with `{ error }` and does not throw
          // on the common failure path. Propagate so performSafeSignOut can
          // return ok:false + SIGN_OUT_FAILURE_MESSAGE (auth hardening #588).
          // Never rethrow the raw error object — it may carry token/session text.
          await signOutOperation.runSdkSignOut(async () => {
            const { error } = await supabase.auth.signOut();
            if (error) throw new Error("sign_out_failed");
          });
        },
      }}
    >
      {signOutNavigationPending ? (
        <div
          role="status"
          aria-live="polite"
          className="min-h-screen flex flex-col gap-3 items-center justify-center text-muted-foreground"
        >
          {signOutStatus === "stalled" ? (
            <>
              <p>Sign-out is taking longer than expected.</p>
              <p>Reload the page to recover before signing in again.</p>
              <button type="button" className="underline" onClick={() => window.location.reload()}>
                Reload page
              </button>
            </>
          ) : (
            SIGN_OUT_LOADING_LABEL
          )}
        </div>
      ) : (
        children
      )}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
