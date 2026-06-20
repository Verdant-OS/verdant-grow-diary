import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// Ensure localStorage never leaks across tests (Diary Calendar persists
// the active filter; stale state would break unrelated suites).
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // ignore (SSR-like envs)
  }
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
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
