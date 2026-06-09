// A11y + keyboard tests for the Settings Start screen control.
// Mocked auth — no Supabase calls. Pure render assertions.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-a11y-1", email: "x@example.invalid" },
    session: {},
    loading: false,
    signOut: vi.fn(),
  }),
}));

import Settings from "@/pages/Settings";

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

describe("Settings start-screen — a11y", () => {
  it("fieldset has accessible label and contains all radio options", () => {
    renderSettings();
    const fieldset = screen.getByTestId("start-screen-fieldset");
    expect(fieldset.tagName.toLowerCase()).toBe("fieldset");
    // sr-only legend + aria-label both supply a name
    expect(fieldset).toHaveAttribute("aria-label", expect.stringMatching(/start screen/i));
    for (const key of ["quickLog", "timeline", "dashboard", "onboarding", "welcome"]) {
      const radio = screen.getByTestId(`start-screen-option-${key}`);
      expect(radio).toHaveAttribute("type", "radio");
      expect(radio).toHaveAttribute("name", "start-screen");
    }
  });

  it("Save and Reset have accessible names", () => {
    renderSettings();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /diary-first default/i }),
    ).toBeInTheDocument();
  });

  it("saved confirmation uses role=status with aria-live=polite", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("start-screen-option-timeline"));
    fireEvent.click(screen.getByTestId("start-screen-save"));
    const note = screen.getByTestId("start-screen-saved");
    expect(note).toHaveAttribute("role", "status");
    expect(note).toHaveAttribute("aria-live", "polite");
  });

  it("native radios update checked state when activated by keyboard click", () => {
    renderSettings();
    const dashboard = screen.getByTestId("start-screen-option-dashboard") as HTMLInputElement;
    dashboard.focus();
    expect(document.activeElement).toBe(dashboard);
    fireEvent.click(dashboard);
    expect(dashboard.checked).toBe(true);
  });

  it("has no detectable axe violations on the Settings page", async () => {
    const { container } = renderSettings();
    const results = await axe(container);
    expect(results.violations.map((v) => `${v.id}:${v.help}`)).toEqual([]);
  });
});
