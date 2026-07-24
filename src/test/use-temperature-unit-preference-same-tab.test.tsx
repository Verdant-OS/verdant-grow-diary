/**
 * useTemperatureUnitPreference — same-tab reactivity.
 *
 * The native `storage` event never fires in the document that made the
 * change, only in OTHER tabs/windows. Without a same-document signal, a
 * long-lived mounted component (e.g. Quick Log, kept mounted by AppShell
 * across route changes) would keep showing the unit it had at mount time
 * even after the grower changes it in Settings — until a full reload.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";
import {
  clearTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

beforeEach(() => {
  clearTemperatureUnitPreference();
});

describe("useTemperatureUnitPreference — same-tab reactivity", () => {
  it("picks up a saved change without a storage event or remount", () => {
    const { result } = renderHook(() => useTemperatureUnitPreference());
    expect(result.current).toBe("fahrenheit");

    act(() => {
      saveTemperatureUnitPreference("celsius");
    });

    expect(result.current).toBe("celsius");
  });

  it("picks up a cleared preference back to the default", () => {
    saveTemperatureUnitPreference("celsius");
    const { result } = renderHook(() => useTemperatureUnitPreference());
    expect(result.current).toBe("celsius");

    act(() => {
      clearTemperatureUnitPreference();
    });

    expect(result.current).toBe("fahrenheit");
  });

  it("stops listening after unmount (no state updates on an unmounted hook)", () => {
    const { unmount } = renderHook(() => useTemperatureUnitPreference());
    unmount();
    expect(() => {
      act(() => {
        saveTemperatureUnitPreference("celsius");
      });
    }).not.toThrow();
  });
});
