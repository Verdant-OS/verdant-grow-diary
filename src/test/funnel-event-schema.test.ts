/**
 * Per-event funnel-analytics schema contract.
 *
 * Locks two properties end-to-end:
 *  1. FUNNEL_EVENT_SCHEMA is exhaustive over FUNNEL_EVENTS and every
 *     listed key is a member of the global FUNNEL_PARAM_KEYS allowlist.
 *  2. trackFunnelEvent dispatches on `verdant:analytics` with props
 *     restricted to the per-event schema — extra keys are silently
 *     dropped, the event still fires, and a schema-violation counter
 *     increments so drift is observable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FUNNEL_EVENTS,
  FUNNEL_PARAM_KEYS,
  trackFunnelEvent,
  type FunnelEventName,
} from "@/lib/funnelAnalytics";
import {
  FUNNEL_EVENT_SCHEMA,
  __resetFunnelSchemaViolationCountForTests,
  getFunnelSchemaViolationCount,
} from "@/lib/funnelEventSchema";
import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";

type Captured = { name: string; props: Record<string, unknown> | null };

function captureAnalytics(): { events: Captured[]; stop: () => void } {
  const events: Captured[] = [];
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ name: string; props?: Record<string, unknown> }>).detail;
    events.push({ name: detail?.name, props: detail?.props ?? null });
  };
  window.addEventListener(PRICING_ANALYTICS_EVENT, listener);
  return { events, stop: () => window.removeEventListener(PRICING_ANALYTICS_EVENT, listener) };
}

describe("FUNNEL_EVENT_SCHEMA (catalog integrity)", () => {
  it("is exhaustive over FUNNEL_EVENTS", () => {
    const schemaKeys = new Set(Object.keys(FUNNEL_EVENT_SCHEMA));
    const catalogKeys = new Set(FUNNEL_EVENTS);
    expect(schemaKeys).toEqual(catalogKeys);
  });

  it("only uses keys from the global FUNNEL_PARAM_KEYS allowlist", () => {
    const global = new Set(FUNNEL_PARAM_KEYS);
    for (const [event, keys] of Object.entries(FUNNEL_EVENT_SCHEMA)) {
      for (const k of keys) {
        expect(global.has(k), `${event}: key "${k}" not in FUNNEL_PARAM_KEYS`).toBe(true);
      }
    }
  });

  it("declares no duplicate keys within any event", () => {
    for (const [event, keys] of Object.entries(FUNNEL_EVENT_SCHEMA)) {
      expect(new Set(keys).size, `${event} duplicates`).toBe(keys.length);
    }
  });
});

describe("trackFunnelEvent enforces the per-event schema", () => {
  let capture: ReturnType<typeof captureAnalytics>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetFunnelSchemaViolationCountForTests();
    capture = captureAnalytics();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    capture.stop();
    warnSpy.mockRestore();
  });

  it("keeps approved keys and drops unapproved ones", () => {
    // paywall_cta_clicked allows { surface, plan } — `reason` is globally
    // valid but NOT valid on this event and must be dropped.
    trackFunnelEvent("paywall_cta_clicked", {
      surface: "pricing",
      plan: "pro_monthly",
      reason: "not_allowed_here",
    });

    // First captured event is the funnel dispatch itself.
    const dispatched = capture.events.find((e) => e.name === "paywall_cta_clicked");
    expect(dispatched?.props).toEqual({ surface: "pricing", plan: "pro_monthly" });
    expect(getFunnelSchemaViolationCount()).toBe(1);
  });

  it("emits nothing in props for events that accept no params", () => {
    trackFunnelEvent("grow_created", { plan: "pro_monthly" } as never);
    const dispatched = capture.events.find((e) => e.name === "grow_created");
    expect(dispatched?.props).toEqual({});
    expect(getFunnelSchemaViolationCount()).toBe(1);
  });

  it("still fires the event even when every key is dropped", () => {
    trackFunnelEvent("tent_created", { surface: "onboarding" } as never);
    expect(capture.events.some((e) => e.name === "tent_created")).toBe(true);
  });

  it("does not increment the violation counter on a fully-valid payload", () => {
    trackFunnelEvent("checkout_recovery_plan_slug_fallback", {
      reason: "not_in_allowlist",
      length_bucket: "33+",
    });
    expect(getFunnelSchemaViolationCount()).toBe(0);
    const dispatched = capture.events.find(
      (e) => e.name === "checkout_recovery_plan_slug_fallback",
    );
    expect(dispatched?.props).toEqual({
      reason: "not_in_allowlist",
      length_bucket: "33+",
    });
  });

  it("gtag receives the same schema-restricted payload as the CustomEvent", () => {
    const gtag = vi.fn();
    (window as unknown as { gtag?: unknown }).gtag = gtag;
    try {
      trackFunnelEvent("checkout_started", {
        plan: "pro_annual",
        surface: "pricing", // not allowed on checkout_started
      } as never);
      expect(gtag).toHaveBeenCalledWith("event", "checkout_started", { plan: "pro_annual" });
    } finally {
      delete (window as unknown as { gtag?: unknown }).gtag;
    }
  });

  it("every catalogued event is dispatchable with its schema-allowed keys", () => {
    const sample: Record<string, string | number | boolean> = {
      surface: "pricing",
      plan: "pro_monthly",
      method: "email",
      event_type: "note",
      rows: 3,
      reason: "price_not_configured",
      length_bucket: "1-8",
    };
    for (const name of FUNNEL_EVENTS as ReadonlyArray<FunnelEventName>) {
      const allowed = FUNNEL_EVENT_SCHEMA[name];
      const payload: Record<string, string | number | boolean> = {};
      for (const k of allowed) payload[k] = sample[k];
      __resetFunnelSchemaViolationCountForTests();
      trackFunnelEvent(name, payload);
      expect(getFunnelSchemaViolationCount(), `${name} should not violate`).toBe(0);
    }
  });
});
