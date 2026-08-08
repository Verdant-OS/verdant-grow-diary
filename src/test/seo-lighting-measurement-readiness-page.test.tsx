/**
 * Lighting measurement readiness page — sticky summary, verified stamps, export.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LightingMeasurementReadiness from "@/pages/LightingMeasurementReadiness";
import {
  GA4_VERIFIED_AT_KEY,
  GSC_VERIFIED_AT_KEY,
} from "@/lib/seoLightingMeasurementReadinessStorage";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

describe("LightingMeasurementReadiness page", () => {
  beforeEach(() => {
    clearLocalStorageForTest();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearLocalStorageForTest();
  });

  it("renders sticky Ready/Blocked summary and two launch pages", () => {
    render(<LightingMeasurementReadiness />);
    expect(screen.getByTestId("readiness-sticky-summary")).toBeInTheDocument();
    expect(screen.getByTestId("readiness-overall-label")).toHaveTextContent(/Blocked/i);
    expect(screen.getByTestId("launch-page-distance-schedule")).toBeInTheDocument();
    expect(screen.getByTestId("launch-page-light-stress")).toBeInTheDocument();
  });

  it("shows FAIL/BLOCKED error types and sitemap inclusion on launch pages", () => {
    render(<LightingMeasurementReadiness />);
    const page = screen.getByTestId("launch-page-distance-schedule");
    const auth = within(page).getByTestId("tech-check-ga4-gsc-auth");
    expect(auth).toHaveAttribute("data-status", "BLOCKED");
    expect(auth).toHaveAttribute("data-error-type", "AUTHENTICATED_ACCESS_UNAVAILABLE");
    expect(auth.textContent).toMatch(/Error type/i);

    const singleton = within(page).getByTestId("tech-check-page-view-singleton");
    expect(singleton).toHaveAttribute("data-status", "FAIL");
    expect(singleton).toHaveAttribute("data-error-type", "ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS");

    const sitemap = within(page).getByTestId("sitemap-sitemap");
    expect(sitemap.textContent).toMatch(/occurrence/i);
  });

  it("records GA4 and GSC verified stamps in UTC and America/Chicago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T20:15:30.000Z"));
    render(<LightingMeasurementReadiness />);

    fireEvent.click(screen.getByTestId("ga4-gate-mark-verified"));
    fireEvent.click(screen.getByTestId("gsc-gate-mark-verified"));

    expect(getLocalStorageItemForTest(GA4_VERIFIED_AT_KEY)).toBe("2026-08-08T20:15:30.000Z");
    expect(getLocalStorageItemForTest(GSC_VERIFIED_AT_KEY)).toBe("2026-08-08T20:15:30.000Z");

    const ga4Times = screen.getByTestId("ga4-gate-timestamps");
    expect(ga4Times.textContent).toMatch(/2026-08-08T20:15:30/);
    expect(ga4Times.textContent).toMatch(/America\/Chicago/);

    const gscTimes = screen.getByTestId("gsc-gate-timestamps");
    expect(gscTimes.textContent).toMatch(/America\/Chicago/);
    vi.useRealTimers();
  });

  it("exports a PDF readiness report download", () => {
    const clicks: string[] = [];
    const createObjectURL = vi.fn(() => "blob:ready-report");
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL: revoke,
    });

    render(<LightingMeasurementReadiness />);
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        el.click = () => {
          clicks.push(el.getAttribute("download") ?? "");
        };
      }
      return el;
    });

    fireEvent.click(screen.getByTestId("export-readiness-report"));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clicks[0]).toMatch(/lighting-measurement-readiness-.*\.pdf/);
  });
});
