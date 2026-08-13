import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";

import NotFound from "@/pages/NotFound";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="not-found-location">{location.pathname}</output>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NotFound standalone page", () => {
  it("exposes one main landmark, a page heading, and a recovery link", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <MemoryRouter initialEntries={["/missing-page"]}>
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Home" })).toHaveAttribute("href", "/");
  });

  it("uses client-side navigation for the recovery link", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/missing-page"]}>
        <NotFound />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: "Return to Home" }));

    expect(screen.getByTestId("not-found-location")).toHaveTextContent(/^\/$/);
  });
});
