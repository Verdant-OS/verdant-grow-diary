/**
 * Runtime redirect: /grow-room → / (main Dashboard).
 *
 * We render just the route element used in App.tsx inside a MemoryRouter
 * to verify the scope-preserving redirect without booting the whole app shell.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import RouteAliasRedirect from "@/components/RouteAliasRedirect";

function DashboardStub() {
  const location = useLocation();
  return (
    <div data-testid="dash-root">
      dashboard
      {location.search}
      {location.hash}
    </div>
  );
}

describe("Legacy /grow-room route redirects to /", () => {
  it("renders Dashboard while preserving grow scope and hash", () => {
    render(
      <MemoryRouter initialEntries={["/grow-room?growId=g1#tent"]}>
        <Routes>
          <Route path="/" element={<DashboardStub />} />
          <Route path="/grow-room" element={<RouteAliasRedirect to="/" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dash-root")).toHaveTextContent("dashboard?growId=g1#tent");
  });
});
