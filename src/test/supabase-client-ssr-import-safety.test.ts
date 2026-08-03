/**
 * @vitest-environment node
 *
 * Import-time safety for `@/integrations/supabase/client` under Node/SSR.
 * - createClient must NOT run on bare import (lazy Proxy singleton).
 * - sessionStorage must NOT be read at module evaluation.
 * - Hostile partial-window shims must not throw on import or first storage use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((_url: string, _key: string, _options: unknown) => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({ select: vi.fn() })),
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);

function restoreGlobalProperty(name: "window" | "sessionStorage", descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

async function importFreshModule() {
  vi.resetModules();
  createClientMock.mockClear();
  return import("@/integrations/supabase/client");
}

function authOptionsFromLastCreate() {
  expect(createClientMock).toHaveBeenCalled();
  const options = createClientMock.mock.calls.at(-1)?.[2] as
    | {
        auth?: {
          storage?: Storage;
          persistSession?: boolean;
          autoRefreshToken?: boolean;
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
});

describe("Supabase client lazy singleton (strategy B)", () => {
  it("does not call createClient on bare import", async () => {
    Reflect.deleteProperty(globalThis, "window");
    await importFreshModule();
    expect(createClientMock).toHaveBeenCalledTimes(0);
  });

  it("calls createClient once on first property access", async () => {
    Reflect.deleteProperty(globalThis, "window");
    const { supabase } = await importFreshModule();
    expect(createClientMock).toHaveBeenCalledTimes(0);

    // First touch materializes the singleton (AuthProvider does this via .auth).
    void supabase.auth;
    expect(createClientMock).toHaveBeenCalledTimes(1);

    void supabase.from;
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it("getSupabaseBrowserClient materializes the same singleton path", async () => {
    Reflect.deleteProperty(globalThis, "window");
    const mod = await importFreshModule();
    expect(createClientMock).toHaveBeenCalledTimes(0);
    mod.getSupabaseBrowserClient();
    expect(createClientMock).toHaveBeenCalledTimes(1);
    mod.getSupabaseBrowserClient();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });
});

describe("Supabase client SSR / Node import safety", () => {
  it("imports without window and does not enable session persistence on first use", async () => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "sessionStorage");

    const { supabase } = await importFreshModule();
    expect(createClientMock).toHaveBeenCalledTimes(0);

    void supabase.auth;
    const auth = authOptionsFromLastCreate();

    expect(auth.storage).toBeUndefined();
    expect(auth.persistSession).toBe(false);
    expect(auth.autoRefreshToken).toBe(false);
  });

  it("imports when window exists but sessionStorage getter throws (hostile SSR)", async () => {
    const partialWindow = {} as Window & typeof globalThis;
    Object.defineProperty(partialWindow, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("SSR import evaluated window.sessionStorage");
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: partialWindow,
    });

    const { supabase } = await importFreshModule();
    expect(createClientMock).toHaveBeenCalledTimes(0);

    // Must not throw at first use either.
    void supabase.auth;
    const auth = authOptionsFromLastCreate();
    expect(() => auth.storage?.getItem("x")).not.toThrow();
    expect(auth.storage?.getItem("x") ?? null).toBeNull();
  });

  it("never reads sessionStorage while evaluating the client module body", async () => {
    let sessionStorageReads = 0;
    const partialWindow = {} as Window & typeof globalThis;
    Object.defineProperty(partialWindow, "sessionStorage", {
      configurable: true,
      get() {
        sessionStorageReads += 1;
        throw new Error("sessionStorage should not be read at import");
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: partialWindow,
    });

    await importFreshModule();
    expect(createClientMock).toHaveBeenCalledTimes(0);
    // Module eval + lazy adapter factory must not touch the getter.
    expect(sessionStorageReads).toBe(0);
  });
});
