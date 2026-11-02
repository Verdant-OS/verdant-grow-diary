import { afterEach, describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import type { CaptureResult } from "posthog-js";

import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";
import { PRODUCTION_HOSTNAMES } from "@/lib/errorReportingRules";
import { GROW_HELP_TOOLKIT_PATH } from "@/lib/growHelpToolkitState";
import {
  POSTHOG_DEFAULT_API_HOST,
  buildPostHogInitOptions,
  decidePostHogStartup,
  isAnalyticsCollectionHost,
  mapFunnelEventToPostHog,
  planPostHogPersistenceRemoval,
  posthogCookieExpiryAssignments,
  posthogDistinctId,
  posthogPageviewProperties,
  posthogPersonProperties,
  resolvePostHogApiHost,
  scrubPostHogCapture,
} from "@/lib/posthogAnalyticsRules";

const FIXTURE_KEY = "phc_test_fixture_not_a_real_key";
const PROD = "verdantgrowdiary.com";

describe("PostHog collection host", () => {
  it("accepts only the production hostnames, ignoring one trailing dot and case", () => {
    for (const host of PRODUCTION_HOSTNAMES) {
      expect(isAnalyticsCollectionHost(host)).toBe(true);
      expect(isAnalyticsCollectionHost(host.toUpperCase())).toBe(true);
      expect(isAnalyticsCollectionHost(`${host}.`)).toBe(true);
    }
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "[::1]",
    "preview.workers.dev",
    "id-preview--app.lovable.app",
    "verdantgrowdiary.com.evil.test",
    "notverdantgrowdiary.com",
    "",
    "   ",
  ])("rejects %s", (hostname) => {
    expect(isAnalyticsCollectionHost(hostname)).toBe(false);
  });

  it("rejects a missing hostname", () => {
    expect(isAnalyticsCollectionHost(null)).toBe(false);
    expect(isAnalyticsCollectionHost(undefined)).toBe(false);
  });
});

describe("decidePostHogStartup", () => {
  const enabled = {
    decision: "granted" as const,
    pathname: "/grows",
    key: FIXTURE_KEY,
    host: "",
    hostname: PROD,
  };

  it("stays off without consent, on the toolkit, off-host, or without a key", () => {
    expect(decidePostHogStartup({ ...enabled, decision: "unset" })).toEqual({
      enabled: false,
      reason: "consent",
    });
    expect(decidePostHogStartup({ ...enabled, decision: "denied" })).toEqual({
      enabled: false,
      reason: "consent",
    });
    expect(decidePostHogStartup({ ...enabled, pathname: GROW_HELP_TOOLKIT_PATH })).toEqual({
      enabled: false,
      reason: "excluded-route",
    });
    expect(decidePostHogStartup({ ...enabled, pathname: `${GROW_HELP_TOOLKIT_PATH}/` })).toEqual({
      enabled: false,
      reason: "excluded-route",
    });
    expect(decidePostHogStartup({ ...enabled, hostname: "localhost" })).toEqual({
      enabled: false,
      reason: "non-production-host",
    });
    expect(decidePostHogStartup({ ...enabled, key: "  " })).toEqual({
      enabled: false,
      reason: "missing-key",
    });
  });

  it("uses the default https API host and refuses non-https or credentialed hosts", () => {
    expect(resolvePostHogApiHost("")).toBe(POSTHOG_DEFAULT_API_HOST);
    expect(resolvePostHogApiHost("  https://eu.i.posthog.com/  ")).toBe("https://eu.i.posthog.com");
    expect(resolvePostHogApiHost("http://us.i.posthog.com")).toBeNull();
    expect(resolvePostHogApiHost("https://user:secret@us.i.posthog.com")).toBeNull();
    expect(resolvePostHogApiHost("https://us.i.posthog.com/proxy")).toBeNull();
    expect(resolvePostHogApiHost("not a url")).toBeNull();
    expect(decidePostHogStartup(enabled)).toEqual({
      enabled: true,
      key: FIXTURE_KEY,
      apiHost: POSTHOG_DEFAULT_API_HOST,
    });
    expect(decidePostHogStartup({ ...enabled, host: "http://evil.example" })).toEqual({
      enabled: false,
      reason: "invalid-host",
    });
  });
});

describe("PostHog identity and product events", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  it("identifies a UUID only and never copies the email address", () => {
    expect(posthogDistinctId(userId)).toBe(userId);
    expect(posthogDistinctId("  " + userId + " ")).toBe(userId);
    expect(posthogDistinctId("ada@example.com")).toBeNull();
    expect(posthogDistinctId("not-a-uuid")).toBeNull();
    expect(posthogDistinctId(`${userId}@extra`)).toBeNull();

    const qa = posthogPersonProperties({
      createdAt: "2026-04-02T15:04:00.000Z",
      email: "Ada+VerdantQA@example.com",
    });
    expect(qa).toEqual({ signup_date: "2026-04-02", qa_synth: true });
    expect(JSON.stringify(qa)).not.toContain("@");
    expect(JSON.stringify(qa)).not.toContain("Ada");

    const plain = posthogPersonProperties({
      createdAt: "2026-04-02T15:04:00.000Z",
      email: "grower@example.com",
    });
    expect(plain).toEqual({ signup_date: "2026-04-02" });
    expect(JSON.stringify(plain)).not.toContain("grower");
  });

  it("marks the other QA address shapes without sending the address", () => {
    expect(
      posthogPersonProperties({ createdAt: null, email: "verdant-qa-one@example.com" }).qa_synth,
    ).toBe(true);
    expect(
      posthogPersonProperties({ createdAt: null, email: "qa-synth@example.com" }).qa_synth,
    ).toBe(true);
  });

  it("maps the allowed funnel events and drops billing, vendor, and row text", () => {
    expect(mapFunnelEventToPostHog("signup", { method: "email" })).toEqual([
      { name: "user_signed_up", properties: {} },
    ]);
    expect(mapFunnelEventToPostHog("grow_created", { name: "Blue Dream" })).toEqual([
      { name: "grow_created", properties: {} },
    ]);
    expect(mapFunnelEventToPostHog("plant_created", {})).toEqual([
      { name: "plant_created", properties: {} },
    ]);
    expect(mapFunnelEventToPostHog("quick_log_saved", { event_type: "note" })).toEqual([
      { name: "log_created", properties: { source: "quick_log" } },
    ]);
    expect(
      mapFunnelEventToPostHog("csv_import_completed", {
        rows: 12,
        vendor: "ac_infinity",
        csv_row: "secret,row",
      }),
    ).toEqual([
      { name: "log_created", properties: { source: "csv_import" } },
      { name: "sensor_csv_imported", properties: { row_count: 12 } },
    ]);
    expect(mapFunnelEventToPostHog("csv_import_completed", { rows: 0 })).toEqual([
      { name: "log_created", properties: { source: "csv_import" } },
      { name: "sensor_csv_imported", properties: { row_count: 0 } },
    ]);
    expect(mapFunnelEventToPostHog("csv_import_completed", { rows: 1_000_000 })).toHaveLength(2);
    expect(mapFunnelEventToPostHog("csv_import_completed", { rows: 1.5 })).toEqual([
      { name: "log_created", properties: { source: "csv_import" } },
    ]);
    expect(mapFunnelEventToPostHog("csv_import_completed", { rows: -1 })).toHaveLength(1);
    expect(mapFunnelEventToPostHog("csv_import_completed", { rows: 1_000_001 })).toHaveLength(1);
    expect(mapFunnelEventToPostHog("csv_import_completed", { rows: "12" })).toHaveLength(1);
    for (const blocked of [
      "paywall_viewed",
      "checkout_started",
      "credit_pack_cta_clicked",
      "ai_doctor_review_started",
      "onboarding_completed",
    ]) {
      expect(mapFunnelEventToPostHog(blocked, { plan: "craft", note: "secret" })).toEqual([]);
    }
  });

  it("sanitizes page locations down to a path with no query", () => {
    expect(
      posthogPageviewProperties(
        "https://verdantgrowdiary.com",
        "/grows/11111111-1111-4111-8111-111111111111?email=a@b.com#note",
      ),
    ).toEqual({
      $pathname: "/grows/:id",
      $current_url: "https://verdantgrowdiary.com/grows/:id",
    });
  });
});

describe("PostHog init privacy", () => {
  it("ships masking, manual pageviews, and no console or body capture", () => {
    const options = buildPostHogInitOptions(POSTHOG_DEFAULT_API_HOST);
    expect(options).toEqual(
      expect.objectContaining({
        api_host: POSTHOG_DEFAULT_API_HOST,
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        rageclick: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        person_profiles: "identified_only",
        advanced_disable_feature_flags: true,
        disable_session_recording: true,
        opt_out_persistence_by_default: true,
        disable_surveys: true,
        enable_recording_console_log: false,
        capture_performance: false,
        session_recording: expect.objectContaining({
          maskAllInputs: true,
          maskTextSelector: "[data-ph-mask], .ph-mask",
          blockClass: "ph-no-capture",
          recordHeaders: false,
          recordBody: false,
        }),
        capture_exceptions: expect.objectContaining({ capture_console_errors: false }),
      }),
    );
  });

  it("strips exception text, sensor numbers, notes, and CSV bodies", () => {
    const beforeSend = buildPostHogInitOptions(POSTHOG_DEFAULT_API_HOST).before_send;
    expect(typeof beforeSend).toBe("function");
    if (typeof beforeSend !== "function") {
      throw new Error("before_send must be a function");
    }

    const exception = beforeSend({
      uuid: "00000000-0000-4000-8000-000000000001",
      event: "$exception",
      properties: {
        $exception_message: "diary note: the plant looks sad",
        $exception_type: "TypeError",
        $exception_list: [
          {
            type: "TypeError",
            value: "diary note: the plant looks sad",
            stacktrace: {
              frames: [
                {
                  filename: "https://verdantgrowdiary.com/assets/app.js?token=secret",
                  function: "secretNote",
                  lineno: 12,
                  colno: 3,
                  context_line: "diary note: the plant looks sad",
                },
              ],
            },
          },
        ],
      },
    });
    const exceptionText = JSON.stringify(exception);
    expect(exceptionText).not.toContain("diary note");
    expect(exceptionText).not.toContain("secretNote");
    expect(exceptionText).not.toContain("token=secret");
    expect(exceptionText).toContain("TypeError");
    expect(exceptionText).toContain("app.js");
    expect(exceptionText).toContain("12");

    const generic = beforeSend({
      uuid: "00000000-0000-4000-8000-000000000002",
      event: "$rageclick",
      properties: {
        temperature: 78.2,
        note: "yellow leaves",
        csv_row: "1,2,3,secret row",
        $el_text: "yellow leaves",
        $current_url: "https://verdantgrowdiary.com/plants/abc?email=a@b.com",
      },
    });
    const genericText = JSON.stringify(generic);
    expect(genericText).not.toContain("78.2");
    expect(genericText).not.toContain("yellow leaves");
    expect(genericText).not.toContain("secret row");
    expect(genericText).not.toContain("email");
    expect(genericText).toContain("https://verdantgrowdiary.com/plants/abc");

    const identify = scrubPostHogCapture({
      uuid: "00000000-0000-4000-8000-000000000003",
      event: "$identify",
      properties: { email: "ada@example.com", name: "Ada" },
      $set: { email: "ada@example.com", name: "Ada", signup_date: "2026-04-02", qa_synth: true },
    });
    const identifyText = JSON.stringify(identify);
    expect(identifyText).not.toContain("@");
    expect(identifyText).not.toContain("Ada");
    expect(identify?.$set).toEqual({ signup_date: "2026-04-02", qa_synth: true });
  });

  it("keeps SDK transport properties from a real posthog-js capture and still drops diary text", () => {
    const options = buildPostHogInitOptions(POSTHOG_DEFAULT_API_HOST);
    const beforeSend = options.before_send;
    expect(typeof beforeSend).toBe("function");
    if (typeof beforeSend !== "function") return;

    const inputs: CaptureResult[] = [];
    const outputs: Array<CaptureResult | null> = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    posthog.init(FIXTURE_KEY, {
      ...options,
      before_send: (capture) => {
        inputs.push(capture);
        const result = beforeSend(capture);
        outputs.push(result);
        return null;
      },
    });

    posthog.capture("$pageview", {
      $pathname: "/",
      $current_url: "https://verdantgrowdiary.com/?email=a@b.com",
      note: "diary note stays local",
    });
    posthog.capture("grow_created", {
      note: "diary note stays local",
      email: "grower@example.com",
    });

    const required = [
      "token",
      "distinct_id",
      "$session_id",
      "$window_id",
      "$device_id",
      "$lib",
      "$lib_version",
    ] as const;

    for (const event of ["$pageview", "grow_created"] as const) {
      const input = inputs.find((capture) => capture.event === event);
      const output = outputs.find((capture) => capture?.event === event);
      expect(input, event).toBeTruthy();
      const source = input?.properties ?? {};
      expect(source.token, `${event} input keys: ${Object.keys(source).join(",")}`).toBe(
        FIXTURE_KEY,
      );
      expect(typeof source.distinct_id).toBe("string");
      expect(output?.properties?.token).toBe(FIXTURE_KEY);
      expect(output?.properties?.distinct_id).toBe(source.distinct_id);
      for (const key of required) {
        if (source[key] != null) expect(output?.properties?.[key]).toEqual(source[key]);
      }
      const text = JSON.stringify(output);
      expect(text).not.toContain("diary note");
      expect(text).not.toContain("grower@example.com");
      expect(text).not.toContain("email=");
    }

    const pageview = outputs.find((capture) => capture?.event === "$pageview");
    expect(pageview?.properties?.$pathname).toBe("/");
    expect(pageview?.properties?.$current_url).toBe("https://verdantgrowdiary.com/");
  });

  it("plans removal of ph_<token>_ storage and keeps the opt-out flag", () => {
    const token = FIXTURE_KEY;
    const persistenceKey = `ph_${token}_posthog`;
    const plan = planPostHogPersistenceRemoval({
      token,
      localKeys: [
        persistenceKey,
        `${persistenceKey}__flags`,
        `ph_${token}_window_id`,
        `__ph_opt_in_out_${token}`,
        "unrelated",
      ],
      sessionKeys: [persistenceKey, `ph_${token}_primary_window_exists`, "other"],
      cookie: `${persistenceKey}=device-kept; theme=dark`,
    });
    expect(plan).toEqual({
      localKeys: [persistenceKey, `${persistenceKey}__flags`, `ph_${token}_window_id`],
      sessionKeys: [persistenceKey, `ph_${token}_primary_window_exists`],
      cookieNames: [persistenceKey],
    });
    expect(plan?.localKeys).not.toContain(`__ph_opt_in_out_${token}`);

    expect(
      planPostHogPersistenceRemoval({
        token: "phc_bad; injected",
        localKeys: ["ph_phc_bad; injected_posthog"],
        sessionKeys: [],
        cookie: "",
      }),
    ).toBeNull();

    const encoded = planPostHogPersistenceRemoval({
      token: "abc+def/ghi=",
      localKeys: ["ph_abcPLdefSLghiEQ_posthog", "__ph_opt_in_out_abc+def/ghi="],
      sessionKeys: [],
      cookie: "ph_abcPLdefSLghiEQ_posthog=1",
    });
    expect(encoded).toEqual({
      localKeys: ["ph_abcPLdefSLghiEQ_posthog"],
      sessionKeys: [],
      cookieNames: ["ph_abcPLdefSLghiEQ_posthog"],
    });
  });

  it("expires a parent-domain PostHog cookie, not only the host cookie", () => {
    const name = `ph_${FIXTURE_KEY}_posthog`;
    const hostOnly = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=/`;
    const parent = `${hostOnly}; domain=.verdantgrowdiary.com`;
    for (const hostname of [
      "verdantgrowdiary.com",
      "www.verdantgrowdiary.com",
      "WWW.VerdantGrowDiary.com.",
    ]) {
      expect(posthogCookieExpiryAssignments({ cookieNames: [name], hostname })).toEqual([
        hostOnly,
        parent,
      ]);
    }
    expect(posthogCookieExpiryAssignments({ cookieNames: [name], hostname: "localhost" })).toEqual([
      hostOnly,
    ]);
    expect(
      posthogCookieExpiryAssignments({
        cookieNames: [name],
        hostname: "verdantgrowdiary.com.evil.test",
      }),
    ).toEqual([hostOnly]);
    expect(
      posthogCookieExpiryAssignments({
        cookieNames: [`${name}; domain=evil.com`, "not-posthog"],
        hostname: "verdantgrowdiary.com",
      }),
    ).toEqual([]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    posthog.opt_out_capturing();
  } catch {
    // The SDK is only initialized by the real-capture test.
  }
  clearLocalStorageForTest();
  window.sessionStorage.clear();
});
