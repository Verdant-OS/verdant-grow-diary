/**
 * Unit coverage for NumberField minExclusive (#2256 / light planner watts mode).
 * Integration behavior lives in light-calculator-watts-mode-zero.test.tsx.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NumberField from "@/components/grow-help/NumberField";

function MinExclusiveHarness() {
  const [value, setValue] = useState<number | null>(0);
  return (
    <NumberField
      id="wall-draw"
      label="Actual wall draw per fixture"
      value={value}
      onChange={setValue}
      min={0}
      max={100000}
      step={1}
      minExclusive
      required
    />
  );
}

function InclusiveZeroMinHarness() {
  const [value, setValue] = useState<number | null>(0);
  return (
    <NumberField
      id="optional-watts"
      label="Actual wall draw per fixture"
      value={value}
      onChange={setValue}
      min={0}
      max={100000}
      step={1}
      required={false}
    />
  );
}

describe("NumberField minExclusive (#2256)", () => {
  it("rejects a value equal to min", () => {
    render(<MinExclusiveHarness />);
    const input = screen.getByLabelText("Actual wall draw per fixture");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Actual wall draw per fixture must be greater than 0.",
    );
  });

  it("accepts 0.001, just above min", () => {
    render(<MinExclusiveHarness />);
    const input = screen.getByLabelText("Actual wall draw per fixture");

    fireEvent.change(input, { target: { value: "0.001" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps min inclusive when minExclusive is off", () => {
    render(<InclusiveZeroMinHarness />);
    const input = screen.getByLabelText("Actual wall draw per fixture");

    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
