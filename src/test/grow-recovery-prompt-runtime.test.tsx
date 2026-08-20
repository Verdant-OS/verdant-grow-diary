import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import GrowRecoveryPrompt from "@/components/GrowRecoveryPrompt";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MOUNTED_AT = new Date("2026-08-20T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("GrowRecoveryPrompt mounted clock", () => {
  it("becomes visible when a check-in crosses the 72-hour boundary without a parent rerender", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MOUNTED_AT);

    render(
      <GrowRecoveryPrompt
        growId="grow-1"
        items={[
          {
            kind: "diary",
            ts: new Date(MOUNTED_AT.getTime() - 72 * HOUR_MS + MINUTE_MS).toISOString(),
          },
        ]}
        testId="recovery-prompt"
      />,
    );

    expect(screen.queryByTestId("recovery-prompt")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2 * MINUTE_MS);
    });

    expect(screen.getByTestId("recovery-prompt")).toHaveAttribute("data-reason", "stale_activity");
    expect(screen.getByText("No recent check-in.")).toBeInTheDocument();
  });

  it("keeps an explicitly injected clock deterministic while wall time advances", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MOUNTED_AT);

    render(
      <GrowRecoveryPrompt
        growId="grow-1"
        items={[
          {
            kind: "diary",
            ts: new Date(MOUNTED_AT.getTime() - 72 * HOUR_MS + MINUTE_MS).toISOString(),
          },
        ]}
        testId="injected-recovery-prompt"
        now={MOUNTED_AT.getTime()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2 * MINUTE_MS);
    });

    expect(screen.queryByTestId("injected-recovery-prompt")).not.toBeInTheDocument();
  });
});
