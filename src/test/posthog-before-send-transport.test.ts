import { describe, expect, it } from "vitest";

import { buildPostHogInitOptions, scrubPostHogCapture } from "@/lib/posthogAnalyticsRules";

const TRANSPORT = {
  token: "phc_test_fixture",
  distinct_id: "11111111-1111-4111-8111-111111111111",
  $session_id: "019a0000-0000-7000-8000-000000000001",
  $window_id: "019a0000-0000-7000-8000-000000000002",
  $lib: "web",
  $lib_version: "1.444.0",
  $insert_id: "00000000-0000-4000-8000-000000000099",
  $device_id: "11111111-1111-4111-8111-111111111112",
  $time: 1_700_000_000,
  $config_defaults: "unset",
  $is_identified: false,
  $process_person_profile: false,
};

describe("PostHog before_send transport properties", () => {
  it("keeps token and distinct_id on allowlisted pageviews and product events", () => {
    const beforeSend = buildPostHogInitOptions("https://us.i.posthog.com").before_send;
    expect(typeof beforeSend).toBe("function");
    if (typeof beforeSend !== "function") {
      throw new Error("before_send must be a function");
    }

    const pageview = beforeSend({
      uuid: "00000000-0000-4000-8000-000000000004",
      event: "$pageview",
      properties: {
        ...TRANSPORT,
        $pathname: "/grows/11111111-1111-4111-8111-111111111111",
        $current_url:
          "https://verdantgrowdiary.com/grows/11111111-1111-4111-8111-111111111111?email=a@b.com",
        note: "secret diary",
        email: "ada@example.com",
      },
    });
    expect(pageview?.properties).toEqual({
      ...TRANSPORT,
      $pathname: "/grows/:id",
      $current_url: "https://verdantgrowdiary.com/grows/:id",
    });
    const pageviewText = JSON.stringify(pageview);
    expect(pageviewText).not.toContain("secret diary");
    expect(pageviewText).not.toContain("@");

    const { distinct_id: _emailId, ...transportWithoutDistinctId } = TRANSPORT;
    const signup = scrubPostHogCapture({
      uuid: "00000000-0000-4000-8000-000000000005",
      event: "user_signed_up",
      properties: {
        ...TRANSPORT,
        distinct_id: "ada@example.com",
        email: "ada@example.com",
        note: "secret diary",
      },
    });
    expect(signup?.properties).toEqual(transportWithoutDistinctId);
    expect(JSON.stringify(signup)).not.toContain("@");
    expect(JSON.stringify(signup)).not.toContain("secret diary");

    const imported = scrubPostHogCapture({
      uuid: "00000000-0000-4000-8000-000000000006",
      event: "sensor_csv_imported",
      properties: {
        ...TRANSPORT,
        row_count: 4,
        csv_row: "secret,1,2",
      },
    });
    expect(imported?.properties).toEqual({ ...TRANSPORT, row_count: 4 });
    expect(JSON.stringify(imported)).not.toContain("secret,1,2");
  });
});
