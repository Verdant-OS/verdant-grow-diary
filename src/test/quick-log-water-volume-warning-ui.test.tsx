import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import QuickLogWateringForm from "@/components/QuickLogWateringForm";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import { confirmLargeWaterAmount } from "@/lib/quickLogWaterVolumeWarningRules";

const HIDDEN_CONTEXT = {
  visible: false,
  scope: "none" as const,
  fields: [],
  helper: "",
};

describe("Quick Log water volume warning UI", () => {
  it("shows Edit amount and Confirm amount once, then asks again after the amount changes", () => {
    const saves: string[] = [];
    function Harness() {
      const [value, setValue] = useState<QuickLogWateringFormState>(EMPTY_QUICKLOG_WATERING_FORM);
      const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
      const session = useRef({ inFlight: false, confirmedKey: null as string | null });
      return (
        <QuickLogWateringForm
          value={value}
          onChange={setValue}
          context={HIDDEN_CONTEXT}
          confirmedLargeWaterKey={confirmedKey}
          onConfirmLargeWater={(key) => {
            const next = confirmLargeWaterAmount(session.current, key);
            session.current = { inFlight: false, confirmedKey: next.confirmedKey };
            setConfirmedKey(next.confirmedKey);
            if (next.save) saves.push(key);
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10000" } });
    expect(screen.queryByTestId("qlv2-large-water-warning")).toBeNull();

    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10001" } });
    expect(screen.getByTestId("qlv2-large-water-warning")).toHaveTextContent("10001 ml");
    expect(screen.getByRole("button", { name: "Edit amount" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    expect(saves).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Volume (ml)"), { target: { value: "10002" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm amount" }));
    expect(saves).toHaveLength(2);
    expect(screen.getByTestId("qlv2-large-water-warning").textContent?.toLowerCase()).not.toMatch(
      /safe|recommend/,
    );
  });
});
