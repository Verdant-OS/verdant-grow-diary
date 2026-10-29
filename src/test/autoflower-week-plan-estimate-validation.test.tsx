import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/lib/autoflowerWeekPlanAnalytics", () => ({ trackAutoflowerPlannerEvent: vi.fn() }));

import {
  AUTOFLOWER_INVALID_ESTIMATE_MESSAGE,
  isValidAutoflowerEstimateDraft,
} from "@/lib/autoflowerWeekPlanRules";
import AutoflowerWeekByWeek from "@/pages/AutoflowerWeekByWeek";

function renderPage() {
  return render(
    <MemoryRouter>
      <AutoflowerWeekByWeek />
    </MemoryRouter>,
  );
}

const estimate = () => screen.getByLabelText(/Breeder's estimated seed-to-harvest time/);
const setEstimate = (value: string) => fireEvent.change(estimate(), { target: { value } });
const exportButtons = () => [
  screen.getByRole("button", { name: "Download CSV" }),
  screen.getByRole("button", { name: "Copy plan" }),
  screen.getByRole("button", { name: "Print / Save as PDF" }),
];

describe("autoflower breeder estimate validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only whole weeks from 6 to 16", () => {
    expect(["6", "10", "16", " 12 "].map(isValidAutoflowerEstimateDraft)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(["", " ", "5", "17", "9.5", "abc", "-8"].map(isValidAutoflowerEstimateDraft)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it.each(["", "17", "9.5"])(
    "shows an error and pauses download, copy and print for %j",
    async (value) => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      const print = vi.fn();
      vi.stubGlobal("print", print);
      renderPage();
      setEstimate(value);

      expect(screen.getByRole("alert")).toHaveTextContent(AUTOFLOWER_INVALID_ESTIMATE_MESSAGE);
      expect(estimate()).toHaveAttribute("aria-invalid", "true");
      for (const button of exportButtons()) expect(button).toBeDisabled();

      await act(async () => {
        for (const button of exportButtons()) fireEvent.click(button);
      });
      expect(writeText).not.toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    },
  );

  it("re-enables exports and applies the estimate once it is valid again", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderPage();
    setEstimate("17");
    setEstimate("12");

    expect(screen.queryByText(AUTOFLOWER_INVALID_ESTIMATE_MESSAGE)).not.toBeInTheDocument();
    for (const button of exportButtons()) expect(button).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy plan" }));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("12");
  });
});
