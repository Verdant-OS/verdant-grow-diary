import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router-dom";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("React Router test adapter", () => {
  it.each([
    ["MemoryRouter", MemoryRouter],
    ["BrowserRouter", BrowserRouter],
  ] as const)("%s opts into the production future flags", (_name, Router) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { unmount } = render(
      <Router>
        <div>route content</div>
      </Router>,
    );

    unmount();

    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes("React Router Future Flag Warning"),
      ),
    ).toEqual([]);
  });
});
