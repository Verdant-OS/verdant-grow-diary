/**
 * useMyEntitlements — presentation-only client read hook.
 *
 * SECURITY: This hook is for UX only. It is NEVER authoritative.
 * Any gate that costs money or protects sensitive data (AI credit
 * consumption, live-sensor access, advanced exports, etc.) MUST re-check
 * entitlement server-side in its edge function. Client capability resolution
 * can be lied to by a tampered client and must not be trusted for security.
 *
 * Canonical lane (2026-07-16): reads ONLY from public.subscriptions, the
 * Lovable Paddle lane. The legacy BYO billing_subscriptions branch was
 * retired in the entitlement-gates narrowing migration; any currently-
 * entitling BYO row was backfilled into public.subscriptions there.
 * Environment is derived from the client token prefix (test_ → sandbox,
 * otherwise live) and passed EXPLICITLY into the adapter.
 *
 * Soft revalidation (#564): token refresh gives a new `user` object with the
 * same id. Reloading must NOT flip `loading` back to true for that id, or
 * PhenoTrackerUpgradeGate (and similar gates) unmount entitled children and
 * discard unsaved wizard/workspace input. Identity changes still hard-load.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  resolveUnionEntitlements,
  resolveEntitlements,
  pickEntitlingLovableRow,
  lovableRowEntitles,
  SUBSCRIPTION_ROW_SCAN_LIMIT,
  type LovableSubscriptionRow,
  type ResolvedEntitlement,
} from "@/lib/entitlements";
import { getPaddleEnvironment } from "@/lib/paddle";

export interface UseMyEntitlementsResult {
  loading: boolean;
  /** True when the canonical subscription row could not be read. */
  lookupFailed: boolean;
  entitlement: ResolvedEntitlement;
  /**
   * Bounded refetch — used by CheckoutSuccess to poll after checkout.
   * Resolves to whether the lookup FAILED. A failed lookup still resolves the
   * entitlement to Free for presentation, so a caller that only awaits
   * completion would read "we couldn't check" as "you are not entitled";
   * callers acting on the outcome must consult this instead.
   */
  refetch: () => Promise<boolean>;
}

const FREE_NOW = (): ResolvedEntitlement => resolveEntitlements(null, new Date());

interface EntitlementSnapshot {
  lookupFailed: boolean;
  lovableRow: LovableSubscriptionRow | null;
  resolvedEnvironment: "live" | "sandbox";
  isStaff: boolean;
  now: Date;
}

/**
 * One in-flight snapshot fetch per (user, sandbox-expectation). Plant Detail
 * mounts several consumers of this hook in the same render turn (Blueprint
 * section, AI Doctor review, the page's credit gate), and without coalescing
 * each fired its own subscriptions + user_roles reads. Entries are removed
 * as soon as the fetch settles: this shares CONCURRENT work only, never
 * serves a completed response as a cache — a later mount or refetch still
 * observes fresh rows, so the soft-revalidate semantics above are unchanged.
 */
const inflightSnapshots = new Map<string, Promise<EntitlementSnapshot>>();

function fetchEntitlementSnapshot(
  userId: string,
  wantsSandbox: boolean,
): Promise<EntitlementSnapshot> {
  const key = `${userId}:${wantsSandbox ? "sandbox" : "live"}`;
  const existing = inflightSnapshots.get(key);
  if (existing) return existing;

  const load = (async (): Promise<EntitlementSnapshot> => {
    // All reads are RLS-protected (select-own) and PRESENTATION-ONLY.
    // Subscription reads use bounded newest-first WINDOWS, not limit(1):
    // public.subscriptions is unique per paddle_subscription_id, so a newer
    // canceled row (e.g. Pro) must not shadow an older entitling row (e.g.
    // Founder Lifetime). Same semantics as the server helper
    // supabase/functions/_shared/unionEntitlementLookup.ts.
    const subscriptionRows = (environment: "live" | "sandbox") =>
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("environment", environment)
        // created_at is not unique; paddle_subscription_id is — without the
        // tiebreak, equal timestamps make the window order (and therefore
        // the picked row) nondeterministic.
        .order("created_at", { ascending: false })
        .order("paddle_subscription_id", { ascending: false })
        .limit(SUBSCRIPTION_ROW_SCAN_LIMIT);

    // Live rows are canonical production evidence and unlock regardless of
    // a sandbox-configured client. Sandbox rows unlock only when this client
    // explicitly expects sandbox. This mirrors the shared Edge helper and
    // the database entitlement gates.
    const [liveRes, sandboxRes, rolesRes] = await Promise.all([
      subscriptionRows("live"),
      wantsSandbox
        ? subscriptionRows("sandbox")
        : Promise.resolve({ data: [] as LovableSubscriptionRow[], error: null }),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "staff")
        .maybeSingle(),
    ]);

    const now = new Date();
    const isStaff = !rolesRes.error && rolesRes.data != null;
    const liveRows = liveRes.error ? [] : ((liveRes.data ?? []) as LovableSubscriptionRow[]);
    const sandboxRows = sandboxRes.error
      ? []
      : ((sandboxRes.data ?? []) as LovableSubscriptionRow[]);
    const liveRow = pickEntitlingLovableRow(liveRows, "live", now);
    const sandboxRow = wantsSandbox ? pickEntitlingLovableRow(sandboxRows, "sandbox", now) : null;
    const liveRowEntitles = liveRow != null && lovableRowEntitles(liveRow, "live", now);
    const sandboxRowEntitles = sandboxRow != null && lovableRowEntitles(sandboxRow, "sandbox", now);

    const resolvedEnvironment = liveRowEntitles
      ? "live"
      : sandboxRowEntitles || wantsSandbox
        ? "sandbox"
        : "live";
    const lovableRow = liveRowEntitles
      ? liveRow
      : sandboxRowEntitles || wantsSandbox
        ? sandboxRow
        : liveRow;
    const paidRowProven = liveRowEntitles || sandboxRowEntitles;
    const lookupFailed =
      !paidRowProven && (liveRes.error != null || (wantsSandbox && sandboxRes.error != null));

    return { lookupFailed, lovableRow, resolvedEnvironment, isStaff, now };
  })();

  const tracked = load.finally(() => {
    if (inflightSnapshots.get(key) === tracked) inflightSnapshots.delete(key);
  });
  inflightSnapshots.set(key, tracked);
  return tracked;
}

export function useMyEntitlements(
  options?: { enabled?: boolean },
): UseMyEntitlementsResult {
  // Default true: existing callers stay presentation-only and still load.
  // AppShell passes enabled: authStatus === "authenticated" so a cached
  // user during getUser miss (revalidation_failed) cannot fire
  // GET /rest/v1/subscriptions or user_roles.
  const enabled = options?.enabled !== false;
  const { user, loading: authLoading } = useAuth();
  // Key loads on user id, never the session user object reference. TOKEN_REFRESHED
  // replaces the user object while keeping the same id (#564).
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState<boolean>(true);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [entitlement, setEntitlement] = useState<ResolvedEntitlement>(() => FREE_NOW());

  const expectedBillingEnvironment = useMemo(() => getPaddleEnvironment(), []);

  // The subscription reads race unmount (route change, test teardown):
  // never setState after unmount.
  const mountedRef = useRef(true);
  /** Last user id for which we completed a load (soft-refresh marker). */
  const settledUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Resolves to whether the lookup FAILED, so a caller that acts on the result
  // (e.g. a manual "re-check my plan") can tell a real Free answer apart from
  // an unverifiable one. A failed lookup still resolves the entitlement to
  // Free for presentation, so a caller that merely awaits completion would
  // otherwise read "we couldn't check" as "you are not entitled".
  const doLoad = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      if (!mountedRef.current) return false;
      settledUserIdRef.current = null;
      setEntitlement(FREE_NOW());
      setLookupFailed(false);
      setLoading(false);
      return false;
    }

    // Soft revalidate same identity: keep prior entitlement + loading=false so
    // upgrade gates do not unmount children mid-edit (pheno wizard/workspace).
    // Hard load on identity change: clear stale plan and show loading.
    const softRefresh = settledUserIdRef.current === userId;
    if (!softRefresh) {
      setEntitlement(FREE_NOW());
      setLoading(true);
    }
    setLookupFailed(false);

    const wantsSandbox = expectedBillingEnvironment === "sandbox";
    const snapshot = await fetchEntitlementSnapshot(userId, wantsSandbox);

    if (!mountedRef.current) return snapshot.lookupFailed;
    setLookupFailed(snapshot.lookupFailed);
    setEntitlement(
      resolveUnionEntitlements({
        byoRow: null,
        lovableRow: snapshot.lovableRow,
        expectedBillingEnvironment: snapshot.resolvedEnvironment,
        now: snapshot.now,
        opts: { isStaff: snapshot.isStaff },
      }),
    );
    settledUserIdRef.current = userId;
    setLoading(false);
    return snapshot.lookupFailed;
  }, [userId, expectedBillingEnvironment]);

  useEffect(() => {
    if (authLoading) return;
    if (!enabled) return;
    void doLoad();
  }, [authLoading, doLoad, enabled]);

  const refetch = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    return doLoad();
  }, [enabled, doLoad]);

  return { loading, lookupFailed, entitlement, refetch };
}
