/**
 * AUD-008 — Action Queue must clearly explain its grow scope. These
 * tests lock in the pure helper that produces the header hint state.
 */
import { describe, it, expect } from "vitest";
import { buildActionQueueGrowContextHint } from "@/lib/actionQueueGrowContextHintRules";

const grows = [
  { id: "g1", name: "Sour Diesel Auto" },
  { id: "g2", name: "Northern Lights" },
];

describe("AUD-008 buildActionQueueGrowContextHint", () => {
  it("scopes via URL when urlGrowId is set and recommends clearing when multiple grows exist", () => {
    const h = buildActionQueueGrowContextHint({
      urlGrowId: "g1",
      activeGrowId: "g2",
      activeGrowName: "Northern Lights",
      scopedGrowName: "Sour Diesel Auto",
      grows,
    });
    expect(h.kind).toBe("scoped_via_url");
    expect(h.isScoped).toBe(true);
    expect(h.growName).toBe("Sour Diesel Auto");
    expect(h.message).toContain("Sour Diesel Auto");
    expect(h.helper).toMatch(/clear the filter/i);
  });

  it("scopes via active grow when no URL filter is present", () => {
    const h = buildActionQueueGrowContextHint({
      urlGrowId: null,
      activeGrowId: "g2",
      activeGrowName: "Northern Lights",
      scopedGrowName: null,
      grows,
    });
    expect(h.kind).toBe("scoped_via_active_grow");
    expect(h.isScoped).toBe(true);
    expect(h.message).toContain("Northern Lights");
    expect(h.message).toMatch(/active grow/i);
    expect(h.helper).toMatch(/grow switcher/i);
  });

  it("hides the helper when there is only one grow and it is the active one", () => {
    const h = buildActionQueueGrowContextHint({
      urlGrowId: null,
      activeGrowId: "g1",
      activeGrowName: "Sour Diesel Auto",
      scopedGrowName: null,
      grows: [{ id: "g1", name: "Sour Diesel Auto" }],
    });
    expect(h.kind).toBe("scoped_via_active_grow");
    expect(h.helper).toBeNull();
  });

  it("shows all-grows multi state with a switcher hint when nothing is scoped", () => {
    const h = buildActionQueueGrowContextHint({
      urlGrowId: null,
      activeGrowId: null,
      activeGrowName: null,
      scopedGrowName: null,
      grows,
    });
    expect(h.kind).toBe("all_grows_multi");
    expect(h.isScoped).toBe(false);
    expect(h.message).toMatch(/all 2 grows/i);
    expect(h.helper).toMatch(/grow switcher/i);
  });

  it("shows a quieter all-grows-single state when only one grow exists", () => {
    const h = buildActionQueueGrowContextHint({
      urlGrowId: null,
      activeGrowId: null,
      activeGrowName: null,
      scopedGrowName: null,
      grows: [{ id: "g1", name: "Solo" }],
    });
    expect(h.kind).toBe("all_grows_single");
    expect(h.helper).toBeNull();
    expect(h.message).toMatch(/across your grow/i);
  });

  it("returns no-grows state with onboarding helper when the user has no grows", () => {
    const h = buildActionQueueGrowContextHint({
      urlGrowId: null,
      activeGrowId: null,
      activeGrowName: null,
      scopedGrowName: null,
      grows: [],
    });
    expect(h.kind).toBe("no_grows");
    expect(h.isScoped).toBe(false);
    expect(h.helper).toMatch(/create a grow/i);
  });

  it("falls back to grows list when scopedGrowName is missing", () => {
    const h = buildActionQueueGrowContextHint({
      urlGrowId: "g2",
      activeGrowId: null,
      activeGrowName: null,
      scopedGrowName: null,
      grows,
    });
    expect(h.growName).toBe("Northern Lights");
  });

  it("is deterministic", () => {
    const opts = {
      urlGrowId: "g1",
      activeGrowId: "g2",
      activeGrowName: "Northern Lights",
      scopedGrowName: "Sour Diesel Auto",
      grows,
    };
    expect(buildActionQueueGrowContextHint(opts)).toEqual(
      buildActionQueueGrowContextHint(opts),
    );
  });
});
