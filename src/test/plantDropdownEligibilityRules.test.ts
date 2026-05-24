/**
 * Plant dropdown eligibility — pure rule tests + static guardrails for the
 * dropdown surfaces that were dropping legacy/orphan plants when their
 * `grow_id` was null but their `tent_id` belonged to a tent in the same
 * grow.
 *
 * Static checks ensure:
 *   - AddExistingPlantDialog no longer uses `.eq("grow_id", X)` as the
 *     sole filter (it now widens with tent-derived grow context).
 *   - PlantMergeDialog no longer passes the raw grow id to useGrowPlants
 *     for DB-level filtering (it filters client-side by effective grow).
 *   - No merge RPC / schema / sensor / pi-ingest / alert persistence /
 *     Action Queue / service_role / automation strings were introduced.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyPlantForDropdown,
  formatPlantDropdownHelper,
  getEffectivePlantGrowId,
  getPlantDropdownOptions,
  isInactiveDropdownPlant,
  isMergedDropdownPlant,
  shouldIncludePlantInDropdown,
  sortPlantDropdownOptions,
  summarizePlantDropdown,
  type PlantDropdownInput,
  type TentGrowRef,
} from "@/lib/plantDropdownEligibilityRules";

const GROW = "g-1";
const OTHER_GROW = "g-2";
const TENT_A = "t-a";
const TENT_B = "t-b";
const OTHER_TENT = "t-other";

const tents: TentGrowRef[] = [
  { id: TENT_A, grow_id: GROW },
  { id: TENT_B, grow_id: GROW },
  { id: OTHER_TENT, grow_id: OTHER_GROW },
];

function p(id: string, over: Partial<PlantDropdownInput> = {}): PlantDropdownInput {
  return { id, name: id, ...over };
}

describe("getEffectivePlantGrowId", () => {
  it("returns the raw grow_id when present", () => {
    expect(getEffectivePlantGrowId(p("a", { grow_id: GROW }), tents)).toBe(GROW);
  });

  it("falls back to the assigned tent's grow_id when grow_id is null", () => {
    expect(
      getEffectivePlantGrowId(
        p("a", { grow_id: null, tent_id: TENT_A }),
        tents,
      ),
    ).toBe(GROW);
  });

  it("returns null when neither grow_id nor tent grow context can resolve", () => {
    expect(getEffectivePlantGrowId(p("a"), tents)).toBeNull();
    expect(
      getEffectivePlantGrowId(p("a", { tent_id: "unknown-tent" }), tents),
    ).toBeNull();
  });
});

describe("inactive plant detection", () => {
  it("treats raw is_archived as inactive", () => {
    expect(isInactiveDropdownPlant(p("a", { is_archived: true }))).toBe(true);
  });
  it("treats RPC merge marker as inactive even without is_archived", () => {
    expect(
      isMergedDropdownPlant(
        p("a", { last_note: "Merged into 11111111-1111-1111-1111-111111111111" }),
      ),
    ).toBe(true);
    expect(
      isInactiveDropdownPlant(
        p("a", { last_note: "Merged into 11111111-1111-1111-1111-111111111111" }),
      ),
    ).toBe(true);
  });
});

describe("classifyPlantForDropdown — quick_log", () => {
  const opts = { context: "quick_log" as const, growId: GROW };

  it("includes plant whose grow_id matches", () => {
    expect(
      shouldIncludePlantInDropdown(p("a", { grow_id: GROW }), tents, opts),
    ).toBe(true);
  });

  it("includes plant with null grow_id when tent-derived grow matches (the bug)", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("a", { grow_id: null, tent_id: TENT_A }),
        tents,
        opts,
      ),
    ).toBe(true);
  });

  it("excludes cross-grow plants", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("a", { grow_id: OTHER_GROW }),
        tents,
        opts,
      ),
    ).toBe(false);
  });

  it("excludes archived plants by default", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("a", { grow_id: GROW, is_archived: true }),
        tents,
        opts,
      ),
    ).toBe(false);
  });

  it("disables plants missing grow context but keeps them visible with reason", () => {
    const decision = classifyPlantForDropdown(p("a"), tents, opts);
    expect(decision).not.toBeNull();
    expect(decision!.disabled).toBe(true);
    expect(decision!.reasonCode).toBe("missing_grow_context");
    expect(decision!.reason).toMatch(/repair from plant page/i);
  });
});

describe("classifyPlantForDropdown — merge_target", () => {
  const opts = {
    context: "merge_target" as const,
    growId: GROW,
    sourcePlantId: "source",
  };

  it("excludes the source plant", () => {
    expect(
      classifyPlantForDropdown(p("source", { grow_id: GROW }), tents, opts),
    ).toBeNull();
  });

  it("includes same-effective-grow targets even when raw grow_id is null", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("target", { grow_id: null, tent_id: TENT_B }),
        tents,
        opts,
      ),
    ).toBe(true);
  });

  it("excludes cross-grow targets", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("target", { grow_id: OTHER_GROW }),
        tents,
        opts,
      ),
    ).toBe(false);
  });

  it("excludes archived targets", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("target", { grow_id: GROW, is_archived: true }),
        tents,
        opts,
      ),
    ).toBe(false);
  });
});

describe("classifyPlantForDropdown — add_existing_to_tent", () => {
  const opts = {
    context: "add_existing_to_tent" as const,
    growId: GROW,
    tentId: TENT_A,
  };

  it("includes unassigned same-grow plants", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("a", { grow_id: GROW, tent_id: null }),
        tents,
        opts,
      ),
    ).toBe(true);
  });

  it("includes other-tent same-grow plants (eligible as a move)", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("a", { grow_id: GROW, tent_id: TENT_B }),
        tents,
        opts,
      ),
    ).toBe(true);
  });

  it("disables plants already in the current tent with a clear reason", () => {
    const decision = classifyPlantForDropdown(
      p("a", { grow_id: GROW, tent_id: TENT_A }),
      tents,
      opts,
    );
    expect(decision).not.toBeNull();
    expect(decision!.disabled).toBe(true);
    expect(decision!.reasonCode).toBe("already_in_tent");
  });

  it("includes plant with null grow_id when tent-derived grow matches (the bug)", () => {
    expect(
      shouldIncludePlantInDropdown(
        p("a", { grow_id: null, tent_id: TENT_B }),
        tents,
        opts,
      ),
    ).toBe(true);
  });
});

describe("logs_filter context", () => {
  const opts = { context: "logs_filter" as const, growId: GROW };
  it("includes archived plants but labels them", () => {
    const decision = classifyPlantForDropdown(
      p("a", { grow_id: GROW, is_archived: true }),
      tents,
      opts,
    );
    expect(decision).not.toBeNull();
    expect(decision!.eligible).toBe(true);
    expect(decision!.reasonCode).toBe("archived_or_merged");
  });
});

describe("getPlantDropdownOptions + sortPlantDropdownOptions", () => {
  it("is deterministic — same input produces same option order", () => {
    const plants = [
      p("c", { name: "Cherry", grow_id: GROW }),
      p("a", { name: "Apple", grow_id: GROW }),
      p("b", { name: "Banana", grow_id: GROW, is_archived: true }),
    ];
    const opts = { context: "quick_log" as const, growId: GROW };
    const first = getPlantDropdownOptions(plants, tents, opts).map((o) => o.plant.id);
    const second = getPlantDropdownOptions(plants, tents, opts).map((o) => o.plant.id);
    expect(first).toEqual(second);
    // Active plants only (archived hidden in quick_log).
    expect(first).toEqual(["a", "c"]);
  });

  it("places disabled options after eligible ones", () => {
    const plants = [
      p("already", { grow_id: GROW, tent_id: TENT_A }),
      p("free", { grow_id: GROW, tent_id: null, name: "Zebra" }),
    ];
    const opts = {
      context: "add_existing_to_tent" as const,
      growId: GROW,
      tentId: TENT_A,
    };
    const sorted = getPlantDropdownOptions(plants, tents, opts);
    expect(sorted.map((o) => o.plant.id)).toEqual(["free", "already"]);
    expect(sorted[1].disabled).toBe(true);
  });

  it("does not impose a hardcoded limit (regression: 2-of-3 bug)", () => {
    const plants = [
      p("a", { grow_id: GROW }),
      p("b", { grow_id: GROW }),
      p("c", { grow_id: null, tent_id: TENT_A }),
    ];
    const opts = { context: "quick_log" as const, growId: GROW };
    const visible = getPlantDropdownOptions(plants, tents, opts);
    expect(visible.map((o) => o.plant.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("summarizePlantDropdown + formatPlantDropdownHelper", () => {
  it("reports hidden archived count", () => {
    const plants = [
      p("a", { grow_id: GROW }),
      p("b", { grow_id: GROW, is_archived: true }),
    ];
    const s = summarizePlantDropdown(plants, tents, {
      context: "quick_log",
      growId: GROW,
    });
    expect(s.visible).toBe(1);
    expect(s.hiddenArchived).toBe(1);
    expect(formatPlantDropdownHelper(s, "My Grow")).toMatch(
      /1 archived\/merged hidden/i,
    );
  });

  it("reports missing grow context count", () => {
    const plants = [
      p("a", { grow_id: GROW }),
      p("b" /* no grow, no tent */),
    ];
    const s = summarizePlantDropdown(plants, tents, {
      context: "merge_target",
      growId: GROW,
      sourcePlantId: "a",
    });
    expect(s.visible).toBe(0);
    expect(s.hiddenSourcePlant).toBe(1);
    expect(s.hiddenMissingGrow).toBe(1);
    expect(formatPlantDropdownHelper(s)).toMatch(/missing grow context/i);
  });

  it("reports cross-grow hidden count without leaking other-grow names", () => {
    const plants = [
      p("a", { grow_id: GROW }),
      p("b", { grow_id: OTHER_GROW }),
    ];
    const s = summarizePlantDropdown(plants, tents, {
      context: "quick_log",
      growId: GROW,
    });
    expect(s.hiddenCrossGrow).toBe(1);
    expect(formatPlantDropdownHelper(s)).toMatch(/in another grow/i);
  });
});

// ---------------------------------------------------------------------------
// Static safety: dropdown surfaces use effective grow context and do not
// regress to a bare `.eq("grow_id", X)` filter that drops null-grow plants.
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const ADD_EXISTING = read("src/components/AddExistingPlantDialog.tsx");
const MERGE = read("src/components/PlantMergeDialog.tsx");
const RULES = read("src/lib/plantDropdownEligibilityRules.ts");

describe("AddExistingPlantDialog wiring", () => {
  it("widens the plant query with tent-derived grow context (OR grow_id, tent_id IN ...)", () => {
    expect(ADD_EXISTING).toMatch(/useGrowTents/);
    expect(ADD_EXISTING).toMatch(/tent_id\.in\.\(/);
    expect(ADD_EXISTING).toMatch(/grow_id\.eq\./);
    expect(ADD_EXISTING).toMatch(/\.or\(/);
  });

  it("verifies effective grow id client-side using the centralized rule", () => {
    expect(ADD_EXISTING).toMatch(/getEffectivePlantGrowId/);
    expect(ADD_EXISTING).toMatch(
      /from\s+["']@\/lib\/plantDropdownEligibilityRules["']/,
    );
  });

  it("does not regress to a bare `.eq(\"grow_id\", growId)` as the sole filter", () => {
    // Allowed in the OR string, banned as a standalone .eq call on the
    // plants query — that's what dropped the third plant.
    expect(ADD_EXISTING).not.toMatch(/\.eq\(\s*["']grow_id["']\s*,\s*growId/);
  });

  it("remains read-then-update on `tent_id` only — no service_role / device control", () => {
    expect(ADD_EXISTING).not.toMatch(/service_role/);
    expect(ADD_EXISTING).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|automation/i,
    );
    // Single-field update payload — guard against accidental column writes.
    expect(ADD_EXISTING).toMatch(/\.update\(\s*\{\s*tent_id:\s*tentId\s*\}\s*\)/);
  });
});

describe("PlantMergeDialog wiring", () => {
  it("loads ALL plants (no DB grow filter) so legacy null-grow rows aren't dropped", () => {
    expect(MERGE).toMatch(/useGrowPlants\(undefined,\s*undefined\)/);
    expect(MERGE).not.toMatch(/useGrowPlants\(\s*undefined,\s*sourceEffectiveGrowId/);
  });

  it("still filters candidates by effective grow id client-side", () => {
    expect(MERGE).toMatch(/getEffectivePlantGrowId/);
    expect(MERGE).toMatch(/sourceEffectiveGrowId/);
  });

  it("does not introduce schema/sensor/pi-ingest/alert/action-queue changes", () => {
    expect(MERGE).not.toMatch(/service_role/);
    expect(MERGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|automation/i,
    );
  });
});

describe("plantDropdownEligibilityRules is pure", () => {
  it("has no Supabase / React / I/O imports", () => {
    expect(RULES).not.toMatch(/supabase|@\/integrations|react|fetch\(|useQuery/);
  });

  it("has no service_role or automation strings", () => {
    expect(RULES).not.toMatch(/service_role/);
    expect(RULES).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|automation/i,
    );
  });
});
