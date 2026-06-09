// Onboarding keyboard / radiogroup / "Change later" behavior.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const navMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navMock };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false, signOut: vi.fn() }),
}));

import Onboarding from "@/pages/Onboarding";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Onboarding page", () => {
  it("renders an accessible heading and radiogroup with three options", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /where do you want verdant to open first/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // Quick Log is default and marked recommended
    const quickLog = radios.find((r) => (r as HTMLInputElement).value === "quickLog") as HTMLInputElement;
    expect(quickLog.checked).toBe(true);
    expect(screen.getAllByText(/recommended/i).length).toBeGreaterThan(0);
  });

  it("selecting another option and pressing Continue navigates and persists", () => {
    navMock.mockClear();
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    renderPage();
    const timeline = screen
      .getAllByRole("radio")
      .find((r) => (r as HTMLInputElement).value === "timeline") as HTMLInputElement;
    fireEvent.click(timeline);
    expect((timeline as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(navMock).toHaveBeenCalledWith("/timeline", { replace: true });
    expect(window.localStorage.getItem("verdant:startScreen:user-1")).toBe("timeline");
  });

  it("Skip for now routes to the diary-first Quick Log route and does NOT persist", () => {
    navMock.mockClear();
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));
    // Quick Log resolves to "/" (the dashboard host of Quick Log).
    expect(navMock).toHaveBeenCalledWith("/", { replace: true });
    expect(window.localStorage.getItem("verdant:startScreen:user-1")).toBeNull();
  });

  it("shows a Change later link pointing to /settings", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /settings/i });
    expect(link).toHaveAttribute("href", "/settings");
    expect(screen.getAllByText(/you can change this later/i).length).toBeGreaterThan(0);
  });

  it("focuses the heading on mount for screen readers / keyboard users", () => {
    renderPage();
    const heading = screen.getByRole("heading", {
      name: /where do you want verdant to open first/i,
    });
    expect(document.activeElement).toBe(heading);
  });
});
