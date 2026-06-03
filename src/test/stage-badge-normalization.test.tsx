/**
 * StageBadge display-normalization tests (#19).
 *
 * Verifies that StageBadge routes all incoming stage values through the
 * canonical growStages normalizer so aliases resolve to one consistent
 * label + style. Also guards against alias-map duplication inside JSX.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import StageBadge from "@/components/StageBadge";

const ROOT = resolve(__dirname, "../..");
const BADGE_SOURCE = readFileSync(
  resolve(ROOT, "src/components/StageBadge.tsx"),
  "utf8",
);

describe("StageBadge canonical rendering", () => {
  it('renders "Veg" for "veg"', () => {
    render(<StageBadge stage="veg" />);
    expect(screen.getByText("Veg")).toBeInTheDocument();
  });

  it('renders "Veg" for "Vegetation"', () => {
    render(<StageBadge stage="Vegetation" />);
    expect(screen.getByText("Veg")).toBeInTheDocument();
  });

  it('renders "Veg" for "Vegetative"', () => {
    render(<StageBadge stage="Vegetative" />);
    expect(screen.getByText("Veg")).toBeInTheDocument();
  });

  it('renders "Veg" for "VEG"', () => {
    render(<StageBadge stage="VEG" />);
    expect(screen.getByText("Veg")).toBeInTheDocument();
  });

  it('renders "Flower" for "flower"', () => {
    render(<StageBadge stage="flower" />);
    expect(screen.getByText("Flower")).toBeInTheDocument();
  });

  it('renders "Flower" for "Flowering"', () => {
    render(<StageBadge stage="Flowering" />);
    expect(screen.getByText("Flower")).toBeInTheDocument();
  });

  it('renders "Flower" for "bloom"', () => {
    render(<StageBadge stage="bloom" />);
    expect(screen.getByText("Flower")).toBeInTheDocument();
  });

  it('renders "Seedling" for "seedling"', () => {
    render(<StageBadge stage="seedling" />);
    expect(screen.getByText("Seedling")).toBeInTheDocument();
  });

  it('renders "Seedling" for "Seed"', () => {
    render(<StageBadge stage="Seed" />);
    expect(screen.getByText("Seedling")).toBeInTheDocument();
  });

  it('renders "Harvest" for "harvest"', () => {
    render(<StageBadge stage="harvest" />);
    expect(screen.getByText("Harvest")).toBeInTheDocument();
  });

  it('renders "Harvest" for "harvested"', () => {
    render(<StageBadge stage="harvested" />);
    expect(screen.getByText("Harvest")).toBeInTheDocument();
  });

  it("renders neutral fallback for unknown stage", () => {
    render(<StageBadge stage="mystery_stage" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it('renders "Unknown" for null', () => {
    render(<StageBadge stage={null} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it('renders "Unknown" for empty string', () => {
    render(<StageBadge stage="" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it('preserves legacy "Flush" label and style', () => {
    render(<StageBadge stage="flush" />);
    expect(screen.getByText("Flush")).toBeInTheDocument();
  });

  it('preserves legacy "Cure" label and style', () => {
    render(<StageBadge stage="cure" />);
    expect(screen.getByText("Cure")).toBeInTheDocument();
  });
});

describe("StageBadge static guardrails", () => {
  it("imports the canonical stage normalizer", () => {
    expect(BADGE_SOURCE).toContain('from "@/constants/growStages"');
    expect(BADGE_SOURCE).toContain("normalizeGrowStage");
  });

  it("does not duplicate an alias table inside JSX", () => {
    // The canonical alias map lives in growStages.ts; StageBadge should
    // only reference the normalizer, not inline its own aliases.
    expect(BADGE_SOURCE).not.toMatch(
      /vegetation\s*:|vegetate\s*:|blooming?\s*:/i,
    );
  });

  it("has no service_role, fetch, or automation surface", () => {
    expect(BADGE_SOURCE).not.toMatch(/service_role/i);
    expect(BADGE_SOURCE).not.toMatch(/\bfetch\(/);
    expect(BADGE_SOURCE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator/i,
    );
  });
});
