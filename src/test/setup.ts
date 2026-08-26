import "@testing-library/jest-dom";
import { beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";

// Production deliberately retains this fence for the complete browser page
// runtime. A Vitest worker hosts many unrelated test runtimes, so clean the
// exact durable key and runtime singleton between tests instead of allowing an
// ambiguous hierarchy-create outcome to disable a later test's creator UI.
// These opaque test-only values intentionally avoid importing the production
// module here, which would initialize its page-runtime singleton during setup.
const HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY =
  "verdant:hierarchy-create-outcome-unknown:v1" as const;
const HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_STATE_SLOT =
  "__verdantHierarchyCreateOutcomeRecoveryRuntimeState" as const;

function resetHierarchyCreateOutcomeRecoveryForTest(): void {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(HIERARCHY_CREATE_OUTCOME_RECOVERY_STORAGE_KEY);
    } catch {
      // A blocked test-storage implementation is unreadable to the recovery
      // helper too; always clear the independently retained runtime fence.
    }
  }
  delete (globalThis as Record<string, unknown>)[
    HIERARCHY_CREATE_OUTCOME_RECOVERY_RUNTIME_STATE_SLOT
  ];
}

// Ensure localStorage never leaks across tests (Diary Calendar persists
// the active filter; stale state would break unrelated suites).
beforeEach(() => {
  resetHierarchyCreateOutcomeRecoveryForTest();
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
// Node-environment suites (// @vitest-environment node) have no document.
afterEach(() => {
  cleanup();
  if (typeof document !== "undefined") {
    document.body.replaceChildren();
  }
  resetHierarchyCreateOutcomeRecoveryForTest();
});

// Node-environment suites must not touch `window` at setup evaluation time.
if (typeof window !== "undefined") {
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
}

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
  ResizeObserverMock;
