import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DROPPED_BREADCRUMB_CATEGORIES,
  REDACTED,
  SENTRY_INGEST_ORIGINS,
  buildManualReportContext,
  isValidSentryDsn,
  normalizeCaughtError,
  resolveErrorReportingConfig,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
} from "@/lib/errorReportingRules";

// Shape-valid, non-functional DSN for tests only.
const TEST_DSN = "https://0123456789abcdef0123456789abcdef@o000000.ingest.us.sentry.io/1";

describe("errorReportingRules — resolveErrorReportingConfig", () => {
  it("is disabled without a DSN (the default for every build until the owner sets one)", () => {
    expect(resolveErrorReportingConfig({ hostname: "verdantgrowdiary.com" })).toEqual({
      enabled: false,
      reason: "no_dsn",
    });
    expect(resolveErrorReportingConfig({ dsn: "   ", hostname: "verdantgrowdiary.com" })).toEqual({
      enabled: false,
      reason: "no_dsn",
    });
    expect(resolveErrorReportingConfig(null)).toEqual({ enabled: false, reason: "no_dsn" });
    expect(resolveErrorReportingConfig(undefined)).toEqual({ enabled: false, reason: "no_dsn" });
  });

  it("rejects a DSN that does not point at hosted Sentry", () => {
    for (const dsn of [
      "https://abc@evil.example.com/1",
      "http://0123456789abcdef@o1.ingest.sentry.io/1",
      "not a dsn",
      "https://0123456789abcdef@o1.ingest.sentry.io/",
    ]) {
      expect(isValidSentryDsn(dsn), dsn).toBe(false);
      expect(resolveErrorReportingConfig({ dsn, hostname: "verdantgrowdiary.com" })).toEqual({
        enabled: false,
        reason: "invalid_dsn",
      });
    }
    expect(isValidSentryDsn(TEST_DSN)).toBe(true);
    expect(isValidSentryDsn(null)).toBe(false);
    expect(isValidSentryDsn(42)).toBe(false);
  });

  it("stays off on the server, on local hosts and on Lovable preview hosts", () => {
    expect(resolveErrorReportingConfig({ dsn: TEST_DSN })).toEqual({
      enabled: false,
      reason: "server",
    });
    for (const hostname of ["localhost", "127.0.0.1", "[::1]", "app.localhost", "LOCALHOST"]) {
      expect(resolveErrorReportingConfig({ dsn: TEST_DSN, hostname }), hostname).toEqual({
        enabled: false,
        reason: "local_host",
      });
    }
    for (const hostname of [
      "verdantgrowdiary.lovable.app",
      "id-preview--abc.lovable.app",
      "abc.lovableproject.com",
    ]) {
      expect(resolveErrorReportingConfig({ dsn: TEST_DSN, hostname }), hostname).toEqual({
        enabled: false,
        reason: "lovable_preview",
      });
    }
  });

  it("stays off in development and test builds even with a DSN", () => {
    for (const mode of ["development", "test"]) {
      expect(
        resolveErrorReportingConfig({ dsn: TEST_DSN, hostname: "verdantgrowdiary.com", mode }),
      ).toEqual({ enabled: false, reason: "not_production_build" });
    }
  });

  it("stays off on every host outside the production apex/www allowlist", () => {
    for (const hostname of [
      "diary2.example.workers.dev",
      "verdant-grow-diary.vercel.app",
      "verdantgrowdiary.com.evil.example",
      "notify.verdantgrowdiary.com",
      "verdantgrowdiary.app",
    ]) {
      expect(
        resolveErrorReportingConfig({ dsn: TEST_DSN, hostname, mode: "production" }),
        hostname,
      ).toEqual({ enabled: false, reason: "non_production_host" });
    }
  });

  it("enables only on the production apex/www, with environment=production", () => {
    const prod = resolveErrorReportingConfig({
      dsn: ` ${TEST_DSN} `,
      hostname: "verdantgrowdiary.com",
      release: "0.0.0+20261007.e0bb39304a44",
      mode: "production",
    });
    expect(prod).toEqual({
      enabled: true,
      dsn: TEST_DSN,
      environment: "production",
      release: "0.0.0+20261007.e0bb39304a44",
    });
    expect(
      resolveErrorReportingConfig({ dsn: TEST_DSN, hostname: "www.verdantgrowdiary.com" }),
    ).toMatchObject({ enabled: true, environment: "production", release: undefined });
    expect(
      resolveErrorReportingConfig({ dsn: TEST_DSN, hostname: "VerdantGrowDiary.com", release: "" }),
    ).toMatchObject({ enabled: true, environment: "production", release: undefined });
  });

  it("is deterministic", () => {
    const env = {
      dsn: TEST_DSN,
      hostname: "verdantgrowdiary.com",
      release: "r1",
      mode: "production",
    };
    expect(resolveErrorReportingConfig(env)).toEqual(resolveErrorReportingConfig({ ...env }));
  });
});

describe("errorReportingRules — scrubbing", () => {
  it("redacts e-mails, JWTs, bearer tokens and credential query values; idempotent", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const input = `user grower@example.com failed; Authorization: Bearer ${jwt}; ?access_token=abc123&code=xyz&tent=4`;
    const once = scrubText(input);
    expect(once).not.toContain("grower@example.com");
    expect(once).not.toContain(jwt);
    expect(once).not.toContain("abc123");
    expect(once).not.toContain("code=xyz");
    expect(once).toContain("tent=4");
    expect(once).toContain(REDACTED);
    expect(scrubText(once)).toBe(once);
  });

  it("handles null, undefined, numbers, objects and circular input without throwing", () => {
    expect(scrubText(null)).toBe("");
    expect(scrubText(undefined)).toBe("");
    expect(scrubText(12)).toBe("12");
    expect(scrubText({ a: "x@y.io" })).toBe(`{"a":"${REDACTED}"}`);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => scrubText(circular)).not.toThrow();
  });

  it("reduces URLs to origin + path; drops query and fragment; tolerates relative/invalid input", () => {
    expect(scrubUrl("https://verdantgrowdiary.com/auth?code=secret#access_token=tok")).toBe(
      "https://verdantgrowdiary.com/auth",
    );
    expect(scrubUrl("/plants/1?x=1#frag")).toBe("/plants/1");
    expect(scrubUrl("")).toBe("");
    expect(scrubUrl(undefined)).toBe("");
    expect(scrubUrl(7)).toBe("");
  });

  it("scrubEvent strips user/server_name, request detail and scrubs text in exceptions, frames, breadcrumbs, extra", () => {
    const event = {
      message: "boom for a@b.co",
      user: { id: "u1", email: "a@b.co", ip_address: "1.2.3.4" },
      server_name: "host",
      request: {
        url: "https://verdantgrowdiary.com/x?access_token=t",
        headers: { cookie: "sb-auth=abc" },
        cookies: "sb=1",
        data: "body",
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "fail ?refresh_token=rt",
            stacktrace: {
              frames: [
                {
                  filename: "https://verdantgrowdiary.com/assets/a.js?v=1",
                  abs_path: "/a.js#x",
                  lineno: 1,
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { category: "console", message: "password=hunter2" },
        {
          category: "fetch",
          data: {
            url: "https://x.supabase.co/auth/v1/token?grant_type=refresh_token",
            method: "POST",
            status_code: 400,
            response: { body: "secret" },
          },
        },
      ],
      extra: { note: "mail me x@y.io" },
      tags: { source: "manual" },
    };
    const out = scrubEvent(event);
    expect(out).not.toBe(event);
    expect(out.user).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toEqual({ url: "https://verdantgrowdiary.com/x" });
    expect(out.message).toMatch(/^#[0-9a-f]{8}$/);
    expect(out.exception?.values?.[0]?.value).toMatch(/^#[0-9a-f]{8}$/);
    expect(JSON.stringify(out)).not.toMatch(/a@b\.co|refresh_token=rt|x@y\.io/);
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: "https://verdantgrowdiary.com/assets/a.js",
      abs_path: "/a.js",
      lineno: 1,
    });
    expect(out.breadcrumbs).toEqual([
      {
        category: "fetch",
        data: { url: "https://x.supabase.co/auth/v1/token", method: "POST", status_code: 400 },
      },
    ]);
    expect(out.extra).toEqual({ note: `mail me ${REDACTED}` });
    expect(out.tags).toEqual({ source: "manual" });
    // Input untouched.
    expect(event.user).toBeDefined();
    expect(event.request.headers).toBeDefined();
  });

  it("scrubEvent/scrubBreadcrumb pass null and undefined through, and drop content-bearing categories", () => {
    expect(scrubEvent(null)).toBeNull();
    expect(scrubEvent(undefined)).toBeUndefined();
    expect(scrubBreadcrumb(null)).toBeNull();
    expect(scrubBreadcrumb(undefined)).toBeNull();
    for (const category of DROPPED_BREADCRUMB_CATEGORIES) {
      expect(scrubBreadcrumb({ category, message: "x" })).toBeNull();
    }
    expect(
      scrubBreadcrumb({ category: "navigation", data: { from: "/a?x=1", to: "/b#y" } }),
    ).toEqual({
      category: "navigation",
      data: { from: "/a", to: "/b" },
    });
  });
});

describe("errorReportingRules — manual capture", () => {
  it("normalises Error, Response and non-Error throwables", () => {
    const err = new Error("x");
    expect(normalizeCaughtError(err)).toBe(err);
    const response = new Response("", { status: 503 });
    expect(normalizeCaughtError(response).message).toBe("Response 503");
    expect(normalizeCaughtError("plain a@b.co").message).toBe(`plain ${REDACTED}`);
    expect(normalizeCaughtError(undefined).message).toBe("Unknown error");
    expect(normalizeCaughtError(null).message).toBe("Unknown error");
  });

  it("builds deterministic, scrubbed context", () => {
    expect(
      buildManualReportContext({
        source: "react_error_boundary",
        route: "/auth?code=1",
        handled: false,
      }),
    ).toEqual({
      tags: { source: "react_error_boundary", handled: "false" },
      extra: { route: "/auth" },
    });
    expect(buildManualReportContext(undefined)).toEqual({
      tags: { source: "manual", handled: "false" },
      extra: {},
    });
  });
});

// @source-scan-justified: "the SDK is never statically imported" and "no replay/tracing/console integration is named" are properties of source text, not of a resolved value; RootErrorComponent is not exported and only renders inside a full TanStack root route. Boundary runtime behaviour is covered in error-reporter-init-and-privacy.test.tsx.
describe("errorReportingRules — wiring", () => {
  const repoRoot = join(__dirname, "..", "..");

  it("the SDK is only ever imported lazily from errorReporter.ts", () => {
    const reporter = readFileSync(join(repoRoot, "src", "lib", "errorReporter.ts"), "utf8");
    expect(reporter).toMatch(/import\("@sentry\/browser"\)/);
    expect(reporter).not.toMatch(/^import .* from "@sentry\/browser"/m);
    expect(reporter).toMatch(/userInfo: false/);
    expect(reporter).toMatch(/urlQueryParams: false/);
    expect(reporter).toMatch(/httpBodies: \[\]/);
    expect(reporter).toMatch(/tracesSampleRate: 0/);
    expect(reporter).not.toMatch(
      /replayIntegration|browserTracingIntegration|captureConsoleIntegration/,
    );
    const rules = readFileSync(join(repoRoot, "src", "lib", "errorReportingRules.ts"), "utf8");
    expect(rules).not.toMatch(/@sentry/);
  });

  it("both error surfaces report, and the root route initialises the reporter", () => {
    const root = readFileSync(join(repoRoot, "src", "routes", "__root.tsx"), "utf8");
    expect(root).toMatch(/initErrorReporter\(\)/);
    expect(root).toMatch(/reportErrorWhenReady\(error, \{\s*source: "route_error_component"/);
    const boundary = readFileSync(
      join(repoRoot, "src", "components", "RootErrorBoundary.tsx"),
      "utf8",
    );
    expect(boundary).toMatch(/reportErrorWhenReady\(error, \{\s*source: "react_error_boundary"/);
  });

  it("documents the ingest origins the report-only CSP must allow", () => {
    expect(SENTRY_INGEST_ORIGINS).toContain("https://*.ingest.sentry.io");
    expect(SENTRY_INGEST_ORIGINS).toContain("https://*.ingest.us.sentry.io");
  });
});
