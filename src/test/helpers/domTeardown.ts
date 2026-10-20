import { cleanup } from "@testing-library/react";

/**
 * Per-test DOM teardown, run by the shared `afterEach` in src/test/setup.ts.
 *
 * Unmounts every tree React Testing Library rendered, then hard-resets the
 * document body so nodes rendered outside RTL's tracking (manual createRoot,
 * portals) don't survive into the next test.
 */
export async function teardownDomForTest(): Promise<void> {
  cleanup();
  if (typeof document !== "undefined") {
    document.body.replaceChildren();
  }
}
