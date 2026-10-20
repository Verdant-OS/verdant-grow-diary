import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetErrorReporterForTests,
  getErrorReporterStatus,
  initErrorReporter,
  reportError,
  reportErrorWhenReady,
} from "@/lib/errorReporter";
import { REDACTED, scrubEvent } from "@/lib/errorReportingRules";

const TEST_DSN = "https://0123456789abcdef0123456789abcdef@o000000.ingest.us.sentry.io/1";
const GROW_ID = "3f2b8c1e-9a4d-4e2b-8f1a-0c7d5e6b9a12";

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname, pathname: "/plants/1" },
  });
}

describe("scrubEvent tag and breadcrumb allowlist", () => {
  it("rebuilds tags from source, route, and handled, and drops content crumbs", () => {
    const growerNote = "Blue Dream diary note grower@example.com";
    const taggedRoute =
      `https://verdantgrowdiary.com/grows/${GROW_ID}?note=` + encodeURIComponent(growerNote);
    const scrubbed = scrubEvent({
      tags: {
        cultivar: growerNote,
        source: "root_boundary",
        route: taggedRoute,
        handled: "false",
      },
    });

    expect(scrubbed.tags).toEqual({
      source: "root_boundary",
      route: "https://verdantgrowdiary.com/grows/:id",
      handled: "false",
    });
    expect(JSON.stringify(scrubbed)).not.toContain(growerNote);
    expect(JSON.stringify(scrubbed)).not.toContain("grower@example.com");

    expect(
      scrubEvent({
        tags: {
          source: "Root Boundary",
          route: "javascript:alert(document.cookie)",
          handled: "yes",
        },
      }).tags,
    ).toBeUndefined();
    expect(scrubEvent({ tags: { route: "   " } }).tags).toBeUndefined();
    expect(
      scrubEvent({
        breadcrumbs: [
          { category: "navigation", message: "", data: {} },
          { category: "console", message: growerNote },
          "not a breadcrumb",
          null,
        ],
      }).breadcrumbs,
    ).toEqual([{ category: "navigation", message: "", data: {} }]);
  });
});

describe("reportError", () => {
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

  async function readySdk() {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    const sdk = { init: vi.fn(), captureException: vi.fn() };
    await initErrorReporter((async () => sdk) as never);
    expect(getErrorReporterStatus()).toBe("ready");
    return sdk;
  }

  it("does nothing until the reporter is ready", () => {
    expect(() => reportError("grower@example.com left a note")).not.toThrow();
    expect(getErrorReporterStatus()).toBe("idle");
  });

  it("replaces a non-Error payload so the original text never reaches capture", async () => {
    const sdk = await readySdk();
    const secret = "grower@example.com vbt_secret_token_value";

    reportError(secret, {
      source: "not a source",
      route: "/plants/grower@example.com?token=vbt_secret_token_value",
      handled: true,
    });
    reportError({ message: secret, stack: secret });

    expect(sdk.captureException).toHaveBeenCalledTimes(2);
    for (const [error, hint] of sdk.captureException.mock.calls) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(REDACTED);
      expect(JSON.stringify(hint)).not.toContain(secret);
      expect(JSON.stringify(hint)).not.toContain("grower@example.com");
      expect(JSON.stringify(error)).not.toContain(secret);
    }
    expect(sdk.captureException.mock.calls[0]?.[1]).toEqual({
      tags: { handled: "true", route: "/plants/:id" },
    });
    expect(sdk.captureException.mock.calls[1]?.[1]).toEqual({ tags: {} });
  });

  it("forwards an Error unchanged and keeps only a safe source and route", async () => {
    const sdk = await readySdk();
    const caught = new TypeError("render failed");

    reportError(caught, {
      source: "root_boundary",
      route: `/grows/${GROW_ID}?note=secret`,
      handled: false,
    });

    expect(sdk.captureException).toHaveBeenCalledWith(caught, {
      tags: {
        source: "root_boundary",
        route: "/grows/:id",
        handled: "false",
      },
    });
  });

  it("swallows a capture failure and still reports after a late init", async () => {
    const sdk = await readySdk();
    sdk.captureException.mockImplementation(() => {
      throw new Error("sdk down");
    });
    expect(() => reportError(new Error("still local"))).not.toThrow();

    __resetErrorReporterForTests();
    const late = { init: vi.fn(), captureException: vi.fn() };
    const caught = new Error("boundary");
    await reportErrorWhenReady(
      caught,
      { source: "root_boundary", handled: true },
      (async () => late) as never,
    );
    expect(late.captureException).toHaveBeenCalledWith(caught, {
      tags: { source: "root_boundary", handled: "true" },
    });
  });
});
