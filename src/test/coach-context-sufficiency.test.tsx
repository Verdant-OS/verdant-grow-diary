/**
 * Tests for CoachContextSufficiencyPanel + Coach page wiring of AI context
 * sufficiency warnings.
 *
 * - Pure render tests against the presenter using crafted results from the
 *   pure rule helper.
 * - Static contract tests for src/pages/Coach.tsx wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import CoachContextSufficiencyPanel from "@/components/CoachContextSufficiencyPanel";
import {
  evaluateAiContextSufficiency,
  type AiContextInput,
} from "@/lib/aiContextSufficiencyRules";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const PANEL = readFileSync(
  resolve(ROOT, "src/components/CoachContextSufficiencyPanel.tsx"),
  "utf8",
);

const NOW = 1_700_000_000_000;
const recent = NOW - 60 * 60 * 1000;

const baseReal = (over: Partial<AiContextInput> = {}): AiContextInput => ({
  activeGrow: { id: "grow-1" },
  plants: [{ id: "p1", stage: "veg", strain: "Blue Dream", medium: "soil" }],
  recentDiaryEntries: [{ at: recent, type: "note" }],
  recentWateringOrFeeding: [{ at: recent, type: "water" }],
  recentSensorReadings: [
    { at: recent, temp: 24, rh: 55, vpd: 1.0, ph: 6.2, ec: 1.4 },
  ],
  hasPhoto: true,
  sensorMeta: { dataSource: "supabase", isDemoData: false },
  contextMeta: { dataSource: "supabase", isDemoData: false },
  questionKind: "general",
  now: NOW,
  ...over,
});

describe("CoachContextSufficiencyPanel (presenter)", () => {
  it("renders sufficient state with high-confidence indicator", () => {
    const result = evaluateAiContextSufficiency(baseReal());
    render(<CoachContextSufficiencyPanel result={result} />);
    const p = screen.getByTestId("coach-context-panel");
    expect(p.getAttribute("data-sufficiency")).toBe("sufficient");
    expect(p.getAttribute("data-ceiling")).toBe("high");
    expect(p.getAttribute("data-trusted")).toBe("true");
  });

  it("renders limited/insufficient warning when context is missing", () => {
    const result = evaluateAiContextSufficiency(baseReal({ plants: [] }));
    render(<CoachContextSufficiencyPanel result={result} />);
    const p = screen.getByTestId("coach-context-panel");
    expect(p.getAttribute("data-sufficiency")).toBe("insufficient");
    expect(p.getAttribute("data-ceiling")).toBe("low");
    expect(p).toHaveTextContent(/limited grow context/i);
  });

  it("lists missing context items by friendly label", () => {
    const result = evaluateAiContextSufficiency(
      baseReal({
        questionKind: "visual-diagnosis",
        hasPhoto: false,
        plants: [{ id: "p1", stage: null, strain: null, medium: null }],
      }),
    );
    render(<CoachContextSufficiencyPanel result={result} />);
    const missing = screen.getByTestId("coach-context-missing");
    expect(missing).toHaveTextContent(/plant stage/i);
    expect(missing).toHaveTextContent(/plant strain/i);
    expect(missing).toHaveTextContent(/growing medium/i);
    expect(missing).toHaveTextContent(/photo/i);
  });

  it("does not treat demo/mock sensor data as high-confidence context", () => {
    const result = evaluateAiContextSufficiency(
      baseReal({ sensorMeta: { dataSource: "mock", isDemoData: true } }),
    );
    render(<CoachContextSufficiencyPanel result={result} />);
    const p = screen.getByTestId("coach-context-panel");
    expect(p.getAttribute("data-ceiling")).toBe("low");
    expect(p.getAttribute("data-trusted")).toBe("false");
    expect(screen.getByTestId("coach-context-warnings")).toHaveTextContent(
      /demo\/mock/i,
    );
  });

  it("shows stale-sensor warning and caps ceiling below high", () => {
    const result = evaluateAiContextSufficiency(
      baseReal({
        recentSensorReadings: [
          { at: NOW - 999_999_999, temp: 24, rh: 55, vpd: 1 },
        ],
      }),
    );
    render(<CoachContextSufficiencyPanel result={result} />);
    const p = screen.getByTestId("coach-context-panel");
    expect(p.getAttribute("data-ceiling")).not.toBe("high");
    expect(screen.getByTestId("coach-context-warnings")).toHaveTextContent(
      /stale/i,
    );
  });

  it("displays ceiling badge using friendly label", () => {
    const result = evaluateAiContextSufficiency(baseReal({ plants: [] }));
    render(<CoachContextSufficiencyPanel result={result} />);
    expect(
      screen
        .getByTestId("coach-context-confidence-ceiling")
        .getAttribute("data-label"),
    ).toBe("low");
  });
});

describe("Coach page wiring", () => {
  it("imports the AI context sufficiency helper and presenter panel", () => {
    expect(COACH).toMatch(/from\s+["']@\/lib\/aiContextSufficiencyRules["']/);
    expect(COACH).toMatch(
      /from\s+["']@\/components\/CoachContextSufficiencyPanel["']/,
    );
    expect(COACH).toMatch(/<CoachContextSufficiencyPanel/);
  });

  it("evaluates sufficiency before render via the pure helper", () => {
    expect(COACH).toMatch(/evaluateAiContextSufficiency\s*\(/);
  });

  it("reads classification metadata via getGrowDataMeta", () => {
    expect(COACH).toMatch(/getGrowDataMeta/);
  });

  it("still allows submission — does not introduce a hard block on the ask buttons based on sufficiency", () => {
    // The two ask buttons must not be disabled by a sufficiency.* check.
    expect(COACH).not.toMatch(/disabled=\{[^}]*contextSufficiency[^}]*\}/);
    expect(COACH).not.toMatch(/disabled=\{[^}]*sufficiency[^}]*\}/);
  });

  it("caps displayed analysis confidence at the sufficiency ceiling", () => {
    expect(COACH).toMatch(/confidenceCeiling/);
    expect(COACH).toMatch(/limited-context guidance/);
  });

  it("Coach.tsx introduces no device-control surface or service_role", () => {
    expect(COACH).not.toMatch(/service_role/);
    expect(COACH).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator/i,
    );
  });
});

describe("CoachContextSufficiencyPanel source", () => {
  it("is presenter-only — no queries, writes, or classification", () => {
    expect(PANEL).not.toMatch(/supabase|service_role/);
    expect(PANEL).not.toMatch(/\.(insert|update|delete|upsert|select)\s*\(/);
    expect(PANEL).not.toMatch(/evaluateAiContextSufficiency\s*\(/);
  });
});
