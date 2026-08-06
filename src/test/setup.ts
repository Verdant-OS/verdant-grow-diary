import "@testing-library/jest-dom";

// Node.js 26 experimental localStorage returns undefined without --localstorage-file.
// Provide an in-memory polyfill so jsdom-based tests can use localStorage/sessionStorage.
if (!globalThis.localStorage) {
  const makeStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
    };
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: makeStorage(),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: makeStorage(),
    writable: true,
    configurable: true,
  });
}

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
