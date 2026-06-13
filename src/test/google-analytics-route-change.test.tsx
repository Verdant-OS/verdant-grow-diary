/**
 * Unit tests for the Google Analytics route-change helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import {
  useGoogleAnalyticsPageViews,
  sanitizePagePath,
} from "@/hooks/useGoogleAnalyticsPageViews";
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
    expect(sanitizePagePath(`/grows/${uuid}/timeline`)).toBe(
      "/grows/:id/timeline"
    );
  });

  it("replaces multiple UUIDs in one path", () => {
    const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    expect(sanitizePagePath(`/tents/${a}/plants/${b}`)).toBe(
      "/tents/:id/plants/:id"
    );
  });

  it("replaces long random token-like segments with :id", () => {
    expect(sanitizePagePath("/token/abc123def456ghi789jkl")).toBe(
      "/token/:id"
    );
  });

  it("preserves short non-UUID segments like /billing/pro", () => {
    expect(sanitizePagePath("/billing/pro")).toBe("/billing/pro");
    expect(sanitizePagePath("/settings/profile")).toBe("/settings/profile");
  });

  it("preserves query strings", () => {
    expect(sanitizePagePath("/tents?growId=abc")).toBe("/tents?growId=abc");
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

    expect(gtagMock).toHaveBeenCalledWith(
      "config",
      GOOGLE_ANALYTICS_MEASUREMENT_ID,
      {
        page_path: "/dashboard",
        page_title: "Test Title",
      }
    );
  });

  it("sanitizes UUIDs before sending to gtag", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MemoryRouter, { initialEntries: [`/plants/${uuid}`] }, children);

    renderHook(() => useGoogleAnalyticsPageViews(), { wrapper });

    expect(gtagMock).toHaveBeenCalledWith(
      "config",
      GOOGLE_ANALYTICS_MEASUREMENT_ID,
      {
        page_path: "/plants/:id",
        page_title: "Test Title",
      }
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
