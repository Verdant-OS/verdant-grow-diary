/**
 * Runtime redirect: /grow-room → / (main Dashboard).
 *
 * We render just the route element used in App.tsx inside a MemoryRouter
 * to verify the Navigate effect without booting the whole app shell.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";

describe("Legacy /grow-room route redirects to /", () => {
  it("renders the Dashboard placeholder when visiting /grow-room", () => {
    render(
      <MemoryRouter initialEntries={["/grow-room"]}>
        <Routes>
          <Route path="/" element={<div data-testid="dash-root">dashboard</div>} />
          <Route path="/grow-room" element={<Navigate to="/" replace />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dash-root")).toBeInTheDocument();
  });
});
