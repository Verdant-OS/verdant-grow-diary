/**
 * Settings → Units tile: temperature display preference UI.
 *
 * Verifies:
 *  - Tile renders with both options and clear non-mutating copy.
 *  - Default selection is Fahrenheit.
 *  - Switching + Save persists via temperatureUnitPreference.
 *  - Reset returns to Fahrenheit.
 *  - The tile copy explicitly says stored sensor values are unchanged.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Settings from "@/pages/Settings";
import { loadTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";

// Minimal auth mock so the Settings page renders without a real session.
vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-test-1", email: "tester@example.com" },
    signOut: () => undefined,
  }),
}));

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("Settings · Units tile (temperature display preference)", () => {
  it("renders the tile with Fahrenheit-default copy and both options", () => {
    render(<Settings />);
    expect(screen.getByText("Display temperature as")).toBeInTheDocument();
    expect(
      screen.getByText("Stored sensor values are unchanged."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(
      screen.getByTestId("temperature-unit-option-celsius"),
    ).not.toBeChecked();
  });

  it("Saves the celsius choice to local preference (no DB writes)", () => {
    render(<Settings />);
    fireEvent.click(screen.getByTestId("temperature-unit-option-celsius"));
    fireEvent.click(screen.getByTestId("temperature-unit-save"));
    expect(loadTemperatureUnitPreference()).toBe("celsius");
    expect(screen.getByTestId("temperature-unit-saved")).toHaveTextContent(
      /saved/i,
    );
  });

  it("Reset restores the Fahrenheit default", () => {
    render(<Settings />);
    fireEvent.click(screen.getByTestId("temperature-unit-option-celsius"));
    fireEvent.click(screen.getByTestId("temperature-unit-save"));
    expect(loadTemperatureUnitPreference()).toBe("celsius");

    fireEvent.click(screen.getByTestId("temperature-unit-reset"));
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
  });
});
