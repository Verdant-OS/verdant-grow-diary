import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import OperatorPostGrowReflectionDryRun from "@/pages/OperatorPostGrowReflectionDryRun";

describe("OperatorPostGrowReflectionDryRun", () => {
  it("renders the operator diagnostics summary", () => {
    render(<OperatorPostGrowReflectionDryRun />);

    expect(screen.getByRole("heading", { name: /Post-Grow Reflection Dry-Run/i })).toBeTruthy();
    expect(screen.getByText("Green")).toBeTruthy();
    expect(screen.getByText("/operator/post-grow-reflection-dry-run")).toBeTruthy();
    expect(screen.getByText("post-grow-reflection-dry-run-harness-v1")).toBeTruthy();
    expect(screen.getByText("All dry-run scenario expectations passed.")).toBeTruthy();
  });

  it("renders the expected metrics", () => {
    render(<OperatorPostGrowReflectionDryRun />);

    expect(screen.getByText("Scenarios")).toBeTruthy();
    expect(screen.getByText("Passed")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Validated")).toBeTruthy();
    expect(screen.getByText("Rejected")).toBeTruthy();
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
  });

  it("renders scenario rows and safety reason codes", () => {
    render(<OperatorPostGrowReflectionDryRun />);

    expect(screen.getByText("Rich photoperiod context with valid evidence-backed candidate")).toBeTruthy();
    expect(screen.getByText("Thin autoflower context rejects high-confidence candidate")).toBeTruthy();
    expect(screen.getByText("Rich context rejects unsafe equipment-control candidate")).toBeTruthy();
    expect(screen.getAllByText(/unsafe_language/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/high_confidence_with_thin_data/).length).toBeGreaterThan(0);
  });

  it("renders operator-only guardrails", () => {
    render(<OperatorPostGrowReflectionDryRun />);

    expect(screen.getByText("Operator guardrails")).toBeTruthy();
    expect(screen.getByText(/Operator-only route/i)).toBeTruthy();
    expect(screen.getByText(/Do not call a model or provider/i)).toBeTruthy();
  });
});
