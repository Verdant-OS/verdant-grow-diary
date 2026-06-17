import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import QuickLogMaturityEvidenceFields from "@/components/QuickLogMaturityEvidenceFields";
import { EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM } from "@/lib/quickLogMaturityEvidenceRules";

describe("QuickLogMaturityEvidenceFields", () => {
  it("renders nothing when hidden", () => {
    render(
      <QuickLogMaturityEvidenceFields
        value={EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM}
        onChange={vi.fn()}
        visible={false}
      />,
    );

    expect(screen.queryByTestId("qlv2-maturity-evidence")).toBeNull();
  });

  it("renders advisory copy and percent fields when visible", () => {
    render(
      <QuickLogMaturityEvidenceFields
        value={EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM}
        onChange={vi.fn()}
        visible={true}
      />,
    );

    expect(screen.getByText("Maturity evidence")).toBeInTheDocument();
    expect(screen.getByText(/Evidence only — grower decides/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Clear %")).toBeInTheDocument();
    expect(screen.getByLabelText("Cloudy %")).toBeInTheDocument();
    expect(screen.getByLabelText("Amber %")).toBeInTheDocument();
    expect(screen.getByText(/Do not force totals to 100/i)).toBeInTheDocument();
  });

  it("emits updated field values without saving", () => {
    const onChange = vi.fn();
    render(
      <QuickLogMaturityEvidenceFields
        value={EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM}
        onChange={onChange}
        visible={true}
      />,
    );

    fireEvent.change(screen.getByLabelText("Cloudy %"), { target: { value: "65" } });

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM,
      cloudyPct: "65",
    });
  });

  it("disables inputs when disabled", () => {
    render(
      <QuickLogMaturityEvidenceFields
        value={EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM}
        onChange={vi.fn()}
        visible={true}
        disabled={true}
      />,
    );

    expect(screen.getByLabelText("Clear %")).toBeDisabled();
    expect(screen.getByLabelText("Grower note")).toBeDisabled();
  });
});
