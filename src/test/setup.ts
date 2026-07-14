import "@testing-library/jest-dom";
<<<<<<< HEAD
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
=======
import { beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
>>>>>>> origin/main

// Ensure localStorage never leaks across tests (Diary Calendar persists
// the active filter; stale state would break unrelated suites).
beforeEach(() => {
  try {
    clearLocalStorageForTest();
  } catch {
    // ignore (storage genuinely unrecoverable)
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
