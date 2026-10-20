/**
 * Regression for the Vitest unhandled error that failed `Full test suite
 * (shard 3/32)` on #2276 (run 39462782064, attempt 1) after every assertion
 * passed:
 *
 *   TypeError: Failed to execute 'dispatchEvent' on 'EventTarget':
 *   parameter 1 is not of type 'Event'.
 *   ❯ Timeout._onTimeout @radix-ui/react-focus-scope/dist/index.mjs
 *
 * Radix FocusScope queues a setTimeout(0) on unmount that dispatches a
 * CustomEvent on its container. The shared per-test teardown must let that
 * timer fire before it returns, while this file's jsdom window is still
 * alive, instead of leaving it to fire after the environment is gone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { teardownDomForTest } from "./helpers/domTeardown";

function renderOpenDialog(onCloseAutoFocus: (event: Event) => void): void {
  render(
    <Dialog open>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle>Teardown probe</DialogTitle>
        <DialogDescription>FocusScope unmount timer</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
}

describe("shared test teardown and Radix FocusScope", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs FocusScope's unmount timer before teardown returns", async () => {
    const onCloseAutoFocus = vi.fn();
    renderOpenDialog(onCloseAutoFocus);
    expect(onCloseAutoFocus).not.toHaveBeenCalled();

    await teardownDomForTest();

    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
  });

  it("delivers the unmount event as an Event of the live jsdom window", async () => {
    const received: Event[] = [];
    renderOpenDialog((event) => {
      received.push(event);
    });

    await teardownDomForTest();

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(window.Event);
  });

  it("does not wait on a timer that fake timers would never fire", async () => {
    vi.useFakeTimers();
    renderOpenDialog(vi.fn());

    await expect(teardownDomForTest()).resolves.toBeUndefined();
  });
});
