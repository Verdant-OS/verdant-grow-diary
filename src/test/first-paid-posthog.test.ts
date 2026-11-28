import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAnalyticsConsent } from "@/lib/analyticsConsent";
import { clearLocalStorageForTest } from "./helpers/localStorageTestHelper";
import {
  recordPaidAnalyticsChoice,
  readPaidAnalyticsSince,
  reportFirstPaidActivation,
} from "@/lib/firstPaidAnalyticsService";

const account = "132f8c69-1905-44c5-afee-13420dbadd35";
const anotherAccount = "fcdeb3aa-8140-4215-83e4-83d494726051";
const eventId = "9a95ecfa-0953-4640-97c1-966a2ffc7b1c";
const grantedAt = Date.parse("2026-05-03T12:00:00Z");
const activatedAt = "2026-05-03T12:05:00.000Z";
const receipt = { account_id: account, event_id: eventId, activated_at: activatedAt };
const originalLocation = window.location;
const send = vi.fn<typeof fetch>();
const lookup = vi.fn<(signal: AbortSignal) => Promise<unknown>>();
let controller: AbortController;

function location(hostname = "verdantgrowdiary.com", pathname = "/") {
  Object.defineProperty(window, "location", { configurable: true, value: { hostname, pathname } });
}

function consent() {
  recordPaidAnalyticsChoice("granted", grantedAt);
  writeAnalyticsConsent("granted");
}

function report() {
  return reportFirstPaidActivation(account, controller.signal, { lookup, send });
}

beforeEach(() => {
  clearLocalStorageForTest();
  sessionStorage.clear();
  vi.stubEnv("VITE_POSTHOG_KEY", "fixture-public-project-token");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
  location();
  controller = new AbortController();
  send.mockReset().mockResolvedValue(new Response("1", { status: 200 }));
  lookup.mockReset().mockResolvedValue(receipt);
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("consented first paid activation", () => {
  it("sends the authenticated account, server event ID, original time, and a safe user agent", async () => {
    consent();
    expect(await report()).toBe(true);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: "fixture-public-project-token",
      distinct_id: account,
      event: "subscription_activated",
      uuid: eventId,
      timestamp: activatedAt,
      properties: { $geoip_disable: true, $raw_user_agent: navigator.userAgent },
    });
    expect(await report()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("omits a user agent the shared transport check rejects", async () => {
    consent();
    const prior = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 grower@example.com",
    });
    try {
      expect(await report()).toBe(true);
      expect(JSON.parse(String(send.mock.calls[0][1]?.body)).properties).toEqual({
        $geoip_disable: true,
      });
    } finally {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: prior });
    }
  });

  it.each(["unset", "denied", "legacy grant", "excluded route", "preview host", "no project key"])(
    "does not query billing or send for %s",
    async (scenario) => {
      if (scenario === "legacy grant") writeAnalyticsConsent("granted");
      else if (scenario !== "unset") consent();
      if (scenario === "denied") writeAnalyticsConsent("denied");
      if (scenario === "excluded route") location("verdantgrowdiary.com", "/CREATOR-beta/");
      if (scenario === "preview host") location("preview.example");
      if (scenario === "no project key") vi.stubEnv("VITE_POSTHOG_KEY", "");
      await report();
      expect(lookup).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { ...receipt, account_id: anotherAccount },
    { ...receipt, event_id: "bad" },
    { ...receipt, activated_at: "invalid" },
    { ...receipt, activated_at: "2026-05-03T11:59:00Z" },
  ])("rejects unavailable, unrelated or pre-consent evidence %#", async (value) => {
    consent();
    lookup.mockResolvedValue(value);
    await report();
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["withdraw", "switch account", "leave eligible route", "withdraw and regrant"])(
    "rechecks authorization after an in-flight lookup when the grower can %s",
    async (scenario) => {
      consent();
      lookup.mockImplementation(async () => {
        if (scenario.startsWith("withdraw")) {
          recordPaidAnalyticsChoice("denied", grantedAt + 1);
          writeAnalyticsConsent("denied");
        }
        if (scenario === "withdraw and regrant") {
          recordPaidAnalyticsChoice("granted", grantedAt + 60 * 60 * 1000);
          writeAnalyticsConsent("granted");
        }
        if (scenario === "switch account") controller.abort();
        if (scenario === "leave eligible route") location("verdantgrowdiary.com", "/breeder-beta");
        return receipt;
      });
      await report();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("retries a delivery failure with the same UUID and timestamp", async () => {
    consent();
    send.mockResolvedValueOnce(new Response("", { status: 503 }));
    expect(await report()).toBe(false);
    expect(await report()).toBe(true);
    expect(send.mock.calls[0][1]?.body).toBe(send.mock.calls[1][1]?.body);
  });

  it("sends the same event identity from another independently consenting browser", async () => {
    consent();
    expect(await report()).toBe(true);
    clearLocalStorageForTest();
    consent();
    expect(await report()).toBe(true);
    expect(send.mock.calls[1][1]?.body).toEqual(send.mock.calls[0][1]?.body);
  });

  it("drops a provider timestamp ahead of the browser clock", async () => {
    consent();
    lookup.mockResolvedValue({
      ...receipt,
      activated_at: new Date(Date.now() + 60000).toISOString(),
    });
    expect(await report()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("withdrawal removes the paid grant and a new grant starts a fresh window", () => {
    consent();
    expect(readPaidAnalyticsSince()).toBe(grantedAt);
    recordPaidAnalyticsChoice("denied", grantedAt + 1);
    expect(readPaidAnalyticsSince()).toBeNull();
    recordPaidAnalyticsChoice("granted", grantedAt + 2000);
    expect(readPaidAnalyticsSince()).toBe(grantedAt + 2000);
  });
});
