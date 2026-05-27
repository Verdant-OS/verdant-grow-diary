/**
 * Tests that CoachContextSufficiencyPanel harmonizes its copy with the
 * Structured AI Doctor confidence rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import CoachContextSufficiencyPanel from "@/components/CoachContextSufficiencyPanel";
import {
  CONFIDENCE_CEILING_CAPS,
  CONFIDENCE_LIMITED_COPY,
} from "@/lib/aiDoctorConfidenceRules";
import type { AiContextSufficiencyResult } from "@/lib/aiContextSufficiencyRules";

const ROOT = resolve(__dirname, "../..");
const PANEL_SRC = readFileSync(
  resolve(ROOT, "src/components/CoachContextSufficiencyPanel.tsx"),
  "utf8",
);

function result(
  ceiling: AiContextSufficiencyResult["confidenceCeiling"],
  over: Partial<AiContextSufficiencyResult> = {},
): AiContextSufficiencyResult {
  return {
    sufficiency: ceiling === "high" ? "sufficient" : "insufficient",
    confidenceCeiling: ceiling,
    missing: [],
    warnings: [],
    trustedForAi: ceiling === "high",
    ...over,
  } as AiContextSufficiencyResult;
}

describe("CoachContextSufficiencyPanel — harmonized confidence copy", () => {
  it("reuses the shared CONFIDENCE_LIMITED_COPY constant from aiDoctorConfidenceRules", () => {
    expect(PANEL_SRC).toMatch(
      /from\s+["']@\/lib\/aiDoctorConfidenceRules["']/,
    );
    expect(PANEL_SRC).toMatch(/CONFIDENCE_LIMITED_COPY/);
    expect(PANEL_SRC).toMatch(/CONFIDENCE_CEILING_CAPS/);
  });

  it("renders limited-confidence copy for low ceiling", () => {
    render(<CoachContextSufficiencyPanel result={result("low")} />);
    expect(
      screen.getByTestId("coach-context-confidence-limited-copy").textContent,
    ).toBe(CONFIDENCE_LIMITED_COPY);
    const badge = screen.getByTestId("coach-context-confidence-ceiling");
    expect(badge.getAttribute("data-ceiling-pct")).toBe(
      String(Math.round(CONFIDENCE_CEILING_CAPS.low * 100)),
    );
    expect(badge.textContent).toMatch(/30%/);
  });

  it("renders limited-confidence copy for medium ceiling", () => {
    render(<CoachContextSufficiencyPanel result={result("medium")} />);
    expect(
      screen.getByTestId("coach-context-confidence-limited-copy").textContent,
    ).toBe(CONFIDENCE_LIMITED_COPY);
    expect(
      screen.getByTestId("coach-context-confidence-ceiling").textContent,
    ).toMatch(/60%/);
  });

  it("does not imply limitation for high ceiling", () => {
    render(
      <CoachContextSufficiencyPanel
        result={result("high", {
          sufficiency: "sufficient",
          trustedForAi: true,
        })}
      />,
    );
    expect(
      screen.queryByTestId("coach-context-confidence-limited-copy"),
    ).toBeNull();
    const badge = screen.getByTestId("coach-context-confidence-ceiling");
    expect(badge.getAttribute("data-ceiling-pct")).toBe("100");
    expect(badge.textContent).toMatch(/100%/);
  });

  it("keeps existing missing/warning labels intact", () => {
    render(
      <CoachContextSufficiencyPanel
        result={result("low", {
          missing: ["plant-stage"],
          warnings: ["sensor-source:demo"],
        })}
      />,
    );
    expect(screen.getByTestId("coach-context-missing").textContent).toMatch(
      /plant stage/i,
    );
    expect(screen.getByTestId("coach-context-warnings").textContent).toMatch(
      /demo\/mock/i,
    );
  });
});

describe("Static safety", () => {
  it("panel does not introduce automation, device-control, queue, or service_role surfaces", () => {
    expect(PANEL_SRC).not.toMatch(/service_role/i);
    expect(PANEL_SRC).not.toMatch(/action_queue/i);
    expect(PANEL_SRC).not.toMatch(
      /mqtt|home[-\s]?assistant|relay|smart\s?plug|auto[-\s]?(execute|run)/i,
    );
  });
});
