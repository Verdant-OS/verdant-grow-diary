import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetErrorReporterForTests,
  getErrorReporterStatus,
  initErrorReporter,
} from "@/lib/errorReporter";
import {
  ERROR_REPORTING_DATA_COLLECTION,
  LABELED_NON_HTTP_SCHEMES,
  REDACTED,
  SEND_DEFAULT_PII,
  TRACES_SAMPLE_RATE,
  resolveErrorReportingConfig,
  scrubEvent,
  scrubUrl,
} from "@/lib/errorReportingRules";

const TEST_DSN = "https://0123456789abcdef0123456789abcdef@o000000.ingest.us.sentry.io/1";

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname, pathname: "/plants/1" },
  });
}

describe("resolveErrorReportingConfig", () => {
  it("stays off without a DSN, in non-production builds, and off production hosts", () => {
    expect(
      resolveErrorReportingConfig({
        dsn: "",
        hostname: "verdantgrowdiary.com",
        mode: "production",
      }),
    ).toEqual({
      enabled: false,
      reason: "no_dsn",
    });
    expect(
      resolveErrorReportingConfig({
        dsn: TEST_DSN,
        hostname: "verdantgrowdiary.com",
        mode: "development",
      }),
    ).toEqual({ enabled: false, reason: "not_production_build" });
    expect(
      resolveErrorReportingConfig({
        dsn: TEST_DSN,
        hostname: "localhost",
        mode: "production",
      }),
    ).toEqual({ enabled: false, reason: "local_host" });
    expect(
      resolveErrorReportingConfig({
        dsn: TEST_DSN,
        hostname: "preview.workers.dev",
        mode: "production",
      }),
    ).toEqual({ enabled: false, reason: "non_production_host" });
    expect(
      resolveErrorReportingConfig({
        dsn: "https://evil.example/dsn",
        hostname: "verdantgrowdiary.com",
        mode: "production",
      }),
    ).toEqual({ enabled: false, reason: "invalid_dsn" });
  });

  it("enables only on a production hostname with a hosted DSN and a release", () => {
    expect(
      resolveErrorReportingConfig({
        dsn: TEST_DSN,
        hostname: "www.verdantgrowdiary.com",
        mode: "production",
        release: "0.0.0+abc",
      }),
    ).toEqual({
      enabled: true,
      dsn: TEST_DSN,
      environment: "production",
      release: "0.0.0+abc",
    });
  });
});

describe("scrubUrl", () => {
  it("rejects vbscript and other non-http schemes and strips query strings", () => {
    expect(LABELED_NON_HTTP_SCHEMES).toContain("vbscript:");
    expect(scrubUrl("vbscript:alert(1)")).toBe(`vbscript:${REDACTED}`);
    expect(scrubUrl("VBSCRIPT:MsgBox(1)")).toBe(`vbscript:${REDACTED}`);
    expect(scrubUrl("javascript:alert(document.cookie)")).toBe(`javascript:${REDACTED}`);
    expect(scrubUrl("custom:secret-token")).toBe(REDACTED);
    expect(scrubUrl("https://verdantgrowdiary.com/plants/a?token=secret#frag")).toBe(
      "https://verdantgrowdiary.com/plants/a",
    );
    expect(scrubUrl("/grows/1?note=secret#x")).toBe("/grows/1");
  });
});

describe("scrubEvent", () => {
  it("drops user, IP, request bodies, query strings, and content breadcrumbs", () => {
    const scrubbed = scrubEvent({
      message: "Blue Dream looks wilted",
      user: { id: "grower-1", email: "grower@example.com", ip_address: "203.0.113.5" },
      extra: { note: "private diary text" },
      request: {
        url: "https://verdantgrowdiary.com/plants/a?token=secret",
        data: "body=secret",
        cookies: "session=abc",
        headers: { Authorization: "Bearer secret" },
        query_string: "token=secret",
        method: "POST",
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "grower wrote this",
            stacktrace: {
              frames: [
                {
                  filename: "vbscript:alert(1)",
                  abs_path: "https://verdantgrowdiary.com/assets/app.js?x=1",
                  vars: { password: "secret" },
                  lineno: 4,
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { category: "console", message: "diary note" },
        { category: "ui.click", data: { title: "Blue Dream" } },
        { category: "navigation" },
      ],
    });

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.message).toBe(REDACTED);
    expect(scrubbed.request).toEqual({
      url: "https://verdantgrowdiary.com/plants/a",
      method: "POST",
    });
    expect(JSON.stringify(scrubbed)).not.toContain("secret");
    expect(JSON.stringify(scrubbed)).not.toContain("grower");
    expect(JSON.stringify(scrubbed)).not.toContain("Blue Dream");
    expect(JSON.stringify(scrubbed)).not.toContain("203.0.113.5");
    expect(scrubbed.exception?.values?.[0]?.value).toBe(REDACTED);
    expect(scrubbed.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: `vbscript:${REDACTED}`,
      abs_path: "https://verdantgrowdiary.com/assets/app.js",
      lineno: 4,
    });
    expect(scrubbed.breadcrumbs).toEqual([{ category: "navigation" }]);
    expect(scrubEvent(null)).toBeNull();
  });
});

describe("initErrorReporter", () => {
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

  it("does not load the SDK without a DSN", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    const loader = vi.fn();
    void initErrorReporter(loader as never);
    expect(loader).not.toHaveBeenCalled();
    expect(getErrorReporterStatus()).toBe("disabled");
  });

  it("does not load the SDK in a non-production build", () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "development");
    setHostname("verdantgrowdiary.com");
    const loader = vi.fn();
    void initErrorReporter(loader as never);
    expect(loader).not.toHaveBeenCalled();
    expect(getErrorReporterStatus()).toBe("disabled");
  });

  it("does not load the SDK on a non-production host", () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("localhost");
    const loader = vi.fn();
    void initErrorReporter(loader as never);
    expect(loader).not.toHaveBeenCalled();
    expect(getErrorReporterStatus()).toBe("disabled");
  });

  it("initialises once with PII off, tracing off, and a scrubbing beforeSend", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
    vi.stubEnv("MODE", "production");
    setHostname("verdantgrowdiary.com");
    const sdk = { init: vi.fn(), captureException: vi.fn() };
    const loader = vi.fn(async () => sdk);
    void initErrorReporter(loader as never);
    await vi.waitFor(() => expect(getErrorReporterStatus()).toBe("ready"));
    expect(loader).toHaveBeenCalledTimes(1);
    const options = sdk.init.mock.calls[0]?.[0] as {
      sendDefaultPii: boolean;
      tracesSampleRate: number;
      dataCollection: typeof ERROR_REPORTING_DATA_COLLECTION;
      dsn: string;
      integrations: (defaults: Array<{ name: string }>) => Array<{ name: string }>;
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(options.dsn).toBe(TEST_DSN);
    expect(options.sendDefaultPii).toBe(SEND_DEFAULT_PII);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(TRACES_SAMPLE_RATE);
    expect(options.dataCollection).toEqual(ERROR_REPORTING_DATA_COLLECTION);
    expect(options.dataCollection.userInfo).toBe(false);
    expect(options.dataCollection.httpBodies).toEqual([]);
    const kept = options.integrations([
      { name: "GlobalHandlers" },
      { name: "Replay" },
      { name: "BrowserTracing" },
      { name: "BrowserSession" },
      { name: "BrowserProfiling" },
    ]);
    expect(kept.map((integration) => integration.name)).toEqual(["GlobalHandlers"]);
    const sent = options.beforeSend({
      user: { ip_address: "203.0.113.9" },
      request: { url: "vbscript:alert(1)", data: "secret" },
      message: "grower text",
    });
    expect(sent.user).toBeUndefined();
    expect(sent.message).toBe(REDACTED);
    expect(sent.request).toEqual({ url: `vbscript:${REDACTED}` });
  });
});
