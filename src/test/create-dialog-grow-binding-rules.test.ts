import { describe, expect, it } from "vitest";
import {
  buildHardStopView,
  checkTentGrowCompatibility,
  formatSetupDisplayName,
  resolveTargetGrow,
  START_YOUR_ROOM_HREF,
} from "@/lib/createDialogGrowBindingRules";
import { growSetup } from "@/constants/growSetupMessages";

describe("createDialogGrowBindingRules", () => {
  it("prefers a valid page setup over the current setup", () => {
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: "grow-page",
        activeGrowId: "grow-active",
        grows: [
          { id: "grow-active", name: "Active" },
          { id: "grow-page", name: "Page" },
        ],
      }),
    ).toEqual({ id: "grow-page", name: "Page" });
  });

  it("falls back to the current setup when the page has no growId", () => {
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: null,
        activeGrowId: "grow-active",
        grows: [{ id: "grow-active", name: "Spring Veg" }],
      }),
    ).toEqual({ id: "grow-active", name: "Spring Veg" });
  });

  it("falls through from a stale page id to a valid active setup", () => {
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: "grow-stale",
        activeGrowId: "grow-active",
        grows: [{ id: "grow-active", name: "Owned" }],
      }),
    ).toEqual({ id: "grow-active", name: "Owned" });
  });

  it("returns null when no owned setup resolves", () => {
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: "missing",
        activeGrowId: "also-missing",
        grows: [{ id: "grow-owned", name: "Owned" }],
      }),
    ).toBeNull();
  });

  it("fails closed while setups load", () => {
    expect(
      buildHardStopView({
        targetGrow: null,
        growCount: 0,
        growsLoading: true,
      }),
    ).toMatchObject({
      kind: "loading",
      blockSubmit: true,
      showLoading: true,
      showStartRoomHardStop: false,
      title: growSetup.create.loadingTitle,
    });
  });

  it("fails closed with a zero-grow hard stop", () => {
    const view = buildHardStopView({
      targetGrow: null,
      growCount: 0,
      growsLoading: false,
    });
    expect(view).toMatchObject({
      kind: "zero_grow",
      blockSubmit: true,
      showStartRoomHardStop: true,
      primaryLabel: growSetup.noSetup.ctaStart,
      secondaryLabel: growSetup.noSetup.ctaDismiss,
      startRoomHref: START_YOUR_ROOM_HREF,
    });
    expect(START_YOUR_ROOM_HREF).toBe("/grows?intent=one_tent_activation");
  });

  it("allows submit only with a resolved owned setup", () => {
    expect(
      buildHardStopView({
        targetGrow: { id: "grow-owned", name: "Spring Veg" },
        growCount: 1,
        growsLoading: false,
      }),
    ).toMatchObject({
      kind: "ok",
      blockSubmit: false,
      setupName: "Spring Veg",
    });
  });

  it("covers the tent/grow compatibility matrix", () => {
    expect(
      checkTentGrowCompatibility({
        targetGrowId: "grow-a",
        tent: { grow_id: "grow-a" },
      }),
    ).toEqual({ ok: true });

    expect(
      checkTentGrowCompatibility({
        targetGrowId: "grow-a",
        tent: { grow_id: "grow-b" },
      }),
    ).toEqual({ ok: false, reason: "different_setup" });

    expect(
      checkTentGrowCompatibility({
        targetGrowId: "grow-a",
        tent: { grow_id: null },
      }),
    ).toEqual({ ok: false, reason: "missing_setup" });

    expect(
      checkTentGrowCompatibility({
        targetGrowId: null,
        tent: { grow_id: null },
      }),
    ).toEqual({ ok: false, reason: "missing_target" });

    expect(
      checkTentGrowCompatibility({
        targetGrowId: "grow-a",
        tent: { growId: "grow-a" },
      }),
    ).toEqual({ ok: true });
  });

  it("never leaks a raw UUID as the setup display name", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      resolveTargetGrow({
        pageDefaultGrowId: uuid,
        activeGrowId: null,
        grows: [{ id: uuid, name: null }],
      }),
    ).toEqual({ id: uuid, name: growSetup.create.fallbackName });

    expect(formatSetupDisplayName(uuid)).toBe(growSetup.create.fallbackName);
    expect(formatSetupDisplayName("")).toBe(growSetup.create.fallbackName);
    expect(formatSetupDisplayName("   ")).toBe(growSetup.create.fallbackName);
    expect(formatSetupDisplayName(null)).toBe(growSetup.create.fallbackName);
  });

  it("handles a very long setup name without failing", () => {
    const longName = "A".repeat(120);
    const resolved = resolveTargetGrow({
      pageDefaultGrowId: "grow-long",
      activeGrowId: null,
      grows: [{ id: "grow-long", name: longName }],
    });
    expect(resolved?.id).toBe("grow-long");
    expect(resolved?.name.length).toBeLessThanOrEqual(80);
    expect(resolved?.name.endsWith("…")).toBe(true);
  });

  it("is deterministic for repeated inputs", () => {
    const input = {
      pageDefaultGrowId: null as string | null,
      activeGrowId: "grow-a",
      grows: [{ id: "grow-a", name: "A" }],
    };
    expect(resolveTargetGrow(input)).toEqual(resolveTargetGrow(input));
    expect(
      checkTentGrowCompatibility({
        targetGrowId: "grow-a",
        tent: { grow_id: "grow-a" },
      }),
    ).toEqual(
      checkTentGrowCompatibility({
        targetGrowId: "grow-a",
        tent: { grow_id: "grow-a" },
      }),
    );
  });
});
