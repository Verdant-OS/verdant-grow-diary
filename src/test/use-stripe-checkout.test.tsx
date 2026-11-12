/**
 * useStripeCheckout: one start at a time, the button stays busy through the
 * redirect, a not-configured Stripe falls back quietly, and a real refusal
 * shows calm copy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";

const requestMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/lib/stripeCheckoutService", () => ({
  requestStripeCheckout: (...args: unknown[]) => requestMock(...args),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

describe("useStripeCheckout", () => {
  const assign = vi.fn();

  beforeEach(() => {
    requestMock.mockReset();
    toastMock.mockReset();
    assign.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
  });

  it("redirects to Stripe and stays loading through the redirect", async () => {
    requestMock.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    const { result } = renderHook(() => useStripeCheckout());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.startStripeCheckout("pro_monthly");
    });
    expect(outcome).toBe("redirecting");
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1");
    expect(result.current.loading).toBe(true);
  });

  it("ignores a second tap while the first start is in flight", async () => {
    let resolve!: (value: unknown) => void;
    requestMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useStripeCheckout());
    let first!: Promise<string>;
    let second: string | undefined;
    await act(async () => {
      first = result.current.startStripeCheckout("pro_monthly");
      second = await result.current.startStripeCheckout("pro_monthly");
    });
    expect(second).toBe("busy");
    expect(requestMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
      await first;
    });
  });

  it("falls back quietly when Stripe is not configured", async () => {
    requestMock.mockResolvedValue({ ok: false, code: "stripe_not_configured", status: 503 });
    const { result } = renderHook(() => useStripeCheckout());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.startStripeCheckout("pro_annual");
    });
    expect(outcome).toBe("fallback");
    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("shows calm copy for a real refusal and frees the button", async () => {
    requestMock.mockResolvedValue({ ok: false, code: "already_subscribed", status: 409 });
    const { result } = renderHook(() => useStripeCheckout());
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.startStripeCheckout("pro_annual");
    });
    expect(outcome).toBe("failed");
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });

  it("re-enables the Pro button when the grower comes Back from Stripe", async () => {
    requestMock.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    const { result } = renderHook(() => useStripeCheckout());
    await act(async () => {
      await result.current.startStripeCheckout("pro_monthly");
    });
    expect(result.current.loading).toBe(true);
    // A normal pageshow (not from the back-forward cache) changes nothing.
    await act(async () => {
      const fresh = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(fresh, "persisted", { value: false });
      window.dispatchEvent(fresh);
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      const restored = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(restored, "persisted", { value: true });
      window.dispatchEvent(restored);
    });
    expect(result.current.loading).toBe(false);
    requestMock.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_2" });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.startStripeCheckout("pro_monthly");
    });
    expect(outcome).toBe("redirecting");
  });
});
