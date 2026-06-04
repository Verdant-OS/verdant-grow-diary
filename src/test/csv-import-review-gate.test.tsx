import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CsvPreviewReviewGate } from "@/components/CsvPreviewReviewGate";

function setup(props: Partial<{ hasHardBlockedRows: boolean; hasAcceptedRows: boolean }> = {}) {
  return render(
    <CsvPreviewReviewGate
      hasHardBlockedRows={props.hasHardBlockedRows ?? false}
      hasAcceptedRows={props.hasAcceptedRows ?? true}
    />,
  );
}

describe("CsvPreviewReviewGate (disabled)", () => {
  it("renders grow/tent/plant inputs and confirmation checkbox", () => {
    setup();
    expect(screen.getByTestId("csv-gate-grow-id")).toBeInTheDocument();
    expect(screen.getByTestId("csv-gate-tent-id")).toBeInTheDocument();
    expect(screen.getByTestId("csv-gate-plant-id")).toBeInTheDocument();
    expect(screen.getByTestId("csv-gate-confirm")).toBeInTheDocument();
  });

  it("save button stays disabled even when every check passes", () => {
    setup({ hasAcceptedRows: true, hasHardBlockedRows: false });
    fireEvent.change(screen.getByTestId("csv-gate-grow-id"), { target: { value: "g1" } });
    fireEvent.change(screen.getByTestId("csv-gate-tent-id"), { target: { value: "t1" } });
    fireEvent.click(screen.getByTestId("csv-gate-confirm"));
    const gate = screen.getByTestId("csv-preview-review-gate");
    expect(gate.getAttribute("data-gate-ready")).toBe("true");
    const btn = screen.getByTestId("csv-gate-save-button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("data-writes-enabled")).toBe("false");
  });

  it("reflects missing grow / missing tent / hard-blocked rows in gate state", () => {
    const { rerender } = render(
      <CsvPreviewReviewGate hasHardBlockedRows={false} hasAcceptedRows={true} />,
    );
    expect(
      screen.getByTestId("csv-preview-review-gate").getAttribute("data-gate-ready"),
    ).toBe("false");

    rerender(<CsvPreviewReviewGate hasHardBlockedRows={true} hasAcceptedRows={true} />);
    expect(
      screen.getByTestId("csv-gate-check-no-blocks").getAttribute("data-ok"),
    ).toBe("false");

    rerender(<CsvPreviewReviewGate hasHardBlockedRows={false} hasAcceptedRows={false} />);
    expect(
      screen.getByTestId("csv-gate-check-accepted").getAttribute("data-ok"),
    ).toBe("false");
  });

  it("confirmation copy and future-flow copy are present", () => {
    setup();
    expect(
      screen.getByText(/I confirm this is my data and understand this import is not live data\./),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Import requires review and will be enabled in a separate approval-required flow\./)
        .length,
    ).toBeGreaterThan(0);
  });
});
