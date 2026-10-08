import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetErrorReporterForTests,
  getErrorReporterStatus,
  initErrorReporter,
  reportError,
} from "@/lib/errorReporter";
import { REDACTED } from "@/lib/errorReportingRules";

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
      route: "/plants?code=1",
    });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = sdk.captureException.mock.calls[0] as [Error, Record<string, unknown>];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("string failure for [redacted]");
    expect(hint).toEqual({
      tags: { source: "react_error_boundary", handled: "false" },
      extra: { route: "/plants" },
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
      release?: string;
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
      beforeBreadcrumb: (b: Record<string, unknown>) => Record<string, unknown> | null;
    };
    const sent = options.beforeSend({ user: { id: "u" }, message: "a@b.co" });
    expect(sent).toMatchObject({ message: REDACTED });
    expect(Object.keys(sent).sort()).toEqual(["message", "release"]);
    expect(sent.release).toBe(options.release);
    expect(JSON.stringify(sent)).not.toContain("a@b.co");
    expect(options.beforeBreadcrumb({ category: "console", message: "x" })).toBeNull();
  });

  it("sanitizes actual SDK envelopes and subsequent reports through the reporter hooks", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    const real = await import("@sentry/browser");
    const events: Array<Record<string, unknown>> = [];
    try {
      await initErrorReporter(async () => ({
        ...real,
        init: (options) =>
          real.init({
            ...options,
            transport: () => ({
              send: async (envelope) => {
                for (const [header, payload] of envelope[1]) {
                  if (header.type === "event") events.push(payload as Record<string, unknown>);
                }
                return { statusCode: 200 };
              },
              flush: async () => true,
            }),
          }),
      }));
      real.addBreadcrumb({
        category: "fetch",
        data: {
          url: "/assets/Blue-Dream-12345678.js",
          method: "GET",
          status_code: 503,
          note: "private diary note",
        },
      });
      for (const note of ["private diary note", "private retry note"]) {
        const error = new Error(note);
        error.name = "BlueDream";
        error.stack = `BlueDream: ${note}\n    at BlueDream (https://verdantgrowdiary.com/assets/Blue-Dream-12345678.js:12:34)`;
        reportError(error, { source: "manual", route: "/plants/Blue%20Dream?secret=1" });
      }
      expect(await real.flush(2000)).toBe(true);
      expect(events).toHaveLength(2);
      expect(JSON.stringify(events)).not.toMatch(/Blue.?Dream|private.*note|secret/);
      const event = events[0] as {
        exception: {
          values: Array<{ type: string; value: string; stacktrace: { frames: unknown[] } }>;
        };
        tags: unknown;
        extra: unknown;
        breadcrumbs: unknown[];
      };
      expect(event.exception.values[0]).toMatchObject({ type: "Error", value: REDACTED });
      expect(event.exception.values[0].stacktrace.frames).toEqual([
        {
          filename: "https://verdantgrowdiary.com/assets/:redacted",
          in_app: true,
          lineno: 12,
          colno: 34,
        },
      ]);
      expect(event.tags).toEqual({ source: "manual", handled: "false" });
      expect(event.extra).toEqual({ route: "/plants/:id" });
      expect(event.breadcrumbs[0]).toMatchObject({
        category: "fetch",
        data: {
          url: "/assets/:redacted",
          method: "GET",
          status_code: 503,
        },
      });
    } finally {
      await real.close(2000);
    }
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
