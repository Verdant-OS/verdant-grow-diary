/**
 * Settings → Units tile: Reset stays available while a stored override exists.
 *
 * Review finding on #2345: with Celsius persisted, picking Fahrenheit without
 * saving made the selection match the default and disabled Reset, although
 * local storage still held the Celsius override that a reload would restore.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Settings from "@/pages/Settings";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
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

describe("Settings · Units tile reset with a stored override", () => {
  it("keeps Reset enabled after an unsaved switch back to the default, and clears the override", () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    renderSettings();
    expect(screen.getByTestId("temperature-unit-option-celsius")).toBeChecked();

    fireEvent.click(screen.getByTestId("temperature-unit-option-fahrenheit"));
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(getLocalStorageItemForTest("verdant:temperatureUnit")).toBe("celsius");

    const reset = screen.getByTestId("temperature-unit-reset");
    expect(reset).toBeEnabled();
    fireEvent.click(reset);

    expect(getLocalStorageItemForTest("verdant:temperatureUnit")).toBeNull();
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();
  });

  it("enables Reset when another tab saves an override, keeping the unsaved choice (Codex P2 at f752598a)", () => {
    renderSettings();
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();

    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "verdant:temperatureUnit" }));
    });

    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();
  });
});
