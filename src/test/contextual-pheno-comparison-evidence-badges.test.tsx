/**
 * contextual-pheno-comparison-evidence-badges.test
 *
 * v0.4 regressions for:
 *  - per-plant evidence-summary badge row (present / missing / untrusted)
 *  - panel-level all-insufficient banner
 *  - mixed partial + untrusted layouts (2/3/4 plants) scanned for
 *    banned ranking / certainty / device-control wording
 *
 * Read-only. No fetch / Supabase / Edge / AI / Action Queue / device control.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import ContextualPhenoComparisonPanel from "@/components/ContextualPhenoComparisonPanel";
import {
  buildContextualPhenoComparisonView,
  type ContextualPhenoPlantInput,
} from "@/lib/contextualPhenoComparisonViewModel";
import {
  CONTEXTUAL_PHENO_COMPARISON_ALL_INSUFFICIENT_PLANT_INPUTS,
  CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS,
} from "@/test/fixtures/contextualPhenoComparisonFixtures";

const BANNED_TOKENS = [
  "healthy",
  "winner",
  "best pheno",
  "definitely",
  "guaranteed",
  "certain",
  "rank ",
  "ranking",
  "scoreboard",
  "automatically select",
  "auto select",
  "device command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "apply pesticide",
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderInputs(inputs: readonly ContextualPhenoPlantInput[]) {
  const view = buildContextualPhenoComparisonView(inputs);
  return { view, ...render(<ContextualPhenoComparisonPanel view={view} />) };
}

function badgeStates(card: HTMLElement): Array<[string, string, string]> {
  return Array.from(
    card.querySelectorAll<HTMLElement>("[data-evidence-type]"),
  ).map((el) => [
    el.getAttribute("data-evidence-type") ?? "",
    el.getAttribute("data-evidence-state") ?? "",
    (el.textContent ?? "").trim(),
  ]);
}

function getCard(plantId: string): HTMLElement {
  return screen.getByTestId(`contextual-pheno-comparison-plant-${plantId}`);
}

function plantCardLabels(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid^="contextual-pheno-comparison-plant-"][data-plant-label]',
    ),
  ).map((el) => el.getAttribute("data-plant-label") ?? "");
}

describe("v0.4 per-plant evidence-summary badges", () => {
  it("full-context plant: all present + no untrusted-evidence badge", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    const card = getCard("demo-empty-full");
    expect(badgeStates(card)).toEqual([
      ["logs", "present", "Logs present"],
      ["photos", "present", "Photos present"],
      ["watering", "present", "Watering present"],
      ["feeding", "present", "Feeding present"],
      ["sensors", "present", "Sensors present"],
      ["trusted-environment", "present", "Trusted environment present"],
    ]);
    expect(
      within(card).queryByTestId("plant-evidence-badge-untrusted-evidence"),
    ).toBeNull();
  });

  it("partial plant: missing feeding + has untrusted-evidence badge for stale source", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    const card = getCard("demo-empty-partial");
    const states = badgeStates(card);
    const map = Object.fromEntries(states.map(([t, s]) => [t, s]));
    expect(map.feeding).toBe("missing");
    expect(map.sensors).toBe("present"); // csv is trusted
    expect(map["trusted-environment"]).toBe("present");
    expect(map["untrusted-evidence"]).toBe("untrusted");
  });

  it("untrusted-only plant: sensors=untrusted, trusted-environment=missing, untrusted-evidence present", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    const card = getCard("demo-empty-untrusted");
    const states = badgeStates(card);
    const map = Object.fromEntries(states.map(([t, s]) => [t, s]));
    expect(map.sensors).toBe("untrusted");
    expect(map["trusted-environment"]).toBe("missing");
    expect(map["untrusted-evidence"]).toBe("untrusted");
    expect(map.logs).toBe("missing");
  });

  it("sparse plant: every basic badge missing, sensors=missing, no untrusted-evidence badge", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    const card = getCard("demo-empty-sparse");
    expect(badgeStates(card)).toEqual([
      ["logs", "present", "Logs present"],
      ["photos", "missing", "Photos missing"],
      ["watering", "missing", "Watering missing"],
      ["feeding", "missing", "Feeding missing"],
      ["sensors", "missing", "Sensors missing"],
      ["trusted-environment", "missing", "Trusted environment missing"],
    ]);
  });

  it("badge order is deterministic across plants (locked sequence)", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    const cards = document.querySelectorAll<HTMLElement>(
      '[data-testid^="contextual-pheno-comparison-plant-demo-empty-"]',
    );
    expect(cards.length).toBe(4);
    cards.forEach((card) => {
      const types = Array.from(
        card.querySelectorAll<HTMLElement>("[data-evidence-type]"),
      ).map((el) => el.getAttribute("data-evidence-type") ?? "");
      // First 6 are always in this locked order; optional untrusted-evidence
      // tail badge follows when applicable.
      expect(types.slice(0, 6)).toEqual([
        "logs",
        "photos",
        "watering",
        "feeding",
        "sensors",
        "trusted-environment",
      ]);
      if (types.length > 6) {
        expect(types[6]).toBe("untrusted-evidence");
      }
    });
  });

  it("badge labels never contain 'healthy' or ranking copy", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    document
      .querySelectorAll<HTMLElement>("[data-evidence-type]")
      .forEach((el) => {
        const txt = (el.textContent ?? "").toLowerCase();
        for (const banned of BANNED_TOKENS) {
          expect(txt.includes(banned), `badge contained: ${banned}`).toBe(false);
        }
      });
  });

  it("desktop+mobile: untrusted card badge snapshot is stable", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    const card = getCard("demo-empty-untrusted");
    expect(badgeStates(card)).toMatchInlineSnapshot(`
      [
        [
          "logs",
          "missing",
          "Logs missing",
        ],
        [
          "photos",
          "missing",
          "Photos missing",
        ],
        [
          "watering",
          "missing",
          "Watering missing",
        ],
        [
          "feeding",
          "missing",
          "Feeding missing",
        ],
        [
          "sensors",
          "untrusted",
          "Sensors untrusted",
        ],
        [
          "trusted-environment",
          "missing",
          "Trusted environment missing",
        ],
        [
          "untrusted-evidence",
          "untrusted",
          "Untrusted sensor evidence",
        ],
      ]
    `);
  });
});

describe("v0.4 panel-level all-insufficient banner", () => {
  it("appears when every plant is insufficient/untrusted", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_ALL_INSUFFICIENT_PLANT_INPUTS);
    const banner = screen.getByTestId(
      "contextual-pheno-comparison-all-insufficient",
    );
    expect(banner.textContent).toMatch(/all compared plants are missing important context/i);
    expect(banner.textContent).toMatch(/use this view as a checklist/i);
    expect(banner.textContent).toMatch(/not picking a phenotype/i);
    expect(banner.getAttribute("role")).toBe("note");
  });

  it("does NOT appear when at least one plant has trusted context (empty-state fixtures include Full)", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS);
    expect(
      screen.queryByTestId("contextual-pheno-comparison-all-insufficient"),
    ).toBeNull();
  });

  it("plant cards still render alongside the all-insufficient banner", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_ALL_INSUFFICIENT_PLANT_INPUTS);
    expect(plantCardLabels()).toEqual(["Sparse-A", "Untrusted-B"]);
    expect(
      screen.getByTestId("contextual-pheno-comparison-plant-grid"),
    ).toBeTruthy();
  });

  it("banner copy is non-ranking, non-AI, non-device-control", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_ALL_INSUFFICIENT_PLANT_INPUTS);
    const banner = screen.getByTestId(
      "contextual-pheno-comparison-all-insufficient",
    );
    const txt = (banner.textContent || "").toLowerCase();
    for (const banned of BANNED_TOKENS) {
      expect(txt.includes(banned), `banner contained: ${banned}`).toBe(false);
    }
  });

  it("desktop snapshot: top-level testid order includes the banner before the grid", () => {
    renderInputs(CONTEXTUAL_PHENO_COMPARISON_ALL_INSUFFICIENT_PLANT_INPUTS);
    const panel = screen.getByTestId("contextual-pheno-comparison-panel");
    const ids = Array.from(panel.children)
      .map((c) => (c as HTMLElement).getAttribute("data-testid"))
      .filter((v): v is string => Boolean(v));
    expect(ids).toMatchInlineSnapshot(`
      [
        "contextual-pheno-comparison-demo-banner",
        "contextual-pheno-comparison-caveat",
        "contextual-pheno-comparison-plant-count",
        "contextual-pheno-comparison-all-insufficient",
        "contextual-pheno-comparison-plant-grid",
        "contextual-pheno-comparison-source-summary",
      ]
    `);
  });
});

describe("v0.4 mixed partial+untrusted layouts — banned word scan", () => {
  const ALL = CONTEXTUAL_PHENO_COMPARISON_EMPTY_STATE_PLANT_INPUTS;
  const layouts: Array<{ name: string; inputs: readonly ContextualPhenoPlantInput[] }> = [
    {
      name: "2 plants (partial + untrusted)",
      inputs: [ALL[1], ALL[3]],
    },
    {
      name: "3 plants (full + partial + untrusted)",
      inputs: [ALL[0], ALL[1], ALL[3]],
    },
    {
      name: "4 plants (full + partial + sparse + untrusted)",
      inputs: ALL,
    },
  ];

  for (const layout of layouts) {
    describe(layout.name, () => {
      it("renders demo banner and caveat", () => {
        renderInputs(layout.inputs);
        expect(
          screen.getByTestId("contextual-pheno-comparison-demo-banner")
            .textContent,
        ).toMatch(/demo comparison data/i);
        expect(
          screen.getByTestId("contextual-pheno-comparison-caveat").textContent,
        ).toMatch(/does not pick a phenotype/i);
      });

      it("contains no banned wording anywhere in panel text", () => {
        const { container } = renderInputs(layout.inputs);
        const txt = (container.textContent || "").toLowerCase();
        for (const banned of BANNED_TOKENS) {
          expect(txt.includes(banned), `${layout.name} contained: ${banned}`)
            .toBe(false);
        }
      });

      it("plant order is deterministic (alpha-by-label)", () => {
        renderInputs(layout.inputs);
        const labels = plantCardLabels();
        const sorted = [...labels].sort((a, b) => a.localeCompare(b));
        expect(labels).toEqual(sorted);
      });

      it("does not call fetch or expose functions.invoke", () => {
        const fetchSpy = vi
          .spyOn(globalThis, "fetch" as never)
          .mockImplementation(() => {
            throw new Error("fetch must not be called");
          });
        const { container } = renderInputs(layout.inputs);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(container.innerHTML).not.toMatch(/functions\.invoke/i);
      });
    });
  }
});
