/**
 * Flattened-label regression guard for the Quick Log target panel.
 *
 * Fails if the presenter or view-model regresses to a single combined
 * ambiguous target string (e.g. "Grow · Tent · Plant · Strain"). The
 * grower must always see four separately labeled fields.
 *
 * Two independent checks:
 *   1. Structural: the presenter renders four data-testid values
 *      (grow / tent / plant / strain) with a distinct label + value
 *      element each.
 *   2. Source-level: neither the presenter nor the view-model builds a
 *      composite `${grow} · ${tent} · ${plant} · ${strain}` label.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import QuickLogTargetPanel from "@/components/QuickLogTargetPanel";
import { buildQuickLogTargetPanel } from "@/lib/quickLogTargetPanelViewModel";
import { scrubExecutableSource } from "./utils/scrubExecutableSource";

const FIXTURE = {
  plants: [
    { id: "p1", name: "Auto #1", strain: "Bruce Banner", tent_id: "t1", grow_id: "g1" },
  ],
  tents: [{ id: "t1", name: "Tent A", grow_id: "g1" }],
  grows: [{ id: "g1", name: "Summer Run 2026" }],
};

const REQUIRED_TESTIDS = [
  "qlv2-target-panel-grow-label",
  "qlv2-target-panel-grow-value",
  "qlv2-target-panel-tent-label",
  "qlv2-target-panel-tent-value",
  "qlv2-target-panel-plant-label",
  "qlv2-target-panel-plant-value",
  "qlv2-target-panel-strain-label",
  "qlv2-target-panel-strain-value",
];

describe("QuickLog target panel — flattened-label regression", () => {
  it("renders exactly one label + value element per Grow/Tent/Plant/Strain field", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: {
        ok: true,
        targetType: "plant",
        targetId: "p1",
        plantId: "p1",
        tentId: "t1",
        growId: "g1",
      },
      ...FIXTURE,
    });
    render(<QuickLogTargetPanel panel={panel} />);
    for (const id of REQUIRED_TESTIDS) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    // No rendered value string is a composite "a · b · c" flattened label.
    for (const suffix of ["grow", "tent", "plant", "strain"]) {
      const el = screen.getByTestId(`qlv2-target-panel-${suffix}-value`);
      expect(el.textContent ?? "").not.toMatch(/·/);
    }
  });

  const PRESENTER_PATH = path.resolve(
    __dirname,
    "../components/QuickLogTargetPanel.tsx",
  );
  const VIEW_MODEL_PATH = path.resolve(
    __dirname,
    "../lib/quickLogTargetPanelViewModel.ts",
  );

  it("presenter and view-model source do not build a combined '· ' target label", () => {
    for (const file of [PRESENTER_PATH, VIEW_MODEL_PATH]) {
      const raw = fs.readFileSync(file, "utf8");
      const scrubbed = scrubExecutableSource(raw);
      // A regression would concatenate fields with the "·" separator —
      // e.g. `${grow} · ${tent}` — in executable code.
      expect(scrubbed, `${file} must not concatenate target fields with '·'`).not.toMatch(
        /\$\{[^}]+\}\s*·/,
      );
      expect(scrubbed, `${file} must not concatenate target fields with '·'`).not.toMatch(
        /·\s*\$\{/,
      );
    }
  });

  it("presenter renders four distinct <dt> label elements", () => {
    const panel = buildQuickLogTargetPanel({
      resolved: {
        ok: true,
        targetType: "plant",
        targetId: "p1",
        plantId: "p1",
        tentId: "t1",
        growId: "g1",
      },
      ...FIXTURE,
    });
    const { container } = render(<QuickLogTargetPanel panel={panel} />);
    const dts = container.querySelectorAll("dt");
    expect(dts.length).toBe(4);
    const dds = container.querySelectorAll("dd");
    expect(dds.length).toBe(4);
    expect(Array.from(dts).map((n) => n.textContent)).toEqual([
      "Grow",
      "Tent",
      "Plant",
      "Strain",
    ]);
  });
});
