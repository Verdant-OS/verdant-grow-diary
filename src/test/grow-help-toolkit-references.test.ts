import { describe, expect, it } from "vitest";
import {
  GROW_HELP_REFERENCE_GROUPS,
  GROW_HELP_RELATED_RESOURCES,
} from "@/constants/growHelpToolkitReferences";

describe("Grow Help Toolkit reference catalog", () => {
  it("keeps every requested capability source as a unique secure external reference", () => {
    const sources = GROW_HELP_REFERENCE_GROUPS.flatMap((group) => group.sources);
    const urls = sources.map((source) => source.url);

    expect(GROW_HELP_REFERENCE_GROUPS.map((group) => group.title)).toEqual([
      "Nutrient references",
      "Light references",
      "Expense references",
    ]);
    expect(sources).toHaveLength(18);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => url.startsWith("https://"))).toBe(true);
    expect(sources.every((source) => source.method.trim().length >= 30)).toBe(true);
  });

  it("links only to the intended public Verdant planning references", () => {
    expect(GROW_HELP_RELATED_RESOURCES.map((resource) => resource.path)).toEqual([
      "/tools/vpd-calculator",
      "/tools/blueprint-targets",
      "/guides",
    ]);
    expect(GROW_HELP_RELATED_RESOURCES.every((resource) => resource.description.length > 40)).toBe(
      true,
    );
  });
});
