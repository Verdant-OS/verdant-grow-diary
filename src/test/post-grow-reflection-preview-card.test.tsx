import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PostGrowReflectionPreviewCard } from "@/components/PostGrowReflectionPreviewCard";
import {
  buildPostGrowReflectionPreviewViewModel,
} from "@/lib/ai/postGrowReflectionPreviewViewModel";
import {
  buildPostGrowReflectionDryRunScenarios,
  runPostGrowReflectionDryRunHarness,
} from "@/lib/ai/postGrowReflectionDryRunHarness";

describe("PostGrowReflectionPreviewCard", () => {
  it("renders operator preview labels and reflection sections", () => {
    const vm = buildPostGrowReflectionPreviewViewModel();
    render(<PostGrowReflectionPreviewCard viewModel={vm} />);

    expect(screen.getByText("Operator preview")).toBeTruthy();
    expect(screen.getByText("Dry-run fixture")).toBeTruthy();
    expect(screen.getByText("Validated output")).toBeTruthy();
    expect(screen.getByText("Not saved")).toBeTruthy();
    expect(screen.getByText("No live AI call")).toBeTruthy();

    expect(screen.getByText("Confidence: High")).toBeTruthy();

    expect(screen.getByText("Executive reflection")).toBeTruthy();
    expect(screen.getByText("Key wins")).toBeTruthy();
    expect(screen.getByText("Repeat next run")).toBeTruthy();
    expect(screen.getByText("Adjust or avoid")).toBeTruthy();
    expect(screen.getByText("Post-harvest specific insights")).toBeTruthy();
    expect(screen.getByText("Pheno / strain notes")).toBeTruthy();
    expect(screen.getByText("Low-risk experiments")).toBeTruthy();
    expect(screen.getByText("Gaps")).toBeTruthy();

    expect(screen.getByText("Validation options")).toBeTruthy();
    expect(screen.getByText(/sensorCoveragePct=/)).toBeTruthy();
  });

  it("renders empty state safely when no validated preview exists", () => {
    const rejectingScenarios = buildPostGrowReflectionDryRunScenarios().filter(
      (s) => s.expectedStatus === "rejected",
    );
    const summary = runPostGrowReflectionDryRunHarness(rejectingScenarios);
    const vm = buildPostGrowReflectionPreviewViewModel({
      scenarios: rejectingScenarios,
      summary,
    });
    render(<PostGrowReflectionPreviewCard viewModel={vm} />);

    expect(
      screen.getByText(
        "No validated reflection preview is available. Review rejected scenarios before continuing.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Operator preview")).toBeTruthy();
    expect(screen.getByText("No live AI call")).toBeTruthy();
    expect(screen.queryByText("Confidence: High")).toBeNull();
    expect(screen.queryByText("Executive reflection")).toBeNull();
  });
});
