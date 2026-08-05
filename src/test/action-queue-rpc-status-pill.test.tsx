import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionQueueRpcStatusPill } from "@/components/ActionQueueRpcStatusPill";
import {
  ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY,
  ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY,
  ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY,
} from "@/lib/actionQueueRpcAvailability";

/**
 * Verifies the ActionQueue transition-RPC status pill renders the correct
 * grower-safe copy, ARIA state, and icon for each mocked `rpcAvailability`
 * value. Guards against silent drift in tri-state UX (unknown / available /
 * unavailable) — growers must never see stale or assumed status.
 */
describe("ActionQueueRpcStatusPill", () => {
  it("renders the checking placeholder while availability is unknown", () => {
    render(<ActionQueueRpcStatusPill availability="unknown" />);
    const pill = screen.getByTestId("action-queue-transition-rpc-status-pill");
    expect(pill).toHaveAttribute("data-state", "unknown");
    expect(pill).toHaveAttribute("aria-busy", "true");
    expect(pill).toHaveAttribute("title", ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY.title);
    expect(pill).toHaveTextContent(ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY.label);
    expect(
      screen.getByTestId("action-queue-transition-rpc-status-pill-icon-checking"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("action-queue-transition-rpc-status-pill-icon-available"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("action-queue-transition-rpc-status-pill-icon-unavailable"),
    ).not.toBeInTheDocument();
  });

  it("renders the ready state with success icon when the RPC is available", () => {
    render(<ActionQueueRpcStatusPill availability="available" />);
    const pill = screen.getByTestId("action-queue-transition-rpc-status-pill");
    expect(pill).toHaveAttribute("data-state", "available");
    expect(pill).toHaveAttribute("aria-busy", "false");
    expect(pill).toHaveAttribute("title", ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY.title);
    expect(pill).toHaveTextContent(ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY.label);
    expect(
      screen.getByTestId("action-queue-transition-rpc-status-pill-icon-available"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("action-queue-transition-rpc-status-pill-icon-checking"),
    ).not.toBeInTheDocument();
  });

  it("renders the unavailable state with warning icon and destructive styling when rpcUnavailable is true", () => {
    render(<ActionQueueRpcStatusPill availability="unavailable" />);
    const pill = screen.getByTestId("action-queue-transition-rpc-status-pill");
    expect(pill).toHaveAttribute("data-state", "unavailable");
    expect(pill).toHaveAttribute("aria-busy", "false");
    expect(pill).toHaveAttribute("title", ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY.title);
    expect(pill).toHaveTextContent("Transitions unavailable");
    expect(pill.className).toContain("text-destructive");
    expect(
      screen.getByTestId("action-queue-transition-rpc-status-pill-icon-unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("action-queue-transition-rpc-status-pill-icon-checking"),
    ).not.toBeInTheDocument();
  });

  it("never leaks internal RPC identifiers into the rendered label or title", () => {
    for (const availability of ["unknown", "available", "unavailable"] as const) {
      const { unmount } = render(<ActionQueueRpcStatusPill availability={availability} />);
      const pill = screen.getByTestId("action-queue-transition-rpc-status-pill");
      const haystack = `${pill.textContent ?? ""} ${pill.getAttribute("title") ?? ""}`;
      expect(haystack).not.toMatch(/action_queue_transition/i);
      expect(haystack).not.toMatch(/rpc/i);
      expect(haystack).not.toMatch(/postgrest|pgrst/i);
      unmount();
    }
  });
});
