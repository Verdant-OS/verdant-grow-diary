/**
 * Unit tests for the Google Analytics route-change helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { useGoogleAnalyticsPageViews, sanitizePagePath } from "@/hooks/useGoogleAnalyticsPageViews";
import { buildSafeAnalyticsPageLocation } from "@/lib/analyticsPageViewRules";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

describe("sanitizePagePath", () => {
  it("leaves known static paths unchanged", () => {
    expect(sanitizePagePath("/dashboard")).toBe("/dashboard");
    expect(sanitizePagePath("/tents")).toBe("/tents");
    expect(sanitizePagePath("/plants")).toBe("/plants");
    expect(sanitizePagePath("/breeding/new")).toBe("/breeding/new");
  });

  it("masks protected dynamic segments by their known route shape", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(sanitizePagePath(`/plants/${uuid}`)).toBe("/plants/:id");
    expect(sanitizePagePath(`/grows/${uuid}/learning`)).toBe("/grows/:growId/learning");
  });

  it.each([
    ["email", "/alerts/grower@example.com", "/alerts/:alertId"],
    ["short number", "/tents/7", "/tents/:id"],
    ["short secret", "/actions/x!", "/actions/:actionId"],
  ])("masks a %s even when it does not resemble a long token", (_label, input, expected) => {
    expect(sanitizePagePath(input)).toBe(expected);
  });

  it("masks every parameter in a known multi-parameter protected route", () => {
    expect(sanitizePagePath("/genetics/health/grower@example.com/7!x")).toBe(
      "/genetics/health/:kind/:id",
    );
  });

  it.each([
    ["/guides/cannabis-grow-light-distance-and-schedule"],
    ["/cultivars/blue-dream"],
    ["/strains/oreoz"],
  ])("preserves a conservative public SEO slug at %s", (path) => {
    expect(sanitizePagePath(`${path}?utm_source=google#details`, path)).toBe(path);
  });

  it.each([
    ["absent", null],
    ["mismatched", "/guides/cannabis-grow-light-distance-and-schedule"],
  ])("masks a slug-shaped guide path when its trusted canonical is %s", (_label, canonical) => {
    expect(sanitizePagePath("/guides/jane-smith-private-note", canonical)).toBe("/guides/:slug");
  });

  it.each([
    ["/guides/Grower-Email"],
    ["/cultivars/grower@example.com"],
    ["/strains/double--hyphen"],
  ])("masks an invalid public SEO slug at %s", (path) => {
    const namespace = path.split("/")[1];
    expect(sanitizePagePath(path, path)).toBe(`/${namespace}/:slug`);
  });

  it("masks dynamic values outside the public SEO namespaces", () => {
    expect(sanitizePagePath("/plants/cannabis-grow-light-distance-and-schedule")).toBe(
      "/plants/:id",
    );
    expect(sanitizePagePath("/billing/pro")).toBe("/billing/:plan");
  });

  it("collapses unknown routes so arbitrary path text cannot reach analytics", () => {
    expect(sanitizePagePath("/token/abc123def456ghi789jkl")).toBe("/:unknown");
    expect(sanitizePagePath("/settings/grower@example.com/private-note")).toBe("/:unknown");
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

  function addCanonical(href: string) {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = href;
    link.setAttribute("data-analytics-test-canonical", "true");
    document.head.appendChild(link);
  }

  beforeEach(() => {
    document.head.querySelectorAll('link[rel~="canonical"]').forEach((link) => link.remove());
    gtagMock = vi.fn();
    (window as any).gtag = gtagMock;
    vi.spyOn(document, "title", "get").mockReturnValue("Test Title");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== "undefined") {
      delete (window as any).gtag;
    }
    document.head
      .querySelectorAll('[data-analytics-test-canonical="true"]')
      .forEach((link) => link.remove());
  });

  // index.html bootstraps the tag with `send_page_view: false`, and settings
  // passed to `config` persist for that measurement id — so a repeat `config`
  // call is not a reliable way to emit a view. Regression guard for a change
  // that would have taken the whole property dark with a green suite.
  it("sends an explicit page_view event, not a repeat config call", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

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
  });

  it("sanitizes UUIDs before sending to gtag", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [`/plants/${uuid}`] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/plants/:id",
      page_location: `${window.location.origin}/plants/:id`,
      page_title: "Test Title",
    });
  });

  it("masks protected path values in both gtag page_path and page_location", () => {
    const protectedPath = "/alerts/grower@example.com";
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [protectedPath] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/alerts/:alertId",
      page_location: `${window.location.origin}/alerts/:alertId`,
      page_title: "Test Title",
    });
    expect(JSON.stringify(gtagMock.mock.calls)).not.toContain("grower@example.com");
  });

  it("collapses unknown paths in both gtag page_path and page_location", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/not-a-route/grower@example.com/private"] },
        children,
      );

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/:unknown",
      page_location: `${window.location.origin}/:unknown`,
      page_title: "Test Title",
    });
    expect(JSON.stringify(gtagMock.mock.calls)).not.toMatch(/grower@example|private/);
  });

  it("sends an individual public guide path to gtag", () => {
    const guidePath = "/guides/cannabis-grow-light-distance-and-schedule";
    addCanonical(`${window.location.origin}${guidePath}`);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [guidePath] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: guidePath,
      page_location: `${window.location.origin}${guidePath}`,
      page_title: "Test Title",
    });
  });

  it("masks an unregistered slug-shaped guide when no matching canonical exists", () => {
    const privateLookingPath = "/guides/jane-smith-private-note";
    addCanonical(`${window.location.origin}/guides`);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [privateLookingPath] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/guides/:slug",
      page_location: `${window.location.origin}/guides/:slug`,
      page_title: "Test Title",
    });
    expect(JSON.stringify(gtagMock.mock.calls)).not.toContain("jane-smith-private-note");
  });

  it.each([
    ["cross-origin", ["https://example.com/guides/published-guide"]],
    [
      "ambiguous",
      [
        `${window.location.origin}/guides/published-guide`,
        `${window.location.origin}/guides/published-guide`,
      ],
    ],
  ])("masks a public slug when its canonical is %s", (_label, canonicals) => {
    const guidePath = "/guides/published-guide";
    canonicals.forEach(addCanonical);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [guidePath] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("event", "page_view", {
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      page_path: "/guides/:slug",
      page_location: `${window.location.origin}/guides/:slug`,
      page_title: "Test Title",
    });
  });

  it("never sends route query values through page_path or page_location", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        MemoryRouter,
        {
          initialEntries: [
            "/auth?token=secret&email=grower%40example.com&redirectTo=%2Fplants%2Fprivate",
          ],
        },
        children,
      );

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

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

  it("no-ops safely when window.gtag is missing", () => {
    delete (window as any).gtag;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, children);

    // Should not throw
    expect(() => {
      renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });
    }).not.toThrow();
  });

  it("no-ops safely when gtag is missing on window", () => {
    delete (window as any).gtag;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, children);

    expect(() => {
      renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });
    }).not.toThrow();
  });
});
