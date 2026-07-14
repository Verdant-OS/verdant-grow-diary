import "@testing-library/jest-dom";
import { beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Ensure localStorage never leaks across tests (Diary Calendar persists
// the active filter; stale state would break unrelated suites).
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // ignore (SSR-like envs)
  }
});

// Explicit safety net for CI full-suite memory growth: React Testing
// Library auto-registers `afterEach(cleanup)` when it detects global test
// hooks, but that only unmounts trees RTL itself rendered/tracked. Force it
// explicitly, then hard-reset the document body so anything rendered
// outside RTL's tracking (manual createRoot/portals) doesn't retain DOM
// nodes, listeners, or component state across files within the same
// worker process. Cheap and idempotent; does not change test behavior.
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
  ResizeObserverMock;
