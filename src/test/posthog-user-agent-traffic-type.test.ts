import { afterEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";

import {
  POSTHOG_DEFAULT_API_HOST,
  buildPostHogInitOptions,
  scrubPostHogCapture,
} from "@/lib/posthogAnalyticsRules";

const FIXTURE_KEY = "phc_test_fixture_not_a_real_key";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const USER_AGENT_KEYS = [
  "$raw_user_agent",
  "$browser",
  "$browser_version",
  "$os",
  "$os_version",
  "$device_type",
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

// PostHog ingestion classifies an event with no `$raw_user_agent` as
// Automation, so allowlisted events must keep the browser user agent.
describe("PostHog user agent on allowlisted events", () => {
  it("keeps the user agent and its parsed fields on every allowlisted event", () => {
    for (const event of [
      "$pageview",
      "$pageleave",
      "$web_vitals",
      "user_signed_up",
      "log_created",
    ] as const) {
      const scrubbed = scrubPostHogCapture({
        uuid: "00000000-0000-4000-8000-000000000020",
        event,
        properties: {
          $raw_user_agent: CHROME_UA,
          $browser: "Chrome",
          $browser_version: 156,
          $os: "Windows",
          $os_version: "10.0",
          $device_type: "Desktop",
        },
      });
      expect(scrubbed?.properties, event).toEqual({
        $raw_user_agent: CHROME_UA,
        $browser: "Chrome",
        $browser_version: 156,
        $os: "Windows",
        $os_version: "10.0",
        $device_type: "Desktop",
      });
    }
  });

  it("drops user agent values that look like an email, a note, or an oversized string", () => {
    const scrubbed = scrubPostHogCapture({
      uuid: "00000000-0000-4000-8000-000000000021",
      event: "$pageview",
      properties: {
        $raw_user_agent: "Mozilla/5.0 grower@example.com",
        $browser: "Chrome\nyellow leaves",
        $os: "x".repeat(513),
        $os_version: " 10.0",
        $device_type: { note: "yellow leaves" },
        $browser_version: Number.NaN,
      },
    });
    expect(scrubbed?.properties).toEqual({});
  });

  it("sends the posthog-js user agent through before_send on a real capture", () => {
    const options = buildPostHogInitOptions(POSTHOG_DEFAULT_API_HOST);
    const beforeSend = options.before_send;
    if (typeof beforeSend !== "function") throw new Error("before_send must be a function");

    const inputs: CaptureResult[] = [];
    const outputs: Array<CaptureResult | null> = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    posthog.init(FIXTURE_KEY, {
      ...options,
      before_send: (capture) => {
        inputs.push(capture);
        outputs.push(beforeSend(capture));
        return null;
      },
    });

    posthog.capture("$pageview", { $pathname: "/" });
    posthog.capture("grow_created", { note: "diary note stays local" });

    for (const event of ["$pageview", "grow_created"] as const) {
      const source = inputs.find((capture) => capture.event === event)?.properties ?? {};
      const output = outputs.find((capture) => capture?.event === event)?.properties ?? {};
      expect(typeof source.$raw_user_agent, event).toBe("string");
      for (const key of USER_AGENT_KEYS) {
        if (source[key] != null) expect(output[key], `${event} ${key}`).toEqual(source[key]);
      }
      expect(JSON.stringify(output)).not.toContain("diary note");
    }
  });
});
