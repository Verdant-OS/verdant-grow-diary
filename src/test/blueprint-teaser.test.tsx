/**
 * BlueprintTeaser presenter — renders the locked-state SOP band preview with a
 * conversion framing, and a "set the stage" fallback when there is nothing to
 * preview. Pure presenter; no gating, no data.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlueprintTeaser } from "@/components/BlueprintTeaser";
import { buildBlueprintTeaserViewModel } from "@/lib/blueprintTeaserViewModel";

describe("BlueprintTeaser", () => {
  it("renders the stage's target bands with an upgrade framing", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: "veg", isDay: true });
    render(<BlueprintTeaser vm={vm} />);

    expect(screen.getByTestId("pro-blueprint-teaser")).toBeTruthy();
    expect(screen.getByTestId("pro-blueprint-teaser-stage").textContent).toContain("Veg targets");
    // Conversion framing names the paid scoring value.
    expect(screen.getByTestId("pro-blueprint-teaser").textContent).toMatch(/Craft scores against/i);

    // A concrete target row for the grower's stage (real SOP numbers).
    const tempRow = screen.getByTestId("pro-blueprint-teaser-row-tempC");
    expect(tempRow.textContent).toMatch(/Temperature/);
    expect(tempRow.textContent).toMatch(/24–27 °C/);
    // Humidity band renders too.
    expect(screen.getByTestId("pro-blueprint-teaser-row-rh").textContent).toMatch(/60–70 %/);
  });

  it("shows a set-the-stage prompt when there is nothing to preview", () => {
    const vm = buildBlueprintTeaserViewModel({ stage: null });
    render(<BlueprintTeaser vm={vm} />);

    expect(screen.getByTestId("pro-blueprint-teaser-stage-unknown")).toBeTruthy();
    expect(screen.queryByTestId("pro-blueprint-teaser-rows")).toBeNull();
    expect(screen.getByTestId("pro-blueprint-teaser-stage-unknown").textContent).toMatch(
      /set this plant/i,
    );
  });
});
