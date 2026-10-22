/**
 * Supplement for Settings → Units reset control (PR #2345).
 *
 * Pins reset enablement from in-form choice (not only persisted preference)
 * and the post-reset disabled + success feedback path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Settings from "@/pages/Settings";
import { loadTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "user-test-1", email: "tester@example.com" },
    signOut: () => undefined,
  }),
}));

beforeEach(() => {
  try {
    clearLocalStorageForTest();
  } catch {
    /* ignore */
  }
});

function renderSettings() {
  render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings · Units tile reset control (supplement)", () => {
  it("enables Reset when the in-form choice leaves the default before Save", () => {
    renderSettings();
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();
    fireEvent.click(screen.getByTestId("temperature-unit-option-celsius"));
    expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
  });

  it("after Reset clears Celsius, Fahrenheit is selected and Reset stays disabled", () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    renderSettings();
    fireEvent.click(screen.getByTestId("temperature-unit-reset"));
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();
    expect(screen.getByTestId("temperature-unit-saved")).toHaveTextContent(
      /reverted to fahrenheit default/i,
    );
  });
});
