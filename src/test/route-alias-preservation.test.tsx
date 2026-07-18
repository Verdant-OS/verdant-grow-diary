import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";
import { buildRouteAliasTarget } from "@/lib/routeAliasRules";

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
  return render(
    <MemoryRouter initialEntries={[from]}>
      <Routes>
        <Route path={path} element={<RouteAliasRedirect to={to} />} />
        <Route path={to} element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("route alias scope preservation", () => {
  it("redirects /logs while preserving grow scope and hash", async () => {
    renderAlias("/logs?growId=g1#entry", "/logs", "/timeline");
    expect(await screen.findByTestId("route-alias-location")).toHaveTextContent(
      "/timeline?growId=g1#entry",
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
});
