import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import {
  clearLocalStorageForTest,
  ensureLocalStorageForTest,
} from "./helpers/localStorageTestHelper";

// Some local jsdom environments (e.g. Node 26 + jsdom on Windows) do not
// expose window.localStorage by default. Install an in-memory Storage
// shim once so every test — including those that call
// `window.localStorage.*` directly — sees a working Storage instance.
// On environments where real localStorage already exists, the helper is
// a no-op pass-through.
ensureLocalStorageForTest();

// Ensure localStorage never leaks across tests (Diary Calendar persists
// the active filter; stale state would break unrelated suites).
beforeEach(() => {
  try {
    clearLocalStorageForTest();
  } catch {
    // ignore (storage genuinely unrecoverable)
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
