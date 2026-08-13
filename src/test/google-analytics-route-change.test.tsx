/**
 * Unit tests for the Google Analytics route-change helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGoogleAnalyticsPageViews, sanitizePagePath } from "@/hooks/useGoogleAnalyticsPageViews";
import { buildSafeAnalyticsPageLocation } from "@/lib/analyticsPageViewRules";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

const locationState = vi.hoisted(() => ({ pathname: "/dashboard" }));
const consentState = vi.hoisted(() => ({
  value: "granted" as "granted" | "denied" | "unset",
  listener: null as null | (() => void),
}));
const loadGoogleAnalytics = vi.hoisted(() => vi.fn());

vi.mock("@/lib/react-router-compat", () => ({
  useLocation: () => ({ pathname: locationState.pathname }),
}));

vi.mock("@/lib/analyticsConsent", () => ({
  readAnalyticsConsent: () => consentState.value,
  subscribeToAnalyticsConsent: (listener: () => void) => {
    consentState.listener = listener;
    return () => {
      if (consentState.listener === listener) consentState.listener = null;
    };
  },
  writeAnalyticsConsent: () => {},
  parseAnalyticsConsentValue: (v: string) => v,
}));

vi.mock("@/lib/googleAnalyticsLoader", () => ({
  loadGoogleAnalytics,
}));

describe("sanitizePagePath", () => {
  it("leaves static paths unchanged", () => {
    expect(sanitizePagePath("/dashboard")).toBe("/dashboard");
    expect(sanitizePagePath("/tents")).toBe("/tents");
    expect(sanitizePagePath("/plants")).toBe("/plants");
  });

  it("replaces UUID path segments with :id", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(sanitizePagePath(`/plants/${uuid}`)).toBe("/plants/:id");
    expect(sanitizePagePath(`/grows/${uuid}/timeline`)).toBe("/grows/:id/timeline");
  });

  it("replaces multiple UUIDs in one path", () => {
    const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    expect(sanitizePagePath(`/tents/${a}/plants/${b}`)).toBe("/tents/:id/plants/:id");
  });

  it("replaces long random token-like segments with :id", () => {
    expect(sanitizePagePath("/token/abc123def456ghi789jkl")).toBe("/token/:id");
  });

  it("preserves public guide slugs so SEO landing pages remain measurable", () => {
    expect(
      sanitizePagePath("/guides/cannabis-grow-light-distance-and-schedule?utm_source=google#ppfd"),
    ).toBe("/guides/cannabis-grow-light-distance-and-schedule");
    expect(sanitizePagePath("/guides/cannabis-light-stress-light-burn-bleaching-or-heat")).toBe(
      "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
    );
  });

  it("continues masking long segments outside the public guide namespace", () => {
    expect(sanitizePagePath("/plants/cannabis-grow-light-distance-and-schedule")).toBe(
      "/plants/:id",
    );
    expect(sanitizePagePath("/auth/cannabis-light-stress-light-burn-bleaching-or-heat")).toBe(
      "/auth/:id",
    );
  });

  it("preserves short non-UUID segments like /billing/pro", () => {
    expect(sanitizePagePath("/billing/pro")).toBe("/billing/pro");
    expect(sanitizePagePath("/settings/profile")).toBe("/settings/profile");
  });

  it("drops query strings and hashes instead of forwarding grower data", () => {
    expect(sanitizePagePath("/tents?growId=abc&email=grower%40example.com#private")).toBe("/tents");
    expect(sanitizePagePath("/cultivars?q=blue+dream&difficulty=easy")).toBe("/cultivars");
  });

  it("builds an explicit query-free http(s) page location", () => {
    expect(
      buildSafeAnalyticsPageLocation(
        "https://verdantgrowdiary.com/private?ignored=yes",
        "/auth?token=secret&email=grower%40example.com",
      ),
    ).toBe("https://verdantgrowdiary.com/auth");
    expect(buildSafeAnalyticsPageLocation("file://local", "/auth?token=secret")).toBe("/auth");
  });
});

describe("useGoogleAnalyticsPageViews — gtag behavior", () => {
  let gtagMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    gtagMock = vi.fn();
    window.gtag = gtagMock;
    consentState.value = "granted";
    consentState.listener = null;
    locationState.pathname = "/dashboard";
    loadGoogleAnalytics.mockReset();
    loadGoogleAnalytics.mockImplementation(() => {
      if (typeof window.gtag !== "function") {
        window.gtag = gtagMock;
      }
    });
    vi.spyOn(document, "title", "get").mockReturnValue("Test Title");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== "undefined") {
      delete window.gtag;
    }
  });

  // The root route bootstraps the tag with `send_page_view: false`, and settings
  // passed to `config` persist for that measurement id — so a repeat `config`
  // call is not a reliable way to emit a view. Regression guard for a change
  // that would have taken the whole property dark with a green suite.
  it("sends an explicit page_view event, not a repeat config call", () => {
    renderHook(() => useGoogleAnalyticsPageViews());

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/dashboard",
      page_location: `${window.location.origin}/dashboard`,
      page_title: "Test Title",
    });
    expect(gtagMock).not.toHaveBeenCalledWith(
      "config",
      GOOGLE_ANALYTICS_MEASUREMENT_ID,
      expect.anything(),
    );
    expect(loadGoogleAnalytics).toHaveBeenCalled();
  });

  it("sanitizes UUIDs before sending to gtag", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    locationState.pathname = `/plants/${uuid}`;

    renderHook(() => useGoogleAnalyticsPageViews());

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/plants/:id",
      page_location: `${window.location.origin}/plants/:id`,
      page_title: "Test Title",
    });
  });

  it("sends an individual public guide path to gtag", () => {
    const guidePath = "/guides/cannabis-grow-light-distance-and-schedule";
    locationState.pathname = guidePath;

    renderHook(() => useGoogleAnalyticsPageViews());

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: guidePath,
      page_location: `${window.location.origin}${guidePath}`,
      page_title: "Test Title",
    });
  });

  it("never sends route query values through page_path or page_location", () => {
    locationState.pathname =
      "/auth?token=secret&email=grower%40example.com&redirectTo=%2Fplants%2Fprivate";

    renderHook(() => useGoogleAnalyticsPageViews());

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/auth",
      page_location: `${window.location.origin}/auth`,
      page_title: "Test Title",
    });
    expect(JSON.stringify(gtagMock.mock.calls)).not.toMatch(
      /secret|grower%40example|redirectTo|private/,
    );
  });

  it("no-ops safely when window.gtag is missing after loader", () => {
    delete window.gtag;
    loadGoogleAnalytics.mockImplementation(() => {
      // Simulate blocked loader / ad blocker: no gtag installed.
    });

    expect(() => {
      renderHook(() => useGoogleAnalyticsPageViews());
    }).not.toThrow();
  });

  it("cold-loads a page_view when gtag is absent until loadGoogleAnalytics runs", () => {
    delete window.gtag;
    const installed = vi.fn();
    loadGoogleAnalytics.mockImplementation(() => {
      window.gtag = installed;
    });

    renderHook(() => useGoogleAnalyticsPageViews());

    expect(loadGoogleAnalytics).toHaveBeenCalled();
    expect(installed).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/dashboard",
      page_location: `${window.location.origin}/dashboard`,
      page_title: "Test Title",
    });
  });

  it("emits the cold-load page_view after consent flips from unset to granted", () => {
    consentState.value = "unset";
    delete window.gtag;
    const installed = vi.fn();
    loadGoogleAnalytics.mockImplementation(() => {
      window.gtag = installed;
    });

    renderHook(() => useGoogleAnalyticsPageViews());
    expect(installed).not.toHaveBeenCalled();

    act(() => {
      consentState.value = "granted";
      consentState.listener?.();
    });

    expect(loadGoogleAnalytics).toHaveBeenCalled();
    expect(installed).toHaveBeenCalledWith(
      "event",
      "page_view",
      expect.objectContaining({ page_path: "/dashboard" }),
    );
  });

  it("emits one explicit event for each settled route change", () => {
    const { rerender } = renderHook(() => useGoogleAnalyticsPageViews());
    locationState.pathname = "/guides/cannabis-light-stress-light-burn-bleaching-or-heat";
    rerender();

    expect(gtagMock.mock.calls).toEqual([
      [
        "event",
        "page_view",
        {
          send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
          page_path: "/dashboard",
          page_location: `${window.location.origin}/dashboard`,
          page_title: "Test Title",
        },
      ],
      [
        "event",
        "page_view",
        {
          send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
          page_path: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          page_location: `${window.location.origin}/guides/cannabis-light-stress-light-burn-bleaching-or-heat`,
          page_title: "Test Title",
        },
      ],
    ]);
  });
});
