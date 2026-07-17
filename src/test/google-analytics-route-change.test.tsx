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
    (window as any).gtag = gtagMock;
    vi.spyOn(document, "title", "get").mockReturnValue("Test Title");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== "undefined") {
      delete (window as any).gtag;
    }
  });

  it("calls gtag config with the measurement ID when gtag is present", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
      page_path: "/dashboard",
      page_location: `${window.location.origin}/dashboard`,
      page_title: "Test Title",
    });
  });

  it("sanitizes UUIDs before sending to gtag", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [`/plants/${uuid}`] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
      page_path: "/plants/:id",
      page_location: `${window.location.origin}/plants/:id`,
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

    expect(gtagMock).toHaveBeenCalledWith("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
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
