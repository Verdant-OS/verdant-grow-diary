/**
 * ManualSensorReadingCard — entered VPD vs air-estimate comparison + conflict warning.
 *
 * Guarantees:
 *  - When temp+RH are entered without VPD, an air estimate renders side-by-side.
 *  - When entered VPD conflicts with derived VPD beyond the threshold,
 *    a conflict warning renders and the entered value is preserved.
 *  - Source stays "manual" — no relabeling to live.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderCard() {
  return render(
    <MemoryRouter>
      <ManualSensorReadingCard
        tents={[{ id: "11111111-1111-1111-1111-111111111111", name: "Tent A" }]}
      />
    </MemoryRouter>,
  );
}

describe("ManualSensorReadingCard VPD entered vs derived", () => {
  it("previews air VPD from temp+RH when VPD is omitted (MANUAL source preserved)", () => {
    const { getByLabelText, getByTestId, queryByTestId } = renderCard();
    // Air temp field is labelled "Air temp" and takes °F in this card.
    // 75°F ~ 24°C, 55% RH -> derived VPD ≈ 1.34 kPa.
    fireEvent.change(getByLabelText(/Air temp/i), { target: { value: "75" } });
    fireEvent.change(getByLabelText(/Humidity/i), { target: { value: "55" } });

    const comparison = getByTestId("manual-reading-vpd-comparison");
    expect(comparison).toBeInTheDocument();
    expect(comparison.getAttribute("data-vpd-conflict")).toBe("false");
    const derived = getByTestId("manual-reading-vpd-derived");
    expect(derived.textContent ?? "").toMatch(/kPa/);
    expect(derived.textContent ?? "").toMatch(/Air VPD estimate/);
    const entered = getByTestId("manual-reading-vpd-entered");
    // Grower did not type a VPD — entered slot renders em-dash placeholder.
    expect(entered.textContent ?? "").toMatch(/—/);
    expect(queryByTestId("manual-reading-vpd-conflict-warning")).toBeNull();
    expect(comparison.textContent ?? "").toMatch(/preview-only/i);
    expect(comparison.textContent ?? "").toMatch(/not saved as verified VPD/i);
    // Source truth stays manual — the comparison block never claims live.
    const label = comparison.getAttribute("data-vpd-conflict");
    expect(label).toBe("false");
  });

  it("warns when entered VPD disagrees with derived VPD by > threshold", () => {
    const { getByLabelText, getByTestId } = renderCard();
    fireEvent.change(getByLabelText(/Air temp/i), { target: { value: "75" } });
    fireEvent.change(getByLabelText(/Humidity/i), { target: { value: "55" } });
    // Enter a wildly inconsistent VPD.
    fireEvent.change(getByLabelText(/^VPD/i), { target: { value: "3.5" } });

    const comparison = getByTestId("manual-reading-vpd-comparison");
    expect(comparison.getAttribute("data-vpd-conflict")).toBe("true");
    const warn = getByTestId("manual-reading-vpd-conflict-warning");
    expect(warn.textContent ?? "").toMatch(/disagrees/i);
    // Entered value is preserved.
    const entered = getByTestId("manual-reading-vpd-entered");
    expect(entered.textContent ?? "").toMatch(/3\.50 kPa/);
  });
});
