/**
 * Pure tests for plant dropdown reason / helper-text rules + static
 * safety guards confirming the new helper text was wired into the
 * AddExistingPlantDialog, PlantMergeDialog, and QuickLog without any
 * schema / RPC / sensor / pi-ingest / alert / Action Queue /
 * automation / service_role changes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatHiddenPlantReason,
  formatPlantDropdownEmptyState,
  getPlantDropdownHelperText,
  getPlantOptionDisabledReason,
  REASON_LABELS,
  summarizePlantDropdownVisibility,
} from "@/lib/plantDropdownReasonRules";
import {
  classifyPlantForDropdown,
  summarizePlantDropdown,
  type PlantDropdownInput,
  type TentGrowRef,
} from "@/lib/plantDropdownEligibilityRules";

const GROW = "g-1";
const OTHER = "g-2";
const TENT = "t-1";
const TENT_B = "t-2";
const tents: TentGrowRef[] = [
  { id: TENT, grow_id: GROW },
  { id: TENT_B, grow_id: GROW },
  { id: "t-other", grow_id: OTHER },
];

function p(id: string, over: Partial<PlantDropdownInput> = {}): PlantDropdownInput {
  return { id, name: id, ...over };
}

describe("summarizePlantDropdown (extended) counts already-in-tent", () => {
  it("counts plants already in the current tent as hiddenAlreadyInTent", () => {
    const plants = [
      p("a", { grow_id: GROW, tent_id: TENT }),
      p("b", { grow_id: GROW, tent_id: TENT_B }),
      p("c", { grow_id: GROW, tent_id: null }),
    ];
    const s = summarizePlantDropdown(plants, tents, {
      context: "add_existing_to_tent",
      growId: GROW,
      tentId: TENT,
    });
    expect(s.visible).toBe(2);
    expect(s.hiddenAlreadyInTent).toBe(1);
  });

  it("counts archived/merged hidden separately from already-in-tent", () => {
    const plants = [
      p("a", { grow_id: GROW, tent_id: TENT_B }),
      p("b", { grow_id: GROW, tent_id: null, is_archived: true }),
    ];
    const s = summarizePlantDropdown(plants, tents, {
      context: "add_existing_to_tent",
      growId: GROW,
      tentId: TENT,
    });
    expect(s.visible).toBe(1);
    expect(s.hiddenArchived).toBe(1);
    expect(s.hiddenAlreadyInTent).toBe(0);
  });

  it("counts missing-grow-context plants", () => {
    const plants = [
      p("a", { grow_id: GROW }),
      p("b" /* no grow, no tent */),
    ];
    const s = summarizePlantDropdown(plants, tents, {
      context: "merge_target",
      growId: GROW,
      sourcePlantId: "a",
    });
    expect(s.hiddenMissingGrow).toBe(1);
  });
});

describe("formatHiddenPlantReason", () => {
  it("returns empty string for non-positive counts", () => {
    expect(formatHiddenPlantReason("archived_or_merged", 0)).toBe("");
    expect(formatHiddenPlantReason("archived_or_merged", -1)).toBe("");
    expect(formatHiddenPlantReason("missing_grow_context", Number.NaN)).toBe("");
  });

  it("formats archived/merged count", () => {
    expect(formatHiddenPlantReason("archived_or_merged", 1)).toBe(
      "1 archived/merged hidden.",
    );
    expect(formatHiddenPlantReason("archived_or_merged", 3)).toBe(
      "3 archived/merged hidden.",
    );
  });

  it("formats missing grow context (singular vs plural)", () => {
    expect(formatHiddenPlantReason("missing_grow_context", 1)).toBe(
      "1 plant missing grow context.",
    );
    expect(formatHiddenPlantReason("missing_grow_context", 2)).toBe(
      "2 plants missing grow context.",
    );
  });

  it("formats cross-grow / already-in-tent / source", () => {
    expect(formatHiddenPlantReason("cross_grow", 2)).toBe("2 in another grow.");
    expect(formatHiddenPlantReason("already_in_tent", 1)).toBe(
      "1 plant already in this tent.",
    );
    expect(formatHiddenPlantReason("source_plant", 1)).toBe(
      "1 source plant excluded.",
    );
  });
});

describe("getPlantDropdownHelperText", () => {
  it("returns a basic line when nothing notable is hidden", () => {
    const v = summarizePlantDropdownVisibility({
      total: 2,
      visible: 2,
      hiddenArchived: 0,
      hiddenCrossGrow: 0,
      hiddenMissingGrow: 0,
      hiddenSourcePlant: 0,
      hiddenAlreadyInTent: 0,
    });
    expect(getPlantDropdownHelperText(v)).toBe("Showing 2 active plants.");
  });

  it("includes grow name when provided", () => {
    const v = summarizePlantDropdownVisibility({
      total: 1,
      visible: 1,
      hiddenArchived: 0,
      hiddenCrossGrow: 0,
      hiddenMissingGrow: 0,
      hiddenSourcePlant: 0,
      hiddenAlreadyInTent: 0,
    });
    expect(getPlantDropdownHelperText(v, { growName: "Auto Run 1" })).toBe(
      "Showing 1 active plant from Auto Run 1.",
    );
  });

  it("appends every notable hidden bucket in a fixed order", () => {
    const v = summarizePlantDropdownVisibility({
      total: 10,
      visible: 3,
      hiddenArchived: 2,
      hiddenCrossGrow: 1,
      hiddenMissingGrow: 1,
      hiddenSourcePlant: 0,
      hiddenAlreadyInTent: 1,
    });
    const text = getPlantDropdownHelperText(v);
    expect(text).toMatch(/Showing 3 active plants\./);
    expect(text).toMatch(/2 archived\/merged hidden\./);
    expect(text).toMatch(/1 plant missing grow context\./);
    expect(text).toMatch(/1 in another grow\./);
    expect(text).toMatch(/1 plant already in this tent\./);
  });
});

describe("getPlantOptionDisabledReason", () => {
  it("returns null for enabled options", () => {
    const opt = classifyPlantForDropdown(
      p("a", { grow_id: GROW }),
      tents,
      { context: "quick_log", growId: GROW },
    );
    expect(opt).not.toBeNull();
    expect(getPlantOptionDisabledReason(opt!)).toBeNull();
  });

  it("returns the already-in-tent reason when disabled by tent match", () => {
    const opt = classifyPlantForDropdown(
      p("a", { grow_id: GROW, tent_id: TENT }),
      tents,
      { context: "add_existing_to_tent", growId: GROW, tentId: TENT },
    );
    expect(opt!.disabled).toBe(true);
    expect(getPlantOptionDisabledReason(opt!)).toMatch(/already in this tent/i);
  });

  it("returns the missing-grow-context reason when applicable", () => {
    const opt = classifyPlantForDropdown(p("a"), tents, {
      context: "merge_target",
      growId: GROW,
      sourcePlantId: "src",
    });
    expect(opt!.disabled).toBe(true);
    expect(getPlantOptionDisabledReason(opt!)).toMatch(/missing grow context/i);
  });
});

describe("formatPlantDropdownEmptyState", () => {
  it("is specific per context", () => {
    expect(formatPlantDropdownEmptyState("add_existing_to_tent")).toBe(
      "No eligible plants available for this tent.",
    );
    expect(formatPlantDropdownEmptyState("merge_target")).toBe(
      "No same-grow merge targets available.",
    );
    expect(formatPlantDropdownEmptyState("quick_log")).toMatch(/no plants/i);
    expect(formatPlantDropdownEmptyState("logs_filter")).toMatch(/no plants/i);
  });
});

describe("REASON_LABELS coverage", () => {
  it("covers every ExclusionReason code", () => {
    for (const k of [
      "archived_or_merged",
      "missing_grow_context",
      "cross_grow",
      "source_plant",
      "already_in_tent",
      "no_tent_assigned",
    ] as const) {
      expect(REASON_LABELS[k]).toMatch(/.+/);
    }
  });
});

// ---------------------------------------------------------------------------
// Static safety: helper text was wired into the dialogs/QuickLog, and the
// changes touched nothing outside dropdown copy.
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const RULES = read("src/lib/plantDropdownReasonRules.ts");
const ADD = read("src/components/AddExistingPlantDialog.tsx");
const MERGE = read("src/components/PlantMergeDialog.tsx");
const QL = read("src/components/QuickLog.tsx");

describe("AddExistingPlantDialog · helper text wiring", () => {
  it("renders the centralized helper text under the picker", () => {
    expect(ADD).toMatch(/data-testid=["']add-existing-plant-helper["']/);
    expect(ADD).toMatch(/getPlantDropdownHelperText/);
    expect(ADD).toMatch(/summarizePlantDropdown/);
  });

  it("uses the empty-state helper copy", () => {
    expect(ADD).toMatch(/formatPlantDropdownEmptyState\(\s*["']add_existing_to_tent["']\s*\)/);
  });

  it("disabled already-in-tent options expose reason via aria-label and title", () => {
    expect(ADD).toMatch(/aria-label=\{`?[^}]*already in this tent/i);
    expect(ADD).toMatch(/title=["']Already in this tent["']/);
  });
});

describe("PlantMergeDialog · helper text wiring", () => {
  it("renders helper text under the target picker", () => {
    expect(MERGE).toMatch(/data-testid=["']plant-merge-target-helper["']/);
    expect(MERGE).toMatch(/getPlantDropdownHelperText/);
  });

  it("uses the empty-state helper copy for no eligible targets", () => {
    expect(MERGE).toMatch(/data-testid=["']plant-merge-target-empty["']/);
    expect(MERGE).toMatch(/formatPlantDropdownEmptyState\(\s*["']merge_target["']\s*\)/);
  });
});

describe("QuickLog · grow-name helper text", () => {
  it("renders grow-name helper line under the plant picker", () => {
    expect(QL).toMatch(/data-testid=["']quick-log-plant-helper["']/);
    expect(QL).toMatch(/Showing plants from \$\{activeGrow\.name\}/);
    expect(QL).toMatch(/Archived\/merged plants hidden/);
  });
});

describe("plantDropdownReasonRules is pure", () => {
  it("has no Supabase / React / I/O imports", () => {
    expect(RULES).not.toMatch(/supabase|@\/integrations|react|fetch\(|useQuery/);
  });
});

describe("safety guards — no out-of-scope strings introduced", () => {
  for (const [name, src] of [
    ["AddExistingPlantDialog", ADD],
    ["PlantMergeDialog", MERGE],
    ["QuickLog", QL],
    ["plantDropdownReasonRules", RULES],
  ] as const) {
    it(`${name} contains no service_role / automation / device-control strings`, () => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|webhook|automation|device_command/i,
      );
    });

    it(`${name} does not write to sensor / pi-ingest / alert / action_queue tables`, () => {
      for (const t of [
        "sensor_readings",
        "pi_ingest_idempotency_keys",
        "pi_ingest_bridge_credentials",
        "alerts",
        "alert_events",
        "action_queue",
        "action_queue_events",
      ]) {
        expect(src).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)\\s*\\.(insert|update|delete|upsert)\\(`));
      }
    });
  }
});
