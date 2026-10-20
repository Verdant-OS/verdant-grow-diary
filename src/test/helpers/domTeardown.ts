import { cleanup } from "@testing-library/react";
import { vi } from "vitest";

/**
 * Per-test DOM teardown, run by the shared `afterEach` in src/test/setup.ts.
 *
 * Unmounts every tree React Testing Library rendered, then hard-resets the
 * document body so nodes rendered outside RTL's tracking (manual createRoot,
 * portals) don't survive into the next test.
 */
export async function teardownDomForTest(): Promise<void> {
  cleanup();
  // Radix FocusScope queues a setTimeout(0) on unmount that dispatches a
  // CustomEvent on its container. Let it fire now, while this file's jsdom
  // window is alive; left queued, it can fire after the environment is torn
  // down and jsdom rejects the event as foreign ("parameter 1 is not of type
  // 'Event'"). Fake timers never fire a real wait, so skip it there.
  if (!vi.isFakeTimers()) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (typeof document !== "undefined") {
    document.body.replaceChildren();
  }
}
