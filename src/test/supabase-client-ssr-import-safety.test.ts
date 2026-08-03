/**
 * @vitest-environment node
 *
 * Import-time safety for `@/integrations/supabase/client` under Node/SSR.
 * The production server (and hostile partial-window shims) must never throw
 * because `window.sessionStorage` is missing or its getter throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((_url: string, _key: string, _options: unknown) => ({
    auth: {},
    from: vi.fn(),
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

describe("Supabase client SSR / Node import safety", () => {
  it("imports without window and does not enable session persistence", async () => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "sessionStorage");

    const auth = await importFreshClient();

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

    // Must not throw at import time.
    const auth = await importFreshClient();

    // Lazy adapter may be installed; calling getItem must not throw either.
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

    await importFreshClient();

    // Construction of the lazy adapter must not touch the getter.
    expect(sessionStorageReads).toBe(0);
  });
});
