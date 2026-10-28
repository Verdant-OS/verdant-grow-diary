/**
 * The grow log app / paper journal / spreadsheet guide makes product claims a
 * grower will act on. Each one is pinned here to the rule it depends on.
 */
import { describe, expect, it } from "vitest";
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS } from "@/lib/publicQuickLogStarterRules";

const guide = findGuideBySlug("grow-log-app-vs-grow-journal")!;
const copy = JSON.stringify(guide);

describe("comparison guide claims", () => {
  it("compares all three formats", () => {
    expect(guide.h1).toMatch(/grow log app, paper journal or spreadsheet/i);
    expect(guide.sections.map((s) => s.heading).join(" ")).toMatch(/Paper.*Spreadsheet.*app/s);
  });

  it("keeps the starter draft local and the account save explicit", () => {
    expect(guide.cta?.description).toContain("only in this browser");
    expect(copy).toContain("set up a grow, tent and plant");
    expect(copy).toContain("opening that card is not a save");
    expect(copy).toContain("The starter does not upload the photo");
  });

  it("does not promise anything that the starter rules do not do", () => {
    // The handoff card only offers recent drafts; the guide must not claim permanence.
    expect(PUBLIC_QUICK_LOG_STARTER_HANDOFF_FRESHNESS_MS).toBe(24 * 60 * 60 * 1000);
    expect(copy).toContain("An eligible recent draft");
    expect(copy).not.toMatch(/automatically (imports|saves)|syncs your draft/i);
  });

  it("links only to guides that exist", () => {
    const linked = [
      ...guide.related,
      ...guide.sections
        .flatMap((s) => s.links ?? [])
        .map((l) => l.to.replace("/guides/", ""))
        .filter((to) => !to.startsWith("/")),
    ];
    for (const slug of linked) expect(findGuideBySlug(slug), slug).not.toBeNull();
  });

  it("attributes the starter CTA to this guide", () => {
    const url = new URL(guide.cta!.to, "https://verdantgrowdiary.com");
    expect(url.pathname).toBe("/quick-log");
    expect(url.searchParams.get("utm_content")).toBe("grow-log-app-vs-grow-journal");
  });
});
