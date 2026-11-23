import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { staticRouteHead } from "@/lib/build/staticRouteHead";
import { HelpCenterContent } from "@/lib/helpCenterContent";
import HelpCenterPage from "@/pages/HelpCenterPage";

function renderHelp(section: ReturnType<typeof HelpCenterContent.sectionBySlug>) {
  return render(
    <MemoryRouter>
      <HelpCenterPage section={section} />
    </MemoryRouter>,
  );
}

function metaContent(head: ReturnType<typeof staticRouteHead>, name: string): string | undefined {
  const title = head.meta.find((entry) => "title" in entry && entry.title);
  if (name === "title" && title && "title" in title) return title.title;
  const match = head.meta.find((entry) => entry.name === name);
  return match && "content" in match ? match.content : undefined;
}

describe("help center pages", () => {
  it("renders the home title, meta, breadcrumb, and canonical", () => {
    renderHelp(null);
    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument();
    expect(document.title).toBe(HelpCenterContent.homeTitle());
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      HelpCenterContent.homeDescription(),
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://verdantgrowdiary.com/help",
    );
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs).toHaveTextContent("Help");
    expect(crumbs.querySelector("a")).toBeNull();

    const head = staticRouteHead("/help");
    expect(metaContent(head, "title")).toBe("Help | Verdant Grow Diary");
    expect(metaContent(head, "description")).toBe(HelpCenterContent.homeDescription());
    expect(head.links.find((link) => link.rel === "canonical")?.href).toBe(
      "https://verdantgrowdiary.com/help",
    );
  });

  it.each(HelpCenterContent.sections())("renders the $title hub", (section) => {
    renderHelp(section);
    expect(screen.getByRole("heading", { level: 1, name: section.title })).toBeInTheDocument();
    expect(screen.getByText(section.covers)).toBeInTheDocument();
    expect(screen.getByText("Covers")).toBeInTheDocument();
    expect(document.title).toBe(section.titleTag);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      section.covers,
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      `https://verdantgrowdiary.com${section.path}`,
    );
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs).toHaveTextContent(`Help → ${section.title}`);
    expect(crumbs.querySelector("a")?.getAttribute("href")).toBe("/help");

    const head = staticRouteHead(section.path);
    expect(metaContent(head, "title")).toBe(section.titleTag);
    expect(metaContent(head, "description")).toBe(section.covers);
    expect(head.links.find((link) => link.rel === "canonical")?.href).toBe(
      `https://verdantgrowdiary.com${section.path}`,
    );
  });

  it("lists only the MCP tools reference on the developers hub", () => {
    const developers = HelpCenterContent.sectionBySlug("developers");
    if (!developers) throw new Error("missing developers hub");
    renderHelp(developers);
    expect(screen.getByRole("link", { name: "MCP tools reference" })).toHaveAttribute(
      "href",
      "/docs/mcp-api",
    );
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
});

describe("help copy guard", () => {
  it("rejects internal, diagnosis, and equipment-control wording", () => {
    expect(HelpCenterContent.forbiddenCopyHits(HelpCenterContent.publicCopyCorpus())).toEqual([]);
    const samples = [
      "internal source",
      "needs public confirmation",
      "https://slack.com/archives",
      "https://app.notion.com/page",
      "Post-V0 note",
      "see issue 2160",
      "without the grower's explicit approval",
      "without your explicit approval",
      "AI Doctor diagnoses nutrient burn",
      "AI Doctor confirms a deficiency",
      "Verdant will control the lights",
      "the bridge sends a command",
      "this automates your equipment",
    ];
    for (const sample of samples) {
      expect(HelpCenterContent.forbiddenCopyHits(sample).length).toBeGreaterThan(0);
    }
  });
});
