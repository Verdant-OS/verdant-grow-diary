/**
 * AI Doctor Phase 1 — Plant Picker presenter tests.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AiDoctorPhase1PlantPicker,
  type AiDoctorPhase1PlantOption,
} from "@/components/AiDoctorPhase1PlantPicker";

const PLANTS: AiDoctorPhase1PlantOption[] = [
  { id: "plant-a", name: "Plant A", strain: "Strain A", stage: "veg", tent_name: "Tent 1" },
  { id: "plant-b", name: "Plant B", strain: "Strain B", stage: "flower", tent_name: "Tent 2" },
];

describe("AiDoctorPhase1PlantPicker", () => {
  it("renders plant name, strain, stage, and tent", () => {
    render(<AiDoctorPhase1PlantPicker plants={PLANTS} selectedPlantId={null} onSelect={() => {}} />);
    expect(screen.getByText("Plant A")).toBeTruthy();
    expect(screen.getByText(/Strain A/)).toBeTruthy();
    expect(screen.getByText(/veg/)).toBeTruthy();
    expect(screen.getByText(/Tent 1/)).toBeTruthy();
  });

  it("renders empty state when no plants", () => {
    render(<AiDoctorPhase1PlantPicker plants={[]} selectedPlantId={null} onSelect={() => {}} />);
    expect(screen.getByTestId("ai-doctor-phase1-plant-picker-empty")).toBeTruthy();
    expect(screen.getByText(/No plants available/)).toBeTruthy();
  });

  it("calls onSelect when a plant is clicked", () => {
    const onSelect = vi.fn();
    render(<AiDoctorPhase1PlantPicker plants={PLANTS} selectedPlantId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ai-doctor-phase1-plant-option-plant-b"));
    expect(onSelect).toHaveBeenCalledWith("plant-b");
  });

  it("marks the selected plant", () => {
    render(<AiDoctorPhase1PlantPicker plants={PLANTS} selectedPlantId="plant-a" onSelect={() => {}} />);
    expect(
      screen
        .getByTestId("ai-doctor-phase1-plant-option-plant-a")
        .getAttribute("data-selected"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("ai-doctor-phase1-plant-option-plant-b")
        .getAttribute("data-selected"),
    ).toBe("false");
  });
});

describe("static safety — AiDoctorPhase1PlantPicker", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../components/AiDoctorPhase1PlantPicker.tsx"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("contains no Supabase/fetch/model/write/device-control surface", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/openai|anthropic|gemini|ai-gateway/i);
    expect(SRC).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/alert.*\.(insert|update|upsert|delete)/i);
    expect(SRC).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
  });
});
