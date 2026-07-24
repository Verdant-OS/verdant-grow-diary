/**
 * Autoflower/photoperiod comparability across the pheno surfaces
 * (Steps 4 + 6 of the locked 2026-07-21 plan).
 *
 * Pure layer: mixed / unknown types (or stages beyond the locked tolerance)
 * mark the board and fight payloads not comparable, while the sorted values
 * stay on the payload as organization only. Presenter layer: a high-contrast
 * non-dismissible banner appears and rank / score-bar / leads visuals are
 * hidden — a soft badge with a clean ranked appearance is a failure.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildContenders, type ContenderInput } from "@/lib/phenoContendersViewModel";
import { buildFight } from "@/lib/phenoFightViewModel";
import PhenoContendersBoard from "@/components/PhenoContendersBoard";
import PhenoFightNight from "@/components/PhenoFightNight";
import { DEMO_CANDIDATES } from "@/lib/demo/phenoHuntDemoFixture";

const AXES = { nose: 8, resin: 7, structure: 6, yield: 6, breeding: 5 };

const contender = (
  id: number,
  plantType: string | null,
  stage: string | null = "flower",
  verdict: "keep" | "maybe" | "cull" = "maybe",
): ContenderInput => ({
  id,
  name: `Plant ${id}`,
  verdict,
  aroma: [],
  axes: { ...AXES, nose: AXES.nose - id },
  plantType,
  stage,
});

describe("buildContenders comparability", () => {
  it("uniform type + stage stays a comparable ranked board", () => {
    const b = buildContenders([contender(1, "photoperiod"), contender(2, "photoperiod")]);
    expect(b.comparability).toBe("comparable");
    expect(b.comparabilityReasons).toEqual([]);
  });

  it("mixed auto + photo is not_comparable with type_mismatch", () => {
    const b = buildContenders([contender(1, "autoflower"), contender(2, "photoperiod")]);
    expect(b.comparability).toBe("not_comparable");
    expect(b.comparabilityReasons).toEqual(["type_mismatch"]);
  });

  it("any unknown type is not_comparable with type_unknown", () => {
    const b = buildContenders([
      contender(1, "photoperiod"),
      contender(2, null),
      contender(3, "photoperiod"),
    ]);
    expect(b.comparability).toBe("not_comparable");
    expect(b.comparabilityReasons).toContain("type_unknown");
  });

  it("same type beyond the locked stage tolerance is stage_mismatch", () => {
    const b = buildContenders([
      contender(1, "photoperiod", "seedling"),
      contender(2, "photoperiod", "flower"),
    ]);
    expect(b.comparability).toBe("not_comparable");
    expect(b.comparabilityReasons).toEqual(["stage_mismatch"]);
  });

  it("culls do not poison comparability (they are off the board already)", () => {
    const b = buildContenders([
      contender(1, "photoperiod"),
      contender(2, null, "flower", "cull"),
    ]);
    expect(b.comparability).toBe("comparable");
  });

  it("rank/score/leader stay on the payload when not comparable (organizing only)", () => {
    const b = buildContenders([contender(1, "autoflower"), contender(2, "photoperiod")]);
    expect(b.contenders[0].rank).toBe(1);
    expect(b.contenders[0].score).toBeGreaterThan(0);
    expect(b.contenders.some((r) => r.axes.some((a) => a.leader))).toBe(true);
    // The payload itself carries the strike — presenters must honor it.
    expect(b.comparability).toBe("not_comparable");
  });

  it("rows carry the normalized type for presenter badges", () => {
    const b = buildContenders([contender(1, " AUTO "), contender(2, "junk-value")]);
    const types = b.contenders.map((r) => r.plantType).sort();
    expect(types).toEqual(["autoflower", "unknown"]);
  });
});

describe("buildFight comparability", () => {
  it("mixed pair is not comparable and still has no winner key", () => {
    const f = buildFight(contender(1, "autoflower"), contender(2, "photoperiod"))!;
    expect(f.comparability.comparable).toBe(false);
    expect(f.comparability.reason).toBe("type_mismatch");
    expect("winner" in f).toBe(false);
  });

  it("unknown side takes precedence as type_unknown", () => {
    const f = buildFight(contender(1, null), contender(2, "photoperiod"))!;
    expect(f.comparability.reason).toBe("type_unknown");
  });

  it("same-type adjacent-stage pair is comparable", () => {
    const f = buildFight(
      contender(1, "autoflower", "veg"),
      contender(2, "autoflower", "flower"),
    )!;
    expect(f.comparability.comparable).toBe(true);
  });
});

describe("PhenoContendersBoard presenter honesty", () => {
  const mixed = [contender(1, "autoflower"), contender(2, "photoperiod")];
  const uniform = [contender(1, "photoperiod"), contender(2, "photoperiod")];

  it("not-comparable board: banner shown; leads, score bar hidden; badges persistent", () => {
    render(<PhenoContendersBoard board={buildContenders(mixed)} />);
    const banner = screen.getByTestId("pheno-comparability-banner");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toMatch(/Not comparable — ranking hidden/);
    // No dismiss control — the banner is not soft.
    expect(banner.querySelector("button")).toBeNull();
    // Leads markers are gone (would be a cross-type comparison).
    expect(screen.queryAllByLabelText("leads this trait")).toEqual([]);
    // Composite score replaced by an explicit "hidden" cell per row.
    expect(screen.getByTestId("pheno-contenders-score-hidden-1")).toBeTruthy();
    expect(screen.getByTestId("pheno-contenders-score-hidden-2")).toBeTruthy();
    // Persistent type badges on every row.
    expect(screen.getByTestId("pheno-contenders-type-1").textContent).toBe("Auto");
    expect(screen.getByTestId("pheno-contenders-type-2").textContent).toBe("Photo");
  });

  it("unknown type renders the Type unknown badge — never a silent default", () => {
    render(<PhenoContendersBoard board={buildContenders([contender(1, null), contender(2, "photoperiod")])} />);
    expect(screen.getByTestId("pheno-contenders-type-1").textContent).toBe("Type unknown");
    expect(screen.getByTestId("pheno-comparability-banner").textContent).toMatch(
      /Plant type is unknown/,
    );
  });

  it("comparable board: no banner, leads and scores render as before", () => {
    render(<PhenoContendersBoard board={buildContenders(uniform)} />);
    expect(screen.queryByTestId("pheno-comparability-banner")).toBeNull();
    expect(screen.queryAllByLabelText("leads this trait").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("pheno-contenders-score-hidden-1")).toBeNull();
  });
});

describe("PhenoFightNight presenter honesty", () => {
  it("mixed pair: banner + tally hidden + type badges on both corners", () => {
    render(
      <PhenoFightNight
        pool={[contender(1, "autoflower"), contender(2, "photoperiod")]}
        defaultAId={1}
        defaultBId={2}
      />,
    );
    expect(screen.getByTestId("pheno-comparability-banner")).toBeTruthy();
    expect(screen.queryByTestId("pheno-fight-tally")).toBeNull();
    expect(screen.getByTestId("pheno-fight-tally-hidden")).toBeTruthy();
    expect(screen.getByTestId("pheno-fight-side-a-type").textContent).toBe("Auto");
    expect(screen.getByTestId("pheno-fight-side-b-type").textContent).toBe("Photo");
  });

  it("comparable pair keeps the tally and no banner", () => {
    render(
      <PhenoFightNight
        pool={[contender(1, "photoperiod"), contender(2, "photoperiod")]}
        defaultAId={1}
        defaultBId={2}
      />,
    );
    expect(screen.queryByTestId("pheno-comparability-banner")).toBeNull();
    expect(screen.getByTestId("pheno-fight-tally")).toBeTruthy();
  });
});

describe("demo pack stays comparable", () => {
  it("every demo candidate declares the same type and stage", () => {
    for (const c of DEMO_CANDIDATES) {
      expect(c.plantType).toBe("photoperiod");
      expect(c.stage).toBe("cure");
    }
  });
});
