/**
 * funnelAnalytics — module unit tests.
 *
 * Covers the eight-event union pin, gtag no-op safety, the structural
 * param allowlist (free text can never reach the tracker), and the
 * verdant:analytics CustomEvent mirror.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FUNNEL_EVENTS,
  FUNNEL_PARAM_KEYS,
  sanitizeFunnelParams,
  trackFunnelEvent,
  type FunnelEventParams,
} from "@/lib/funnelAnalytics";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

// index.html's GA snippet types gtag globally elsewhere; the tests only
// need an assignable slot, so go through a local view of window.
const win = window as unknown as { gtag?: (...args: unknown[]) => void };

afterEach(() => {
  delete win.gtag;
});

describe("event name contract", () => {
  it("pins exactly the eight growth-calendar funnel events, in order", () => {
    expect([...FUNNEL_EVENTS]).toEqual([
      "signup",
      "tent_created",
      "plant_created",
      "quick_log_saved",
      "csv_import_completed",
      "paywall_viewed",
      "checkout_started",
      "subscription_activated",
    ]);
  });

  it("pins the param-key allowlist", () => {
    expect([...FUNNEL_PARAM_KEYS]).toEqual([
      "surface",
      "plan",
      "method",
      "event_type",
      "rows",
    ]);
  });
});

describe("sanitizeFunnelParams — structural privacy allowlist", () => {
  it("passes enum-like strings, numbers, and booleans on allowed keys", () => {
    expect(
      sanitizeFunnelParams({
        surface: "pricing",
        plan: "pro-monthly",
        rows: 42,
      }),
    ).toEqual({ surface: "pricing", plan: "pro-monthly", rows: 42 });
  });

  it("drops unknown keys entirely", () => {
    const dirty = {
      surface: "upgrade",
      note: "my plant looks droopy today",
      nickname: "Bruce Banner #4",
      email: "grower@example.com",
      user_id: "u-123",
    } as unknown as FunnelEventParams;
    expect(sanitizeFunnelParams(dirty)).toEqual({ surface: "upgrade" });
  });

  it("drops free-text-looking strings even on allowed keys (whitespace)", () => {
    expect(
      sanitizeFunnelParams({ plan: "my favorite plan ever" }),
    ).toEqual({});
  });

  it("drops over-long strings even on allowed keys", () => {
    expect(
      sanitizeFunnelParams({ plan: "x".repeat(33) }),
    ).toEqual({});
    expect(
      sanitizeFunnelParams({ plan: "x".repeat(32) }),
    ).toEqual({ plan: "x".repeat(32) });
  });

  it("drops NaN/Infinity numbers and empty strings", () => {
    expect(
      sanitizeFunnelParams({ rows: Number.NaN, plan: "" }),
    ).toEqual({});
    expect(sanitizeFunnelParams({ rows: Infinity })).toEqual({});
  });

  it("handles undefined params", () => {
    expect(sanitizeFunnelParams(undefined)).toEqual({});
  });
});

describe("trackFunnelEvent — emission", () => {
  it("no-ops without throwing when gtag is absent", () => {
    expect(win.gtag).toBeUndefined();
    expect(() => trackFunnelEvent("signup", { method: "email" })).not.toThrow();
  });

  it("calls gtag('event', name, sanitizedParams) when present", () => {
    const spy = vi.fn();
    win.gtag = spy;
    trackFunnelEvent("quick_log_saved", {
      event_type: "water",
      // @ts-expect-error — hostile extra key must be stripped
      note: "watered 500ml, looked droopy",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("event", "quick_log_saved", {
      event_type: "water",
    });
  });

  it("survives a throwing gtag and still dispatches the mirror event", () => {
    win.gtag = () => {
      throw new Error("blocked");
    };
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(PRICING_ANALYTICS_EVENT, listener);
    try {
      expect(() =>
        trackFunnelEvent("paywall_viewed", { surface: "pricing" }),
      ).not.toThrow();
      expect(seen).toEqual([
        { name: "paywall_viewed", props: { surface: "pricing" } },
      ]);
    } finally {
      window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
    }
  });

  it("mirrors every event onto the verdant:analytics bridge", () => {
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(PRICING_ANALYTICS_EVENT, listener);
    try {
      trackFunnelEvent("subscription_activated", { plan: "pro_annual" });
      expect(seen).toEqual([
        { name: "subscription_activated", props: { plan: "pro_annual" } },
      ]);
    } finally {
      window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
    }
  });
});
