/**
 * Spec docs/specs/quick-log-water-unit-liters-default.md §6.1: a phone with no
 * stored Water unit opens Quick Log Water in liters. A stored choice wins, the
 * default writes nothing, and saved rows stay whole millilitres.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

import QuickLogWateringForm from "@/components/QuickLogWateringForm";
import {
  buildWateringFormPayload,
  EMPTY_QUICKLOG_WATERING_FORM,
  isWateringFormPristine,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import {
  loadWaterVolumeEntryUnit,
  WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY,
} from "@/lib/waterVolumeEntryUnitPreference";

const HIDDEN_CONTEXT = {
  visible: false,
  scope: "none" as const,
  fields: [],
  helper: "",
};

let latest: QuickLogWateringFormState = EMPTY_QUICKLOG_WATERING_FORM;

function Harness({ initial = EMPTY_QUICKLOG_WATERING_FORM }: { initial?: QuickLogWateringFormState }) {
  const [value, setValue] = useState<QuickLogWateringFormState>(initial);
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

function build(form: QuickLogWateringFormState) {
  return buildWateringFormPayload({ growId: "g-1", idempotencyKey: "liters-default-key", form });
}

function payload(form: QuickLogWateringFormState) {
  const result = build(form);
  if (!result.ok) throw new Error(result.reason);
  return result.payload;
}

const volumeInput = () => screen.getByRole("textbox", { name: /^Volume \(/ }) as HTMLInputElement;
const runoffInput = () => screen.getByLabelText(/^Runoff \((ml|L|gal)\)$/) as HTMLInputElement;
const storedUnit = () => getLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);

beforeEach(() => {
  // src/test/setup.ts may seed a unit for older suites; this suite owns the default.
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
  latest = EMPTY_QUICKLOG_WATERING_FORM;
});
afterEach(() => {
  vi.restoreAllMocks();
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
});

describe("Quick Log Water: liters by default", () => {
  it("1: with nothing stored, the remembered unit reads as L", () => {
    expect(loadWaterVolumeEntryUnit()).toBe("L");
  });

  it("2: an unknown stored value, or storage that throws, falls back to L", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "quart");
    expect(loadWaterVolumeEntryUnit()).toBe("L");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadWaterVolumeEntryUnit()).toBe("L");
  });

  it("3: a stored choice wins over the default", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "ml");
    expect(loadWaterVolumeEntryUnit()).toBe("ml");
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
    expect(loadWaterVolumeEntryUnit()).toBe("gal");
  });

  it("4: opening the form with nothing stored writes nothing", () => {
    render(<Harness />);
    expect(storedUnit()).toBeNull();
  });

  it("5: the form opens in liters and 2 L saves as 2,000 ml", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-volume-unit-L")).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(volumeInput(), { target: { value: "2" } });
    expect(screen.getByTestId("qlv2-volume-saves-as")).toHaveTextContent("Saves as 2,000 ml.");
    expect(payload(latest).volume_ml).toBe(2000);
  });

  it("6: an ml habit typed into liters is stopped or asked about", () => {
    render(<Harness />);
    fireEvent.change(volumeInput(), { target: { value: "500" } });
    expect(screen.getByTestId("qlv2-volume-error")).toHaveTextContent(
      "Max 50 L (50,000 ml) per watering.",
    );
    expect(build(latest)).toEqual({ ok: false, reason: "volume_ml:too_large" });

    fireEvent.change(volumeInput(), { target: { value: "20" } });
    expect(latest.volumeMl).toBe("20000");
    expect(screen.getByTestId("qlv2-large-water-warning")).toHaveTextContent(
      "20 L (20,000 ml) is above 10,000 ml.",
    );
    expect(screen.getByTestId("qlv2-large-water-confirm")).toBeEnabled();
  });

  it("7: runoff follows the liters default", () => {
    render(<Harness />);
    fireEvent.change(volumeInput(), { target: { value: "1" } });
    fireEvent.change(runoffInput(), { target: { value: "0.25" } });
    expect(screen.getByLabelText("Runoff (L)")).toBeInTheDocument();
    expect(payload(latest).runoff_ml).toBe(250);
  });

  it("8: an ml preset switches this form to ml but does not change the phone's default", () => {
    const first = render(<Harness />);
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-1000"));
    expect(screen.getByLabelText("Volume (ml)")).toBeInTheDocument();
    expect(payload(latest).volume_ml).toBe(1000);
    expect(storedUnit()).toBeNull();
    first.unmount();
    render(<Harness />);
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
  });

  it("9: a stored-ml prefill shows in liters and saves its ml unedited", () => {
    render(<Harness initial={{ ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "1893" }} />);
    expect(volumeInput().value).toBe("1.893");
    expect(payload(latest).volume_ml).toBe(1893);
  });

  it("10: an untouched form opened in liters stays pristine", () => {
    render(<Harness />);
    expect(isWateringFormPristine(latest)).toBe(true);
  });
});
