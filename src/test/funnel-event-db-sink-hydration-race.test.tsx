/**
 * FunnelEventDbSink — consent/auth hydration race.
 *
 * Two related findings, both from automated review:
 *
 * 1. (PR #964 -> fixed in #968) Reordering FunnelEventDbSink before
 *    <Outlet/> guarantees the window LISTENER exists before a route's own
 *    mount-effect trackFunnelEvent call (e.g. Pricing's paywall_viewed) --
 *    but not that consentGrantedRef/userIdRef already reflect real values.
 *    useAnalyticsConsent's hydration read is synchronous but delivered via
 *    setState inside an effect; AuthProvider's session read is genuinely
 *    async. Neither setState synchronously updates these refs mid-flush --
 *    a re-render only happens after the CURRENT effect flush finishes
 *    across the whole tree. A route mount effect firing in that same first
 *    flush sees the refs' pre-hydration values and the event was silently,
 *    permanently dropped.
 *
 * 2. (PR #968 -> fixed here, Codex P1) The first fix's buffer-until-both-
 *    ready approach didn't distinguish "consent is ALREADY decided from a
 *    prior session, just not yet reflected in a re-render" from "consent
 *    is genuinely unset, a first-time visitor hasn't decided yet." Because
 *    readiness only checked consentHydrated && !authLoading, an event
 *    observed while consent was truly unset could sit in the buffer and
 *    get retroactively WRITTEN once the visitor later accepted and auth
 *    happened to resolve afterward -- capturing pre-consent activity,
 *    contradicting the "nothing analytics-related loads until acceptance"
 *    promise. The fix: "unset" and "denied" are decidable the MOMENT
 *    consent hydrates, regardless of auth state, since the outcome (don't
 *    write) is already determined -- only "granted" needs to wait on auth.
 *
 * All hydration/auth/consent timing here is deterministically controlled
 * via act()-wrapped triggers rather than real Promise/setTimeout races, so
 * these tests assert exact causal ordering instead of hoping a real timer
 * lands a particular way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState, useEffect } from "react";
import { render, act, waitFor } from "@testing-library/react";

type ConsentDecision = "unset" | "granted" | "denied";

const consentControl = vi.hoisted(() => {
  let current: ConsentDecision = "unset";
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (d: ConsentDecision) => {
      current = d;
      listeners.forEach((l) => l());
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    reset: () => {
      current = "unset";
      listeners.clear();
    },
  };
});

const authControl = vi.hoisted(() => {
  let resolved = false;
  let pendingResolver: (() => void) | null = null;
  return {
    resolve: () => {
      resolved = true;
      pendingResolver?.();
    },
    reset: () => {
      resolved = false;
      pendingResolver = null;
    },
    register: (fn: () => void) => {
      pendingResolver = fn;
      if (resolved) fn();
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => {
    const [user, setUser] = useState<{ id: string } | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
      authControl.register(() => {
        setUser({ id: "user-1" });
        setLoading(false);
      });
    }, []);
    return { user, loading };
  },
}));

vi.mock("@/hooks/useAnalyticsConsent", () => ({
  useAnalyticsConsent: () => {
    const [decision, setDecision] = useState<ConsentDecision>("unset");
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
      setDecision(consentControl.get());
      setHydrated(true);
      return consentControl.subscribe(() => setDecision(consentControl.get()));
    }, []);
    return { decision, hydrated };
  },
}));

const insertSpy = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (_table: string) => ({ insert: insertSpy }) },
}));

import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import FunnelEventDbSink from "@/components/FunnelEventDbSink";

beforeEach(() => {
  insertSpy.mockClear();
  consentControl.reset();
  authControl.reset();
});

/** Mirrors Pricing.tsx:348-351 — fires synchronously in its own mount effect. */
function PricingLikePage() {
  useEffect(() => {
    trackFunnelEvent("paywall_viewed", { surface: "pricing" });
  }, []);
  return null;
}

describe("FunnelEventDbSink · consent/auth hydration race", () => {
  it("still captures a route's mount-effect event once a PRIOR-session consent hydrates and auth resolves", async () => {
    consentControl.set("granted"); // simulates a returning, already-consented visitor
    render(
      <>
        <FunnelEventDbSink />
        <PricingLikePage />
      </>,
    );
    // Consent is known (granted), but auth hasn't resolved yet -- must
    // still be waiting, not dropped and not written.
    expect(insertSpy).not.toHaveBeenCalled();

    await act(async () => {
      authControl.resolve();
    });
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "paywall_viewed",
      props: { surface: "pricing" },
    });
  });

  it("does not double-write: an event fired well after hydration settles is written exactly once", async () => {
    consentControl.set("granted");
    render(<FunnelEventDbSink />);
    await act(async () => {
      authControl.resolve();
    });
    trackFunnelEvent("grow_created");
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "grow_created",
      props: {},
    });
  });

  it("a buffered event is dropped, not force-written, when consent hydrates to denied -- and does not wait on auth to decide that", async () => {
    consentControl.set("denied");
    render(
      <>
        <FunnelEventDbSink />
        <PricingLikePage />
      </>,
    );
    // Denied is decidable immediately on hydration; auth is never resolved
    // in this test at all, proving the drop doesn't wait on it.
    await new Promise((r) => setTimeout(r, 10));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("never retroactively writes an event observed while consent was genuinely unset, even if the visitor accepts before auth resolves", async () => {
    // consentControl starts "unset" (default / first-time-visitor state).
    render(
      <>
        <FunnelEventDbSink />
        <PricingLikePage />
      </>,
    );
    // Hydration alone (still "unset") must be enough to resolve and drop
    // this event -- it must NOT wait on auth, since the outcome ("unset"
    // means don't write) is already determined the moment consent hydrates.
    expect(insertSpy).not.toHaveBeenCalled();

    // The visitor accepts analytics BEFORE auth has resolved.
    await act(async () => {
      consentControl.set("granted");
    });
    expect(insertSpy).not.toHaveBeenCalled();

    // Auth resolves after the accept.
    await act(async () => {
      authControl.resolve();
    });
    await new Promise((r) => setTimeout(r, 10));

    // The ORIGINAL pre-consent paywall_viewed must never be written --
    // only events observed AFTER genuine consent should ever be captured.
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("captures a NEW event fired after the visitor accepts, once auth also resolves", async () => {
    render(<FunnelEventDbSink />);
    await act(async () => {
      consentControl.set("granted");
    });
    trackFunnelEvent("grow_created");
    expect(insertSpy).not.toHaveBeenCalled(); // still waiting on auth

    await act(async () => {
      authControl.resolve();
    });
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "grow_created",
      props: {},
    });
  });
});
