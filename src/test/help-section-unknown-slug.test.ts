import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route as HelpSectionRoute } from "@/routes/help.$section";

describe("unknown help section", () => {
  it("loader throws not found", async () => {
    const loader = HelpSectionRoute.options.loader;
    if (typeof loader !== "function") throw new Error("help section loader must be a function");
    try {
      await loader({ params: { section: "not-a-section" } } as never);
      throw new Error("expected not found");
    } catch (error) {
      expect(isNotFound(error)).toBe(true);
    }
  });

  it("head is noindex and has no canonical", async () => {
    const head = HelpSectionRoute.options.head;
    if (typeof head !== "function") throw new Error("help section head must be a function");
    const result = await head({ params: { section: "not-a-section" } } as never);
    expect(result.meta).toEqual([{ name: "robots", content: "noindex, follow" }]);
    expect(result.links ?? []).toEqual([]);
  });
});
