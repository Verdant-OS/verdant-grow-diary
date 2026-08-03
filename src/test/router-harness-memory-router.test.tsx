/**
 * Regression: Vitest MemoryRouter harness provides real TanStack router
 * context so Link / useNavigate / useLocation work without null isServer.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, useLocation, useNavigate } from "@/lib/react-router-compat";

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <Link to="/next">Go next</Link>
      <button type="button" onClick={() => navigate("/via-nav")}>
        Navigate
      </button>
    </div>
  );
}

describe("Vitest MemoryRouter harness", () => {
  it("renders Link and exposes useLocation under a real router context", () => {
    render(
      <MemoryRouter initialEntries={["/start"]}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("path")).toHaveTextContent("/start");
    expect(screen.getByRole("link", { name: "Go next" })).toBeInTheDocument();
  });

  it("supports client-side navigation via useNavigate", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/start"]}>
        <Probe />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Navigate" }));
    expect(await screen.findByTestId("path")).toHaveTextContent("/via-nav");
  });
});
