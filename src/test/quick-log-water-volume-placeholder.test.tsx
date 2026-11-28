/**
 * The empty Volume field's example amount is written in the unit the field is
 * in, so "e.g. 500" never sits in a liters field (500 L). The hint is display
 * only: it is not a value, and nothing is saved from it.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

import QuickLogWateringForm from "@/components/QuickLogWateringForm";
import {
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

const volumeInput = () => screen.getByRole("textbox", { name: /^Volume \(/ }) as HTMLInputElement;

beforeEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
  latest = EMPTY_QUICKLOG_WATERING_FORM;
});
afterEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
});

describe("Quick Log Water: the volume hint follows the unit", () => {
  it("1: in liters (the default) the hint is a liters amount, not 500", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
    expect(volumeInput()).toHaveAttribute("placeholder", "e.g. 1.5");
  });

  it("2: in ml the hint stays e.g. 500", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "ml");
    render(<Harness />);
    expect(screen.getByLabelText("Volume (ml)")).toBeInTheDocument();
    expect(volumeInput()).toHaveAttribute("placeholder", "e.g. 500");
  });

  it("3: in gallons the hint is a gallons amount", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
    render(<Harness />);
    expect(screen.getByLabelText("Volume (gal)")).toBeInTheDocument();
    expect(volumeInput()).toHaveAttribute("placeholder", "e.g. 0.5");
  });

  it("4: switching the unit updates the hint, and the hint is never a value", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("qlv2-volume-unit-gal"));
    expect(volumeInput()).toHaveAttribute("placeholder", "e.g. 0.5");
    fireEvent.click(screen.getByTestId("qlv2-volume-unit-ml"));
    expect(volumeInput()).toHaveAttribute("placeholder", "e.g. 500");
    expect(volumeInput().value).toBe("");
    expect(latest.volumeMl ?? "").toBe("");
  });

  it("5: a 0.5 L shortcut keeps liters, fills 0.5 and keeps the liters hint", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-500"));
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
    expect(latest.volumeMl).toBe("500");
    expect(volumeInput().value).toBe("0.5");
    expect(volumeInput()).toHaveAttribute("placeholder", "e.g. 1.5");
  });
});
