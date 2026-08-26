import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NumberField from "@/components/grow-help/NumberField";

function FallbackHarness() {
  const [value, setValue] = useState(1);
  return (
    <NumberField
      id="quantity"
      label="Fixture count"
      value={value}
      onChange={(next) => setValue(next ?? 1)}
      min={1}
      max={100}
      step={1}
      integer
      required
    />
  );
}

describe("Grow Help numeric input editing", () => {
  it("keeps a cleared required draft empty long enough to type a replacement", () => {
    render(<FallbackHarness />);
    const input = screen.getByLabelText("Fixture count") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter fixture count.");

    fireEvent.change(input, { target: { value: "12" } });
    expect(input).toHaveValue(12);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an inline whole-number error when the formula requires an integer", () => {
    render(<FallbackHarness />);
    fireEvent.change(screen.getByLabelText("Fixture count"), { target: { value: "1.5" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Fixture count must be a whole number.");
  });
});
