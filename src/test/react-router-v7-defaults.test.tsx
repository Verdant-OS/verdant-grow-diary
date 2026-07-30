import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router-dom";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("React Router v7 defaults", () => {
  it.each([
    ["MemoryRouter", MemoryRouter],
    ["BrowserRouter", BrowserRouter],
  ] as const)("%s renders without legacy future-flag warnings", (_name, Router) => {
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
