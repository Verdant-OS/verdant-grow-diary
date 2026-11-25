/**
 * Quick Log Water: the volume shortcuts follow the entry unit (founder decision
 * 2026-11-19, revising D3 in docs/specs/quick-log-water-volume-units.md §8).
 * - In liters the six shortcuts read 0.5 L … 2.5 L, fill the liters box and keep
 *   the form in liters. They save the same whole millilitres as before.
 * - In ml they are unchanged ("500 ml").
 * - In gallons there are no shortcuts: gallon amounts don't come out round.
 * A shortcut never changes the unit, and never stores a unit for the phone.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

import QuickLogWateringForm from "@/components/QuickLogWateringForm";
import {
  buildWateringFormPayload,
  EMPTY_QUICKLOG_WATERING_FORM,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import { WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY } from "@/lib/waterVolumeEntryUnitPreference";

const HIDDEN_CONTEXT = {
  visible: false,
  scope: "none" as const,
  fields: [],
  helper: "",
};

let latest: QuickLogWateringFormState = EMPTY_QUICKLOG_WATERING_FORM;

function Harness() {
  const [value, setValue] = useState<QuickLogWateringFormState>(EMPTY_QUICKLOG_WATERING_FORM);
  latest = value;
  return (
    <QuickLogWateringForm
      value={value}
      onChange={(next) => {
        latest = next;
        setValue(next);
      }}
      context={HIDDEN_CONTEXT}
    />
  );
}

function savedVolumeMl(form: QuickLogWateringFormState): number {
  const result = buildWateringFormPayload({
    growId: "g-1",
    idempotencyKey: "shortcuts-follow-unit-key",
    form,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.payload.volume_ml;
}

const volumeInput = () => screen.getByRole("textbox", { name: /^Volume \(/ }) as HTMLInputElement;
const chooseUnit = (unit: "ml" | "L" | "gal") =>
  fireEvent.click(screen.getByTestId(`qlv2-volume-unit-${unit}`));
const shortcutLabels = () =>
  within(screen.getByTestId("qlv2-volume-presets"))
    .getAllByRole("button")
    .map((chip) => chip.textContent);

beforeEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
  latest = EMPTY_QUICKLOG_WATERING_FORM;
});
afterEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
});

describe("Quick Log Water: the volume shortcuts follow the unit", () => {
  it("1: in liters (the default) the shortcuts read in liters", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
    expect(shortcutLabels()).toEqual(["0.5 L", "1 L", "1.5 L", "1.8 L", "2 L", "2.5 L"]);
  });

  it("2: a liters shortcut fills the liters box, keeps liters and saves the same ml", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-1500"));
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
    expect(volumeInput().value).toBe("1.5");
    expect(latest.volumeMl).toBe("1500");
    expect(savedVolumeMl(latest)).toBe(1500);
    expect(screen.getByTestId("qlv2-volume-preset-1500")).toHaveAttribute("aria-pressed", "true");
  });

  it("3: tapping the chosen liters shortcut again clears it", () => {
    render(<Harness />);
    const chip = screen.getByTestId("qlv2-volume-preset-1000");
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(volumeInput().value).toBe("");
    expect(latest.volumeMl).toBe("");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
  });

  it("4: in ml the shortcuts are unchanged", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "ml");
    render(<Harness />);
    expect(shortcutLabels()).toEqual(["500 ml", "1000 ml", "1500 ml", "1800 ml", "2000 ml", "2500 ml"]);
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-1000"));
    expect(screen.getByLabelText("Volume (ml)")).toBeInTheDocument();
    expect(volumeInput().value).toBe("1000");
    expect(savedVolumeMl(latest)).toBe(1000);
  });

  it("5: in gallons there are no shortcuts, and they come back in liters", () => {
    render(<Harness />);
    chooseUnit("gal");
    expect(screen.queryByTestId("qlv2-volume-presets")).not.toBeInTheDocument();
    expect(screen.queryByText("Optional shortcuts. You can still type any volume.")).not.toBeInTheDocument();
    chooseUnit("L");
    expect(shortcutLabels()).toEqual(["0.5 L", "1 L", "1.5 L", "1.8 L", "2 L", "2.5 L"]);
  });

  it("6: a shortcut never stores a unit for the phone", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-2000"));
    expect(getLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY)).toBeNull();
  });
});
