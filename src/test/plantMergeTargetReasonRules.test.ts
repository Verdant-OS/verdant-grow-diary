/**
 * Tests for the Merge Duplicate target picker reason labels +
 * visibility summary.
 *
 * Scope: pure rules in `plantMergeTargetReasonRules.ts` plus static
 * safety guards on `PlantMergeDialog.tsx`. No DB, no RPC, no
 * automation, no device control, no service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyMergeTargetOption,
  classifyMergeTargetOptions,
  summarizeMergeTargetVisibility,
  formatMergeTargetReason,
  formatMergeTargetHelperText,
  MERGE_TARGET_EMPTY_STATE,
  MERGE_TARGET_SOURCE_MISSING_GROW_CONTEXT,
  MERGE_TARGET_REASON_LABELS,
} from "@/lib/plantMergeTargetReasonRules";

const tents = [
  { id: "tent-a", grow_id: "grow-1" },
  { id: "tent-b", grow_id: "grow-2" },
  { id: "tent-orphan", grow_id: null },
];

const source = {
  id: "src",
  name: "Source",
  grow_id: "grow-1",
  tent_id: "tent-a",
  is_archived: false,
};

describe("classifyMergeTargetOption", () => {
  it("same-grow target is selectable with same_grow reason", () => {
    const d = classifyMergeTargetOption(
      source,
      { id: "t1", name: "Twin", grow_id: "grow-1", tent_id: "tent-a" },
      tents,
    );
    expect(d.reason).toBe("same_grow");
    expect(d.selectable).toBe(true);
    expect(d.hidden).toBe(false);
    expect(d.disabled).toBe(false);
  });

  it("legacy same-grow target (null grow_id, tent derives grow) uses legacy reason", () => {
    const d = classifyMergeTargetOption(
      source,
      { id: "t1", name: "Legacy", grow_id: null, tent_id: "tent-a" },
      tents,
    );
    expect(d.reason).toBe("legacy_same_grow");
    expect(d.selectable).toBe(true);
  });

  it("source plant is excluded with source_plant reason", () => {
    const d = classifyMergeTargetOption(source, source, tents);
    expect(d.reason).toBe("source_plant");
    expect(d.selectable).toBe(false);
    expect(d.hidden).toBe(true);
  });

  it("cross-grow target is hidden with different_grow reason", () => {
    const d = classifyMergeTargetOption(
      source,
      { id: "t2", name: "Other", grow_id: "grow-2", tent_id: "tent-b" },
      tents,
    );
    expect(d.reason).toBe("different_grow");
    expect(d.selectable).toBe(false);
    expect(d.hidden).toBe(true);
  });

  it("archived/merged target is hidden with archived_or_merged reason", () => {
    const d = classifyMergeTargetOption(
      source,
      {
        id: "t3",
        name: "Old",
        grow_id: "grow-1",
        tent_id: "tent-a",
        is_archived: true,
      },
      tents,
    );
    expect(d.reason).toBe("archived_or_merged");
    expect(d.hidden).toBe(true);
  });

  it("merged-via-note target is hidden with archived_or_merged reason", () => {
    const d = classifyMergeTargetOption(
      source,
      {
        id: "t4",
        name: "Merged",
        grow_id: "grow-1",
        tent_id: "tent-a",
        last_note: "Merged into 11111111-1111-1111-1111-111111111111",
      },
      tents,
    );
    expect(d.reason).toBe("archived_or_merged");
    expect(d.hidden).toBe(true);
  });

  it("missing-grow-context target (no derivable grow) is disabled with reason", () => {
    const d = classifyMergeTargetOption(
      source,
      { id: "t5", name: "Orphan", grow_id: null, tent_id: "tent-orphan" },
      tents,
    );
    expect(d.reason).toBe("missing_grow_context");
    expect(d.selectable).toBe(false);
    expect(d.disabled).toBe(true);
    expect(d.hidden).toBe(false);
  });
});

describe("formatMergeTargetReason copy", () => {
  it("matches the grower-facing vocabulary from the spec", () => {
    expect(formatMergeTargetReason("same_grow")).toBe("Same grow — can merge");
    expect(formatMergeTargetReason("legacy_same_grow")).toBe(
      "Legacy plant — grow derived from assigned tent",
    );
    expect(formatMergeTargetReason("different_grow")).toBe(
      "Different grow — cannot merge",
    );
    expect(formatMergeTargetReason("source_plant")).toBe(
      "Source plant — cannot merge into itself",
    );
    expect(formatMergeTargetReason("archived_or_merged")).toBe(
      "Archived/merged — hidden by default",
    );
    expect(formatMergeTargetReason("missing_grow_context")).toBe(
      "Missing grow context — repair from plant page",
    );
  });

  it("REASON_LABELS covers every reason", () => {
    const keys = Object.keys(MERGE_TARGET_REASON_LABELS).sort();
    expect(keys).toEqual(
      [
        "same_grow",
        "legacy_same_grow",
        "different_grow",
        "source_plant",
        "archived_or_merged",
        "missing_grow_context",
      ].sort(),
    );
  });
});

describe("summarizeMergeTargetVisibility", () => {
  const candidates = [
    source, // source excluded
    { id: "a", name: "A", grow_id: "grow-1", tent_id: "tent-a" }, // same
    { id: "b", name: "B", grow_id: "grow-1", tent_id: "tent-a" }, // same
    { id: "c", name: "C", grow_id: null, tent_id: "tent-a" }, // legacy
    { id: "d", name: "D", grow_id: "grow-2", tent_id: "tent-b" }, // cross
    {
      id: "e",
      name: "E",
      grow_id: "grow-1",
      tent_id: "tent-a",
      is_archived: true,
    }, // archived
    { id: "f", name: "F", grow_id: null, tent_id: "tent-orphan" }, // missing
  ];

  const s = summarizeMergeTargetVisibility(source, candidates, tents);

  it("counts same-grow targets", () => {
    expect(s.sameGrow).toBe(2);
  });
  it("counts legacy same-grow targets", () => {
    expect(s.legacySameGrow).toBe(1);
  });
  it("counts cross-grow targets", () => {
    expect(s.differentGrow).toBe(1);
  });
  it("counts archived/merged targets", () => {
    expect(s.archivedOrMerged).toBe(1);
  });
  it("counts missing-grow-context targets", () => {
    expect(s.missingGrowContext).toBe(1);
  });
  it("excludes the source plant", () => {
    expect(s.sourcePlantExcluded).toBe(1);
  });
  it("selectable = same + legacy", () => {
    expect(s.selectable).toBe(3);
  });
});

describe("formatMergeTargetHelperText", () => {
  it("renders same-grow target count when there are selectable options", () => {
    const text = formatMergeTargetHelperText({
      total: 2,
      sameGrow: 2,
      legacySameGrow: 0,
      differentGrow: 0,
      archivedOrMerged: 0,
      missingGrowContext: 0,
      sourcePlantExcluded: 0,
      selectable: 2,
    });
    expect(text).toBe("Showing 2 same-grow targets.");
  });

  it("renders archived/merged hidden count", () => {
    const text = formatMergeTargetHelperText({
      total: 3,
      sameGrow: 2,
      legacySameGrow: 0,
      differentGrow: 0,
      archivedOrMerged: 1,
      missingGrowContext: 0,
      sourcePlantExcluded: 0,
      selectable: 2,
    });
    expect(text).toContain("1 archived/merged hidden.");
  });

  it("renders different-grow hidden count", () => {
    const text = formatMergeTargetHelperText({
      total: 3,
      sameGrow: 1,
      legacySameGrow: 0,
      differentGrow: 2,
      archivedOrMerged: 0,
      missingGrowContext: 0,
      sourcePlantExcluded: 0,
      selectable: 1,
    });
    expect(text).toContain("2 different-grow plants hidden.");
  });

  it("renders missing-grow-context count", () => {
    const text = formatMergeTargetHelperText({
      total: 2,
      sameGrow: 1,
      legacySameGrow: 0,
      differentGrow: 0,
      archivedOrMerged: 0,
      missingGrowContext: 1,
      sourcePlantExcluded: 0,
      selectable: 1,
    });
    expect(text).toContain("1 plant missing grow context.");
  });

  it("renders legacy grow-derived count", () => {
    const text = formatMergeTargetHelperText({
      total: 2,
      sameGrow: 1,
      legacySameGrow: 1,
      differentGrow: 0,
      archivedOrMerged: 0,
      missingGrowContext: 0,
      sourcePlantExcluded: 0,
      selectable: 2,
    });
    expect(text).toContain(
      "Using tent assignment to derive grow context for 1 legacy plant.",
    );
  });

  it("returns empty string when there is nothing notable", () => {
    expect(
      formatMergeTargetHelperText({
        total: 0,
        sameGrow: 0,
        legacySameGrow: 0,
        differentGrow: 0,
        archivedOrMerged: 0,
        missingGrowContext: 0,
        sourcePlantExcluded: 0,
        selectable: 0,
      }),
    ).toBe("");
  });
});

describe("empty / missing source guidance copy", () => {
  it("empty state uses the spec wording", () => {
    expect(MERGE_TARGET_EMPTY_STATE).toBe(
      "No same-grow merge targets available.",
    );
  });

  it("source-missing-grow-context guidance directs to tent assignment", () => {
    expect(MERGE_TARGET_SOURCE_MISSING_GROW_CONTEXT).toContain(
      "missing grow context",
    );
    expect(MERGE_TARGET_SOURCE_MISSING_GROW_CONTEXT).toContain("tent in a grow");
  });
});

// ---------------------------------------------------------------------------
// Static safety guards on PlantMergeDialog wiring.
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "../..");
const DIALOG = readFileSync(
  resolve(ROOT, "src/components/PlantMergeDialog.tsx"),
  "utf8",
);
const RULES = readFileSync(
  resolve(ROOT, "src/lib/plantMergeTargetReasonRules.ts"),
  "utf8",
);

describe("PlantMergeDialog target picker uses the new reason labels", () => {
  it("imports the merge-target reason rules", () => {
    expect(DIALOG).toMatch(/from "@\/lib\/plantMergeTargetReasonRules"/);
    expect(DIALOG).toMatch(/classifyMergeTargetOptions/);
    expect(DIALOG).toMatch(/summarizeMergeTargetVisibility/);
    expect(DIALOG).toMatch(/formatMergeTargetReason/);
    expect(DIALOG).toMatch(/formatMergeTargetHelperText/);
  });

  it("renders reason labels per option with aria-label", () => {
    expect(DIALOG).toMatch(/formatMergeTargetReason\(opt\.reason\)/);
    expect(DIALOG).toMatch(/aria-label=\{`\$\{baseName\} — \$\{reasonLabel\}`\}/);
  });

  it("renders the helper line under the picker", () => {
    expect(DIALOG).toContain("plant-merge-target-helper");
  });

  it("renders the empty state when there are zero candidates", () => {
    expect(DIALOG).toContain("MERGE_TARGET_EMPTY_STATE");
    expect(DIALOG).toContain("plant-merge-target-empty");
  });

  it("still routes execution through the merge_duplicate_plant RPC only", () => {
    expect(DIALOG).toMatch(/supabase\.rpc\(\s*"merge_duplicate_plant"/);
  });

  it("does not enable cross-grow merges", () => {
    expect(DIALOG).not.toMatch(/allowCrossGrow\s*:\s*true/);
  });

  it("never hard-deletes plants from the client", () => {
    expect(DIALOG).not.toMatch(/from\(\s*["']plants["']\s*\)\s*\.delete\(/);
  });
});

describe("plantMergeTargetReasonRules static safety", () => {
  it("module is free of I/O, automation, device-control, and service_role", () => {
    expect(RULES).not.toMatch(/supabase/i);
    expect(RULES).not.toMatch(/from\s+["']react["']/);
    expect(RULES).not.toMatch(/sensor_readings|pi_ingest|pi-ingest/);
    expect(RULES).not.toMatch(/mqtt|home[\s_-]?assistant|webhook|actuator|relay/i);
    expect(RULES).not.toMatch(/service_role/);
  });

  it("does not loosen cross-grow safety", () => {
    expect(RULES).not.toMatch(/allowCrossGrow/);
  });
});
