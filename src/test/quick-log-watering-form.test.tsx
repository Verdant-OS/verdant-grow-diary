import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import QuickLogWateringForm from "@/components/QuickLogWateringForm";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";

const HIDDEN_CONTEXT = {
  visible: false,
  scope: "none" as const,
  fields: [],
  helper: "",
};

function Harness() {
  const [value, setValue] = useState<QuickLogWateringFormState>(EMPTY_QUICKLOG_WATERING_FORM);
  return <QuickLogWateringForm value={value} onChange={setValue} context={HIDDEN_CONTEXT} />;
}

describe("QuickLogWateringForm", () => {
  it("auto-fills PPM-500 when input EC is entered", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Input EC"), { target: { value: "2" } });
    expect((screen.getByLabelText("Input PPM (500 scale)") as HTMLInputElement).value).toBe("1000");
  });

  it("auto-fills canonical EC when input PPM-500 is entered", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Input PPM (500 scale)"), {
      target: { value: "750" },
    });
    expect((screen.getByLabelText("Input EC") as HTMLInputElement).value).toBe("1.5");
  });

  it("keeps the runoff EC/PPM pair synchronized and clears stale companions", () => {
    render(<Harness />);
    const ec = screen.getByLabelText("Runoff EC") as HTMLInputElement;
    const ppm = screen.getByLabelText("Runoff PPM (500 scale)") as HTMLInputElement;
    fireEvent.change(ec, { target: { value: "1.7" } });
    expect(ppm.value).toBe("850");
    fireEvent.change(ppm, { target: { value: "not-a-number" } });
    expect(ec.value).toBe("");
    expect(ppm.value).toBe("not-a-number");
  });

  it("uses chip-first manual observations and labels them manual in review", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    fireEvent.click(screen.getByRole("button", { name: "Dry" }));
    fireEvent.click(screen.getByRole("button", { name: "Normal" }));

    const review = screen.getByTestId("qlv2-watering-review");
    expect(review.textContent).toMatch(/pre-water pot weight \(manual\).*light/i);
    expect(review.textContent).toMatch(/medium surface \(manual\).*dry/i);
    expect(review.textContent).toMatch(/drainage \(manual\).*normal/i);
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  });
});
