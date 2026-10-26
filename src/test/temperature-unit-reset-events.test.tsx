/**
 * Supplemental Settings reset coverage for external preference changes.
 * The base suites retain the stored-override and keyed cross-tab save cases;
 * these cases preserve the additional null-key, removal, same-document and
 * unsaved-choice fences from PR #2345.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import Settings from "@/pages/Settings";
import {
  clearTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
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

describe("Settings · Units tile reset preference events", () => {
  it.each([null])(
    "refreshes a cross-tab override for storage key %s without changing the radio choice",
    (key) => {
      renderSettings();
      expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();

      act(() => {
        setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
        window.dispatchEvent(new StorageEvent("storage", { key }));
      });

      expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
      expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();
      fireEvent.click(screen.getByTestId("temperature-unit-reset"));
      expect(getLocalStorageItemForTest("verdant:temperatureUnit")).toBeNull();
      expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();
    },
  );

  it("refreshes a same-document save without overwriting an unsaved Fahrenheit choice", () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    renderSettings();
    fireEvent.click(screen.getByTestId("temperature-unit-option-fahrenheit"));

    act(() => {
      clearTemperatureUnitPreference();
    });
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();

    act(() => {
      saveTemperatureUnitPreference("celsius");
    });
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();
  });

  it.each(["verdant:temperatureUnit", null])(
    "disables Reset after a cross-tab removal for storage key %s while Fahrenheit is selected",
    (key) => {
      setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
      renderSettings();
      fireEvent.click(screen.getByTestId("temperature-unit-option-fahrenheit"));
      expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();

      act(() => {
        removeLocalStorageItemForTest("verdant:temperatureUnit");
        window.dispatchEvent(new StorageEvent("storage", { key }));
      });

      expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
      expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();
    },
  );

  it("keeps an unsaved Celsius choice when another tab clears storage", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("temperature-unit-option-celsius"));

    act(() => {
      clearLocalStorageForTest();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    expect(screen.getByTestId("temperature-unit-option-celsius")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeEnabled();
    expect(getLocalStorageItemForTest("verdant:temperatureUnit")).toBeNull();
  });

  it("ignores unrelated storage events", () => {
    renderSettings();

    act(() => {
      setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-preference" }));
    });

    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-reset")).toBeDisabled();
  });
});
