import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import QuickLogFeedingForm from "@/components/QuickLogFeedingForm";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";

function Harness() {
  const [value, setValue] = useState<QuickLogFeedingFormState>({
    ...EMPTY_QUICKLOG_FEEDING_FORM,
    lineId: "cronk-auto-1",
    products: [{ name: "Cronk base", amount: "", unit: "ml_per_l" }],
  });
  return <QuickLogFeedingForm value={value} onChange={setValue} />;
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("QuickLogFeedingForm EC/PPM-500 autofill", () => {
  it("fills EC from PPM and PPM from EC for input readings", () => {
    render(<Harness />);
    fireEvent.change(input("PPM in (500 scale)"), { target: { value: "1000" } });
    expect(input("EC in")).toHaveValue("2");

    fireEvent.change(input("EC in"), { target: { value: "1.4" } });
    expect(input("PPM in (500 scale)")).toHaveValue("700");
  });

  it("pairs EC out and runoff independently", () => {
    render(<Harness />);
    fireEvent.change(input("EC out"), { target: { value: "2" } });
    expect(input("PPM out (500 scale)")).toHaveValue("1000");

    fireEvent.change(input("Runoff PPM (500 scale)"), { target: { value: "850" } });
    expect(input("Runoff EC")).toHaveValue("1.7");
  });

  it("clears a stale derived value when source text becomes invalid or blank", () => {
    render(<Harness />);
    fireEvent.change(input("EC in"), { target: { value: "2" } });
    expect(input("PPM in (500 scale)")).toHaveValue("1000");

    fireEvent.change(input("EC in"), { target: { value: "abc" } });
    expect(input("EC in")).toHaveValue("abc");
    expect(input("PPM in (500 scale)")).toHaveValue("");

    fireEvent.change(input("EC in"), { target: { value: "" } });
    expect(input("PPM in (500 scale)")).toHaveValue("");
  });

  it("states the exact 500-scale formula and canonical save unit", () => {
    render(<Harness />);
    expect(screen.getByText(/PPM ÷ 500 = EC; EC × 500 = PPM/)).toBeInTheDocument();
    expect(screen.getByText(/Canonical EC is saved in mS\/cm/)).toBeInTheDocument();
  });
});
