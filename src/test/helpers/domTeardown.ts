import { cleanup } from "@testing-library/react";

// Captured when src/test/setup.ts loads this module, before any test can fake
// timers, so it stays the real timer whatever vi.useFakeTimers() replaces later.
const realSetTimeout = globalThis.setTimeout;

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
  // 'Event'"). Wait on the real timer: vi.isFakeTimers() is also true when
  // only Date is faked, and then FocusScope's setTimeout is still real. When
  // setTimeout itself is faked, FocusScope's timer never fires, and the real
  // wait still returns, so teardown cannot hang.
  await new Promise<void>((resolve) => realSetTimeout(resolve, 0));
  if (typeof document !== "undefined") {
    document.body.replaceChildren();
  }
}
