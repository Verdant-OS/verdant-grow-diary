/**
 * accountDeletion — client helper for the `delete-account` edge function.
 *
 * The edge function requires `{ confirm: "DELETE" }` and re-verifies the
 * caller JWT before any destructive write. This helper enforces the same
 * literal so a typo cannot silently fail closed.
 *
 * On success, the caller's session is invalidated server-side; we also
 * call supabase.auth.signOut locally so the SPA drops the stale session.
 */
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAuthSignOutOperation } from "@/lib/authSignOutOperationService";

/** Matches AuthProvider held-session confirmation: fail closed on malformed shape. */
function isDispatchableHeldSession(session: Session | null | undefined): session is Session {
  return (
    session != null &&
    typeof session.access_token === "string" &&
    session.access_token.trim() !== "" &&
    typeof session.user?.id === "string" &&
    session.user.id.trim() !== ""
  );
}

export const DELETE_ACCOUNT_CONFIRMATION = "DELETE";

export const DELETE_ACCOUNT_GENERIC_FAILURE =
  "We couldn't delete your account right now. Please try again or contact support.";
export const DELETE_ACCOUNT_BILLING_FAILURE =
  "We couldn't stop your recurring billing, so your account was not deleted. Please try again or contact support.";
export const DELETE_ACCOUNT_CLEANUP_UNCONFIRMED =
  "Your account was deleted, but we couldn't confirm this browser signed out. Reload the page before continuing.";

export type DeleteAccountResult =
  | { ok: false; error: string }
  | { ok: true; disposition: "completed" | "superseded" }
  | { ok: true; disposition: "cleanup_unconfirmed"; error: string };

function cleanupUnconfirmed(): DeleteAccountResult {
  return {
    ok: true,
    disposition: "cleanup_unconfirmed",
    error: DELETE_ACCOUNT_CLEANUP_UNCONFIRMED,
  };
}

interface DeleteAccountCleanupLease {
  isCurrent: () => boolean;
  finish: () => void;
}

export interface DeleteAccountContinuationOptions {
  expectedUserId: string;
  isCurrent: () => boolean;
  beginCleanup: () => DeleteAccountCleanupLease | null;
  onDeleted: () => void | Promise<void>;
}

export function deleteAccountFailureMessage(
  status: number | null | undefined,
  errorCode: string | null | undefined,
): string {
  return status === 409 || errorCode === "billing_cancellation_failed"
    ? DELETE_ACCOUNT_BILLING_FAILURE
    : DELETE_ACCOUNT_GENERIC_FAILURE;
}

export async function requestAccountDeletion(
  typedConfirmation: string,
  options: DeleteAccountContinuationOptions,
): Promise<DeleteAccountResult> {
  if (typedConfirmation !== DELETE_ACCOUNT_CONFIRMATION) {
    return { ok: false, error: `Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm.` };
  }
  if (!options.expectedUserId || !options.isCurrent()) {
    return { ok: false, error: DELETE_ACCOUNT_GENERIC_FAILURE };
  }
  const operation = getAuthSignOutOperation(supabase.auth);
  const cleanupAvailable = () =>
    operation.getSnapshot() === "idle" && !operation.hasFailedCleanup();
  if (!cleanupAvailable()) return { ok: false, error: DELETE_ACCOUNT_GENERIC_FAILURE };
  let authCurrent = true;
  let cleanupStarted = false;
  let observedCleanupSignOut = false;
  let authReadUnconfirmed = false;
  let observing = true;
  const pendingAuthChecks = new Set<Promise<void>>();
  let serverDeleted = false;
  let lease: DeleteAccountCleanupLease | null = null;
  // auth-js relays other tabs' events without changing this client's
  // sessionStorage. Reconcile every event against the held session; a
  // delivered foreign SIGNED_IN or SIGNED_OUT is not ownership authority.
  // Start each read immediately, never await inside the SDK callback. Keep
  // every answer so an actual A -> B -> A cannot revive A's confirmation.
  const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
    const duringCleanup = cleanupStarted;
    const check = (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!observing) return;
        if (error || data?.session === undefined) {
          authReadUnconfirmed = true;
          return;
        }
        const held = data.session;
        if (held !== null && held !== undefined) {
          if (!isDispatchableHeldSession(held)) {
            authReadUnconfirmed = true;
            return;
          }
          if (held.user.id !== options.expectedUserId) authCurrent = false;
        }
        if (held === null) {
          if (duringCleanup) observedCleanupSignOut = true;
          else authCurrent = false;
        }
        if (held && observedCleanupSignOut) authCurrent = false;
      } catch {
        if (observing) authReadUnconfirmed = true;
      }
    })();
    pendingAuthChecks.add(check);
    void check.then(() => pendingAuthChecks.delete(check));
  });
  const settleAuthChecks = async () => {
    while (pendingAuthChecks.size > 0) await Promise.all([...pendingAuthChecks]);
  };
  const isCurrent = () => authCurrent && options.isCurrent();
  try {
    const response = await (async () => {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      await settleAuthChecks();
      if (
        error ||
        authReadUnconfirmed ||
        !isDispatchableHeldSession(session) ||
        session.user.id !== options.expectedUserId ||
        !isCurrent() ||
        !cleanupAvailable()
      )
        return null;
      // Per-call Authorization binds dispatch to the verified confirming
      // session even if the SDK's asynchronous token getter later sees B.
      // The bearer lives only in this transient request header.
      return supabase.functions.invoke<{ ok?: boolean; error?: string }>("delete-account", {
        body: { confirm: DELETE_ACCOUNT_CONFIRMATION },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    })();
    if (!response) return { ok: false, error: DELETE_ACCOUNT_GENERIC_FAILURE };
    const { data, error } = response;
    if (error || !data?.ok) {
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      return { ok: false, error: deleteAccountFailureMessage(status, data?.error) };
    }
    serverDeleted = true;
    await settleAuthChecks();
    if (!isCurrent()) return { ok: true, disposition: "superseded" };
    if (authReadUnconfirmed) return cleanupUnconfirmed();
    const { data: held, error: heldError } = await supabase.auth.getSession();
    await settleAuthChecks();
    if (
      !isCurrent() ||
      (held?.session &&
        (!isDispatchableHeldSession(held.session) ||
          held.session.user.id !== options.expectedUserId))
    )
      return { ok: true, disposition: "superseded" };
    if (heldError || authReadUnconfirmed || !isDispatchableHeldSession(held?.session))
      return cleanupUnconfirmed();

    // Never join another exit or clear its failure latch with a skipped
    // queue action. Admission, lease acquisition and enqueue are synchronous.
    if (!cleanupAvailable()) return cleanupUnconfirmed();
    lease = options.beginCleanup();
    if (!lease) return cleanupUnconfirmed();
    const cleanupRan = await operation.runSdkSignOut(async () => {
      const { data: current, error: currentError } = await supabase.auth.getSession();
      await settleAuthChecks();
      if (!isCurrent() || !lease?.isCurrent()) return false;
      if (currentError || authReadUnconfirmed)
        throw new Error("account_deletion_cleanup_unconfirmed");
      if (
        !isDispatchableHeldSession(current?.session) ||
        current.session.user.id !== options.expectedUserId
      )
        return false;
      cleanupStarted = true;
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw new Error("account_deletion_cleanup_unconfirmed");
      const { data: cleared, error: clearedError } = await supabase.auth.getSession();
      await settleAuthChecks();
      if (!isCurrent() || !lease?.isCurrent()) return false;
      if (
        cleared?.session &&
        (!isDispatchableHeldSession(cleared.session) ||
          cleared.session.user.id !== options.expectedUserId)
      ) {
        authCurrent = false;
        return false;
      }
      // Verify within the queue so an unconfirmed cleanup records its
      // failure before the provider unmasks and remounts session checks.
      if (clearedError || authReadUnconfirmed || cleared?.session !== null)
        throw new Error("account_deletion_cleanup_unconfirmed");
      return true;
    });
    if (!cleanupRan || !isCurrent() || !lease.isCurrent())
      return { ok: true, disposition: "superseded" };
    const { data: afterCleanup, error: afterError } = await supabase.auth.getSession();
    await settleAuthChecks();
    if (!isCurrent() || !lease.isCurrent()) return { ok: true, disposition: "superseded" };
    if (
      afterCleanup?.session &&
      (!isDispatchableHeldSession(afterCleanup.session) ||
        afterCleanup.session.user.id !== options.expectedUserId)
    )
      return { ok: true, disposition: "superseded" };
    if (afterError || authReadUnconfirmed || afterCleanup?.session !== null)
      return cleanupUnconfirmed();
    // Keep entry fenced until the router has committed the exit. Starting a
    // document navigation alone provides no completion signal.
    await options.onDeleted();
    return { ok: true, disposition: "completed" };
  } catch {
    if (serverDeleted) {
      return isCurrent() ? cleanupUnconfirmed() : { ok: true, disposition: "superseded" };
    }
    return { ok: false, error: DELETE_ACCOUNT_GENERIC_FAILURE };
  } finally {
    observing = false;
    authSubscription.subscription.unsubscribe();
    lease?.finish();
  }
}
