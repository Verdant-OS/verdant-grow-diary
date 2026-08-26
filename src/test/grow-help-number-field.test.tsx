import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NumberField from "@/components/grow-help/NumberField";

function ClearToMissingHarness() {
  const [value, setValue] = useState<number | null>(1);
  return (
    <NumberField
      id="quantity"
      label="Fixture count"
      value={value}
      onChange={setValue}
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
    render(<ClearToMissingHarness />);
    const input = screen.getByLabelText("Fixture count") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue(null);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter fixture count.");

    fireEvent.change(input, { target: { value: "12" } });
    expect(input).toHaveValue(12);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps an explicitly cleared required value missing after blur (no default snap-back)", () => {
    render(<ClearToMissingHarness />);
    const input = screen.getByLabelText("Fixture count") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(input).toHaveValue(null);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter fixture count.");
  });

  it("shows an inline whole-number error when the formula requires an integer", () => {
    render(<ClearToMissingHarness />);
    fireEvent.change(screen.getByLabelText("Fixture count"), { target: { value: "1.5" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Fixture count must be a whole number.");
  });
});
