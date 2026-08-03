// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relative, resolve } from "node:path";

import { listFilesCached, readFileCached } from "./helpers/cachedSrcTextScan";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ auth: {}, from: vi.fn() })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "src");

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);

function restoreGlobalProperty(name: "window" | "sessionStorage", descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

async function importFreshClient() {
  vi.resetModules();
  createClientMock.mockClear();
  await import("@/integrations/supabase/client");
  expect(createClientMock).toHaveBeenCalledTimes(1);
  const options = createClientMock.mock.calls[0]?.[2] as
    | {
        auth?: {
          storage?: Storage;
          persistSession?: boolean;
          autoRefreshToken?: boolean;
          detectSessionInUrl?: boolean;
        };
      }
    | undefined;
  expect(options?.auth).toBeDefined();
  return options!.auth!;
}

beforeEach(() => {
  restoreGlobalProperty("window", originalWindowDescriptor);
  restoreGlobalProperty("sessionStorage", originalSessionStorageDescriptor);
});

afterEach(() => {
  restoreGlobalProperty("window", originalWindowDescriptor);
  restoreGlobalProperty("sessionStorage", originalSessionStorageDescriptor);
  vi.restoreAllMocks();
});

describe("Supabase client SSR auth storage", () => {
  it("imports without evaluating global sessionStorage and uses transient memory on the server", async () => {
    Reflect.deleteProperty(globalThis, "window");
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("server import touched sessionStorage");
      },
    });

    const auth = await importFreshClient();

    expect(auth.storage).toBeDefined();
    auth.storage!.setItem("server-key", "server-value");
    expect(auth.storage!.getItem("server-key")).toBe("server-value");
    expect(auth.persistSession).toBe(false);
    expect(auth.autoRefreshToken).toBe(false);
    expect(auth.detectSessionInUrl).toBe(false);
  });

  it("uses browser sessionStorage and browser auth lifecycle settings when available", async () => {
    const sessionStorage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage },
    });

    const auth = await importFreshClient();

    expect(auth.storage).toBe(sessionStorage);
    expect(auth.persistSession).toBe(true);
    expect(auth.autoRefreshToken).toBe(true);
    expect(auth.detectSessionInUrl).toBe(true);
  });

  it("falls back to memory when browser sessionStorage access throws", async () => {
    const browserWindow = {} as { sessionStorage: Storage };
    Object.defineProperty(browserWindow, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: browserWindow,
    });

    const auth = await importFreshClient();

    expect(auth.storage).toBeDefined();
    auth.storage!.setItem("browser-key", "browser-value");
    expect(auth.storage!.getItem("browser-key")).toBe("browser-value");
    expect(auth.persistSession).toBe(true);
    expect(auth.autoRefreshToken).toBe(true);
    expect(auth.detectSessionInUrl).toBe(true);
  });
});

describe("production sessionStorage references", () => {
  it("contains no bare sessionStorage member access outside a window-safe resolver", () => {
    const offenders = listFilesCached(SRC)
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !relative(SRC, file).replace(/\\/g, "/").startsWith("test/"))
      .filter((file) => /(^|[^\w$.])sessionStorage\s*\./m.test(readFileCached(file)))
      .map((file) => relative(ROOT, file).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });
});
