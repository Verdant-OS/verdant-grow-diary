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
import {
  buildManualReportContext,
  REDACTED,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
} from "@/lib/errorReportingRules";

const TEST_DSN = "https://0123456789abcdef0123456789abcdef@o000000.ingest.us.sentry.io/1";

function enableProductionReporter(hostname = "verdantgrowdiary.com") {
  vi.stubEnv("VITE_SENTRY_DSN", TEST_DSN);
  vi.stubEnv("MODE", "production");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname, pathname: "/plants/1" },
  });
}

// Supabase segments are kept only on the configured project host (VITE_SUPABASE_URL).
const SUPABASE_URL_ORIGIN = new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;

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

  it("removes the BrowserSession default integration, whose session envelopes bypass beforeSend", async () => {
    enableProductionReporter();
    await initErrorReporter(async () => sdk as never);
    const options = sdk.init.mock.calls[0]?.[0] as {
      integrations?: (defaults: Array<{ name: string }>) => Array<{ name: string }>;
    };
    expect(typeof options.integrations).toBe("function");
    const kept = options.integrations!([
      { name: "GlobalHandlers" },
      { name: "BrowserSession" },
      { name: "Dedupe" },
    ]).map((integration) => integration.name);
    expect(kept).toEqual(["GlobalHandlers", "Dedupe"]);
  });

  it("turns every Sentry data-collection category off once the SDK resolves its defaults", async () => {
    enableProductionReporter();
    await initErrorReporter(async () => sdk as never);
    const options = sdk.init.mock.calls[0]?.[0] as { dataCollection?: unknown };
    // Resolve with the installed SDK's own resolver, so an omitted field shows its real default.
    const { resolveDataCollectionOptions } = (await import(
      // Deep import of an unexported SDK helper (no type declaration at this path).
      "../../node_modules/@sentry/core/build/esm/utils/data-collection/resolveDataCollectionOptions.js"
    )) as { resolveDataCollectionOptions: (o: unknown) => Record<string, unknown> };
    expect(resolveDataCollectionOptions(options)).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    });
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
      extra: { route: "/grows/:growId" },
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
      extra: { route: "/plants/:id" },
    });
    // The message text is replaced by beforeSend before anything leaves the browser.
    const options = sdk.init.mock.calls[0]?.[0] as {
      beforeSend: (e: Record<string, unknown>) => Record<string, unknown>;
    };
    const sent = options.beforeSend({
      exception: { values: [{ type: "Error", value: error.message }] },
    }) as { exception: { values: Array<{ value: string }> } };
    expect(sent.exception.values[0]?.value).toBe(REDACTED);
    expect(JSON.stringify(sent)).not.toContain("grower@example.com");
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

  it("redacts colon-delimited, Basic-auth and object-style credentials", () => {
    const cases: Array<[string, string]> = [
      ["login failed password: hunter2", "hunter2"],
      ["api_key: sk_live_abc123 rejected", "sk_live_abc123"],
      ["Authorization: Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
      ["{password: 'hunter two', user: 'x'}", "hunter two"],
      ["{'client_secret': 'cs_abc'}", "cs_abc"],
      ["Cookie: sb-access=xyz123", "xyz123"],
      ['{"apikey" : "anon-key-value"}', "anon-key-value"],
      ['config error password="hunter2"', "hunter2"],
      ["api_key='sk_live_abc' rejected", "sk_live_abc"],
      ['secret="two words"', "two words"],
      ["Authorization: Basic YTpi", "YTpi"],
      ["Authorization: Bearer abcd", "abcd"],
      ["password = hunter2", "hunter2"],
      ['token: "a\\"b secret"', "secret"],
      ["Authorization=Basic YTpi", "YTpi"],
      ["access_token%3Dabc123", "abc123"],
      ["clientSecret=cs_1", "cs_1"],
      ["refreshToken: rt_abc", "rt_abc"],
      ["pass: hunter2", "hunter2"],
      ["session_id: abc123", "abc123"],
      ["login failed password: hunter two, retrying", "two"],
      ["secret=open sesame; next", "sesame"],
      ["SUPABASE_SERVICE_ROLE_KEY=service-secret-123", "service-secret-123"],
      ["service_role_key: service-secret-123", "service-secret-123"],
      ['{"key":"sk_live_abc"}', "sk_live_abc"],
      ["{'key': 'sk_live_abc'}", "sk_live_abc"],
      ["privateKey: pk_abc", "pk_abc"],
      ["access_token%3D abc123", "abc123"],
      ["access_token %3Dabc123", "abc123"],
      ["password=abc#123", "#123"],
      ["password: it's secret", "s secret"],
      ["password=#abc", "#abc"],
      ["callback failed code%3Dabc123", "abc123"],
      ["callback failed key%3Dsecret", "secret"],
      ["callback failed code %3D abc123", "abc123"],
      ["lookup failed email=grower%40example.com", "grower%40example.com"],
      ["lookup failed for grower%40example.com", "example.com"],
      ["Authorization%3A%20Bearer%20abcd1234efgh", "abcd1234efgh"],
      ["Bearer%20abcd1234efgh", "abcd1234efgh"],
      ["Basic%20dXNlcjpwYXNz", "dXNlcjpwYXNz"],
      ["%22password%22%3A%22hunter2%22", "hunter2"],
      ["%7B%22refresh_token%22%3A%22v1r3fr3sh%22%7D", "v1r3fr3sh"],
      ["token%3A%20abc123", "abc123"],
      ["access_token%253Dabc123", "abc123"],
      ["grower%2540example.com", "example.com"],
      ["callback failed code = abc123", "abc123"],
      ['oauth exchange failed {"code":"4/0AbCdEfGhIjKlMnOp"}', "4/0AbCdEfGhIjKlMnOp"],
      ["oauth exchange failed {'code': 'q8w7e6r5t4y3u2i1'}", "q8w7e6r5t4y3u2i1"],
      ["auth_code=q8w7e6r5t4y3", "q8w7e6r5t4y3"],
      ['{"code":"abc123"}', "abc123"],
      ["{'code':'ab12'}", "ab12"],
      ["password%3A%ED%A0%80%20hunter2", "hunter2"],
      ["sign-in failed, auth code: 123456", "123456"],
      ["Verification code: 482913 expired", "482913"],
      ["code verifier: dBjftJeZ4CVPmB92K27uhbUJU1p1r", "dBjftJeZ4CVPmB92K27uhbUJU1p1r"],
      ["one-time code = 771204", "771204"],
      ["Authorization code: q8w7e6r5t4", "q8w7e6r5t4"],
      ["MFA code: 123456", "123456"],
      ["2FA code: 123456", "123456"],
      ["SMS code: 123456", "123456"],
      ["recovery code: abcd-efgh", "abcd-efgh"],
      ["backup code: 1234-5678", "1234-5678"],
      ["reset code: 998877", "998877"],
      ["invite code: XYZ123", "XYZ123"],
      ["mfa_code=123456", "123456"],
      ['recovery_codes: ["a1b2", "c3d4"]', "a1b2"],
      ['recovery_codes: [\n  "a1b2",\n  "c3d4"\n]', "c3d4"],
      ['{"backup_codes": [\n  "e5f6"\n]}', "e5f6"],
      ["pin: 4821", "4821"],
      ["https://verdantgrowdiary.com/auth?code=abc&state=csrfSecret123456", "csrfSecret123456"],
      ["openid callback nonce=n0nc3Value99", "n0nc3Value99"],
      ['{"code":"12345"}', "12345"],
      ['{"code":"ABCDE"}', "ABCDE"],
      ["gateway rejected sk_live_ABCDEFGH123456", "ABCDEFGH123456"],
      ["supabase said sb_secret_abcdefgh12345678", "abcdefgh12345678"],
      ["paddle webhook pdl_ntfset_ABCDEF123456", "ABCDEF123456"],
      ["whsec_9f8e7d6c5b4a3210 rejected", "9f8e7d6c5b4a3210"],
      ["token ghp_AbCdEfGhIjKlMnOpQrSt1234 revoked", "AbCdEfGhIjKlMnOpQrSt1234"],
      ["key AKIAABCDEFGHIJKLMNOP leaked", "ABCDEFGHIJKLMNOP"],
      ['{"auth_code":"q8w7e6r5t4y3"}', "q8w7e6r5t4y3"],
      ["verification_code=482913", "482913"],
      ['{"otp":"482913"}', "482913"],
      ["code_verifier=dBjftJeZ4CVPmB92K27uhbUJU1p1r", "dBjftJeZ4CVPmB92K27uhbUJU1p1r"],
      ["request rejected vbt_0123456789abcdefABCDEF0123456789abcdefAB", "vbt_0123456789"],
      ["bridge said (vbt_short-tok_123) was revoked", "short-tok_123"],
      ['{"code":"12345","message":"OAuth exchange failed"}', "12345"],
      ['oauth={"code":"12345"}; error={"message":"request failed"}', "12345"],
      ['{"code":"42P01","message":"relation missing"}', "42P01"],
      ['payload=\\"access_token\\":\\"AbCdEf1234567890\\"', "AbCdEf1234567890"],
      ['{\\"refresh_token\\":\\"rt_9x8y7z6w\\"}', "rt_9x8y7z6w"],
      ['{\\"key\\":\\"AbCdEf1234567890\\"}', "AbCdEf1234567890"],
      ["API key: AbCdEf1234567890", "AbCdEf1234567890"],
      ["secret key: AbCdEf1234567890", "AbCdEf1234567890"],
      ["signing key: AbCdEf1234567890", "AbCdEf1234567890"],
      ["service role key: AbCdEf1234567890", "AbCdEf1234567890"],
      ['{"state":"csrfSecret123456"}', "csrfSecret123456"],
      ['{"nonce":"n0nc3Value99"}', "n0nc3Value99"],
      ["state: csrfSecret123456", "csrfSecret123456"],
      ["nonce: n0nc3Value99", "n0nc3Value99"],
      ['recovery_codes: [\n  "a1b2",\n  "c3d4"', "c3d4"],
      ['{"backup_codes": ["e5f6", "g7h8"', "g7h8"],
      ['login failed password: "hunter2', "hunter2"],
      ['payload=\\"access_token\\":\\"AbCdEf1234567890', "AbCdEf1234567890"],
      [String.raw`{\"password\":\"abc\\\"def\"}`, "def"],
      [String.raw`{\\\"password\\\":\\\"abc\\\\\\\"def\\\"}`, "def"],
      ['{"code":"12345","metadata":{"details":null,"hint":null,"message":"oauth"}}', "12345"],
      ['{"code":"12345","message":"\\"details\\":null,\\"hint\\":null"}', "12345"],
      ['{"state":"abcdefghijklmno"}', "abcdefghijklmno"],
      ["state: abcdefghijklmno", "abcdefghijklmno"],
      ['{"API key":"AbCdEf1234567890"}', "AbCdEf1234567890"],
      ['{"service role key":"AbCdEf1234567890"}', "AbCdEf1234567890"],
      [String.raw`{\"API key\":\"AbCdEf1234567890\"}`, "AbCdEf1234567890"],
      ["access_token=abc%26defSECRET", "SECRET"],
      ["password=abc%3BdefSECRET", "SECRET"],
      ["client_secret=abc%2CdefSECRET", "SECRET"],
      ["token: abc%22defSECRET", "SECRET"],
      [String.raw`{\\\\\\\"password\\\\\\\":\\\\\\\"AbCdEf1234567890\\\\\\\"}`, "AbCdEf1234567890"],
      [
        String.raw`{\\\\\\\\\\\\\\\"token\\\\\\\\\\\\\\\":\\\\\\\\\\\\\\\"AbCdEf1234567890\\\\\\\\\\\\\\\"}`,
        "AbCdEf1234567890",
      ],
      ['{"details":null,"hint":null,"message":"db","metadata":{"x":"}","code":"12345"}}', "12345"],
      ['{"details":null,"hint":null,"message":"db","metadata":{"x":"{","code":"12345"}}', "12345"],
      [
        JSON.stringify({
          details: null,
          hint: null,
          message: "db",
          a: "\\",
          metadata: { b: "\\", code: "12345" },
        }),
        "12345",
      ],
      ["%22access_token%22%3Aabc%26defSECRET", "SECRET"],
      ["%2522access_token%2522%253Aabc%2526defSECRET", "SECRET"],
      ["%22password%22%3A%20abc%3BdefSECRET", "SECRET"],
      ["%25252522access_token%25252522%2525253AabcSECRET", "SECRET"],
      ["%22access_token%22%3Aabc%22defSECRET", "SECRET"],
      ["&quot;access_token&quot;:&quot;AbCdEf1234567890&quot;", "AbCdEf1234567890"],
      ["&#34;password&#34;&#58;&#34;hunter2&#34;", "hunter2"],
      ["{&#x22;refresh_token&#x22;:&#x22;rt_9x8y7z&#x22;}", "rt_9x8y7z"],
      ["access_token=abc&amp;defSECRET", "SECRET"],
      [
        "&amp;quot;access_token&amp;quot;&colon;&amp;quot;AbCdEf1234567890&amp;quot;",
        "AbCdEf1234567890",
      ],
      ["&#38;quot;password&#38;quot;:&#38;quot;hunter2&#38;quot;", "hunter2"],
      [
        "&amp;amp;quot;token&amp;amp;quot;:&amp;amp;quot;AbCdEf1234567890&amp;amp;quot;",
        "AbCdEf1234567890",
      ],
      [
        "%26quot%3Baccess_token%26quot%3B%3A%26quot%3BAbCdEf1234567890%26quot%3B",
        "AbCdEf1234567890",
      ],
      ["%26%2334%3Bpassword%26%2334%3B%3A%26%2334%3Bhunter2%26%2334%3B", "hunter2"],
      ["&QUOT;access_token&QUOT;:&QUOT;AbCdEf1234567890&QUOT;", "AbCdEf1234567890"],
      [
        "%26QUOT%3Baccess_token%26QUOT%3B%3A%26QUOT%3BAbCdEf1234567890%26QUOT%3B",
        "AbCdEf1234567890",
      ],
      ["access_token=abc&AMP;defSECRET", "SECRET"],
      [`{'details':null,'hint':null,'message':'db','metadata':{"x":"}",'code':'12345'}}`, "12345"],
    ];
    for (const [input, secret] of cases) {
      const out = scrubText(input);
      expect(out, input).not.toContain(secret);
      expect(out, input).toContain(REDACTED);
      expect(scrubText(out), input).toBe(out);
    }
  });

  it("keeps non-credential diagnostics such as Postgres error codes readable", () => {
    expect(scrubText('duplicate key value, code: 23505, details: "plant_id"')).toBe(
      'duplicate key value, code: 23505, details: "plant_id"',
    );
    expect(scrubText("Key (plant_id)=(42) already exists.")).toBe(
      "Key (plant_id)=(42) already exists.",
    );
    // A complete PostgREST error object (code, details, hint, message) keeps its diagnostic code.
    const postgrestErrors = [
      '{"code":"23505","details":"Key (plant_id)=(42) already exists.","hint":null,"message":"duplicate"}',
      '{"code":"PGRST116","details":null,"hint":null,"message":"no rows"}',
      '{"message":"relation missing","code":"42P01","hint":null,"details":null}',
      '{\\"code\\":\\"23505\\",\\"details\\":null,\\"hint\\":null,\\"message\\":\\"duplicate\\"}',
    ];
    for (const payload of postgrestErrors) expect(scrubText(payload)).toBe(payload);
    expect(scrubText("state: pending")).toBe("state: pending");
    expect(scrubText('{"state":"active"}')).toBe('{"state":"active"}');
    expect(scrubText("primary key: plant_id")).toBe("primary key: plant_id");
    expect(scrubText('{"error_code":"23505"}')).toBe('{"error_code":"23505"}');
    expect(scrubText("status_code: 500")).toBe("status_code: 500");
    expect(scrubText("error code: 23505")).toBe("error code: 23505");
    expect(scrubText("HTTP status code: 500")).toBe("HTTP status code: 500");
    expect(scrubText("pinned: true, spin: 3")).toBe("pinned: true, spin: 3");
  });

  it("drops DOM click breadcrumbs, which can carry grower data in element attributes", () => {
    expect(
      scrubBreadcrumb({ category: "ui.click", message: 'button[title="Blue Dream #3"]' }),
    ).toBeNull();
    const out = scrubEvent({
      breadcrumbs: [
        { category: "ui.click", message: 'div[title="My private cultivar"]' },
        { category: "navigation", data: { from: "/grows", to: "/plants" } },
      ],
    });
    expect(out?.breadcrumbs).toEqual([
      { category: "navigation", data: { from: "/grows", to: "/plants" } },
    ]);
  });

  it("replaces UUID path segments (grow, tent and plant ids) with :id", () => {
    const id = "3f2c9a1e-8b7d-4c6e-9f00-1a2b3c4d5e6f";
    // Direct scrubUrl calls keep only code-defined segments; page URLs in events go
    // through scrubRouteUrl and keep their route template instead.
    expect(scrubUrl(`https://verdantgrowdiary.com/plants/${id}?tab=log`)).toBe(
      "https://verdantgrowdiary.com/:redacted/:id",
    );
    expect(scrubUrl(`/grows/${id.toUpperCase()}/tents/${id}`)).toBe("/:redacted/:id/:redacted/:id");
    // An asset name keeps only inside an executed stack frame; anywhere else it is redacted.
    expect(scrubUrl("/assets/index-3f2c9a1e.js")).toBe("/assets/:redacted");
    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: `/plants/${id}`, to: `/grows/${id}` },
    });
    // Navigation breadcrumbs carry page paths, so they leave as route templates.
    expect(crumb?.data).toEqual({ from: "/plants/:id", to: "/grows/:growId" });
    const event = scrubEvent({
      transaction: `/plants/${id}`,
      request: { url: `https://verdantgrowdiary.com/plants/${id}` },
    }) as { transaction: string; request: { url: string } };
    expect(event.transaction).toBe("/plants/:id");
    expect(event.request.url).toBe("https://verdantgrowdiary.com/plants/:id");
  });

  it("replaces percent-encoded UUID path segments with :id", () => {
    const encoded = "3f2c9a1e%2D8b7d%2d4c6e%2D9f00%2D1a2b3c4d5e6f";
    expect(scrubUrl(`https://verdantgrowdiary.com/plants/${encoded}`)).toBe(
      "https://verdantgrowdiary.com/:redacted/:id",
    );
    expect(scrubUrl(`/plants/${encoded}`)).toBe("/:redacted/:id");
  });

  it("redacts UUIDs in free text: exception values, messages and breadcrumb messages", () => {
    const id = "3f2c9a1e-8b7d-4c6e-9f00-1a2b3c4d5e6f";
    const text = scrubText(`hunt ${id} failed; plant ${id.toUpperCase()} missing`);
    expect(text).toBe("hunt [id] failed; plant [id] missing");
    expect(scrubText(text)).toBe(text);
    const event = scrubEvent({
      message: `load ${id}`,
      exception: { values: [{ type: "Error", value: `hunt ${id} failed` }] },
    }) as { message: string; exception: { values: Array<{ value: string }> } };
    // Event and breadcrumb messages leave only as a summary, so no id survives there either.
    expect(event.message).toBe(REDACTED);
    expect(event.exception.values[0]?.value).toBe(REDACTED);
    expect(scrubBreadcrumb({ category: "fetch", message: `GET row ${id}` })?.message).toBe(
      REDACTED,
    );
  });

  it("keeps only http(s) origin+path from URLs and redacts payload-bearing schemes", () => {
    expect(scrubUrl("https://verdantgrowdiary.com/grows/1?token=abc#x")).toBe(
      "https://verdantgrowdiary.com/:redacted/:redacted",
    );
    for (const url of [
      "data:text/plain,grower@example.com?token=abc",
      "javascript:alert('grower@example.com')",
      "blob:https://verdantgrowdiary.com/1f2e",
      "chrome-extension://abcdef/content.js",
    ]) {
      const out = scrubUrl(url);
      expect(out, url).not.toContain("grower@example.com");
      expect(out, url).not.toContain("token");
      expect(out, url).toMatch(/^[a-z][a-z0-9+.-]*:\[redacted\]$/);
      expect(scrubUrl(out), url).toBe(out);
    }
    const event = scrubEvent({
      transaction: "data:text/plain,grower@example.com",
      request: { url: "javascript:void(document.cookie)" },
      exception: { values: [{ stacktrace: { frames: [{ filename: "data:x,secret" }] } }] },
    });
    expect(event?.transaction).toBe("data:[redacted]");
    expect(event?.request?.url).toBe("javascript:[redacted]");
    expect(event?.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      "data:[redacted]",
    );
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
      transaction: "/auth?code=abc",
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
    expect(out?.logentry).toEqual({ message: REDACTED });
    expect(out?.transaction).toBe("/auth");
    const ex = out?.exception?.values?.[0];
    expect(ex?.type).toBe("Error");
    expect(ex?.mechanism).toEqual({ type: "generic", handled: false });
    // A script on a host outside the closed list loses its host as well as its path.
    expect(ex?.stacktrace?.frames?.[0]).toEqual({ filename: "https://[redacted-host]/:redacted" });
  });
});

describe("errorReportingRules — free-text messages leave only an allowlisted diagnostic summary", () => {
  it("replaces grower-authored text in event messages with a constant", () => {
    const out = scrubEvent({ message: "plant Blue Dream note: leaves curled" });
    expect(out?.message).toBe(REDACTED);
    expect(out?.message).not.toContain("Blue Dream");
    expect(out?.message).not.toContain("leaves");
  });

  it("keeps the repo scope and SQLSTATE code from a forwarded provider message", () => {
    const value =
      'growRepo.fetchTents: duplicate key value violates unique constraint "plants_name_key" ' +
      "Key (name)=(Blue Dream #3) already exists. SQLSTATE 23505";
    const out = scrubEvent({ exception: { values: [{ type: "Error", value }] } });
    const sent = out?.exception?.values?.[0]?.value ?? "";
    expect(sent).toBe("growRepo.fetchTents code=23505");
    expect(sent).not.toContain("Blue Dream");
    // Nothing derived from the grower value survives, so a different value sends the same summary.
    const other = scrubEvent({
      exception: { values: [{ type: "Error", value: value.replace("#3", "#4") }] },
    });
    expect(other?.exception?.values?.[0]?.value).toBe(sent);
  });

  it("keeps PostgREST codes and HTTP statuses, and drops everything else", () => {
    const out = scrubEvent({
      message: "db.fetchGrowRow: PGRST116 JSON object requested, multiple (or no) rows returned",
      logentry: {
        message: "Response 503 at https://verdantgrowdiary.com/plants/:id",
        formatted: "My Gelato tent is too warm",
      },
    });
    expect(out?.message).toBe("db.fetchGrowRow code=PGRST116");
    expect(out?.logentry?.message).toBe("status=503");
    expect(out?.logentry?.formatted).toBe(REDACTED);
  });

  it("summarises breadcrumb messages the same way", () => {
    const crumb = scrubBreadcrumb({ category: "fetch", message: "GET Blue Dream diary failed" });
    expect(crumb?.message).toBe(REDACTED);
  });

  it("keeps identifier-shaped exception types and replaces any other type with Error", () => {
    const out = scrubEvent({
      exception: {
        values: [
          { type: "TypeError", value: "x" },
          { type: "Blue Dream note", value: "y" },
        ],
      },
    });
    expect(out?.exception?.values?.map((ex) => ex.type)).toEqual(["TypeError", "Error"]);
    for (const ex of out?.exception?.values ?? []) expect(ex.value).toBe(REDACTED);
  });

  it("reports a code only when it is a real SQLSTATE class, so a grower's number never passes", () => {
    expect(scrubEvent({ message: "ship to zip code 90210" })?.message).toBe(REDACTED);
    expect(scrubEvent({ message: "growRepo.fetchTents: SQLSTATE 42P01" })?.message).toBe(
      "growRepo.fetchTents code=42P01",
    );
  });

  it("leaves empty messages empty", () => {
    const out = scrubEvent({ message: "", exception: { values: [{ type: "Error", value: "" }] } });
    expect(out?.message).toBe("");
    expect(out?.exception?.values?.[0]?.value).toBe("");
  });
});

describe("errorReportingRules — summary fields come only from code-defined provenance", () => {
  it("keeps a scope only from the closed list of repository-defined scopes", () => {
    expect(scrubEvent({ message: "plant.BlueDream: leaves curled" })?.message).toBe(REDACTED);
    expect(scrubEvent({ message: "db.fetchGrowRow: boom" })?.message).toBe("db.fetchGrowRow");
  });

  it("keeps a code only under a known scope and with explicit PostgREST or SQLSTATE context", () => {
    expect(scrubEvent({ message: "oauth.exchange: code=42P01" })?.message).toBe(REDACTED);
    expect(scrubEvent({ message: "growRepo.fetchTents: code=42P01" })?.message).toBe(
      "growRepo.fetchTents",
    );
    expect(scrubEvent({ message: "growRepo.fetchTents: SQLSTATE 42P01" })?.message).toBe(
      "growRepo.fetchTents code=42P01",
    );
    expect(scrubEvent({ message: "PGRST116 from an unknown caller" })?.message).toBe(REDACTED);
  });

  it("keeps an HTTP status only from the caught-Response shape or under a known scope", () => {
    expect(scrubEvent({ message: "Response 503 at https://x.test/a" })?.message).toBe("status=503");
    expect(scrubEvent({ message: "my tent status 404 is odd" })?.message).toBe(REDACTED);
  });

  it("redacts e-mail and token-shaped path segments from asset and API URLs", () => {
    expect(scrubUrl("https://verdantgrowdiary.com/oops/grower@example.com")).toBe(
      "https://verdantgrowdiary.com/:redacted/:redacted",
    );
    expect(scrubUrl("/bridge/vbt_0123456789abcdefABCDEF0123456789abcdefAB")).toBe(
      "/:redacted/:redacted",
    );
    expect(scrubUrl("/x/grower%40example.com/y")).toBe("/:redacted/:redacted/:redacted");
    // An asset name keeps only inside an executed stack frame; anywhere else it is redacted.
    expect(scrubUrl("/assets/index-3f2c9a1e.js")).toBe("/assets/:redacted");
  });

  it("reduces page URLs to their route template and fails closed for unknown paths", () => {
    const event = scrubEvent({
      transaction: "/oops/grower@example.com",
      request: { url: "https://verdantgrowdiary.com/oops/Blue%20Dream" },
      breadcrumbs: [
        { category: "navigation", data: { from: "/oops/x@y.co", to: "/pheno-hunts/abc/keepers" } },
      ],
    });
    expect(event?.transaction).toBe("/:unmatched");
    expect(event?.request?.url).toBe("https://verdantgrowdiary.com/:unmatched");
    expect(event?.breadcrumbs?.[0]?.data).toEqual({
      from: "/:unmatched",
      to: "/pheno-hunts/:id/keepers",
    });
    expect(buildManualReportContext({ source: "manual", route: "/plants/1" }).extra).toEqual({
      route: "/plants/:id",
    });
    expect(buildManualReportContext({ source: "manual", route: "/pheno-hunts/new" }).extra).toEqual(
      { route: "/pheno-hunts/new" },
    );
    expect(buildManualReportContext({ source: "manual", route: "/oops/a@b.co" }).extra).toEqual({
      route: "/:unmatched",
    });
  });
});

describe("errorReportingRules — only code-defined shapes leave; nothing else is fingerprinted", () => {
  it("sends a constant instead of fingerprinting grower text", () => {
    expect(scrubEvent({ message: "plant Blue Dream note: leaves curled" })?.message).toBe(REDACTED);
    expect(scrubEvent({ message: "growRepo.fetchTents: SQLSTATE 42P01" })?.message).toBe(
      "growRepo.fetchTents code=42P01",
    );
    expect(scrubEvent({ message: "Response 503 at https://x.test/a" })?.message).toBe("status=503");
  });

  it("redacts URL segments that are not a recognised asset or API shape", () => {
    expect(
      scrubBreadcrumb({ category: "fetch", data: { url: "/api/Blue%20Dream" } })?.data,
    ).toEqual({
      url: "/:redacted/:redacted",
    });
    expect(
      scrubUrl(
        `${SUPABASE_URL_ORIGIN}/storage/v1/object/public/plant-photos/3f2c9a1e-8b7d-4c6e-9f00-1a2b3c4d5e6f/My%20private%20plant.jpg`,
      ),
    ).toBe(`${SUPABASE_URL_ORIGIN}/storage/v1/object/public/:redacted/:id/:redacted`);
  });

  it("redacts nested-encoded segments instead of trusting one decoding pass", () => {
    expect(scrubUrl("/bridge/vbt%255F0123456789abcdefABCDEF0123456789abcdefAB")).toBe(
      "/:redacted/:redacted",
    );
  });

  it("keeps Supabase vocabulary and known function/auth names readable; redacts non-frame asset names", () => {
    for (const [input, expected] of [
      [
        "https://verdantgrowdiary.com/assets/index-BvX3k9aQ.js",
        "https://verdantgrowdiary.com/assets/:redacted",
      ],
      [
        `${SUPABASE_URL_ORIGIN}/rest/v1/sensor_readings?select=*`,
        `${SUPABASE_URL_ORIGIN}/rest/v1/:redacted`,
      ],
      [
        `${SUPABASE_URL_ORIGIN}/rest/v1/rpc/quicklog_save_manual`,
        `${SUPABASE_URL_ORIGIN}/rest/v1/rpc/:redacted`,
      ],
      [
        `${SUPABASE_URL_ORIGIN}/functions/v1/ai-doctor-review`,
        `${SUPABASE_URL_ORIGIN}/functions/v1/ai-doctor-review`,
      ],
      [
        `${SUPABASE_URL_ORIGIN}/auth/v1/token?grant_type=refresh_token`,
        `${SUPABASE_URL_ORIGIN}/auth/v1/token`,
      ],
    ]) {
      expect(scrubUrl(input), input).toBe(expected);
    }
  });
});

describe("errorReportingRules — URL segments are kept only from closed lists of code-owned names", () => {
  it("does not trust an API shape on a foreign host, or an unfingerprinted asset name", () => {
    expect(scrubUrl("https://evil.test/rest/v1/blue-dream")).toBe(
      "https://[redacted-host]/:redacted/:redacted/:redacted",
    );
    expect(scrubUrl("/assets/grower_private_note.svg")).toBe("/assets/:redacted");
    expect(scrubUrl("https://evil.test/assets/index-BvX3k9aQ.js")).toBe(
      "https://[redacted-host]/:redacted/:redacted",
    );
  });

  it("keeps Supabase vocabulary and known function/auth names, and redacts table, RPC and bucket names", () => {
    for (const [input, expected] of [
      [`${SUPABASE_URL_ORIGIN}/rest/v1/blue-dream`, `${SUPABASE_URL_ORIGIN}/rest/v1/:redacted`],
      [
        `${SUPABASE_URL_ORIGIN}/rest/v1/sensor_readings?select=*`,
        `${SUPABASE_URL_ORIGIN}/rest/v1/:redacted`,
      ],
      [
        `${SUPABASE_URL_ORIGIN}/rest/v1/rpc/quicklog_save_manual`,
        `${SUPABASE_URL_ORIGIN}/rest/v1/rpc/:redacted`,
      ],
      [
        `${SUPABASE_URL_ORIGIN}/functions/v1/blue-dream`,
        `${SUPABASE_URL_ORIGIN}/functions/v1/:redacted`,
      ],
      [
        `${SUPABASE_URL_ORIGIN}/functions/v1/ai-doctor-review`,
        `${SUPABASE_URL_ORIGIN}/functions/v1/ai-doctor-review`,
      ],
      [
        `${SUPABASE_URL_ORIGIN}/auth/v1/token?grant_type=refresh_token`,
        `${SUPABASE_URL_ORIGIN}/auth/v1/token`,
      ],
      [`${SUPABASE_URL_ORIGIN}/auth/v1/blue-dream`, `${SUPABASE_URL_ORIGIN}/auth/v1/:redacted`],
      [
        `${SUPABASE_URL_ORIGIN}/storage/v1/object/public/plant-photos/a.jpg`,
        `${SUPABASE_URL_ORIGIN}/storage/v1/object/public/:redacted/:redacted`,
      ],
      [
        "https://verdantgrowdiary.com/assets/index-BvX3k9aQ.js",
        "https://verdantgrowdiary.com/assets/:redacted",
      ],
    ]) {
      expect(scrubUrl(input), input).toBe(expected);
    }
  });

  it("lists exactly the edge functions that exist in supabase/functions", async () => {
    const { readdirSync } = await import("node:fs");
    const { KNOWN_EDGE_FUNCTIONS } = await import("@/lib/errorReportingRules");
    const onDisk = readdirSync("supabase/functions", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name)
      .sort();
    expect([...KNOWN_EDGE_FUNCTIONS].sort()).toEqual(onDisk);
  });
});

describe("errorReportingRules — only closed-list hosts, and only executed scripts keep asset names", () => {
  const SUPABASE_ORIGIN = new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;

  it("redacts every host that is not a production or the configured Supabase host", () => {
    expect(scrubUrl("https://blue-dream.evil.test/rest/v1/x")).toBe(
      "https://[redacted-host]/:redacted/:redacted/:redacted",
    );
    expect(scrubUrl("https://other-project.supabase.co/functions/v1/ai-doctor-review")).toBe(
      "https://[redacted-host]/:redacted/:redacted/:redacted",
    );
    expect(scrubUrl(`${SUPABASE_ORIGIN}/functions/v1/ai-doctor-review`)).toBe(
      `${SUPABASE_ORIGIN}/functions/v1/ai-doctor-review`,
    );
    expect(
      scrubBreadcrumb({ category: "fetch", data: { url: "https://blue-dream.evil.test/a" } })?.data,
    ).toEqual({ url: "https://[redacted-host]/:redacted" });
  });

  it("redacts asset file names outside stack frames, and non-script names inside them", () => {
    expect(scrubUrl("/assets/Blue-Dream-12345678.svg")).toBe("/assets/:redacted");
    expect(
      scrubBreadcrumb({
        category: "fetch",
        data: { url: "https://verdantgrowdiary.com/assets/Blue-Dream-12345678.js" },
      })?.data,
    ).toEqual({ url: "https://verdantgrowdiary.com/assets/:redacted" });
    const frames = scrubEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: "https://verdantgrowdiary.com/assets/index-BvX3k9aQ.js" },
                { filename: "https://verdantgrowdiary.com/assets/Blue-Dream-12345678.svg" },
              ],
            },
          },
        ],
      },
    })?.exception?.values?.[0]?.stacktrace?.frames;
    expect(frames?.map((frame) => frame.filename)).toEqual([
      "https://verdantgrowdiary.com/assets/index-BvX3k9aQ.js",
      "https://verdantgrowdiary.com/assets/:redacted",
    ]);
  });
});
