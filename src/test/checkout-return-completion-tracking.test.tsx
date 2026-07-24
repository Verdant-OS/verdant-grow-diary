import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCheckoutReturnNavigationState } from "@/lib/checkoutReturnTo";
import { useCheckoutReturnCompletionTracking } from "@/hooks/useCheckoutReturnCompletionTracking";

const trackFunnelEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

function Harness({ enabled = true }: { enabled?: boolean }) {
  useCheckoutReturnCompletionTracking(enabled);
  const location = useLocation();
  return <div data-testid="router-state">{location.state === null ? "cleared" : "present"}</div>;
}

beforeEach(() => trackFunnelEvent.mockReset());

describe("useCheckoutReturnCompletionTracking", () => {
  it("records once after destination mount and consumes the history marker", async () => {
    render(
      <StrictMode>
        <MemoryRouter
          initialEntries={[
            {
              pathname: "/plants/private-id",
              search: "?tentId=private-id",
              hash: "#plant-ai-doctor-review",
              state: buildCheckoutReturnNavigationState("ai_doctor"),
            },
          ]}
        >
          <Harness />
        </MemoryRouter>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(trackFunnelEvent).toHaveBeenCalledWith("checkout_return_completed", {
        surface: "ai_doctor",
      }),
    );
    await waitFor(() => expect(screen.getByTestId("router-state")).toHaveTextContent("cleared"));
    expect(trackFunnelEvent).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(trackFunnelEvent.mock.calls)).not.toMatch(/private-id|plants|tentId/);
  });

  it("does nothing without a valid one-shot marker", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/dashboard", state: { arbitrary: true } }]}>
        <Harness />
      </MemoryRouter>,
    );
    await Promise.resolve();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId("router-state")).toHaveTextContent("present");
  });

  it("preserves the marker until destination readiness succeeds, then records once", async () => {
    const { rerender } = render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/dashboard",
            state: buildCheckoutReturnNavigationState("other"),
          },
        ]}
      >
        <Harness enabled={false} />
      </MemoryRouter>,
    );
    await Promise.resolve();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId("router-state")).toHaveTextContent("present");

    rerender(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/dashboard",
            state: buildCheckoutReturnNavigationState("other"),
          },
        ]}
      >
        <Harness enabled />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(trackFunnelEvent).toHaveBeenCalledWith("checkout_return_completed", {
        surface: "other",
      }),
    );
    await waitFor(() => expect(screen.getByTestId("router-state")).toHaveTextContent("cleared"));
    expect(trackFunnelEvent).toHaveBeenCalledTimes(1);
  });
});
