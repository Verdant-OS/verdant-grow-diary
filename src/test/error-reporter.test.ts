import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetErrorReporterForTests,
  getErrorReporterStatus,
  initErrorReporter,
  reportError,
} from "@/lib/errorReporter";

const TEST_DSN = "https://0123456789abcdef0123456789abcdef@o000000.ingest.us.sentry.io/1";

type FakeSdk = {
  init: ReturnType<typeof vi.fn>;
  captureException: ReturnType<typeof vi.fn>;
};

function fakeSdk(): FakeSdk {
  return { init: vi.fn(), captureException: vi.fn() };
}

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname, pathname: "/plants/1" },
  });
}

describe("errorReporter", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    __resetErrorReporterForTests();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    __resetErrorReporterForTests();
  });

  it("never loads the SDK without a DSN; reportError is a no-op", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    setHostname("verdantgrowdiary.com");
    const loader = vi.fn();
    initErrorReporter(loader as never);
    expect(loader).not.toHaveBeenCalled();
    expect(getErrorReporterStatus()).toBe("disabled");
    expect(() => reportError(new Error("x"), { source: "manual" })).not.toThrow();
  });

  it("never loads the SDK on localhost or in non-production mode even with a DSN", () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("localhost");
    const loader = vi.fn();
    initErrorReporter(loader as never);
    expect(loader).not.toHaveBeenCalled();
    expect(getErrorReporterStatus()).toBe("disabled");
  });

  it("initialises once with all data collection off and routes manual reports through captureException", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    const sdk = fakeSdk();
    const loader = vi.fn(async () => sdk);
    initErrorReporter(loader as never);
    initErrorReporter(loader as never);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(getErrorReporterStatus()).toBe("loading");
    // Report before ready: dropped, never queued.
    reportError(new Error("early"), { source: "manual" });
    await vi.waitFor(() => expect(getErrorReporterStatus()).toBe("ready"));
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const options = sdk.init.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toMatchObject({
      dsn: TEST_DSN,
      environment: "production",
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      tracesSampleRate: 0,
    });
    expect(typeof options.beforeSend).toBe("function");
    expect(typeof options.beforeBreadcrumb).toBe("function");
    expect(sdk.captureException).not.toHaveBeenCalled();

    reportError("string failure for a@b.co", {
      source: "react_error_boundary",
      route: "/x?code=1",
    });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = sdk.captureException.mock.calls[0] as [Error, Record<string, unknown>];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("string failure for [redacted]");
    expect(hint).toEqual({
      tags: { source: "react_error_boundary", handled: "false" },
      extra: { route: "/x" },
    });
  });

  it("beforeSend/beforeBreadcrumb passed to the SDK scrub payloads", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    const sdk = fakeSdk();
    initErrorReporter((async () => sdk) as never);
    await vi.waitFor(() => expect(getErrorReporterStatus()).toBe("ready"));
    const options = sdk.init.mock.calls[0]?.[0] as {
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
      beforeBreadcrumb: (b: Record<string, unknown>) => Record<string, unknown> | null;
    };
    expect(options.beforeSend({ user: { id: "u" }, message: "a@b.co" })).toEqual({
      message: "[redacted]",
    });
    expect(options.beforeBreadcrumb({ category: "console", message: "x" })).toBeNull();
  });

  it("a failed SDK load leaves the app untouched and reportError silent", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    initErrorReporter((async () => {
      throw new Error("blocked by network");
    }) as never);
    await vi.waitFor(() => expect(getErrorReporterStatus()).toBe("failed"));
    expect(() => reportError(new Error("x"))).not.toThrow();
  });

  it("a throwing captureException never escapes", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    const sdk = fakeSdk();
    sdk.captureException.mockImplementation(() => {
      throw new Error("sdk broke");
    });
    initErrorReporter((async () => sdk) as never);
    await vi.waitFor(() => expect(getErrorReporterStatus()).toBe("ready"));
    expect(() => reportError(new Error("x"))).not.toThrow();
  });
});
