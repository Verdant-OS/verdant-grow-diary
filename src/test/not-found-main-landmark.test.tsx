import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import NotFound from "@/pages/NotFound";

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
});
