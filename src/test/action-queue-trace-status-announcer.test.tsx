import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ActionQueueTraceStatusAnnouncer from "@/components/ActionQueueTraceStatusAnnouncer";
import { TRACE_STATUS_ANNOUNCEMENT_TESTID } from "@/lib/actionQueueTraceStatusA11yRules";

describe("ActionQueueTraceStatusAnnouncer", () => {
  it("renders a polite aria-live region", () => {
    const { getByTestId } = render(
      <ActionQueueTraceStatusAnnouncer state="idle" />,
    );
    const node = getByTestId(TRACE_STATUS_ANNOUNCEMENT_TESTID);
    expect(node.getAttribute("aria-live")).toBe("polite");
    expect(node.getAttribute("role")).toBe("status");
  });

  it("stays empty on initial idle render", () => {
    const { getByTestId } = render(
      <ActionQueueTraceStatusAnnouncer state="idle" />,
    );
    expect(getByTestId(TRACE_STATUS_ANNOUNCEMENT_TESTID).textContent).toBe("");
  });

  it("announces 'Retrying trace' when state transitions to retrying", () => {
    const { getByTestId, rerender } = render(
      <ActionQueueTraceStatusAnnouncer state="idle" />,
    );
    rerender(<ActionQueueTraceStatusAnnouncer state="retrying" />);
    expect(getByTestId(TRACE_STATUS_ANNOUNCEMENT_TESTID).textContent).toBe(
      "Retrying trace",
    );
  });

  it("announces 'Trace failed' when state transitions to failed", () => {
    const { getByTestId, rerender } = render(
      <ActionQueueTraceStatusAnnouncer state="idle" />,
    );
    rerender(<ActionQueueTraceStatusAnnouncer state="failed" />);
    expect(getByTestId(TRACE_STATUS_ANNOUNCEMENT_TESTID).textContent).toBe(
      "Trace failed",
    );
  });

  it("announces 'Trace OK' when state transitions back to idle from failure", () => {
    const { getByTestId, rerender } = render(
      <ActionQueueTraceStatusAnnouncer state="failed" />,
    );
    // Initial 'failed' is announced because it's a non-idle initial state.
    expect(getByTestId(TRACE_STATUS_ANNOUNCEMENT_TESTID).textContent).toBe(
      "Trace failed",
    );
    rerender(<ActionQueueTraceStatusAnnouncer state="idle" />);
    expect(getByTestId(TRACE_STATUS_ANNOUNCEMENT_TESTID).textContent).toBe(
      "Trace OK",
    );
  });

  it("never exposes internal IDs in the announcement region", () => {
    const { getByTestId, rerender } = render(
      <ActionQueueTraceStatusAnnouncer state="failed" />,
    );
    rerender(<ActionQueueTraceStatusAnnouncer state="retrying" />);
    const text = getByTestId(TRACE_STATUS_ANNOUNCEMENT_TESTID).textContent ?? "";
    expect(text).not.toMatch(/[0-9a-f]{8}-/i);
    expect(text).not.toMatch(/aq-/i);
  });
});
