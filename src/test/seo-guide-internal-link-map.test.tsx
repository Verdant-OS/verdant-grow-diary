/**
 * Internal-link map, 2026-10-21 (ranks 1–3). Three guide sections gain one
 * ordinary crawlable link each, to a page the crawl found with few or no
 * incoming internal links. Each destination must be linked exactly once on its
 * source guide (counted by href, whatever the label), inside the named section,
 * identically in the static no-JS body and on the hydrated page, and point at a
 * page that exists.
 */
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import GuidePage from "@/pages/GuidePage";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { GLOSSARY_TERMS } from "@/constants/glossaryTerms";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";

const routeState = vi.hoisted(() => ({ slug: "" }));

vi.mock("@/lib/react-router-compat", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) =>
    createElement("a", { href: to, ...props }, children),
  Navigate: ({ to }: { to: string }) => createElement("span", { "data-redirect-to": to }),
  useLocation: () => ({ hash: "" }),
  useParams: () => ({ slug: routeState.slug }),
}));
vi.mock("@/components/DiaryFaqLinkStatsPanel", () => ({ default: () => null }));
vi.mock("@/components/customer/CustomerComparisonGuideQrOption", () => ({
  default: () => null,
}));

afterEach(() => {
  cleanup();
  document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove());
});

const EDGES = [
  {
    source: "what-to-log-in-a-grow-journal",
    heading: "Log inputs with their numbers, not adjectives",
    label: "Use the five-field grow journal template",
    to: "/guides/grow-journal-template",
  },
  {
    source: "daily-grow-log-checklist",
    heading: "One entry per change, against the plant",
    label: "See how the no-account draft works",
    to: "/guides/grow-journal-app-without-account",
  },
  {
    source: "what-to-log-in-a-grow-journal",
    heading: "Photos and sensor snapshots: the context multipliers",
    label: "Look up cultivation terms in the glossary",
    to: "/glossary",
  },
] as const;

/** Every anchor to `to` under `root`, whatever its label. */
function anchorsTo(root: ParentNode, to: string): HTMLAnchorElement[] {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>(`a[href="${to}"]`));
}

function staticBody(slug: string): Document {
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((d) => d.path === `/guides/${slug}`);
  return new DOMParser().parseFromString(doc?.metadata.bodyFallbackHtml ?? "", "text/html");
}

describe("internal-link map data", () => {
  it.each(EDGES)("$source → $to sits in its named section, once", (edge) => {
    const guide = findGuideBySlug(edge.source);
    const section = guide?.sections.find((s) => s.heading === edge.heading);
    expect(section, edge.heading).toBeDefined();
    expect(section?.links ?? []).toContainEqual({ label: edge.label, to: edge.to });
    const everyLink = guide?.sections.flatMap((s) => s.links ?? []) ?? [];
    expect(everyLink.filter((l) => l.label === edge.label)).toHaveLength(1);
    expect(everyLink.filter((l) => l.to === edge.to)).toHaveLength(1);
  });

  it("keeps the glossary link after the existing sensor-truth link", () => {
    const section = findGuideBySlug("what-to-log-in-a-grow-journal")?.sections.find(
      (s) => s.heading === EDGES[2].heading,
    );
    const targets = (section?.links ?? []).map((l) => l.to);
    expect(targets.indexOf("/glossary")).toBeGreaterThan(
      targets.indexOf("/guides/sensor-truth-grow-room"),
    );
    expect(targets.indexOf("/guides/sensor-truth-grow-room")).toBeGreaterThanOrEqual(0);
  });

  it.each(EDGES)("target $to is a published public document", (edge) => {
    expect(STATIC_PUBLIC_SEO_DOCUMENTS.some((d) => d.path === edge.to)).toBe(true);
  });

  it("the glossary still defines VPD, the term the source guide uses", () => {
    expect(GLOSSARY_TERMS.some((t) => t.term === "Vapor Pressure Deficit (VPD)")).toBe(true);
  });
});

describe("internal-link map in the static no-JS body", () => {
  it.each(EDGES)("$source emits $to once, inside its section", (edge) => {
    const html = staticBody(edge.source);
    const section = Array.from(html.querySelectorAll("section")).find(
      (s) => s.querySelector("h2")?.textContent === edge.heading,
    );
    expect(section, edge.heading).toBeDefined();
    const inSection = Array.from(section?.querySelectorAll(`a[href="${edge.to}"]`) ?? []);
    expect(inSection.map((a) => a.textContent)).toEqual([edge.label]);
    const sameLabel = Array.from(html.querySelectorAll("a")).filter(
      (a) => a.textContent === edge.label,
    );
    expect(sameLabel).toHaveLength(1);
    expect(sameLabel[0].getAttribute("rel")).toBeNull();
    expect(anchorsTo(html, edge.to)).toHaveLength(1);
  });

  it("counts a differently labelled second link to the same destination", () => {
    const edge = EDGES[0];
    const html = staticBody(edge.source);
    const extra = html.createElement("a");
    extra.setAttribute("href", edge.to);
    extra.textContent = "Grow journal template";
    html.body.appendChild(extra);
    expect(anchorsTo(html, edge.to).map((a) => a.textContent)).toEqual([
      edge.label,
      "Grow journal template",
    ]);
  });
});

describe("internal-link map on the hydrated guide", () => {
  it.each(EDGES)("$source renders $to once, inside its section", (edge) => {
    routeState.slug = edge.source;
    render(<GuidePage />);
    const nav = screen.getByRole("navigation", { name: `In Verdant: ${edge.heading}` });
    expect(within(nav).getByRole("link", { name: edge.label })).toHaveAttribute("href", edge.to);
    expect(screen.getAllByRole("link", { name: edge.label })).toHaveLength(1);
    expect(anchorsTo(document.body, edge.to)).toHaveLength(1);
  });
});
