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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Settings from "@/pages/Settings";
import { loadTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";
import {
  clearLocalStorageForTest,
  ensureLocalStorageForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

// Minimal auth mock so the Settings page renders without a real session.
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Settings · Units tile (temperature display preference)", () => {
  it("renders the tile with Fahrenheit-default copy and both options", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    expect(screen.getByText("Display temperature as")).toBeInTheDocument();
    expect(screen.getByText("Stored sensor values are unchanged.")).toBeInTheDocument();
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-option-celsius")).not.toBeChecked();
  });

  it("Saves the celsius choice to local preference (no DB writes)", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("temperature-unit-option-celsius"));
    fireEvent.click(screen.getByTestId("temperature-unit-save"));
    expect(loadTemperatureUnitPreference()).toBe("celsius");
    expect(screen.getByTestId("temperature-unit-saved")).toHaveTextContent(/saved/i);
  });

  it("shows an honest storage error and recovers when Save is retried", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("temperature-unit-option-celsius"));

    const storage = ensureLocalStorageForTest();
    const storagePrototype = Object.getPrototypeOf(storage) as Storage;
    const setItem = storagePrototype.setItem;
    vi.spyOn(storagePrototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("storage blocked");
      })
      .mockImplementation(function (this: Storage, key, value) {
        setItem.call(this, key, value);
      });

    fireEvent.click(screen.getByTestId("temperature-unit-save"));
    expect(screen.getByTestId("temperature-unit-saved")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("temperature-unit-saved")).toHaveTextContent(
      /couldn't save.+on this device.+try again/i,
    );
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");

    fireEvent.click(screen.getByTestId("temperature-unit-save"));
    expect(screen.getByTestId("temperature-unit-saved")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("temperature-unit-saved")).toHaveTextContent(/saved/i);
    expect(loadTemperatureUnitPreference()).toBe("celsius");
  });

  it("Reset restores the Fahrenheit default", () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("temperature-unit-option-celsius"));
    fireEvent.click(screen.getByTestId("temperature-unit-save"));
    expect(loadTemperatureUnitPreference()).toBe("celsius");

    fireEvent.click(screen.getByTestId("temperature-unit-reset"));
    expect(loadTemperatureUnitPreference()).toBe("fahrenheit");
    expect(screen.getByTestId("temperature-unit-option-fahrenheit")).toBeChecked();
  });

  it("keeps Celsius selected and explains when Reset cannot clear storage", () => {
    setLocalStorageItemForTest("verdant:temperatureUnit", "celsius");
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
    const storage = ensureLocalStorageForTest();
    const storagePrototype = Object.getPrototypeOf(storage) as Storage;
    vi.spyOn(storagePrototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    fireEvent.click(screen.getByTestId("temperature-unit-reset"));

    expect(screen.getByTestId("temperature-unit-option-celsius")).toBeChecked();
    expect(screen.getByTestId("temperature-unit-saved")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("temperature-unit-saved")).toHaveTextContent(
      /couldn't reset.+current choice is unchanged.+try again/i,
    );
    expect(loadTemperatureUnitPreference()).toBe("celsius");
  });
});
