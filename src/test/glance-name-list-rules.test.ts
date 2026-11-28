import { describe, expect, it } from "vitest";
import {
  GLANCE_DESKTOP_LIMIT,
  GLANCE_MOBILE_LIMIT,
  buildGlanceNameListView,
  formatGlanceHeading,
  formatGlanceToggleLabel,
  sortGlanceItemsByLabel,
} from "@/lib/glanceNameListRules";

const item = (i: number) => ({ id: `p${i}`, label: `Plant ${i}`, href: `/plants/p${i}` });
const many = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));
const noun = { singular: "plant", plural: "plants" };

describe("buildGlanceNameListView", () => {
  it("shows every name with no toggle when the list fits a phone", () => {
    const view = buildGlanceNameListView({
      items: many(GLANCE_MOBILE_LIMIT),
      complete: true,
      loading: false,
      expanded: false,
    });
    expect(view.state).toBe("list");
    expect(view.total).toBe(GLANCE_MOBILE_LIMIT);
    expect(view.items.every((i) => i.visibility === "always")).toBe(true);
    expect(view.showToggle).toBe(false);
  });

  it("shows more names on desktop and a phone-only toggle for a mid-size list", () => {
    const view = buildGlanceNameListView({
      items: many(GLANCE_MOBILE_LIMIT + 2),
      complete: true,
      loading: false,
      expanded: false,
    });
    expect(view.items.slice(0, GLANCE_MOBILE_LIMIT).map((i) => i.visibility)).toEqual(
      Array(GLANCE_MOBILE_LIMIT).fill("always"),
    );
    expect(view.items.slice(GLANCE_MOBILE_LIMIT).map((i) => i.visibility)).toEqual([
      "desktop",
      "desktop",
    ]);
    expect(view.showToggle).toBe(true);
    expect(view.toggleMobileOnly).toBe(true);
  });

  it("keeps the toggle on desktop for a list longer than the desktop limit", () => {
    const view = buildGlanceNameListView({
      items: many(24),
      complete: true,
      loading: false,
      expanded: false,
    });
    expect(view.items.filter((i) => i.visibility === "always")).toHaveLength(GLANCE_MOBILE_LIMIT);
    expect(view.items.filter((i) => i.visibility === "desktop")).toHaveLength(
      GLANCE_DESKTOP_LIMIT - GLANCE_MOBILE_LIMIT,
    );
    expect(view.items.filter((i) => i.visibility === "expanded")).toHaveLength(
      24 - GLANCE_DESKTOP_LIMIT,
    );
    expect(view.toggleMobileOnly).toBe(false);
    expect(formatGlanceToggleLabel(view, noun)).toBe("See all 24 plants");
    expect(formatGlanceHeading("Plants", view)).toBe("Plants (24)");
  });

  it("shows every name once expanded, and offers to show fewer", () => {
    const view = buildGlanceNameListView({
      items: many(24),
      complete: true,
      loading: false,
      expanded: true,
    });
    expect(view.items.every((i) => i.visibility === "always")).toBe(true);
    expect(view.showToggle).toBe(true);
    expect(view.toggleMobileOnly).toBe(false);
    expect(formatGlanceToggleLabel(view, noun)).toBe("Show fewer plants");
  });

  it("says empty only after a complete read", () => {
    expect(
      buildGlanceNameListView({ items: [], complete: true, loading: false, expanded: false }),
    ).toMatchObject({ state: "empty", total: 0 });
    expect(
      buildGlanceNameListView({ items: [], complete: false, loading: true, expanded: false }),
    ).toMatchObject({ state: "loading", total: null });
    expect(
      buildGlanceNameListView({ items: null, complete: false, loading: false, expanded: false }),
    ).toMatchObject({ state: "unknown", total: null });
  });

  it("shows names from an incomplete read without claiming a total", () => {
    const view = buildGlanceNameListView({
      items: many(3),
      complete: false,
      loading: false,
      expanded: false,
    });
    expect(view.state).toBe("list");
    expect(view.total).toBeNull();
    expect(formatGlanceHeading("Plants", view)).toBe("Plants");
  });

  it("drops rows without an id and is repeatable", () => {
    const input = {
      items: [item(1), { id: "", label: "ghost", href: "/x" }, item(2)],
      complete: true,
      loading: false,
      expanded: false,
    };
    const first = buildGlanceNameListView(input);
    expect(first.items.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(buildGlanceNameListView(input)).toEqual(first);
  });

  it("uses the singular for one item", () => {
    const view = { expanded: false, total: 1, items: [] };
    expect(formatGlanceToggleLabel(view, noun)).toBe("See all 1 plant");
  });
});

describe("sortGlanceItemsByLabel", () => {
  it("orders by label, ignoring case, then by id", () => {
    const sorted = sortGlanceItemsByLabel([
      { id: "b", label: "veg", href: "/b" },
      { id: "a", label: "Veg", href: "/a" },
      { id: "c", label: "Flower", href: "/c" },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});
