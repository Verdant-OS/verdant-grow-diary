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

type HelpHeadMeta = { title?: string; name?: string; content?: string };
type HelpHeadLink = { rel?: string; href?: string };

class HelpSectionHeadRead {
  static title(head: { meta?: ReadonlyArray<HelpHeadMeta | undefined> }): string | undefined {
    return head.meta?.find((entry) => typeof entry?.title === "string")?.title;
  }

  static robots(head: { meta?: ReadonlyArray<HelpHeadMeta | undefined> }): string | undefined {
    return head.meta?.find((entry) => entry?.name === "robots")?.content;
  }

  static canonical(head: { links?: ReadonlyArray<HelpHeadLink | undefined> }): string | undefined {
    return head.links?.find((entry) => entry?.rel === "canonical")?.href;
  }
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

  it("gives each article its own canonical, title and index robots", async () => {
    for (const slug of ["faq", "log-watering"] as const) {
      const article = HelpCenterContent.articleBySlug(slug);
      if (!article) throw new Error(`missing help article ${slug}`);
      const head = await headFn()({ params: { section: slug } } as never);
      expect(HelpSectionHeadRead.canonical(head), slug).toBe(
        `https://verdantgrowdiary.com${article.path}`,
      );
      expect(HelpSectionHeadRead.title(head), slug).toBe(article.titleTag);
      expect(HelpSectionHeadRead.title(head), slug).toContain(article.title);
      const robots = HelpSectionHeadRead.robots(head);
      expect(robots, slug).toContain("index");
      expect(robots, slug).not.toContain("noindex");
    }
  });

  it("keeps the watering facts that a target and a unit are required", () => {
    const corpus = HelpCenterContent.articleCopyCorpus();
    expect(corpus.toLowerCase()).not.toContain("only the amount");
    expect(corpus).toContain("Volume starts in liters when this device has no saved choice");
    const watering = HelpCenterContent.articleBySlug("log-watering");
    if (!watering) throw new Error("missing watering article");
    const steps = watering.blocks.find((block) => block.tag === "ol");
    if (!steps || steps.tag !== "ol") throw new Error("missing watering steps");
    const stepText = steps.items.map((item) => item.map((run) => run.text).join("")).join("\n");
    expect(stepText).toContain("gal");
    const faq = HelpCenterContent.articleBySlug("faq");
    if (!faq) throw new Error("missing faq article");
    const hrefs = faq.blocks.flatMap((block) =>
      block.tag === "ol"
        ? []
        : block.runs.filter((run) => run.kind === "link").map((run) => run.href),
    );
    expect(hrefs).toContain("/help/log-watering");
  });

  it("lists /help/faq in the sitemap and leaves /faq out", () => {
    expect(SITEMAP).toContain("<loc>https://verdantgrowdiary.com/help/faq</loc>");
    expect(SITEMAP).not.toContain("<loc>https://verdantgrowdiary.com/faq</loc>");
  });
});
