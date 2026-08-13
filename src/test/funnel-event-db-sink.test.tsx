/**
 * FunnelEventDbSink — mounted component behaviour.
 *
 * Exercises the listener end to end: real trackFunnelEvent() calls through
 * the ACTUAL verdant:analytics bridge (not a mocked dispatcher), so this
 * proves the whole chain — trackFunnelEvent -> sanitize -> schema -> mirror
 * dispatch -> this listener -> decideFunnelEventSinkWrite -> insert — works
 * together, not just each piece in isolation. Also dispatches raw, forged
 * events directly (bypassing trackFunnelEvent entirely) to prove the
 * component doesn't trust the bridge either.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const state = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  consent: "granted" as "unset" | "granted" | "denied",
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: state.userId ? { id: state.userId } : null }),
}));
vi.mock("@/hooks/useAnalyticsConsent", () => ({
  useAnalyticsConsent: () => ({ decision: state.consent, hydrated: true }),
}));

const insertSpy = vi.hoisted(() => vi.fn(async () => ({ data: null, error: null })));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (_table: string) => ({ insert: insertSpy }) },
}));

import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import FunnelEventDbSink from "@/components/FunnelEventDbSink";

const ROOT = resolve(__dirname, "../..");
const ROOT_ROUTE = readFileSync(resolve(ROOT, "src/routes/__root.tsx"), "utf8");

beforeEach(() => {
  insertSpy.mockClear();
  state.userId = "user-1";
  state.consent = "granted";
});

describe("FunnelEventDbSink · end-to-end through the real bridge", () => {
  it("inserts a row for a real trackFunnelEvent call when consented and signed in", async () => {
    render(<FunnelEventDbSink />);
    trackFunnelEvent("grow_created");
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "grow_created",
      props: {},
    });
  });

  it("carries sanitized params through end to end", async () => {
    render(<FunnelEventDbSink />);
    trackFunnelEvent("quick_log_saved", {
      event_type: "water",
      // @ts-expect-error — hostile extra key must never reach the insert
      note: "watered 500ml, looked droopy",
    });
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "quick_log_saved",
      props: { event_type: "water" },
    });
  });
});

describe("FunnelEventDbSink · consent and identity gates", () => {
  it("never inserts without granted consent", async () => {
    state.consent = "denied";
    render(<FunnelEventDbSink />);
    trackFunnelEvent("grow_created");
    await new Promise((r) => setTimeout(r, 0));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("never inserts while consent is merely unset", async () => {
    state.consent = "unset";
    render(<FunnelEventDbSink />);
    trackFunnelEvent("grow_created");
    await new Promise((r) => setTimeout(r, 0));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("never inserts for a signed-out visitor", async () => {
    state.userId = null;
    render(<FunnelEventDbSink />);
    trackFunnelEvent("grow_created");
    await new Promise((r) => setTimeout(r, 0));
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

describe("FunnelEventDbSink · does not trust the bridge itself", () => {
  it("ignores a raw, forged CustomEvent with an unknown event name", async () => {
    render(<FunnelEventDbSink />);
    window.dispatchEvent(
      new CustomEvent(PRICING_ANALYTICS_EVENT, {
        detail: { name: "totally_made_up_event", props: { surface: "x" } },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("does not throw on a malformed forged dispatch", async () => {
    render(<FunnelEventDbSink />);
    expect(() =>
      window.dispatchEvent(new CustomEvent(PRICING_ANALYTICS_EVENT, { detail: "not an object" })),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("never blocks or throws when the insert itself rejects", async () => {
    insertSpy.mockRejectedValueOnce(new Error("network down"));
    render(<FunnelEventDbSink />);
    expect(() => trackFunnelEvent("grow_created")).not.toThrow();
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
  });
});

describe("FunnelEventDbSink · wiring", () => {
  it("is mounted at the true app root, alongside AnalyticsShell", () => {
    expect(ROOT_ROUTE).toContain('import FunnelEventDbSink from "@/components/FunnelEventDbSink"');
    expect(ROOT_ROUTE).toMatch(/<AnalyticsShell \/>\s*\n\s*<FunnelEventDbSink \/>/);
  });

  // React fires sibling mount effects in JSX order. __root.tsx's route
  // content (<Outlet/>, and every page nested under it) is a sibling of
  // this sink, not an ancestor — so if the sink were positioned AFTER
  // Outlet, a page's own mount-effect trackFunnelEvent call (e.g.
  // Pricing.tsx's paywall_viewed) would dispatch into a window with no
  // listener yet on a cold/direct load, and the event would be silently
  // lost. This is proven structurally below, not just asserted.
  it("must sit before the route outlet, or a page's own mount-effect event is lost on cold load", () => {
    const outletIdx = ROOT_ROUTE.indexOf("<Outlet />");
    const sinkIdx = ROOT_ROUTE.indexOf("<FunnelEventDbSink />");
    expect(outletIdx).toBeGreaterThan(-1);
    expect(sinkIdx).toBeGreaterThan(-1);
    expect(sinkIdx).toBeLessThan(outletIdx);
  });
});

describe("FunnelEventDbSink · sibling mount-effect ordering (the mechanism behind the wiring test above)", () => {
  // A minimal stand-in for Pricing.tsx's own mount effect (Pricing.tsx:348-351):
  // fires trackFunnelEvent synchronously on mount, before any cleanup can run.
  function PricingLikePage() {
    useEffect(() => {
      trackFunnelEvent("paywall_viewed", { surface: "pricing" });
    }, []);
    return null;
  }

  it("loses the event when the sink is positioned AFTER the page (today's bug shape, reproduced directly)", async () => {
    render(
      <>
        <PricingLikePage />
        <FunnelEventDbSink />
      </>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("captures the event when the sink is positioned BEFORE the page (the fixed shape)", async () => {
    render(
      <>
        <FunnelEventDbSink />
        <PricingLikePage />
      </>,
    );
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    expect(insertSpy).toHaveBeenCalledWith({
      user_id: "user-1",
      event_name: "paywall_viewed",
      props: { surface: "pricing" },
    });
  });
});
