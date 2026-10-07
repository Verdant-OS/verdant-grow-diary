import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("@sentry/browser", () => sdk);

import RootErrorBoundary from "@/components/RootErrorBoundary";
import {
  __resetErrorReporterForTests,
  getErrorReporterStatus,
  initErrorReporter,
  reportErrorWhenReady,
} from "@/lib/errorReporter";
import { REDACTED, scrubEvent, scrubText } from "@/lib/errorReportingRules";

const TEST_DSN = "https://0123456789abcdef0123456789abcdef@o000000.ingest.us.sentry.io/1";

function enableProductionReporter(hostname = "verdantgrowdiary.com") {
  vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
  vi.stubEnv("MODE", "production");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname, pathname: "/plants/1" },
  });
}

describe("errorReporter — initialisation race", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    __resetErrorReporterForTests();
    sdk.init.mockReset();
    sdk.captureException.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    __resetErrorReporterForTests();
  });

  it("initErrorReporter returns one shared promise that settles when the reporter is ready", async () => {
    enableProductionReporter();
    const loader = vi.fn(async () => sdk as never);
    const first = initErrorReporter(loader);
    const second = initErrorReporter(loader);
    expect(first).toBeInstanceOf(Promise);
    expect(second).toBe(first);
    await first;
    expect(getErrorReporterStatus()).toBe("ready");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("initErrorReporter resolves (never rejects) when disabled or when the SDK fails to load", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    await expect(initErrorReporter()).resolves.toBeUndefined();
    expect(getErrorReporterStatus()).toBe("disabled");

    __resetErrorReporterForTests();
    enableProductionReporter();
    await expect(
      initErrorReporter(async () => {
        throw new Error("blocked");
      }),
    ).resolves.toBeUndefined();
    expect(getErrorReporterStatus()).toBe("failed");
  });

  it("an error caught before anything started the reporter is still reported once it is ready", async () => {
    enableProductionReporter();
    expect(getErrorReporterStatus()).toBe("idle");
    await reportErrorWhenReady(new Error("first paint crash"), {
      source: "route_error_component",
      route: "/grows/1?code=abc",
    });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    const [error, hint] = sdk.captureException.mock.calls[0] as [Error, Record<string, unknown>];
    expect(error.message).toBe("first paint crash");
    expect(hint).toEqual({
      tags: { source: "route_error_component", handled: "false" },
      extra: { route: "/grows/1" },
    });
  });

  it("stays inert when reporting is disabled: no SDK load, no capture", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    await reportErrorWhenReady(new Error("x"), { source: "manual" });
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("RootErrorBoundary reports a descendant's render error even though nothing initialised the reporter first", async () => {
    enableProductionReporter();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    function Thrower(): never {
      throw new Error("child render failed for grower@example.com");
    }
    try {
      render(
        <RootErrorBoundary>
          <Thrower />
        </RootErrorBoundary>,
      );
      await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledTimes(1));
    } finally {
      consoleError.mockRestore();
    }
    const [error, hint] = sdk.captureException.mock.calls[0] as [Error, Record<string, unknown>];
    expect(error.message).toBe("child render failed for grower@example.com");
    expect(hint).toEqual({
      tags: { source: "react_error_boundary", handled: "false" },
      extra: { route: "/plants/1" },
    });
    // The e-mail is removed by beforeSend before anything leaves the browser.
    const options = sdk.init.mock.calls[0]?.[0] as {
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
    };
    const sent = options.beforeSend({
      exception: { values: [{ type: "Error", value: error.message }] },
    }) as { exception: { values: Array<{ value: string }> } };
    expect(sent.exception.values[0]?.value).toBe(`child render failed for ${REDACTED}`);
  });
});

describe("errorReportingRules — privacy of outgoing events", () => {
  it("redacts credentials serialised as JSON, including short refresh tokens", () => {
    const session = JSON.stringify({
      access_token: "short.tok",
      refresh_token: "v1r3fr3sh",
      provider_token: "gho_x",
      expires_in: 3600,
    });
    const scrubbed = scrubText(`session restore failed: ${session}`);
    expect(scrubbed).not.toContain("v1r3fr3sh");
    expect(scrubbed).not.toContain("short.tok");
    expect(scrubbed).not.toContain("gho_x");
    expect(scrubbed).toContain(`"refresh_token":"${REDACTED}"`);
    expect(scrubbed).toContain(`"expires_in":3600`);
    expect(scrubText(scrubbed)).toBe(scrubbed);
  });

  it("drops non-allowlisted contexts and keeps device/runtime ones", () => {
    const out = scrubEvent({
      contexts: {
        browser: { name: "Chrome" },
        os: { name: "macOS" },
        state: { grow: { name: "Private grow" } },
        response: { status_code: 500, headers: { "set-cookie": "sb=1" } },
      },
    });
    expect(out?.contexts).toEqual({ browser: { name: "Chrome" }, os: { name: "macOS" } });
  });

  it("scrubs tags and extra, and drops structured values from both", () => {
    const out = scrubEvent({
      tags: { source: "manual", who: "grower@example.com", nested: { id: "u1" } as never },
      extra: { route: "/x", row: { plant: "Blue Dream #3", owner: "u1" }, count: 2 },
    });
    expect(out?.tags).toEqual({ source: "manual", who: REDACTED });
    expect(out?.extra).toEqual({ route: "/x", count: 2 });
  });

  it("scrubs logentry, transaction, exception type, mechanism data and frame vars", () => {
    const out = scrubEvent({
      logentry: { message: "login a@b.co", params: ["secret-param"] },
      transaction: "/auth/callback?code=abc",
      exception: {
        values: [
          {
            type: "Error for a@b.co",
            value: "boom",
            mechanism: { type: "generic", handled: false, data: { body: "private" } },
            stacktrace: {
              frames: [{ filename: "https://x.test/a.js?token=1", vars: { password: "p" } }],
            },
          },
        ],
      },
    });
    expect(out?.logentry).toEqual({ message: `login ${REDACTED}` });
    expect(out?.transaction).toBe("/auth/callback");
    const ex = out?.exception?.values?.[0];
    expect(ex?.type).toBe(`Error for ${REDACTED}`);
    expect(ex?.mechanism).toEqual({ type: "generic", handled: false });
    expect(ex?.stacktrace?.frames?.[0]).toEqual({ filename: "https://x.test/a.js" });
  });
});
