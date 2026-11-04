/**
 * Spec docs/specs/quick-log-water-volume-units.md §6, tests 8–16: the Water form
 * accepts ml / L / gal, shows what will be saved, and the payload keeps volume_ml.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getLocalStorageItemForTest,
  removeLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";
import { fireEvent, render, screen } from "@testing-library/react";

import QuickLogWateringForm from "@/components/QuickLogWateringForm";
import {
  buildWateringFormPayload,
  EMPTY_QUICKLOG_WATERING_FORM,
  isWateringFormPristine,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import { assessLargeWaterAmount } from "@/lib/quickLogWaterVolumeWarningRules";
import { WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY } from "@/lib/waterVolumeEntryUnitPreference";

const HIDDEN_CONTEXT = {
  visible: false,
  scope: "none" as const,
  fields: [],
  helper: "",
};

let latest: QuickLogWateringFormState = EMPTY_QUICKLOG_WATERING_FORM;

function Harness({
  initial = EMPTY_QUICKLOG_WATERING_FORM,
  confirmedLargeWaterKey = null,
}: {
  initial?: QuickLogWateringFormState;
  confirmedLargeWaterKey?: string | null;
}) {
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
      confirmedLargeWaterKey={confirmedLargeWaterKey}
    />
  );
}

function payloadVolume(form: QuickLogWateringFormState) {
  const result = buildWateringFormPayload({
    growId: "g-1",
    idempotencyKey: "water-units-test-key",
    form,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.payload;
}

const volumeInput = () => screen.getByRole("textbox", { name: /^Volume \(/ }) as HTMLInputElement;
const runoffInput = () => screen.getByLabelText(/^Runoff \((ml|L|gal)\)$/) as HTMLInputElement;
const chooseUnit = (unit: "ml" | "L" | "gal") =>
  fireEvent.click(screen.getByTestId(`qlv2-volume-unit-${unit}`));

beforeEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
  latest = EMPTY_QUICKLOG_WATERING_FORM;
});
afterEach(() => {
  removeLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY);
});

describe("Quick Log Water volume units", () => {
  it("defaults to ml with today's label", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Volume (ml)")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-volume-unit-ml")).toHaveAttribute("aria-pressed", "true");
    expect(isWateringFormPristine(latest)).toBe(true);
  });

  it("8: one gallon saves volume_ml 3785", () => {
    render(<Harness />);
    chooseUnit("gal");
    fireEvent.change(volumeInput(), { target: { value: "1" } });
    expect(screen.getByLabelText("Volume (gal)")).toBeInTheDocument();
    expect(payloadVolume(latest).volume_ml).toBe(3785);
  });

  it("9: shows the saved ml only for valid L/gal text", () => {
    render(<Harness />);
    fireEvent.change(volumeInput(), { target: { value: "500" } });
    expect(screen.queryByTestId("qlv2-volume-saves-as")).toBeNull();
    chooseUnit("gal");
    fireEvent.change(volumeInput(), { target: { value: "1" } });
    expect(screen.getByTestId("qlv2-volume-saves-as")).toHaveTextContent("Saves as 3,785 ml.");
    fireEvent.change(volumeInput(), { target: { value: "abc" } });
    expect(screen.queryByTestId("qlv2-volume-saves-as")).toBeNull();
    fireEvent.change(volumeInput(), { target: { value: "" } });
    expect(screen.queryByTestId("qlv2-volume-saves-as")).toBeNull();
  });

  it("names the ceiling in the entry unit when the converted amount is too large", () => {
    render(<Harness />);
    chooseUnit("gal");
    fireEvent.change(volumeInput(), { target: { value: "13.21" } });
    expect(screen.getByTestId("qlv2-volume-error")).toHaveTextContent(
      "Max 13.2 gal (50,000 ml) per watering.",
    );
    expect(
      buildWateringFormPayload({ growId: "g", idempotencyKey: "water-units-k", form: latest }),
    ).toEqual({ ok: false, reason: "volume_ml:too_large" });
  });

  it("10: a large-water confirmation does not carry over to another amount or unit", () => {
    const keyFor3Gal = assessLargeWaterAmount({
      amount: "11356",
      unit: "ml",
      confirmedKey: null,
    }).confirmationKey;
    expect(keyFor3Gal).not.toBeNull();
    render(
      <Harness
        initial={{
          ...EMPTY_QUICKLOG_WATERING_FORM,
          volumeEntryUnit: "gal",
          volumeEntryText: "3",
          volumeMl: "11356",
        }}
        confirmedLargeWaterKey={keyFor3Gal}
      />,
    );
    expect(screen.getByTestId("qlv2-large-water-confirm")).toBeDisabled();
    fireEvent.change(volumeInput(), { target: { value: "3.5" } });
    expect(latest.volumeMl).toBe("13249");
    expect(screen.getByTestId("qlv2-large-water-confirm")).toBeEnabled();
    expect(screen.getByTestId("qlv2-large-water-warning")).toHaveTextContent(
      "3.5 gal (13,249 ml) is above 10,000 ml.",
    );
    fireEvent.change(volumeInput(), { target: { value: "3" } });
    chooseUnit("L");
    expect(latest.volumeMl).toBe("3000");
  });

  it("11: a prefill keeps its stored ml unless the grower edits it", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
    render(<Harness initial={{ ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "1893" }} />);
    expect(volumeInput().value).toBe("0.5");
    expect(payloadVolume(latest).volume_ml).toBe(1893);
    fireEvent.change(volumeInput(), { target: { value: "0.5" } });
    expect(payloadVolume(latest).volume_ml).toBe(1893);
    fireEvent.change(volumeInput(), { target: { value: "0.6" } });
    expect(payloadVolume(latest).volume_ml).toBe(2271);
  });

  it("a prefill above the warning threshold still warns in another unit", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
    render(<Harness initial={{ ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "10001" }} />);
    expect(volumeInput().value).toBe("2.64");
    expect(screen.getByTestId("qlv2-large-water-warning")).toHaveTextContent("10,001 ml");
    expect(payloadVolume(latest).volume_ml).toBe(10001);
  });

  it("a tiny prefill shows a nonzero amount and saves its ml", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
    render(<Harness initial={{ ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "1" }} />);
    expect(volumeInput().value).toBe("0.00026");
    expect(screen.getByTestId("qlv2-volume-saves-as")).toHaveTextContent("Saves as 1 ml.");
    expect(payloadVolume(latest).volume_ml).toBe(1);
  });

  it("12: a restored record shows its stored ml in the entry unit and saves it unchanged", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "gal");
    render(<Harness initial={{ ...EMPTY_QUICKLOG_WATERING_FORM, volumeMl: "3785" }} />);
    expect(volumeInput().value).toBe("1");
    expect(payloadVolume(latest).volume_ml).toBe(3785);
  });

  it("14: remembers the chosen unit; a preset does not overwrite it", () => {
    const first = render(<Harness />);
    chooseUnit("gal");
    expect(getLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY)).toBe("gal");
    first.unmount();
    render(<Harness />);
    expect(screen.getByTestId("qlv2-volume-unit-gal")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-1000"));
    expect(getLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY)).toBe("gal");
  });

  it("14: an unknown stored unit opens in ml", () => {
    setLocalStorageItemForTest(WATER_VOLUME_ENTRY_UNIT_STORAGE_KEY, "quart");
    render(<Harness />);
    expect(screen.getByLabelText("Volume (ml)")).toBeInTheDocument();
  });

  it("15: runoff shares the unit and converts before its bound", () => {
    render(<Harness />);
    chooseUnit("gal");
    fireEvent.change(volumeInput(), { target: { value: "1" } });
    fireEvent.change(runoffInput(), { target: { value: "0.25" } });
    expect(screen.getByLabelText("Runoff (gal)")).toBeInTheDocument();
    expect(screen.getByTestId("qlv2-runoff-saves-as")).toHaveTextContent("Saves as 946 ml.");
    expect(payloadVolume(latest).runoff_ml).toBe(946);

    chooseUnit("L");
    fireEvent.change(runoffInput(), { target: { value: "1000.001" } });
    expect(
      buildWateringFormPayload({ growId: "g", idempotencyKey: "water-units-k", form: latest }),
    ).toEqual({ ok: false, reason: "numeric:out_of_range" });

    fireEvent.change(runoffInput(), { target: { value: "" } });
    expect(payloadVolume(latest).runoff_ml).toBeUndefined();
  });

  it("16: ml presets stay in ml and switch the entry unit to ml", () => {
    render(<Harness />);
    chooseUnit("gal");
    fireEvent.change(runoffInput(), { target: { value: "0.25" } });
    expect(screen.getByTestId("qlv2-volume-preset-1000")).toHaveTextContent("1000 ml");
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-1000"));
    expect(screen.getByLabelText("Volume (ml)")).toBeInTheDocument();
    expect(volumeInput().value).toBe("1000");
    const payload = payloadVolume(latest);
    expect(payload.volume_ml).toBe(1000);
    expect(payload.runoff_ml).toBe(946);
    expect(runoffInput().value).toBe("946");
  });
});

describe("Quick Log Water volume units: review fixes (#2814 Bugbot)", () => {
  it("keeps the chosen unit after the form resets", () => {
    function ResetHarness() {
      const [value, setValue] = useState<QuickLogWateringFormState>(EMPTY_QUICKLOG_WATERING_FORM);
      return (
        <>
          <QuickLogWateringForm value={value} onChange={setValue} context={HIDDEN_CONTEXT} />
          <button type="button" onClick={() => setValue(EMPTY_QUICKLOG_WATERING_FORM)}>
            reset
          </button>
        </>
      );
    }
    render(<ResetHarness />);
    chooseUnit("gal");
    fireEvent.click(screen.getByRole("button", { name: "reset" }));
    expect(screen.getByTestId("qlv2-volume-unit-gal")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Volume (gal)")).toBeInTheDocument();
  });

  it("does not mark a preset selected for L/gal text, and a tap sets the preset", () => {
    render(<Harness />);
    chooseUnit("L");
    fireEvent.change(volumeInput(), { target: { value: "1" } });
    expect(latest.volumeMl).toBe("1000");
    const chip = screen.getByTestId("qlv2-volume-preset-1000");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(latest.volumeMl).toBe("1000");
    expect(screen.getByLabelText("Volume (ml)")).toBeInTheDocument();
  });

  it("keeps a preset's ml amount when the unit changes afterwards", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("qlv2-volume-preset-2000"));
    chooseUnit("L");
    expect(latest.volumeMl).toBe("2000");
    expect(volumeInput().value).toBe("2");
  });
});
