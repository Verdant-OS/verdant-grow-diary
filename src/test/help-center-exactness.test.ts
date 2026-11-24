import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { DEVICE_CONTROL_SENTENCE } from "@/constants/helpCenterArticleCopy";
import { EXACT_PERMANENT_REDIRECTS, resolveHostRouting } from "@/lib/cloudflareHostRoutingRules";
import { HelpCenterContent } from "@/lib/helpCenterContent";
import HelpCenterPage from "@/pages/HelpCenterPage";
import { Route as HelpSectionRoute } from "@/routes/help.$section";

const ALLOWED_DEVICE_SENTENCE = "Verdant reads sensor data and never controls your equipment.";

const SITEMAP = readFileSync(resolve(process.cwd(), "public/sitemap.xml"), "utf8");

function loaderFn() {
  const loader = HelpSectionRoute.options.loader;
  if (typeof loader !== "function") throw new Error("help section loader must be a function");
  return loader;
}

function headFn() {
  const head = HelpSectionRoute.options.head;
  if (typeof head !== "function") throw new Error("help section head must be a function");
  return head;
}

describe("help center exactness", () => {
  it("pins the device sentence to the literal, not to the constant", () => {
    expect(DEVICE_CONTROL_SENTENCE).toBe(ALLOWED_DEVICE_SENTENCE);
    const corpus = HelpCenterContent.articleCopyCorpus();
    expect(corpus).toContain(ALLOWED_DEVICE_SENTENCE);
    expect(corpus.split(ALLOWED_DEVICE_SENTENCE).join("")).not.toContain("controls your equipment");
    const article = HelpCenterContent.articleBySlug("faq");
    if (!article) throw new Error("missing faq article");
    render(
      createElement(MemoryRouter, null, createElement(HelpCenterPage, { section: null, article })),
    );
    expect(screen.getByText(ALLOWED_DEVICE_SENTENCE)).toBeInTheDocument();
  });

  it("does not redirect a longer /faq path", () => {
    expect(resolveHostRouting({ pathname: "/faq/x", search: "" }).kind).toBe("continue");
  });

  it("does not chain any exact redirect target", () => {
    for (const target of Object.values(EXACT_PERMANENT_REDIRECTS)) {
      expect(resolveHostRouting({ pathname: target, search: "" }).kind, target).toBe("continue");
    }
  });

  it("404s unknown slugs that only share a prefix, with a noindex head", async () => {
    for (const slug of ["faq-anything", "faq-x", "FAQ"]) {
      try {
        await loaderFn()({ params: { section: slug } } as never);
        throw new Error(`expected not found for ${slug}`);
      } catch (error) {
        expect(isNotFound(error), slug).toBe(true);
      }
      const result = await headFn()({ params: { section: slug } } as never);
      expect(result.meta, slug).toEqual([{ name: "robots", content: "noindex, follow" }]);
      expect(result.links ?? [], slug).toEqual([]);
    }
  });

  it("lists /help/faq in the sitemap and leaves /faq out", () => {
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/help/faq</loc>");
    expect(SITEMAP).not.toContain("<loc>https://verdantgrowdiary.com/faq</loc>");
  });
});
