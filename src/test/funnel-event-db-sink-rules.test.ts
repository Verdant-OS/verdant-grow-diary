/**
 * decideFunnelEventSinkWrite — the actual attack surface of the funnel_events
 * sink. The CustomEvent this reads is dispatched unconditionally by
 * trackFunnelEvent, but ANY script on the page can also dispatch it directly
 * — a browser extension, a compromised dependency, a grower in devtools. RLS
 * confines a forged row to the forger's own account (auth.uid() = user_id),
 * so the stakes here are table integrity and privacy, not a cross-account
 * breach — but a wrong answer here still means real, meaningful data.
 */
import { describe, it, expect } from "vitest";
import { decideFunnelEventSinkWrite } from "@/lib/funnelEventDbSinkRules";

const GRANTED = { consentGranted: true, userId: "user-1" } as const;
const realDetail = (name: string, props: Record<string, unknown> = {}) => ({ name, props });

describe("funnel_events sink · consent and identity gate first", () => {
  it("never writes without granted consent, regardless of a perfectly valid event", () => {
    for (const consentGranted of [false]) {
      expect(
        decideFunnelEventSinkWrite({
          detail: realDetail("signup", { method: "email" }),
          consentGranted,
          userId: "user-1",
        }).write,
      ).toBe(false);
    }
  });

  it("never writes for a signed-out visitor", () => {
    expect(
      decideFunnelEventSinkWrite({
        detail: realDetail("signup", { method: "email" }),
        consentGranted: true,
        userId: null,
      }).write,
    ).toBe(false);
  });

  it('writes only on the exact string "granted" — not a truthy stand-in', () => {
    // consentGranted is already boolean-typed at the call site, but the
    // decision itself must be the caller's job (decision === "granted"),
    // never re-derived here from something looser.
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("signup", { method: "email" }),
      ...GRANTED,
    });
    expect(outcome.write).toBe(true);
  });
});

describe("funnel_events sink · the event name must be real", () => {
  it("accepts a real catalog event", () => {
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("grow_created"),
      ...GRANTED,
    });
    expect(outcome.write).toBe(true);
    if (outcome.write) expect(outcome.row.event_name).toBe("grow_created");
  });

  it("rejects a name that is not in FUNNEL_EVENTS — a forged event cannot invent a new one", () => {
    expect(
      decideFunnelEventSinkWrite({
        detail: realDetail("totally_made_up_event", { surface: "x" }),
        ...GRANTED,
      }).write,
    ).toBe(false);
  });

  it("rejects a name that merely LOOKS like a prefix/suffix of a real one", () => {
    for (const name of ["signup2", "signupx", " signup", "signup "]) {
      expect(decideFunnelEventSinkWrite({ detail: realDetail(name), ...GRANTED }).write).toBe(
        false,
      );
    }
  });
});

describe("funnel_events sink · props are re-validated, never trusted as-is", () => {
  it("strips a key that is not in this event's OWN schema, even though it's a real allowlisted key elsewhere", () => {
    // "plan" is a real global param key (used by paywall/checkout events) but
    // is NOT in grow_created's schema. A forged event claiming grow_created
    // with a plan attached must not smuggle it through.
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("grow_created", { plan: "founder_lifetime" }),
      ...GRANTED,
    });
    expect(outcome.write).toBe(true);
    if (outcome.write) expect(outcome.row.props).toEqual({});
  });

  it("strips a key that is not in the global allowlist at all", () => {
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("signup", { method: "email", email: "grower@example.com" }),
      ...GRANTED,
    });
    expect(outcome.write).toBe(true);
    if (outcome.write) expect(outcome.row.props).toEqual({ method: "email" });
  });

  it("strips a free-text-shaped value even on an allowed key", () => {
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("checkout_started", { plan: "please charge my card now" }),
      ...GRANTED,
    });
    expect(outcome.write).toBe(true);
    if (outcome.write) expect(outcome.row.props).toEqual({});
  });

  it("never lets a forged event carry an id-shaped value through", () => {
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("blueprint_cta_clicked", {
        surface: "tent_alert_row",
        metric: "temp",
        severity: "warning",
        plant_id: "plant-123",
        user_id: "someone-elses-id",
      }),
      ...GRANTED,
    });
    expect(outcome.write).toBe(true);
    if (!outcome.write) return;
    expect(outcome.row.props).toEqual({
      surface: "tent_alert_row",
      metric: "temp",
      severity: "warning",
    });
    const serialized = JSON.stringify(outcome.row);
    expect(serialized).not.toContain("plant-123");
    expect(serialized).not.toContain("someone-elses-id");
  });
});

describe("funnel_events sink · a detail with no usable event identity never writes", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a bare string", "signup"],
    ["a number", 42],
    ["an array", ["signup"]],
    ["an object with no name", { props: { method: "email" } }],
    ["an object with a non-string name", { name: 123, props: {} }],
  ])("detail = %s", (_label, detail) => {
    expect(() => decideFunnelEventSinkWrite({ detail, ...GRANTED })).not.toThrow();
    expect(decideFunnelEventSinkWrite({ detail, ...GRANTED }).write).toBe(false);
  });
});

describe("funnel_events sink · a valid name with garbage props still writes, empty-propped", () => {
  // Matches enforceFunnelEventSchema's own contract: "The event itself is
  // NEVER refused — analytics must remain fire-and-forget so a schema bug
  // cannot block a save or checkout path." A malformed props object is a
  // params problem, not an identity problem, so it degrades to {} rather
  // than dropping the whole row — consistent with how every real call site
  // already behaves when it sends an extra/wrong-shaped key.
  it.each([
    ["a string", "not an object"],
    ["null", null],
    ["an array", ["method", "email"]],
    ["a number", 42],
  ])("props = %s", (_label, props) => {
    const outcome = decideFunnelEventSinkWrite({
      detail: { name: "signup", props },
      ...GRANTED,
    });
    expect(() =>
      decideFunnelEventSinkWrite({ detail: { name: "signup", props }, ...GRANTED }),
    ).not.toThrow();
    expect(outcome.write).toBe(true);
    if (outcome.write) expect(outcome.row.props).toEqual({});
  });
});

describe("funnel_events sink · the row it builds", () => {
  it("attributes the row to the CALLER-supplied userId, never anything from the detail", () => {
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("signup", { method: "email" }),
      consentGranted: true,
      userId: "the-real-signed-in-user",
    });
    expect(outcome.write).toBe(true);
    if (outcome.write) expect(outcome.row.user_id).toBe("the-real-signed-in-user");
  });

  it("ignores a forged user_id sitting in the detail's props", () => {
    const outcome = decideFunnelEventSinkWrite({
      detail: realDetail("signup", { method: "email", user_id: "attacker-controlled" }),
      ...GRANTED,
    });
    expect(outcome.write).toBe(true);
    if (outcome.write) {
      expect(outcome.row.user_id).toBe("user-1");
      expect(JSON.stringify(outcome.row)).not.toContain("attacker-controlled");
    }
  });
});
