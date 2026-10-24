/**
 * Settings → Units tile: `stored` follows same-document preference changes.
 *
 * Supplement to temperature-unit-reset-stored-override.test.tsx (scorer-locked
 * on #2405). Cross-tab updates use the native `storage` event; saves in the
 * same document dispatch TEMPERATURE_UNIT_CHANGE_EVENT instead. Both must keep
 * Reset available when a persisted override exists while the unsaved radio
 * choice stays untouched.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Settings from "@/pages/Settings";
import { TEMPERATURE_UNIT_CHANGE_EVENT } from "@/lib/temperatureUnitPreference";
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

describe("Settings · Units tile reset vs same-document hook sync", () => {
  it("enables Reset when TEMPERATURE_UNIT_CHANGE_EVENT reflects a new stored override", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();

    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    act(() => {
      window.dispatchEvent(new Event(TEMPERATURE_UNIT_CHANGE_EVENT));
    });

    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();
  });
});
