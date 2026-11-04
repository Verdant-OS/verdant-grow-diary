import { afterEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";

import {
  POSTHOG_DEFAULT_API_HOST,
  buildPostHogInitOptions,
  scrubPostHogCapture,
} from "@/lib/posthogAnalyticsRules";

const FIXTURE_KEY = "phc_test_fixture_not_a_real_key";
const GROW_ID = "11111111-1111-4111-8111-111111111111";
const PAGEVIEW_ID = "019a4f00-0000-7000-8000-000000000001";
const PREV_PAGEVIEW_ID = "019a4f00-0000-7000-8000-000000000002";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("PostHog pageleave and web vitals capture", () => {
  it("turns on SDK pageleave and web vitals, without attribution or network timing", () => {
    const options = buildPostHogInitOptions(POSTHOG_DEFAULT_API_HOST);
    expect(options.capture_pageview).toBe(false);
    expect(options.capture_pageleave).toBe(true);
    expect(options.capture_performance).toEqual({
      web_vitals: true,
      web_vitals_attribution: false,
      network_timing: false,
    });
  });

  it("keeps sanitized page and scroll properties on $pageleave and $pageview", () => {
    for (const event of ["$pageleave", "$pageview"] as const) {
      const scrubbed = scrubPostHogCapture({
        uuid: "00000000-0000-4000-8000-000000000010",
        event,
        properties: {
          token: FIXTURE_KEY,
          $session_id: "019a4f00-0000-7000-8000-00000000000a",
          $pathname: `/grows/${GROW_ID}`,
          $current_url: `https://verdantgrowdiary.com/grows/${GROW_ID}?email=a@b.com#note`,
          $pageview_id: PAGEVIEW_ID,
          $prev_pageview_id: PREV_PAGEVIEW_ID,
          $prev_pageview_pathname: `/grows/${GROW_ID}/plants/${GROW_ID}`,
          $prev_pageview_duration: 12.5,
          $prev_pageview_last_scroll: 300,
          $prev_pageview_last_scroll_percentage: 0.4,
          $prev_pageview_max_scroll: 900,
          $prev_pageview_max_scroll_percentage: 1,
          $prev_pageview_last_content: 1200,
          $prev_pageview_last_content_percentage: 0.5,
          $prev_pageview_max_content: 2400,
          $prev_pageview_max_content_percentage: 0.9,
          title: "Blue Dream week 3 diary",
          note: "yellow leaves",
        },
      });
      expect(scrubbed?.properties).toEqual({
        token: FIXTURE_KEY,
        $session_id: "019a4f00-0000-7000-8000-00000000000a",
        $pathname: "/grows/:id",
        $current_url: "https://verdantgrowdiary.com/grows/:id",
        $pageview_id: PAGEVIEW_ID,
        $prev_pageview_id: PREV_PAGEVIEW_ID,
        $prev_pageview_pathname: "/grows/:id/plants/:id",
        $prev_pageview_duration: 12.5,
        $prev_pageview_last_scroll: 300,
        $prev_pageview_last_scroll_percentage: 0.4,
        $prev_pageview_max_scroll: 900,
        $prev_pageview_max_scroll_percentage: 1,
        $prev_pageview_last_content: 1200,
        $prev_pageview_last_content_percentage: 0.5,
        $prev_pageview_max_content: 2400,
        $prev_pageview_max_content_percentage: 0.9,
      });
    }
  });

  it("drops malformed page ids and non-numeric or negative scroll values", () => {
    const scrubbed = scrubPostHogCapture({
      uuid: "00000000-0000-4000-8000-000000000011",
      event: "$pageleave",
      properties: {
        $pageview_id: "grower@example.com",
        $prev_pageview_id: "not a uuid",
        $prev_pageview_duration: Number.NaN,
        $prev_pageview_max_scroll: -1,
        $prev_pageview_max_scroll_percentage: "1",
        $prev_pageview_pathname: 42,
      },
    });
    expect(scrubbed?.properties).toEqual({});
  });

  it("keeps web vitals values and drops the nested event objects with raw URLs", () => {
    const rawUrl = `https://verdantgrowdiary.com/grows/${GROW_ID}?email=a@b.com`;
    const scrubbed = scrubPostHogCapture({
      uuid: "00000000-0000-4000-8000-000000000012",
      event: "$web_vitals",
      properties: {
        token: FIXTURE_KEY,
        $pathname: `/grows/${GROW_ID}`,
        $current_url: rawUrl,
        $web_vitals_LCP_value: 1830.4,
        $web_vitals_CLS_value: 0.02,
        $web_vitals_FCP_value: 912,
        $web_vitals_INP_value: 64,
        $web_vitals_LCP_event: { name: "LCP", value: 1830.4, $current_url: rawUrl },
        $web_vitals_INP_event: {
          name: "INP",
          value: 64,
          attribution: { interactionTarget: "textarea.diary-note" },
        },
      },
    });
    expect(scrubbed?.properties).toEqual({
      token: FIXTURE_KEY,
      $pathname: "/grows/:id",
      $current_url: "https://verdantgrowdiary.com/grows/:id",
      $web_vitals_LCP_value: 1830.4,
      $web_vitals_CLS_value: 0.02,
      $web_vitals_FCP_value: 912,
      $web_vitals_INP_value: 64,
    });
    const text = JSON.stringify(scrubbed);
    expect(text).not.toContain(GROW_ID);
    expect(text).not.toContain("email");
    expect(text).not.toContain("diary-note");
  });

  it("sends a scrubbed $pageleave from real posthog-js when the page is hidden", () => {
    const options = buildPostHogInitOptions(POSTHOG_DEFAULT_API_HOST);
    const beforeSend = options.before_send;
    if (typeof beforeSend !== "function") throw new Error("before_send must be a function");

    const outputs: Array<CaptureResult | null> = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    window.history.replaceState(null, "", `/grows/${GROW_ID}?email=a@b.com`);
    posthog.init(FIXTURE_KEY, {
      ...options,
      before_send: (capture) => {
        outputs.push(capture ? beforeSend(capture) : null);
        return null;
      },
    });

    posthog.capture("$pageview", {
      $pathname: "/grows/:id",
      $current_url: "https://verdantgrowdiary.com/grows/:id",
    });
    window.dispatchEvent(new Event("pagehide"));

    const pageleave = outputs.find((capture) => capture?.event === "$pageleave");
    expect(pageleave, outputs.map((capture) => capture?.event).join(",")).toBeTruthy();
    expect(pageleave?.properties?.token).toBe(FIXTURE_KEY);
    expect(pageleave?.properties?.$pathname).toBe("/grows/:id");
    expect(pageleave?.properties?.$prev_pageview_pathname).toBe("/grows/:id");
    expect(typeof pageleave?.properties?.$prev_pageview_duration).toBe("number");
    const text = JSON.stringify(pageleave);
    expect(text).not.toContain(GROW_ID);
    expect(text).not.toContain("email");
  });
});
