/**
 * Add Existing Plant — eligibility reason labels + legacy null-grow_id
 * regression coverage.
 *
 * The dialog now annotates every selectable option with an inline reason
 * suffix AND an `aria-label` / `title` so the grower (and screen readers)
 * always know why an option is offered, disabled, or hidden. This file
 * locks that behavior in via:
 *
 *   1. Pure rule tests proving classifyPlantForDropdown returns the
 *      correct decision for legacy null-grow_id plants whose tent
 *      belongs to the current grow — they MUST NOT disappear.
 *   2. Static source-level tests proving the dialog rendered the new
 *      reason copy, the `data-legacy` marker, the existing categories,
 *      and the centralized helper / empty-state copy.
 *   3. Static safety guards (no schema / merge RPC / sensor / pi-ingest
 *      / alert / Action Queue / automation / service_role changes).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  classifyPlantForDropdown,
  getEffectivePlantGrowId,
  getPlantDropdownOptions,
  shouldIncludePlantInDropdown,
  type PlantDropdownInput,
  type TentGrowRef,
} from "@/lib/plantDropdownEligibilityRules";

const GROW = "g-1";
const OTHER_GROW = "g-2";
const TENT_A = "t-a"; // current tent for the dialog
const TENT_B = "t-b"; // same grow, different tent
const TENT_OTHER = "t-other-grow";

const tents: TentGrowRef[] = [
  { id: TENT_A, grow_id: GROW },
  { id: TENT_B, grow_id: GROW },
  { id: TENT_OTHER, grow_id: OTHER_GROW },
];

function p(id: string, over: Partial<PlantDropdownInput> = {}): PlantDropdownInput {
  return { id, name: id, ...over };
}

const opts = {
  context: "add_existing_to_tent" as const,
  growId: GROW,
  tentId: TENT_A,
};

// ---------------------------------------------------------------------------
// Pure rule regression: legacy null-grow_id plants must NOT disappear.
// ---------------------------------------------------------------------------

describe("Add Existing Plant · legacy null-grow_id regression", () => {
  it("legacy plant (grow_id=null, tent_id in current grow, other tent) is eligible and not the current tent", () => {
    const legacy = p("legacy-other", { grow_id: null, tent_id: TENT_B });
    expect(getEffectivePlantGrowId(legacy, tents)).toBe(GROW);
    const decision = classifyPlantForDropdown(legacy, tents, opts);
    expect(decision).not.toBeNull();
    expect(decision!.eligible).toBe(true);
    expect(decision!.disabled).toBe(false);
    // Belongs to "other tent" bucket — tent_id is set and is NOT the
    // current tent — so it must be included as a move candidate.
    expect(legacy.tent_id).not.toBe(TENT_A);
  });

  it("legacy plant (grow_id=null, tent_id=null) is silently excluded for add_existing_to_tent (no usable grow context)", () => {
    const legacy = p("legacy-orphan", { grow_id: null, tent_id: null });
    expect(getEffectivePlantGrowId(legacy, tents)).toBeNull();
    // The dialog's data path uses an OR(grow_id, tent_id IN ...) filter
    // which cannot match this row at all, so the centralized rule
    // silently excludes it from the add_existing_to_tent picker.
    expect(shouldIncludePlantInDropdown(legacy, tents, opts)).toBe(false);
  });

  it("legacy plant whose tent belongs to OTHER grow is excluded (no cross-grow leak)", () => {
    const legacy = p("legacy-crossgrow", { grow_id: null, tent_id: TENT_OTHER });
    expect(getEffectivePlantGrowId(legacy, tents)).toBe(OTHER_GROW);
    expect(shouldIncludePlantInDropdown(legacy, tents, opts)).toBe(false);
  });

  it("mixed list — legacy null-grow_id row survives alongside normal rows", () => {
    const plants = [
      p("normal-unassigned", { grow_id: GROW, tent_id: null }),
      p("normal-other-tent", { grow_id: GROW, tent_id: TENT_B }),
      p("legacy-other-tent", { grow_id: null, tent_id: TENT_B }),
      p("already-here", { grow_id: GROW, tent_id: TENT_A }),
      p("cross-grow", { grow_id: OTHER_GROW, tent_id: TENT_OTHER }),
      p("archived", { grow_id: GROW, tent_id: null, is_archived: true }),
    ];
    const ids = getPlantDropdownOptions(plants, tents, opts).map((o) => o.plant.id);
    // Visible/disabled rows: 4 (3 eligible + 1 disabled current tent).
    expect(ids).toContain("normal-unassigned");
    expect(ids).toContain("normal-other-tent");
    expect(ids).toContain("legacy-other-tent"); // regression
    expect(ids).toContain("already-here"); // disabled but visible
    // Hidden: cross-grow + archived.
    expect(ids).not.toContain("cross-grow");
    expect(ids).not.toContain("archived");
  });

  it("legacy plant (grow_id=null, tent_id=current tent) lands in the 'already in this tent' disabled bucket", () => {
    const legacy = p("legacy-here", { grow_id: null, tent_id: TENT_A });
    const decision = classifyPlantForDropdown(legacy, tents, opts);
    expect(decision).not.toBeNull();
    expect(decision!.disabled).toBe(true);
    expect(decision!.reasonCode).toBe("already_in_tent");
  });
});

// ---------------------------------------------------------------------------
// Static dialog source guards: reason copy + accessibility + safety.
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "../..");
const DIALOG = readFileSync(
  resolve(ROOT, "src/components/AddExistingPlantDialog.tsx"),
  "utf8",
);

describe("Add Existing Plant · visible reason labels", () => {
  it("preserves the three categorization labels", () => {
    expect(DIALOG).toContain("Unassigned plants");
    expect(DIALOG).toContain("Plants in another tent");
    expect(DIALOG).toContain("Already in this tent");
  });

  it("renders an 'unassigned, can add to this tent' reason", () => {
    expect(DIALOG).toMatch(/unassigned, can add to this tent/i);
  });

  it("renders an 'in another tent — will move' reason", () => {
    expect(DIALOG).toMatch(/will move to this tent/i);
  });

  it("renders an 'already in this tent' reason and disables the option", () => {
    expect(DIALOG).toMatch(/already in this tent/i);
    expect(DIALOG).toMatch(/disabled\s*$/m); // <SelectItem ... disabled
  });

  it("flags legacy null-grow_id rows with a legacy reason and data-legacy marker", () => {
    expect(DIALOG).toMatch(/data-legacy=\{legacy/);
    expect(DIALOG).toMatch(/legacy plant.*grow derived from assigned tent/i);
    expect(DIALOG).toMatch(/legacy plant/i);
  });

  it("derives 'legacy' purely from the plant's raw grow_id being null", () => {
    expect(DIALOG).toMatch(/const legacy\s*=\s*p\.grow_id\s*==\s*null/);
  });
});

describe("Add Existing Plant · accessibility", () => {
  it("every selectable option carries an aria-label with the reason text", () => {
    // Unassigned + other-tent groups both build a `label` string and pass it.
    const ariaMatches = DIALOG.match(/aria-label=\{(label|`[^`]*`)\}/g) ?? [];
    expect(ariaMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("every selectable option carries a title for hover/tap exposure", () => {
    expect(DIALOG).toMatch(/title=\{[^}]*Legacy plant[^}]*\}/);
    expect(DIALOG).toMatch(/title=\{[^}]*Unassigned[^}]*\}/);
    expect(DIALOG).toMatch(/title=\{reason\}/);
    expect(DIALOG).toMatch(/title=["']Already in this tent["']/);
  });

  it("renders helper-text summary line + empty-state via centralized helpers", () => {
    expect(DIALOG).toMatch(/data-testid=["']add-existing-plant-helper["']/);
    expect(DIALOG).toMatch(/getPlantDropdownHelperText/);
    expect(DIALOG).toMatch(/formatPlantDropdownEmptyState\(\s*["']add_existing_to_tent["']\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// Static safety: scope guard.
// ---------------------------------------------------------------------------

describe("Add Existing Plant · scope/safety guards", () => {
  it("contains no service_role / automation / device-control strings", () => {
    expect(DIALOG).not.toMatch(/service_role/);
    expect(DIALOG).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|automation|device_command/i,
    );
  });

  it("does not write to sensor / pi-ingest / alert / Action Queue tables", () => {
    for (const t of [
      "sensor_readings",
      "pi_ingest_idempotency_keys",
      "pi_ingest_bridge_credentials",
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
    ]) {
      expect(DIALOG).not.toMatch(
        new RegExp(`\\.from\\(["']${t}["']\\)\\s*\\.(insert|update|delete|upsert)\\(`),
      );
    }
  });

  it("update payload still touches ONLY tent_id (no schema/RPC expansion)", () => {
    expect(DIALOG).toMatch(
      /\.from\(["']plants["']\)\s*\.update\(\s*\{\s*tent_id:\s*tentId\s*\}\s*\)/,
    );
    expect(DIALOG).not.toMatch(/\.rpc\(/);
  });
});
