import { describe, expect, it } from "vitest";

import {
  QUICK_LOG_TARGET_BLOCKED_COPY,
  quickLogPrefillTargetKey,
  resolveQuickLogEditorTarget,
  resolveQuickLogPrefillTarget,
  resolveQuickLogWriteTarget,
} from "@/lib/quickLogTargetIntegrityRules";

const plants = [
  { id: "p1", grow_id: "g1", tent_id: "t1" },
  { id: "p2", grow_id: "g2", tent_id: "t2" },
];

const tents = [
  { id: "t1", grow_id: "g1" },
  { id: "t2", grow_id: "g2" },
];

describe("resolveQuickLogPrefillTarget", () => {
  it("resolves an exact plant/grow/tent prefill to one readonly target", () => {
    const result = resolveQuickLogPrefillTarget({
      prefill: { plantId: "p1", growId: "g1", tentId: "t1" },
      plants,
      tents,
    });

    expect(result).toEqual({
      status: "ready",
      target: { plantId: "p1", growId: "g1", tentId: "t1" },
    });
    expect(result.status === "ready" && Object.isFrozen(result.target)).toBe(true);
  });

  it("resolves a cross-grow prefill from the full plant list", () => {
    expect(
      resolveQuickLogPrefillTarget({
        prefill: { plantId: "p2", growId: "g2", tentId: "t2" },
        plants,
        tents,
      }),
    ).toEqual({
      status: "ready",
      target: { plantId: "p2", growId: "g2", tentId: "t2" },
    });
  });

  it.each([
    {
      label: "unknown",
      prefill: { plantId: "missing", growId: "g1", tentId: "t1" },
      rows: plants,
      reason: "plant_not_found",
    },
    {
      label: "archived",
      prefill: { plantId: "p1", growId: "g1", tentId: "t1" },
      rows: [{ ...plants[0], is_archived: true }],
      reason: "plant_inactive",
    },
    {
      label: "merged",
      prefill: { plantId: "p1", growId: "g1", tentId: "t1" },
      rows: [{ ...plants[0], merged_into_plant_id: "p9" }],
      reason: "plant_inactive",
    },
  ] as const)("blocks an $label plant", ({ prefill, rows, reason }) => {
    expect(resolveQuickLogPrefillTarget({ prefill, plants: rows, tents })).toEqual({
      status: "blocked",
      reason,
    });
  });

  it("blocks contradictory route grow and tent context", () => {
    expect(
      resolveQuickLogPrefillTarget({
        prefill: { plantId: "p1", growId: "g2", tentId: "t1" },
        plants,
        tents,
      }),
    ).toEqual({ status: "blocked", reason: "prefill_grow_mismatch" });

    expect(
      resolveQuickLogPrefillTarget({
        prefill: { plantId: "p1", growId: "g1", tentId: "t2" },
        plants,
        tents,
      }),
    ).toEqual({ status: "blocked", reason: "prefill_tent_mismatch" });
  });

  it("blocks missing stored assignments instead of inferring them from prefill", () => {
    expect(
      resolveQuickLogPrefillTarget({
        prefill: { plantId: "p1", growId: "g1", tentId: "t1" },
        plants: [{ id: "p1", grow_id: null, tent_id: "t1" }],
        tents,
      }),
    ).toEqual({ status: "blocked", reason: "plant_grow_unassigned" });

    expect(
      resolveQuickLogPrefillTarget({
        prefill: { plantId: "p1", growId: "g1", tentId: "t1" },
        plants: [{ id: "p1", grow_id: "g1", tent_id: null }],
        tents,
      }),
    ).toEqual({ status: "blocked", reason: "plant_tent_unassigned" });
  });

  it("requires the assigned tent row and matching tent grow", () => {
    expect(
      resolveQuickLogPrefillTarget({
        prefill: { plantId: "p1", growId: "g1", tentId: "t1" },
        plants,
        tents: [],
      }),
    ).toEqual({ status: "blocked", reason: "tent_not_found" });

    expect(
      resolveQuickLogPrefillTarget({
        prefill: { plantId: "p1", growId: "g1", tentId: "t1" },
        plants,
        tents: [{ id: "t1", grow_id: "g9" }],
      }),
    ).toEqual({ status: "blocked", reason: "tent_grow_mismatch" });
  });

  it.each([undefined, null, {}, { plantId: "" }, { plantId: "   " }])(
    "blocks an empty prefill without guessing: %j",
    (prefill) => {
      expect(resolveQuickLogPrefillTarget({ prefill, plants, tents })).toEqual({
        status: "blocked",
        reason: "missing_plant",
      });
    },
  );

  it("is deterministic for repeated identical inputs", () => {
    const input = {
      prefill: { plantId: " p1 ", growId: " g1 ", tentId: " t1 " },
      plants,
      tents,
    };

    expect(resolveQuickLogPrefillTarget(input)).toEqual(resolveQuickLogPrefillTarget(input));
  });
});

describe("resolveQuickLogWriteTarget", () => {
  it("returns ready only when active grow, plant, and tent relationships agree", () => {
    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "g1",
        selectedPlant: plants[0],
        selectedTent: tents[0],
      }),
    ).toEqual({
      status: "ready",
      target: { plantId: "p1", growId: "g1", tentId: "t1" },
    });
  });

  it.each([
    {
      label: "active grow",
      input: { activeGrowId: null, selectedPlant: plants[0], selectedTent: tents[0] },
      reason: "missing_active_grow",
    },
    {
      label: "selected plant",
      input: { activeGrowId: "g1", selectedPlant: null, selectedTent: tents[0] },
      reason: "missing_plant",
    },
    {
      label: "selected tent",
      input: { activeGrowId: "g1", selectedPlant: plants[0], selectedTent: null },
      reason: "tent_not_found",
    },
  ] as const)("blocks a missing $label", ({ input, reason }) => {
    expect(resolveQuickLogWriteTarget(input)).toEqual({ status: "blocked", reason });
  });

  it("blocks every contradictory write relationship", () => {
    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "g2",
        selectedPlant: plants[0],
        selectedTent: tents[0],
      }),
    ).toEqual({ status: "blocked", reason: "active_grow_mismatch" });

    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "g1",
        selectedPlant: plants[0],
        selectedTent: tents[1],
      }),
    ).toEqual({ status: "blocked", reason: "selected_tent_mismatch" });

    expect(
      resolveQuickLogWriteTarget({
        activeGrowId: "g1",
        selectedPlant: plants[0],
        selectedTent: { id: "t1", grow_id: "g2" },
      }),
    ).toEqual({ status: "blocked", reason: "tent_grow_mismatch" });
  });

  it("blocks legacy assignment gaps with calm repair copy", () => {
    const result = resolveQuickLogWriteTarget({
      activeGrowId: "g1",
      selectedPlant: { id: "p1", grow_id: null, tent_id: null },
      selectedTent: null,
    });

    expect(result).toEqual({ status: "blocked", reason: "plant_grow_unassigned" });
    if (result.status !== "blocked") throw new Error("expected blocked target");
    expect(QUICK_LOG_TARGET_BLOCKED_COPY[result.reason]).toBe(
      "Assign this plant to a grow and tent before saving.",
    );
  });

  it("does not carry sensor values, automation flags, or a persistence selector", () => {
    const result = resolveQuickLogWriteTarget({
      activeGrowId: "g1",
      selectedPlant: plants[0],
      selectedTent: tents[0],
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/temperature|humidity|sensor|automation|device/i);
    expect(serialized).not.toMatch(/rpc|table|writer|persistence/i);
  });
});

describe("resolveQuickLogEditorTarget", () => {
  const readyWrite = {
    status: "ready" as const,
    target: { plantId: "p1", growId: "g1", tentId: "t1" },
  };
  const blockedPrefill = { status: "blocked" as const, reason: "plant_not_found" as const };
  const missingWrite = { status: "blocked" as const, reason: "missing_plant" as const };

  it("lets a blocked route prefill override an otherwise ready unrelated write target", () => {
    expect(
      resolveQuickLogEditorTarget({
        prefill: { plantId: "missing", growId: "g1", tentId: "t1" },
        prefillResolution: blockedPrefill,
        writeResolution: readyWrite,
      }),
    ).toEqual(blockedPrefill);
  });

  it("releases the prefill hold only for the exact request key dismissed by grower selection", () => {
    const prefill = { plantId: "missing", growId: "g1", tentId: "t1" };
    const key = quickLogPrefillTargetKey(prefill);
    expect(key).not.toBeNull();
    expect(
      resolveQuickLogEditorTarget({
        prefill,
        prefillResolution: blockedPrefill,
        writeResolution: readyWrite,
        dismissedBlockedPrefillKey: key,
      }),
    ).toEqual(readyWrite);

    expect(
      resolveQuickLogEditorTarget({
        prefill: { ...prefill, plantId: "another-missing" },
        prefillResolution: blockedPrefill,
        writeResolution: readyWrite,
        dismissedBlockedPrefillKey: key,
      }),
    ).toEqual(blockedPrefill);
  });

  it("does not hold global or grow-only launchers that contain no plant target", () => {
    for (const prefill of [null, {}, { growId: "g1", tentId: "t1" }]) {
      expect(quickLogPrefillTargetKey(prefill)).toBeNull();
      expect(
        resolveQuickLogEditorTarget({
          prefill,
          prefillResolution: { status: "blocked", reason: "missing_plant" },
          writeResolution: missingWrite,
        }),
      ).toEqual(missingWrite);
    }
  });
});
