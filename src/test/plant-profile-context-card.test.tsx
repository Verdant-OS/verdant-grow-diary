import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PlantProfileContextCard from "@/components/PlantProfileContextCard";

describe("PlantProfileContextCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders known stage and strain", () => {
    render(<PlantProfileContextCard stage="Veg" strain="Blue Dream" />);
    expect(screen.getByText("Stage: Veg")).toBeInTheDocument();
    expect(screen.getByText("Strain: Blue Dream")).toBeInTheDocument();
  });

  it("renders missing medium and pot size copy", () => {
    render(<PlantProfileContextCard stage="Veg" />);
    expect(
      screen.getByText("Medium is not available on this plant profile yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pot size is not available on this plant profile yet."),
    ).toBeInTheDocument();
  });

  it("renders Add medium / Add pot size as disabled coming-soon controls", () => {
    render(<PlantProfileContextCard />);
    const addMedium = screen.getByTestId("plant-profile-context-add-medium");
    const addPot = screen.getByTestId("plant-profile-context-add-pot-size");
    expect(addMedium).toBeDisabled();
    expect(addMedium).toHaveTextContent(/coming soon/i);
    expect(addPot).toBeDisabled();
    expect(addPot).toHaveTextContent(/coming soon/i);
  });

  it("does not call fetch / storage / supabase on render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
      throw new Error("fetch should not be called");
    }) as never);
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    render(<PlantProfileContextCard stage="Veg" strain="X" />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
  });

  it("renders known medium and pot size when provided", () => {
    render(
      <PlantProfileContextCard
        stage="Flower"
        strain="BD"
        medium="coco"
        potSize="11 L"
      />,
    );
    expect(screen.getByText("Medium: coco")).toBeInTheDocument();
    expect(screen.getByText("Pot size: 11 L")).toBeInTheDocument();
    expect(
      screen.getByTestId("plant-profile-context-field-medium").getAttribute("data-known"),
    ).toBe("true");
    expect(
      screen.getByTestId("plant-profile-context-field-pot-size").getAttribute("data-known"),
    ).toBe("true");
  });

  it("does not infer medium/pot size from strain or freeform values", () => {
    render(
      <PlantProfileContextCard
        stage="Flower"
        strain="Coco 5gal organic super soil"
      />,
    );
    const medium = screen.getByTestId("plant-profile-context-field-medium");
    const pot = screen.getByTestId("plant-profile-context-field-pot-size");
    expect(medium.getAttribute("data-known")).toBe("false");
    expect(pot.getAttribute("data-known")).toBe("false");
  });
});

describe("PlantProfileContext static safety scan", () => {
  it("source files contain no persistence/write paths", () => {
    const files = [
      "src/lib/plantProfileContextViewModel.ts",
      "src/components/PlantProfileContextCard.tsx",
    ];
    const forbidden = [
      /supabase/i,
      /\.insert\s*\(/,
      /\.update\s*\(/,
      /\.upsert\s*\(/,
      /\.delete\s*\(/,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/i,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const pattern of forbidden) {
        expect(
          pattern.test(src),
          `${rel} must not contain ${pattern}`,
        ).toBe(false);
      }
    }
  });
});
