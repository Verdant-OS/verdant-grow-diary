/**
 * Slice D — checkoutOverlaySession pure module.
 *
 * Verifies:
 *   - checkout.closed WITHOUT prior checkout.completed → cancel callback fires
 *   - checkout.completed then checkout.closed → callback does NOT fire
 *   - session is one-shot: duplicate close/complete events are ignored
 *   - starting a new session drops the previous one silently (no cancel)
 *   - unrelated / malformed events are no-ops
 *   - a throwing callback does not propagate out of the handler
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  beginCheckoutSession,
  handlePaddleCheckoutEvent,
  markCheckoutCompleted,
  _peekActiveSessionForTests,
  _resetCheckoutOverlaySessionForTests,
} from "@/lib/checkoutOverlaySession";

beforeEach(() => {
  _resetCheckoutOverlaySessionForTests();
});

describe("checkoutOverlaySession — cancel routing", () => {
  it("fires the cancel callback when checkout.closed arrives without completion", () => {
    const onCancel = vi.fn();
    beginCheckoutSession(onCancel);
    handlePaddleCheckoutEvent({ name: "checkout.closed" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire the cancel callback when completion precedes close", () => {
    const onCancel = vi.fn();
    beginCheckoutSession(onCancel);
    handlePaddleCheckoutEvent({ name: "checkout.completed" });
    handlePaddleCheckoutEvent({ name: "checkout.closed" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("markCheckoutCompleted by id also suppresses the cancel path", () => {
    const onCancel = vi.fn();
    const id = beginCheckoutSession(onCancel);
    markCheckoutCompleted(id);
    handlePaddleCheckoutEvent({ name: "checkout.closed" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ignores duplicate close events after the session has settled", () => {
    const onCancel = vi.fn();
    beginCheckoutSession(onCancel);
    handlePaddleCheckoutEvent({ name: "checkout.closed" });
    handlePaddleCheckoutEvent({ name: "checkout.closed" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("starting a new session replaces the previous one WITHOUT firing its cancel", () => {
    const first = vi.fn();
    const second = vi.fn();
    beginCheckoutSession(first);
    beginCheckoutSession(second);
    handlePaddleCheckoutEvent({ name: "checkout.closed" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("markCheckoutCompleted with a mismatched id is a no-op", () => {
    const onCancel = vi.fn();
    beginCheckoutSession(onCancel);
    markCheckoutCompleted("paddle-checkout-forged-id");
    handlePaddleCheckoutEvent({ name: "checkout.closed" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated event names, null, and malformed payloads", () => {
    const onCancel = vi.fn();
    beginCheckoutSession(onCancel);
    handlePaddleCheckoutEvent({ name: "checkout.loaded" });
    handlePaddleCheckoutEvent({ name: "checkout.warning" });
    handlePaddleCheckoutEvent({} as any);
    handlePaddleCheckoutEvent(null);
    handlePaddleCheckoutEvent(undefined);
    handlePaddleCheckoutEvent({ name: null } as any);
    expect(onCancel).not.toHaveBeenCalled();
    expect(_peekActiveSessionForTests()?.settled).toBe(false);
  });

  it("no active session → all events are safe no-ops", () => {
    expect(() =>
      handlePaddleCheckoutEvent({ name: "checkout.closed" }),
    ).not.toThrow();
    expect(_peekActiveSessionForTests()).toBeNull();
  });

  it("swallows a throwing cancel callback", () => {
    beginCheckoutSession(() => {
      throw new Error("navigation blew up");
    });
    expect(() =>
      handlePaddleCheckoutEvent({ name: "checkout.closed" }),
    ).not.toThrow();
  });
});
