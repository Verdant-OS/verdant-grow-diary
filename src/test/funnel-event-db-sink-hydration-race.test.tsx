/**
 * FunnelEventDbSink — consent/auth hydration race.
 *
 * Flagged by an automated review on PR #964 (Codex, P1): the fix that
 * reorders FunnelEventDbSink before <Outlet/> guarantees the window
 * LISTENER is registered before a route's own mount-effect trackFunnelEvent
 * call — but it does not guarantee consentGrantedRef/userIdRef reflect real
 * values yet. useAnalyticsConsent's hydration read is synchronous
 * (readAnalyticsConsent()) but delivered via setDecision/setHydrated inside
 * an effect, and AuthProvider's session read is genuinely async
 * (supabase.auth.getSession() is a Promise). Neither setState call
 * synchronously updates the sink's refs mid-flush — a re-render only
 * happens AFTER the current effect flush finishes across the whole tree.
 * So a route mount effect firing in that SAME first flush (e.g. Pricing's
 * paywall_viewed on a cold direct load) sees the refs' pre-hydration
 * values (false/null) regardless of listener-registration order.
 *
 * These mock hooks use REAL useState/useEffect (not a static return value)
 * specifically to reproduce that timing faithfully, rather than asserting
 * against a description of the bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState, useEffect } from "react";
import { render, waitFor } from "@testing-library/react";

const fixtureState = vi.hoisted(() => ({
  finalConsent: "granted" as "granted" | "denied",
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => {
    const [user, setUser] = useState<{ id: string } | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
      // A resolved Promise .then() — even at 0ms, this cannot run until the
      // current synchronous effect flush (and the microtask checkpoint
      // after it) completes, faithfully modeling supabase.auth.getSession().
      Promise.resolve().then(() => {
        setUser({ id: "user-1" });
        setLoading(false);
      });
    }, []);
    return { user, loading };
  },
}));

vi.mock("@/hooks/useAnalyticsConsent", () => ({
  useAnalyticsConsent: () => {
    const [decision, setDecision] = useState<"unset" | "granted" | "denied">("unset");
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
      // Synchronous "read" (mirrors readAnalyticsConsent()), but still just
      // a setState call inside an effect — the ref update it feeds is
      // deferred to the next render, same as the real hook.
      setDecision(fixtureState.finalConsent);
      setHydrated(true);
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
  fixtureState.finalConsent = "granted";
});

/** Mirrors Pricing.tsx:348-351 — fires synchronously in its own mount effect. */
function PricingLikePage() {
  useEffect(() => {
    trackFunnelEvent("paywall_viewed", { surface: "pricing" });
  }, []);
  return null;
}

describe("FunnelEventDbSink · consent/auth hydration race", () => {
  it("still captures a route's mount-effect event fired in the SAME initial flush as the sink's own mount, even though consent/auth are not yet hydrated at that instant", async () => {
    render(
      <>
        <FunnelEventDbSink />
        <PricingLikePage />
      </>,
    );
    // At the moment PricingLikePage's effect fires, useAnalyticsConsent's
    // hydration effect and useAuth's session effect have not yet delivered
    // their real values (both resolve after this same effect flush), so a
    // sink that decides synchronously off consentGrantedRef/userIdRef at
    // dispatch time would drop this event permanently. It must be buffered
    // and replayed once both signals settle instead.
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "paywall_viewed",
      props: { surface: "pricing" },
    });
  });

  it("does not double-write: an event fired well after hydration settles is written exactly once, not once from the buffer and once live", async () => {
    render(<FunnelEventDbSink />);
    await new Promise((r) => setTimeout(r, 10));
    trackFunnelEvent("grow_created");
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "grow_created",
      props: {},
    });
  });

  it("a buffered event is dropped, not force-written, if consent settles to denied", async () => {
    fixtureState.finalConsent = "denied";
    render(
      <>
        <FunnelEventDbSink />
        <PricingLikePage />
      </>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
