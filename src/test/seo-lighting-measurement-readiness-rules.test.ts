import { describe, it, expect } from "vitest";
import {
  buildMeasurementReadinessModel,
  buildVerificationStamp,
  explainAccessBlocked,
  formatChicagoLabel,
  formatUtcLabel,
  LIGHTING_LAUNCH_PAGES,
} from "@/lib/seoLightingMeasurementReadinessRules";
import {
  buildReadinessReportPdf,
  readinessReportFilename,
} from "@/lib/seoLightingMeasurementReadinessPdf";

describe("explainAccessBlocked", () => {
  it("names AUTHENTICATED_ACCESS_UNAVAILABLE with owner action", () => {
    const e = explainAccessBlocked("AUTHENTICATED_ACCESS_UNAVAILABLE");
    expect(e.errorType).toBe("AUTHENTICATED_ACCESS_UNAVAILABLE");
    expect(e.explanation).toMatch(/Authenticated reporting is unavailable/i);
    expect(e.ownerAction).toMatch(/owner setup/i);
  });

  it("names Enhanced Measurement history page-view defect", () => {
    const e = explainAccessBlocked("ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS");
    expect(e.errorType).toBe("ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS");
    expect(e.explanation).toMatch(/double-count/i);
    expect(e.ownerAction).toMatch(/browser history events/i);
  });
});

describe("verification timestamps", () => {
  it("formats UTC and America/Chicago labels for audit stamps", () => {
    const iso = "2026-08-08T19:30:00.000Z";
    expect(formatUtcLabel(iso)).toMatch(/^2026-08-08T19:30:00/);
    expect(formatChicagoLabel(iso)).toMatch(/America\/Chicago/);
    const stamp = buildVerificationStamp(iso);
    expect(stamp.verifiedAtUtc).toBeTruthy();
    expect(stamp.verifiedAtChicago).toMatch(/America\/Chicago/);
  });

  it("returns null stamps when not marked", () => {
    expect(buildVerificationStamp(null).verifiedAtIso).toBeNull();
  });
});

describe("buildMeasurementReadinessModel", () => {
  it("builds two launch pages with FAIL/BLOCKED explanations", () => {
    const model = buildMeasurementReadinessModel();
    expect(model.launchPages).toHaveLength(2);
    expect(model.launchPages.map((p) => p.path)).toEqual(LIGHTING_LAUNCH_PAGES.map((p) => p.path));

    for (const page of model.launchPages) {
      const auth = page.checks.find((c) => c.id === "ga4-gsc-auth");
      expect(auth?.status).toBe("BLOCKED");
      expect(auth?.errorType).toBe("AUTHENTICATED_ACCESS_UNAVAILABLE");
      expect(auth?.explanation).toMatch(/Error type:/);

      const singleton = page.checks.find((c) => c.id === "page-view-singleton");
      expect(singleton?.status).toBe("FAIL");
      expect(singleton?.errorType).toBe("ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS");

      const canonical = page.checks.find((c) => c.id === "canonical");
      expect(canonical?.canonical?.match).toBe(true);
      expect(canonical?.canonical?.expected).toBe(page.absoluteUrl);

      const sitemap = page.checks.find((c) => c.id === "sitemap");
      expect(sitemap?.sitemap?.included).toBe(true);
      expect(sitemap?.sitemap?.occurrences).toBe(1);
    }
  });

  it("marks overall Blocked while gates fail", () => {
    const model = buildMeasurementReadinessModel();
    expect(model.summary.overall).toBe("Blocked");
    expect(model.summary.failCount).toBeGreaterThan(0);
    expect(model.ga4.errorType).toBe("AUTHENTICATED_ACCESS_UNAVAILABLE");
    expect(model.gsc.errorType).toBe("AUTHENTICATED_ACCESS_UNAVAILABLE");
  });

  it("surfaces dual-timezone verified stamps when provided", () => {
    const iso = "2026-08-08T18:00:00.000Z";
    const model = buildMeasurementReadinessModel({
      ga4VerifiedAtIso: iso,
      gscVerifiedAtIso: iso,
    });
    expect(model.ga4Verification.verifiedAtUtc).toMatch(/2026-08-08T18:00:00/);
    expect(model.ga4Verification.verifiedAtChicago).toMatch(/America\/Chicago/);
    expect(model.gscVerification.verifiedAtChicago).toMatch(/America\/Chicago/);
  });
});

describe("readiness PDF export", () => {
  it("emits a PDF with readiness content and dual timezones", () => {
    const model = buildMeasurementReadinessModel({
      ga4VerifiedAtIso: "2026-08-08T18:00:00.000Z",
    });
    const bytes = buildReadinessReportPdf(model, {
      generatedAtIso: "2026-08-08T19:00:00.000Z",
    });
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Lighting measurement readiness");
    expect(text).toContain("Error type");
    expect(text).toContain("AUTHENTICATED_ACCESS_UNAVAILABLE");
    expect(text).toContain("Sitemap");
    expect(text).toContain("America/Chicago");
    expect(text).toContain("%%EOF");
    expect(readinessReportFilename(new Date("2026-08-08T00:00:00Z"))).toBe(
      "lighting-measurement-readiness-2026-08-08.pdf",
    );
  });
});
