/**
 * QA 2026-09-24 regressions:
 *  - BUG-012: tent size accepted "-999999x0".
 *  - BUG-017: raw internal tokens shown to growers (`ml_per_l` in the Feed
 *    unit field), and "Snapshot quality: Usable current reading" while
 *    RH 101 was blocking the manual-reading save.
 *    (The AI Doctor readiness `status:/reason:` tokens are covered in
 *    plant-detail-ai-doctor-readiness-live-caller.test.tsx.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import {
  TENT_SIZE_INVALID_MESSAGE,
  TENT_SIZE_TOO_LONG_MESSAGE,
  buildTentUpdatePayload,
  isTentUpdatePayloadValid,
  tentSizeValidationMessage,
} from "@/lib/tentManagementRules";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  FEEDING_FORM_DEFAULT_UNIT,
  feedingProductUnitDisplay,
  feedingProductUnitFromInput,
} from "@/lib/quickLogFeedingFormViewModel";
import QuickLogFeedingForm from "@/components/QuickLogFeedingForm";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";

vi.mock("@/lib/growRepo", () => ({
  insertSensorReading: vi.fn().mockResolvedValue(undefined),
  insertSensorReadingsBatch: vi.fn().mockResolvedValue(undefined),
}));

describe("tent size validation (BUG-012)", () => {
  it.each([
    "-999999x0",
    "0x0",
    "4x0",
    "4 x -4",
    "−4x4",
    "5000x5000",
    "4x4x0",
    // A minus right after the "x" separator is still a negative dimension.
    "4x-4",
    "4X-4",
    "4x −4",
    "4 X-4 ft",
    "120x-120 cm",
  ])("rejects %s", (size) => {
    expect(tentSizeValidationMessage(size)).toBe(TENT_SIZE_INVALID_MESSAGE);
  });

  it.each([
    "",
    "   ",
    "4x4",
    "2x4 ft",
    "120x120 cm",
    "5' x 5'",
    "4 x 4 x 6.5",
    "1.2 x 1.2 m",
    "small closet",
    "2-3 ft",
  ])("accepts %s", (size) => {
    expect(tentSizeValidationMessage(size)).toBeNull();
  });

  it("rejects overlong sizes and invalidates the edit payload", () => {
    expect(tentSizeValidationMessage("4x4 ".repeat(20))).toBe(TENT_SIZE_TOO_LONG_MESSAGE);
    expect(tentSizeValidationMessage(null)).toBeNull();
    const payload = buildTentUpdatePayload({ name: "Tent", size: "-999999x0" });
    expect(isTentUpdatePayloadValid(payload)).toBe(false);
    expect(isTentUpdatePayloadValid(buildTentUpdatePayload({ name: "Tent", size: "4x4" }))).toBe(
      true,
    );
  });

  it("both tent dialogs check the size before saving", () => {
    // @source-scan-justified: proves each dialog calls the shared rule; the
    // dialogs need a full auth/grow harness to drive end to end.
    for (const path of [
      "src/components/CreateTentDialog.tsx",
      "src/components/EditTentDialog.tsx",
    ]) {
      const src = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(src).toMatch(/tentSizeValidationMessage\((form|payload)\.size\)/);
    }
  });
});

describe("Feed product unit shows mL/L, stores ml_per_l (BUG-017)", () => {
  it("maps the canonical token for display and back from typed text", () => {
    expect(feedingProductUnitDisplay("ml_per_l")).toBe("mL/L");
    expect(feedingProductUnitDisplay("g/L")).toBe("g/L");
    expect(feedingProductUnitDisplay(null)).toBe("");
    expect(feedingProductUnitFromInput("mL/L")).toBe(FEEDING_FORM_DEFAULT_UNIT);
    expect(feedingProductUnitFromInput(" ml / l ")).toBe(FEEDING_FORM_DEFAULT_UNIT);
    expect(feedingProductUnitFromInput("tsp/gal")).toBe("tsp/gal");
  });

  it("the Feed form never shows the raw token and keeps it in state", () => {
    const onChange = vi.fn();
    render(<QuickLogFeedingForm value={EMPTY_QUICKLOG_FEEDING_FORM} onChange={onChange} />);
    const unit = screen.getByLabelText("Product 1 unit") as HTMLInputElement;
    expect(unit.value).toBe("mL/L");
    expect(screen.queryByDisplayValue("ml_per_l")).toBeNull();
    fireEvent.change(unit, { target: { value: "mL/L" } });
    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next?.products?.[0]?.unit ?? FEEDING_FORM_DEFAULT_UNIT).toBe(FEEDING_FORM_DEFAULT_UNIT);
  });
});

describe("manual reading quality never says usable while a value blocks the save (BUG-017)", () => {
  function renderCard() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const TENT_ID = "11111111-1111-4111-8111-111111111111";
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ManualSensorReadingCard
            tents={[{ id: TENT_ID, name: "Veg Tent" }]}
            defaultTentId={TENT_ID}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("flags RH 101 as invalid instead of grading the remaining metrics usable", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "101" } });
    const quality = screen.getByTestId("manual-snapshot-quality");
    expect(quality.getAttribute("data-quality")).not.toBe("usable");
    expect(within(quality).queryByText("Usable current reading")).not.toBeInTheDocument();
    expect(within(quality).getByText(/Humidity outside 0–100%/i)).toBeInTheDocument();
  });

  it("still grades a valid entry usable", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "55" } });
    expect(screen.getByTestId("manual-snapshot-quality").getAttribute("data-quality")).toBe(
      "usable",
    );
  });
});
