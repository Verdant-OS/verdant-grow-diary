/**
 * useCommittedRouteDeparture — browser fallback when TanStack router is absent.
 *
 * Account deletion binds to the confirming session until the grower leaves
 * Settings. account-deletion-continuation.test.tsx covers router.navigate;
 * this file pins popstate/hashchange departure for non-TanStack hosts.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCommittedRouteDeparture } from "@/hooks/useCommittedRouteDeparture";

const routerMock = vi.hoisted(() => ({
  present: true,
  startingHref: "http://127.0.0.1:8080/settings",
  subscribe: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () =>
    routerMock.present
      ? {
          state: { location: { href: routerMock.startingHref } },
          subscribe: routerMock.subscribe,
        }
      : null,
}));

vi.mock("@/lib/routerCommittedLocation", () => ({
  selectCommittedLocation: (state: { location: { href: string } }) => state.location,
}));

describe("useCommittedRouteDeparture", () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    routerMock.present = true;
    routerMock.subscribe.mockReset();
    window.history.replaceState({}, "", "/settings");
  });

  afterEach(() => {
    window.history.replaceState({}, "", originalHref);
  });

  it("fires onResolved when the committed router href changes", () => {
    let onResolved: ((event: { toLocation: { href: string } }) => void) | undefined;
    routerMock.subscribe.mockImplementation((_event, listener) => {
      onResolved = listener;
      return () => undefined;
    });

    const onDeparture = vi.fn();
    const { result } = renderHook(() => useCommittedRouteDeparture());

    const unsubscribe = result.current(onDeparture);
    expect(routerMock.subscribe).toHaveBeenCalledWith("onResolved", expect.any(Function));

    onResolved?.({ toLocation: { href: "http://127.0.0.1:8080/plants" } });
    expect(onDeparture).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("does not fire when the resolved href matches the starting href", () => {
    let onResolved: ((event: { toLocation: { href: string } }) => void) | undefined;
    routerMock.subscribe.mockImplementation((_event, listener) => {
      onResolved = listener;
      return () => undefined;
    });

    const onDeparture = vi.fn();
    const { result } = renderHook(() => useCommittedRouteDeparture());
    result.current(onDeparture);

    onResolved?.({ toLocation: { href: routerMock.startingHref } });
    expect(onDeparture).not.toHaveBeenCalled();
  });

  it("falls back to popstate when TanStack router is unavailable", () => {
    routerMock.present = false;
    window.history.replaceState({}, "", "/settings");

    const onDeparture = vi.fn();
    const { result } = renderHook(() => useCommittedRouteDeparture());
    const unsubscribe = result.current(onDeparture);

    act(() => {
      window.history.pushState({}, "", "/plants");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onDeparture).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("falls back to hashchange when TanStack router is unavailable", () => {
    routerMock.present = false;
    window.history.replaceState({}, "", "/settings");

    const onDeparture = vi.fn();
    const { result } = renderHook(() => useCommittedRouteDeparture());
    const unsubscribe = result.current(onDeparture);

    act(() => {
      window.history.replaceState({}, "", "/settings#billing");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(onDeparture).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
