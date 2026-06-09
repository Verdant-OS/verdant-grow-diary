// Settings start-screen control — user-scoped localStorage preference UI.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-settings-1", email: "x@example.invalid" },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
}));

import Settings from "@/pages/Settings";
import {
  getStartScreenChoice,
  DEFAULT_START_SCREEN,
} from "@/lib/startScreenPreferences";

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings start-screen control", () => {
  it("renders the start-screen control for a signed-in user", () => {
    renderSettings();
    expect(screen.getByText(/^start screen$/i)).toBeInTheDocument();
    expect(screen.getByText(/choose where verdant opens after sign-in/i)).toBeInTheDocument();
    expect(screen.getByTestId("start-screen-option-quickLog")).toBeInTheDocument();
    expect(screen.getByTestId("start-screen-option-onboarding")).toBeInTheDocument();
    expect(screen.getByTestId("start-screen-option-welcome")).toBeInTheDocument();
  });

  it("defaults to diary-first when nothing is saved", () => {
    renderSettings();
    const quick = screen.getByTestId("start-screen-option-quickLog") as HTMLInputElement;
    expect(quick.checked).toBe(true);
    expect(DEFAULT_START_SCREEN).toBe("quickLog");
  });

  it("saves preference to the user-scoped localStorage key", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-onboarding"));
    fireEvent.click(screen.getByTestId("start-screen-save"));
    expect(window.localStorage.getItem("verdant:startScreen:user-settings-1")).toBe("onboarding");
    expect(getStartScreenChoice("user-settings-1")).toBe("onboarding");
    expect(screen.getByTestId("start-screen-saved")).toHaveAttribute("role", "status");
  });

  it("welcome option stores safe internal value", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-welcome"));
    fireEvent.click(screen.getByTestId("start-screen-save"));
    expect(getStartScreenChoice("user-settings-1")).toBe("welcome");
  });

  it("reset button clears preference and re-selects diary-first", () => {
    window.localStorage.setItem("verdant:startScreen:user-settings-1", "timeline");
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-reset"));
    expect(window.localStorage.getItem("verdant:startScreen:user-settings-1")).toBeNull();
    const quick = screen.getByTestId("start-screen-option-quickLog") as HTMLInputElement;
    expect(quick.checked).toBe(true);
  });

  it("never stores tokens/sessions/grow data under the start-screen key", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-timeline"));
    fireEvent.click(screen.getByTestId("start-screen-save"));
    const v = window.localStorage.getItem("verdant:startScreen:user-settings-1") ?? "";
    expect(v).not.toMatch(/token|session|password|hash|@/i);
    expect(v).toBe("timeline");
  });
});
