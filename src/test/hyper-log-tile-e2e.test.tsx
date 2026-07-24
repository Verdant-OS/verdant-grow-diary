/**
 * End-to-end-ish user-flow tests for each supported HyperLog tile.
 *
 * Mounts GlobalFastAddButton + a stub Quick Log listener and verifies
 * that clicking each HyperLog tile + Commit fires the existing
 * `verdant:open-quicklog` event with the correct prefill shape.
 *
 * Hard assertions:
 *  - Water is absent from HyperLog so it cannot reach the legacy handoff
 *  - existing event name used (no new write path)
 *  - eventType mapping is correct per tile
 *  - HyperLog demo snapshot values (24.6 / 58 / 1.12) never appear
 *  - HyperLog photos stay local: no file refs in dispatched detail
 *  - source = "hyperlog"; never labeled live
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GlobalFastAddButton from "@/components/GlobalFastAddButton";
import type { QuickLogPrefill } from "@/components/QuickLog";
import {
  clearTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

type Dispatched = { name: string; detail: QuickLogPrefill };
const captured: Dispatched[] = [];
const handler = (e: Event) => {
  const ce = e as CustomEvent<QuickLogPrefill>;
  captured.push({ name: e.type, detail: ce.detail });
};

beforeEach(() => {
  clearTemperatureUnitPreference();
  captured.length = 0;
  window.addEventListener("verdant:open-quicklog", handler as EventListener);
});
afterEach(() => {
  window.removeEventListener("verdant:open-quicklog", handler as EventListener);
});

function openTileAndCommit(tile: string) {
  render(
    <MemoryRouter initialEntries={["/plants/p-77"]}>
      <GlobalFastAddButton />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
  fireEvent.click(screen.getByTestId(`global-fast-add-hyperlog-${tile}`));
  act(() => {
    fireEvent.click(screen.getByTestId("hyperlog-commit"));
  });
}

describe("HyperLog tile → Quick Log handoff e2e", () => {
  it("does not expose a HyperLog water tile", () => {
    render(
      <MemoryRouter initialEntries={["/plants/p-77"]}>
        <GlobalFastAddButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    expect(screen.queryByTestId("global-fast-add-hyperlog-water")).toBeNull();
  });

  it("feed tile maps to eventType=feeding", () => {
    openTileAndCommit("feed");
    expect(captured[0].detail.eventType).toBe("feeding");
  });

  it("defoliate tile maps to eventType=training", () => {
    openTileAndCommit("defoliate");
    expect(captured[0].detail.eventType).toBe("training");
  });

  it("note tile maps to eventType=observation", () => {
    openTileAndCommit("note");
    expect(captured[0].detail.eventType).toBe("observation");
  });

  it("environment tile maps to eventType=environment", () => {
    openTileAndCommit("environment");
    expect(captured[0].detail.eventType).toBe("environment");
  });

  it("never carries HyperLog demo snapshot values (24.6 / 58 / 1.12) and never labels live", () => {
    openTileAndCommit("feed");
    const json = JSON.stringify(captured[0].detail);
    expect(json).not.toMatch(/24\.6/);
    expect(json).not.toMatch(/1\.12/);
    expect(json).not.toMatch(/"58"/);
    expect(json).not.toMatch(/\blive\b/i);
  });

  it("never exposes File refs / object URLs in the dispatched detail", () => {
    openTileAndCommit("note");
    const json = JSON.stringify(captured[0].detail);
    expect(json).not.toMatch(/blob:/);
    expect(json).not.toMatch(/File\(/);
    // photoCount is the only photo info that may travel — never URLs/files.
    expect(typeof captured[0].detail.photoCount === "number" || captured[0].detail.photoCount == null).toBe(true);
  });

  it("does not call any new persistence function from HyperLogModal/GlobalFastAdd commit", () => {
    // Spy-style assertion: a no-op handler captured the event, but nothing
    // else fired. Re-validate by counting events on the wire.
    const spy = vi.fn();
    window.addEventListener("verdant:entry-created", spy as EventListener);
    openTileAndCommit("environment");
    window.removeEventListener("verdant:entry-created", spy as EventListener);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("HyperLog environment temp draft — entry-unit pin race", () => {
  it("keeps the ORIGINAL entry unit's interpretation when the live preference flips before commit", () => {
    // Default preference is fahrenheit (this branch's app-wide default).
    render(
      <MemoryRouter initialEntries={["/plants/p-77"]}>
        <GlobalFastAddButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-hyperlog-environment"));

    // Grower types "77" meaning 77°F while the live preference is fahrenheit.
    fireEvent.change(screen.getByLabelText("Environment temperature"), {
      target: { value: "77" },
    });

    // Preference flips to celsius in another tab WHILE the draft is still open
    // (dispatches TEMPERATURE_UNIT_CHANGE_EVENT, picked up by the reactive hook).
    act(() => {
      saveTemperatureUnitPreference("celsius");
    });

    act(() => {
      fireEvent.click(screen.getByTestId("hyperlog-commit"));
    });

    expect(captured).toHaveLength(1);
    const note = captured[0].detail.note ?? "";
    // Correct: 77°F pinned at entry -> 25°C canonical, regardless of the later flip.
    expect(note).toContain("Temp 25°C");
    // Would be the bug's (wrong) output: raw "77" reinterpreted as already-°C.
    expect(note).not.toContain("Temp 77°C");
  });
});

describe("HyperLog demo Sensor Snapshot — unit-aware display", () => {
  it("shows the demo snapshot temperature converted to the active unit, not a hardcoded °C string", () => {
    // Codex round-5 finding: the demo Sensor Snapshot always showed the
    // hardcoded "24.6°C" regardless of the active preference, mixing units on
    // screen with the unit-aware Temp input/preview right below it.
    render(
      <MemoryRouter initialEntries={["/plants/p-77"]}>
        <GlobalFastAddButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-hyperlog-environment"));

    // Default preference is fahrenheit (this branch's app-wide default): the
    // canonical 24.6°C demo value must render converted, not raw.
    expect(screen.getByText("76.3°F")).toBeTruthy();
    expect(screen.queryByText("24.6°C")).toBeNull();
  });

  it("shows the demo snapshot temperature in °C when the preference is celsius", () => {
    saveTemperatureUnitPreference("celsius");
    render(
      <MemoryRouter initialEntries={["/plants/p-77"]}>
        <GlobalFastAddButton />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("global-fast-add-trigger"));
    fireEvent.click(screen.getByTestId("global-fast-add-hyperlog-environment"));

    expect(screen.getByText("24.6°C")).toBeTruthy();
    expect(screen.queryByText("76.3°F")).toBeNull();
  });
});
