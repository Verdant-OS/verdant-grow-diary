/**
 * Settings → Units tile: the Reset control never reads as the current setting.
 *
 * Filming bug #9 (2026-10-22): with Celsius saved, the always-visible
 * "Use Fahrenheit default" button read like a status line contradicting the
 * checked Celsius radio. Reset is now a plain action, and it is disabled only
 * when the default is selected and no non-default override is still stored
 * (see temperature-unit-reset-stored-override.test.tsx).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Settings from "@/pages/Settings";
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

describe("Settings · Units tile reset control", () => {
  it("never shows a Fahrenheit-default line beside a saved Celsius choice", () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    renderSettings();
    expect(screen.getByTestId("temperature-unit-option-celsius")).toBeChecked();
    const tile = screen.getByTestId("temperature-unit-fieldset").parentElement as HTMLElement;
    expect(tile.textContent).not.toMatch(/fahrenheit default/i);
    expect(screen.getByTestId("temperature-unit-reset")).toHaveTextContent("Reset to default");
    expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();
  });

  it("disables Reset while the default is already selected", () => {
    renderSettings();
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();
  });
});
