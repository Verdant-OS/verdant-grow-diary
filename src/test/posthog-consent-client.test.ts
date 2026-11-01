import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRICING_ANALYTICS_EVENT } from "@/lib/pricingAnalytics";
import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";
import {
  __resetPostHogClientForTests,
  syncPostHogWithConsent,
  type PostHogIdentity,
} from "@/lib/posthogClient";

const FIXTURE_KEY = "phc_test_fixture_not_a_real_key";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const { sdk, getSession, onAuthStateChange } = vi.hoisted(() => ({
  sdk: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    stopSessionRecording: vi.fn(),
    reset: vi.fn(),
  },
  getSession: vi.fn(
    async (): Promise<{
      data: {
        session: {
          user: { id: string; email?: string | null; created_at?: string | null };
        } | null;
      };
    }> => ({ data: { session: null } }),
  ),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

vi.mock("posthog-js", () => ({ default: sdk }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}));

const originalLocation = window.location;

function setLocation(hostname: string, pathname = "/", search = "", hash = "") {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      hostname,
      pathname,
      search,
      hash,
      protocol: "https:",
      origin: `https://${hostname}`,
      href: `https://${hostname}${pathname}${search}${hash}`,
    },
  });
}

function prodEnv() {
  return { key: FIXTURE_KEY, host: "" };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PostHog consent client", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetPostHogClientForTests();
    sdk.init.mockClear();
    sdk.capture.mockClear();
    sdk.identify.mockClear();
    sdk.opt_in_capturing.mockClear();
    sdk.opt_out_capturing.mockClear();
    sdk.stopSessionRecording.mockClear();
    sdk.reset.mockClear();
    getSession.mockClear();
    onAuthStateChange.mockClear();
    getSession.mockResolvedValue({ data: { session: null } });
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(""));
    setLocation("localhost");
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    vi.stubEnv("VITE_POSTHOG_HOST", "");
  });

  afterEach(() => {
    __resetPostHogClientForTests();
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  function expectNoPostHogNetwork() {
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.toLowerCase().includes("posthog"))).toBe(false);
    expect(document.querySelectorAll("script")).toHaveLength(0);
  }

  it("does not load or capture before consent is granted", async () => {
    const loadSdk = vi.fn(async () => sdk);
    setLocation("verdantgrowdiary.com");
    syncPostHogWithConsent(
      "unset",
      { pathname: "/", search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    syncPostHogWithConsent(
      "denied",
      { pathname: "/", search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    await flush();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
    expect(sdk.opt_in_capturing).not.toHaveBeenCalled();
    expectNoPostHogNetwork();
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "[::1]",
    "preview.workers.dev",
    "id-preview--app.lovable.app",
    "verdantgrowdiary.com.evil.test",
  ])("does nothing on %s even when consent is granted and a key is present", async (hostname) => {
    const loadSdk = vi.fn(async () => sdk);
    setLocation(hostname);
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    await flush();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
    expectNoPostHogNetwork();
  });

  it("does nothing on a production host when the key is absent", async () => {
    const loadSdk = vi.fn(async () => sdk);
    setLocation("verdantgrowdiary.com");
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk, readEnv: () => ({ key: "", host: "" }) },
    );
    syncPostHogWithConsent("granted", { pathname: "/", search: "", hash: "" });
    await flush();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
    expectNoPostHogNetwork();
  });

  it("does not load on the grow-help toolkit route", async () => {
    const loadSdk = vi.fn(async () => sdk);
    setLocation("verdantgrowdiary.com", GROW_HELP_TOOLKIT_PATH);
    syncPostHogWithConsent(
      "granted",
      { pathname: GROW_HELP_TOOLKIT_PATH, search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    await flush();
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("initializes once after consent and sends one sanitized pageview per route", async () => {
    const loadSdk = vi.fn(async () => sdk);
    setLocation("www.verdantgrowdiary.com");
    const home = { pathname: "/", search: "", hash: "" };
    syncPostHogWithConsent("granted", home, { loadSdk, readEnv: prodEnv });
    syncPostHogWithConsent("granted", home, { loadSdk, readEnv: prodEnv });
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(loadSdk).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith(
      FIXTURE_KEY,
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        capture_pageview: false,
        autocapture: false,
        rageclick: true,
        mask_all_text: true,
        disable_session_recording: true,
        session_recording: expect.objectContaining({
          maskAllInputs: true,
          recordHeaders: false,
          recordBody: false,
          maskTextSelector: "*",
        }),
      }),
    );
    expect(sdk.capture).toHaveBeenCalledTimes(1);
    expect(sdk.capture).toHaveBeenCalledWith("$pageview", {
      $pathname: "/",
      $current_url: "https://www.verdantgrowdiary.com/",
    });

    syncPostHogWithConsent("granted", home, { loadSdk, readEnv: prodEnv });
    expect(sdk.capture).toHaveBeenCalledTimes(1);

    const growPath = `/grows/${USER_ID}`;
    syncPostHogWithConsent(
      "granted",
      { pathname: growPath, search: "?email=a@b.com", hash: "#note" },
      { loadSdk, readEnv: prodEnv },
    );
    expect(sdk.capture).toHaveBeenCalledTimes(2);
    const pageview = sdk.capture.mock.calls[1]?.[1] as { $pathname: string; $current_url: string };
    expect(pageview).toEqual({
      $pathname: "/grows/:id",
      $current_url: "https://www.verdantgrowdiary.com/grows/:id",
    });
    expect(JSON.stringify(pageview)).not.toContain("email");
    expect(JSON.stringify(pageview)).not.toContain(USER_ID);
    expectNoPostHogNetwork();
  });

  it("opts out on withdrawal, including a later denied decision, and does not capture after", async () => {
    const loadSdk = vi.fn(async () => sdk);
    setLocation("verdantgrowdiary.com");
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    await vi.waitFor(() => expect(sdk.capture).toHaveBeenCalledTimes(1));
    sdk.capture.mockClear();

    syncPostHogWithConsent(
      "denied",
      { pathname: "/app", search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    expect(sdk.stopSessionRecording.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.reset.mock.invocationCallOrder[0],
    );
    expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.opt_out_capturing.mock.invocationCallOrder[0],
    );

    window.dispatchEvent(
      new CustomEvent(PRICING_ANALYTICS_EVENT, { detail: { name: "signup", props: {} } }),
    );
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
  });

  it("does not initialize when consent is withdrawn before the SDK import resolves", async () => {
    let release: (value: typeof sdk) => void = () => {};
    const loadSdk = vi.fn(
      () =>
        new Promise<typeof sdk>((resolve) => {
          release = resolve;
        }),
    );
    setLocation("verdantgrowdiary.com");
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    expect(loadSdk).toHaveBeenCalledTimes(1);
    syncPostHogWithConsent(
      "denied",
      { pathname: "/", search: "", hash: "" },
      { loadSdk, readEnv: prodEnv },
    );
    release(sdk);
    await flush();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expectNoPostHogNetwork();
  });

  it("forwards only the allowed product events after init", async () => {
    setLocation("verdantgrowdiary.com");
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk: async () => sdk, readEnv: prodEnv, subscribeIdentity: () => () => {} },
    );
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalled());
    sdk.capture.mockClear();

    window.dispatchEvent(
      new CustomEvent(PRICING_ANALYTICS_EVENT, {
        detail: { name: "signup", props: { method: "email" } },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(PRICING_ANALYTICS_EVENT, {
        detail: { name: "paywall_viewed", props: { surface: "pricing", plan: "craft" } },
      }),
    );
    window.dispatchEvent(
      new CustomEvent(PRICING_ANALYTICS_EVENT, {
        detail: {
          name: "csv_import_completed",
          props: { rows: 4, vendor: "ac_infinity", csv_row: "secret,1,2" },
        },
      }),
    );
    expect(sdk.capture.mock.calls).toEqual([
      ["user_signed_up", {}],
      ["log_created", { source: "csv_import" }],
      ["sensor_csv_imported", { row_count: 4 }],
    ]);
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain("ac_infinity");
    expect(JSON.stringify(sdk.capture.mock.calls)).not.toContain("@");
  });

  it("identifies the account id only and resets on sign-out without opting out", async () => {
    let listener: (event: string, identity: PostHogIdentity | null) => void = () => {};
    setLocation("verdantgrowdiary.com");
    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      {
        loadSdk: async () => sdk,
        readEnv: prodEnv,
        subscribeIdentity: (onChange) => {
          listener = onChange;
          onChange("INITIAL_SESSION", {
            id: USER_ID,
            email: "Ada+VerdantQA@example.com",
            created_at: "2026-04-02T15:04:00.000Z",
          });
          return () => {};
        },
      },
    );
    await vi.waitFor(() => expect(sdk.identify).toHaveBeenCalledTimes(1));
    expect(sdk.identify).toHaveBeenCalledWith(USER_ID, {
      signup_date: "2026-04-02",
      qa_synth: true,
    });
    expect(JSON.stringify(sdk.identify.mock.calls)).not.toContain("@");
    expect(JSON.stringify(sdk.identify.mock.calls)).not.toContain("Ada");

    sdk.identify.mockClear();
    listener("INITIAL_SESSION", {
      id: "ada@example.com",
      email: "ada@example.com",
      created_at: "2026-04-02T00:00:00.000Z",
    });
    expect(sdk.identify).not.toHaveBeenCalled();

    listener("SIGNED_OUT", null);
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.opt_out_capturing).not.toHaveBeenCalled();
  });

  it("reads the signed-in account from Supabase only after init and still omits the email", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: USER_ID,
            email: "grower@example.com",
            created_at: "2026-04-02T00:00:00.000Z",
          },
        },
      },
    });
    setLocation("verdantgrowdiary.com");
    syncPostHogWithConsent("unset", { pathname: "/", search: "", hash: "" });
    expect(getSession).not.toHaveBeenCalled();

    syncPostHogWithConsent(
      "granted",
      { pathname: "/", search: "", hash: "" },
      { loadSdk: async () => sdk, readEnv: prodEnv },
    );
    await vi.waitFor(() => expect(sdk.identify).toHaveBeenCalledTimes(1));
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(sdk.identify).toHaveBeenCalledWith(USER_ID, { signup_date: "2026-04-02" });
    expect(JSON.stringify(sdk.identify.mock.calls)).not.toContain("grower");
    expect(JSON.stringify(sdk.identify.mock.calls)).not.toContain("@");
  });

  it("opts back in on a later grant without loading the SDK a second time", async () => {
    const loadSdk = vi.fn(async () => sdk);
    setLocation("verdantgrowdiary.com");
    const home = { pathname: "/", search: "", hash: "" };
    syncPostHogWithConsent("granted", home, { loadSdk, readEnv: prodEnv });
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    syncPostHogWithConsent("denied", home, { loadSdk, readEnv: prodEnv });
    sdk.capture.mockClear();
    syncPostHogWithConsent("granted", home, { loadSdk, readEnv: prodEnv });
    expect(loadSdk).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(sdk.capture).toHaveBeenCalledTimes(1);
    expect(sdk.capture).toHaveBeenCalledWith("$pageview", expect.any(Object));
  });
});
