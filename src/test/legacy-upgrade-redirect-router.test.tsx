import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { APP_ROUTES } from "@/lib/appRouteManifest";
import LegacyUpgradeRedirect from "@/pages/LegacyUpgradeRedirect";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/upgrade" element={<LegacyUpgradeRedirect />} />
        <Route path="/pricing" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LegacyUpgradeRedirect", () => {
  it("routes a bookmarked paid plan to canonical pricing", () => {
    renderAt("/upgrade?plan=pro_monthly");
    expect(screen.getByTestId("location")).toHaveTextContent("/pricing?plan=pro_monthly");
  });

  it("round-trips safe attribution and return intent without opening checkout", () => {
    renderAt(
      "/upgrade?plan=founder-lifetime&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch&returnTo=/dashboard",
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/pricing?plan=founder_lifetime&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch&returnTo=%2Fdashboard",
    );
  });

  it("marks /upgrade as a redirect to the sole checkout owner", () => {
    const route = APP_ROUTES.find((entry) => entry.path === "/upgrade");
    expect(route?.access).toBe("redirect");
    expect(route?.description).toContain("/pricing");
  });
});
