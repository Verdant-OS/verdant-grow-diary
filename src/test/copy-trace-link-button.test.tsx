import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import CopyTraceLinkButton from "@/components/CopyTraceLinkButton";
import {
  COPY_TRACE_LINK_SUCCESS_COPY,
  COPY_TRACE_LINK_FAILURE_COPY,
  COPY_TRACE_LINK_TESTID,
  COPY_TRACE_LINK_STATUS_TESTID,
} from "@/lib/actionQueueTraceLinkCopyRules";

describe("CopyTraceLinkButton", () => {
  it("writes the supplied URL via the injected clipboard and announces success", async () => {
    const writeText = vi.fn(async () => {});
    const { getByTestId } = render(
      <CopyTraceLinkButton
        url="/actions?highlight=action-queue:aq-1:approved"
        clipboard={{ writeText }}
      />,
    );
    fireEvent.click(getByTestId(COPY_TRACE_LINK_TESTID));
    await waitFor(() =>
      expect(getByTestId(COPY_TRACE_LINK_STATUS_TESTID).textContent).toBe(
        COPY_TRACE_LINK_SUCCESS_COPY,
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      "/actions?highlight=action-queue:aq-1:approved",
    );
  });

  it("announces calm failure copy when clipboard rejects and does not crash", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    const { getByTestId } = render(
      <CopyTraceLinkButton url="/x" clipboard={{ writeText }} />,
    );
    fireEvent.click(getByTestId(COPY_TRACE_LINK_TESTID));
    await waitFor(() =>
      expect(getByTestId(COPY_TRACE_LINK_STATUS_TESTID).textContent).toBe(
        COPY_TRACE_LINK_FAILURE_COPY,
      ),
    );
  });

  it("announces failure when no clipboard is available", async () => {
    const { getByTestId } = render(
      <CopyTraceLinkButton url="/x" clipboard={null} />,
    );
    fireEvent.click(getByTestId(COPY_TRACE_LINK_TESTID));
    await waitFor(() =>
      expect(getByTestId(COPY_TRACE_LINK_STATUS_TESTID).textContent).toBe(
        COPY_TRACE_LINK_FAILURE_COPY,
      ),
    );
  });

  it("visible button label never includes raw IDs", () => {
    const { getByTestId } = render(
      <CopyTraceLinkButton url="/x" clipboard={null} />,
    );
    const btn = getByTestId(COPY_TRACE_LINK_TESTID);
    expect(btn.getAttribute("aria-label")).not.toMatch(/aq-|[0-9a-f]{8}-/i);
    expect(btn.textContent ?? "").not.toMatch(/aq-|[0-9a-f]{8}-/i);
  });

  describe("timeout cleanup", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("clears pending reset timeout on unmount (no state-after-unmount warning)", async () => {
      vi.useFakeTimers();
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const writeText = vi.fn(async () => {});
      const { getByTestId, unmount } = render(
        <CopyTraceLinkButton url="/x" clipboard={{ writeText }} />,
      );
      await act(async () => {
        fireEvent.click(getByTestId(COPY_TRACE_LINK_TESTID));
        await Promise.resolve();
      });
      // Unmount BEFORE the 2.5s reset fires.
      unmount();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // No "state update on unmounted component" warning should have been emitted.
      const offenders = errSpy.mock.calls.filter((args) =>
        String(args[0] ?? "").includes("unmounted"),
      );
      expect(offenders).toHaveLength(0);
      errSpy.mockRestore();
    });

    it("repeated clicks do not leak overlapping reset timeouts", async () => {
      vi.useFakeTimers();
      const writeText = vi.fn(async () => {});
      const { getByTestId } = render(
        <CopyTraceLinkButton url="/x" clipboard={{ writeText }} />,
      );
      const btn = getByTestId(COPY_TRACE_LINK_TESTID);
      for (let i = 0; i < 3; i += 1) {
        await act(async () => {
          fireEvent.click(btn);
          await Promise.resolve();
        });
      }
      // After the final 2.5s window the status must reset exactly once.
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      // Button is back to idle and not stuck "busy".
      expect(btn.getAttribute("data-copy-state")).toBe("idle");
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });
  });
});

