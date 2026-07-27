import { describe, expect, it } from "vitest";
import {
  AUTHENTICATED_CORE_CENSUS_ROUTES,
  PRIVILEGED_ROUTE_PREFIXES,
  PUBLIC_CORE_CENSUS_ROUTES,
  classifyLink,
  expectedCensusNavigationPath,
  isReadOnlyEdgeFunction,
  isPrivilegedRoute,
  isSafelyFillableFieldType,
  matchesKnownAppRoute,
  placeholderValueForField,
} from "../../e2e/lib/coreLinkFormCensus";

const MANIFEST = [
  "*",
  "/",
  "/auth",
  "/grows",
  "/grows/:growId",
  "/plants/:id",
  "/guides/:slug",
  "/pricing",
  "/pheno-hunts/:id/workspace",
] as const;

describe("core link and form census rules", () => {
  it("matches exact and dynamic manifest routes without allowing the catch-all", () => {
    expect(matchesKnownAppRoute("/grows", MANIFEST)).toBe(true);
    expect(matchesKnownAppRoute("/grows/11111111-1111-4111-8111-111111111111", MANIFEST)).toBe(
      true,
    );
    expect(matchesKnownAppRoute("/plants/plant-1", MANIFEST)).toBe(true);
    expect(matchesKnownAppRoute("/not-a-real-route", MANIFEST)).toBe(false);
  });

  it.each([
    ["", "unsafe"],
    ["javascript:alert(1)", "unsafe"],
    ["data:text/html,unsafe", "unsafe"],
    ["#root-zone", "fragment"],
    ["mailto:grower@example.invalid", "contact"],
    ["tel:+15550100199", "contact"],
    ["https://example.com/guide", "external"],
    ["/unknown", "unknown-route"],
    ["/auth", "navigate"],
    ["/guides/cronk-nutrients-grow-diary", "navigate"],
    ["/grows/grow-1?tab=plants#top", "navigate"],
    ["/pricing", "navigate"],
    ["/pheno-hunts/hunt-1/workspace", "navigate"],
    ["/operator/ecowitt", "excluded-privileged"],
    ["/internal/sensor-truth-audit", "excluded-privileged"],
  ] as const)("classifies %s as %s", (href, expected) => {
    expect(classifyLink({ href }, MANIFEST).disposition).toBe(expected);
  });

  it("allows explicit downloads without treating their asset path as an app route", () => {
    expect(
      classifyLink({ href: "/exports/example.csv", download: true }, MANIFEST).disposition,
    ).toBe("download");
  });

  it("expects signed-out links to auth routes to land on the welcome gate", () => {
    const routes = [
      { path: "/pheno-hunts/:id/compare", access: "public" },
      { path: "/pheno-hunts/:id/workspace", access: "auth" },
    ] as const;

    expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/workspace", routes, false)).toBe(
      "/welcome",
    );
    expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/workspace", routes, true)).toBe(
      "/pheno-hunts/hunt-1/workspace",
    );
    expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/compare", routes, false)).toBe(
      "/pheno-hunts/hunt-1/compare",
    );
  });

  it("resolves the most specific route deterministically before applying access behavior", () => {
    const routes = [
      { path: "/pheno-hunts/:id/:view", access: "auth" },
      { path: "/pheno-hunts/:id/compare", access: "public" },
    ] as const;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(expectedCensusNavigationPath("/pheno-hunts/hunt-1/compare", routes, false)).toBe(
        "/pheno-hunts/hunt-1/compare",
      );
    }
  });

  it.each(["text", "search", "email", "password", "number", "date", "datetime-local", "time"])(
    "allows deterministic filling for %s fields",
    (type) => {
      expect(isSafelyFillableFieldType(type)).toBe(true);
    },
  );

  it.each(["hidden", "file", "checkbox", "radio", "range", "submit"])(
    "keeps %s controls audit-only",
    (type) => {
      expect(isSafelyFillableFieldType(type)).toBe(false);
    },
  );

  it.each([
    "check-entitlement",
    "count-sessions",
    "get-latest-snapshot",
    "health",
    "list-recent-diary-entries",
    "preview-import",
    "resolve-plan",
    "status",
    "environment-summary-report-entitlement",
    "founder-slots-remaining",
    "premium-export-entitlement",
  ])("classifies the read-only edge function %s without weakening the mutation fence", (name) => {
    expect(isReadOnlyEdgeFunction(name)).toBe(true);
  });

  it.each([
    "ai-doctor-review",
    "create-checkout-session",
    "delete-account",
    "paddle-webhook",
    "save-diary-entry",
  ])("keeps the mutating edge function %s behind the mutation fence", (name) => {
    expect(isReadOnlyEdgeFunction(name)).toBe(false);
  });

  it("builds safe, deterministic placeholder values", () => {
    expect(placeholderValueForField({ type: "email", accessibleName: "Email" })).toBe(
      "verdant-census@example.invalid",
    );
    expect(placeholderValueForField({ type: "number", accessibleName: "Relative humidity" })).toBe(
      "55",
    );
    expect(placeholderValueForField({ type: "number", accessibleName: "EC" })).toBe("1.5");
    expect(
      placeholderValueForField({
        type: "number",
        accessibleName: "Temperature in Celsius",
        min: "-10",
        max: "50",
      }),
    ).toBe("50");
    expect(
      placeholderValueForField({
        type: "number",
        accessibleName: "Days",
        min: "3",
        max: "9",
        step: "2",
      }),
    ).toBe("5");
    expect(
      placeholderValueForField({ type: "textarea", accessibleName: "Observation notes" }),
    ).toContain("No live data");
  });

  it.each(PRIVILEGED_ROUTE_PREFIXES)(
    "keeps privileged route %s outside the grower census",
    (prefix) => {
      expect(isPrivilegedRoute(prefix)).toBe(true);
      expect(isPrivilegedRoute(`${prefix}/nested`)).toBe(true);
    },
  );

  it("does not duplicate a route inside either census lane", () => {
    const paths = [
      ...PUBLIC_CORE_CENSUS_ROUTES.map((route) => route.path),
      ...AUTHENTICATED_CORE_CENSUS_ROUTES.map((route) => route.path),
    ];
    expect(new Set(paths).size).toBe(paths.length);
  });
});
