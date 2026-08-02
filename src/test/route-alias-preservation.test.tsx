import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";
import { buildLegacyStrainSlugAliasTarget, buildRouteAliasTarget } from "@/lib/routeAliasRules";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="route-alias-location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

function renderAlias(from: string, path: string, to: string) {
  const destinationPath = to.split(/[?#]/, 1)[0];
  return render(
    <MemoryRouter initialEntries={[from]}>
      <Routes>
        <Route path={path} element={<RouteAliasRedirect to={to} />} />
        <Route path={destinationPath} element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("route alias scope preservation", () => {
  it.each([
    {
      from: "/features?ref=pricing#plans",
      path: "/features",
      to: "/welcome",
      expected: "/welcome?ref=pricing#plans",
    },
    {
      from: "/demo?ref=partner#proof",
      path: "/demo",
      to: "/welcome",
      expected: "/welcome?ref=partner#proof",
    },
    {
      from: "/ai-doctor?growId=g1&plantId=p1#review",
      path: "/ai-doctor",
      to: "/doctor",
      expected: "/doctor?growId=g1&plantId=p1#review",
    },
    {
      from: "/strains?ref=legacy#directory",
      path: "/strains",
      to: "/cultivars",
      expected: "/cultivars?ref=legacy#directory",
    },
    {
      from: "/refunds?source=footer#eligibility",
      path: "/refunds",
      to: "/refund",
      expected: "/refund?source=footer#eligibility",
    },
    {
      from: "/refund-policy?source=footer#eligibility",
      path: "/refund-policy",
      to: "/refund",
      expected: "/refund?source=footer#eligibility",
    },
    {
      from: "/terms-of-service?source=footer#rights",
      path: "/terms-of-service",
      to: "/terms",
      expected: "/terms?source=footer#rights",
    },
    {
      from: "/privacy-policy?source=footer#choices",
      path: "/privacy-policy",
      to: "/privacy",
      expected: "/privacy?source=footer#choices",
    },
  ])("redirects $path while preserving query and hash", async ({ from, path, to, expected }) => {
    renderAlias(from, path, to);
    expect(await screen.findByTestId("route-alias-location")).toHaveTextContent(expected);
  });

  it("redirects /logs while preserving grow scope and hash", async () => {
    renderAlias("/logs?growId=g1#entry", "/logs", "/timeline");
    expect(await screen.findByTestId("route-alias-location")).toHaveTextContent(
      "/timeline?growId=g1#entry",
    );
  });

  it("redirects /tasks while preserving grow scope, focus, and hash", async () => {
    renderAlias("/tasks?growId=g1&focus=aq1#row", "/tasks", "/actions");
    expect(await screen.findByTestId("route-alias-location")).toHaveTextContent(
      "/actions?growId=g1&focus=aq1#row",
    );
  });

  it("keeps blank search and hash blank", () => {
    expect(buildRouteAliasTarget("/timeline", "", "")).toBe("/timeline");
  });

  it("preserves encoded values verbatim without decoding or re-encoding", () => {
    expect(
      buildRouteAliasTarget("/timeline", "?growId=a%2Fb+room%26cycle%3D1", "#entry%2Fraw%20anchor"),
    ).toBe("/timeline?growId=a%2Fb+room%26cycle%3D1#entry%2Fraw%20anchor");
  });

  it("encodes a decoded legacy strain slug as one segment and preserves query/hash", () => {
    expect(
      buildLegacyStrainSlugAliasTarget(
        "blue/dream & haze",
        "?ref=legacy%2Fguide",
        "#feeding%20notes",
      ),
    ).toBe("/cultivars/blue%2Fdream%20%26%20haze?ref=legacy%2Fguide#feeding%20notes");
  });

  it("fails malformed or path-traversal strain slugs to the cultivar index", () => {
    expect(buildLegacyStrainSlugAliasTarget("..", "?ref=legacy", "#top")).toBe(
      "/cultivars?ref=legacy#top",
    );
    expect(buildLegacyStrainSlugAliasTarget("\ud800", "?ref=legacy", "#top")).toBe(
      "/cultivars?ref=legacy#top",
    );
  });

  it("merges a canonical destination query before incoming signup context", () => {
    expect(
      buildRouteAliasTarget(
        "/auth?mode=signup",
        "?ref=GROWER42&redirectTo=%2Fonboarding",
        "#continue",
      ),
    ).toBe("/auth?mode=signup&ref=GROWER42&redirectTo=%2Fonboarding#continue");
  });

  it("keeps signup mode authoritative when an old link carries another mode", () => {
    expect(buildRouteAliasTarget("/auth?mode=signup", "?mode=signin&ref=GROWER42", "")).toBe(
      "/auth?mode=signup&mode=signin&ref=GROWER42",
    );
  });

  it("redirects a signup alias with referral, return, and hash context intact", async () => {
    renderAlias(
      "/signup?ref=GROWER42&redirectTo=%2Fonboarding#continue",
      "/signup",
      "/auth?mode=signup",
    );
    expect(await screen.findByTestId("route-alias-location")).toHaveTextContent(
      "/auth?mode=signup&ref=GROWER42&redirectTo=%2Fonboarding#continue",
    );
  });

  it("redirects a login alias with return, referral, and hash context intact", async () => {
    renderAlias("/login?redirectTo=%2Fgrows%2Fg1&ref=GROWER42#continue", "/login", "/auth");
    expect(await screen.findByTestId("route-alias-location")).toHaveTextContent(
      "/auth?redirectTo=%2Fgrows%2Fg1&ref=GROWER42#continue",
    );
  });
});

describe("stateful alias wiring", () => {
  it.each([
    { path: "/features", to: "/welcome" },
    { path: "/demo", to: "/welcome" },
    { path: "/ai-doctor", to: "/doctor" },
    { path: "/strains", to: "/cultivars" },
    { path: "/refunds", to: "/refund" },
    { path: "/refund-policy", to: "/refund" },
    { path: "/terms-of-service", to: "/terms" },
    { path: "/privacy-policy", to: "/privacy" },
  ])("routes $path through the query-preserving alias", ({ path, to }) => {
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedTarget = to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    expect(APP).toMatch(
      new RegExp(
        `path="${escapedPath}"\\s+element=\\{<RouteAliasRedirect\\s+to="${escapedTarget}"\\s*\\/>\\}`,
      ),
    );
  });

  it("routes login, signup, and register through the shared context-preserving alias", () => {
    expect(APP).toMatch(/path="\/login"\s+element=\{<RouteAliasRedirect\s+to="\/auth"\s*\/>\}/);
    expect(APP).toMatch(
      /path="\/signup"\s+element=\{<RouteAliasRedirect\s+to="\/auth\?mode=signup"\s*\/>\}/,
    );
    expect(APP).toMatch(
      /path="\/register"\s+element=\{<RouteAliasRedirect\s+to="\/auth\?mode=signup"\s*\/>\}/,
    );
  });

  it("routes grow-room, tasks, and action-queue through the query-preserving alias", () => {
    expect(APP).toMatch(/path="\/grow-room"\s+element=\{<RouteAliasRedirect\s+to="\/"\s*\/>\}/);
    expect(APP).toMatch(/path="\/tasks"\s+element=\{<RouteAliasRedirect\s+to="\/actions"\s*\/>\}/);
    expect(APP).toMatch(
      /path="\/action-queue"\s+element=\{<RouteAliasRedirect\s+to="\/actions"\s*\/>\}/,
    );
  });

  it("routes a dynamic legacy strain slug through the encoded preserving helper", () => {
    expect(APP).toMatch(
      /buildLegacyStrainSlugAliasTarget\(\s*slug,\s*location\.search,\s*location\.hash,?\s*\)/,
    );
  });
});
