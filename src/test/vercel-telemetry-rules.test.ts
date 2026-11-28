import { describe, expect, it } from "vitest";
import {
  isVercelTelemetryEventOnNoAnalyticsPage,
  shouldMountVercelTelemetry,
} from "@/lib/vercelTelemetryRules";

describe("shouldMountVercelTelemetry", () => {
  it("mounts only with granted consent on an ordinary page", () => {
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname: "/pricing" })).toBe(true);
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname: "/" })).toBe(true);
    expect(shouldMountVercelTelemetry({ decision: "denied", pathname: "/pricing" })).toBe(false);
    expect(shouldMountVercelTelemetry({ decision: "unset", pathname: "/pricing" })).toBe(false);
    expect(shouldMountVercelTelemetry({ decision: null, pathname: "/pricing" })).toBe(false);
    expect(shouldMountVercelTelemetry({ decision: undefined, pathname: "/pricing" })).toBe(false);
  });

  it.each([
    "/creator-beta",
    "/breeder-beta",
    "/creator-beta/",
    "/CREATOR-BETA",
    "//breeder-beta",
    "/breeder%2Dbeta",
  ])("never mounts on the no-analytics page %s, even with consent granted", (pathname) => {
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname })).toBe(false);
  });

  it("fails closed when the path is unknown", () => {
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname: null })).toBe(false);
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname: undefined })).toBe(false);
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname: "" })).toBe(false);
  });

  it("does not treat lookalike paths as beta pages", () => {
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname: "/creator-beta-faq" })).toBe(
      true,
    );
    expect(shouldMountVercelTelemetry({ decision: "granted", pathname: "/beta" })).toBe(true);
  });
});

describe("isVercelTelemetryEventOnNoAnalyticsPage", () => {
  it.each([
    "https://verdantgrowdiary.com/creator-beta",
    "https://verdantgrowdiary.com/breeder-beta/?utm_source=x#top",
    "https://verdantgrowdiary.com//Creator-Beta",
    "/breeder-beta",
  ])("flags an event from %s", (url) => {
    expect(isVercelTelemetryEventOnNoAnalyticsPage({ type: "pageview", url })).toBe(true);
  });

  it("does not flag events from other pages or with no usable url", () => {
    expect(
      isVercelTelemetryEventOnNoAnalyticsPage({ url: "https://verdantgrowdiary.com/pricing" }),
    ).toBe(false);
    expect(
      isVercelTelemetryEventOnNoAnalyticsPage({
        url: "https://verdantgrowdiary.com/?p=/creator-beta",
      }),
    ).toBe(false);
    expect(isVercelTelemetryEventOnNoAnalyticsPage({ type: "pageview" })).toBe(false);
    expect(isVercelTelemetryEventOnNoAnalyticsPage({ url: 42 })).toBe(false);
    expect(isVercelTelemetryEventOnNoAnalyticsPage(null)).toBe(false);
    expect(
      isVercelTelemetryEventOnNoAnalyticsPage("https://verdantgrowdiary.com/creator-beta"),
    ).toBe(false);
  });
});
