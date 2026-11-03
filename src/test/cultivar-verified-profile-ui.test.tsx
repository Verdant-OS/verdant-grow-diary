import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { findCultivarBySlug, getCultivarGuideSections } from "@/constants/strainReferenceLibrary";
import type { CultivarSource, VerdantCultivarProfile } from "@/constants/strainReferenceLibrary";

const catalog = vi.hoisted(() => ({
  profile: null as VerdantCultivarProfile | null,
  sources: [] as CultivarSource[],
}));

vi.mock("@/hooks/usePublishedCultivars", () => ({
  usePublishedCultivars: () => ({
    state: "bundled_fallback",
    reason: null,
    catalog: {
      findBySlug: () => catalog.profile ?? undefined,
      sectionsFor: (profile: VerdantCultivarProfile) => getCultivarGuideSections(profile),
      sourcesFor: () => catalog.sources,
    },
  }),
}));

import CultivarPage from "@/pages/CultivarPage";

function renderSlug() {
  return render(
    <MemoryRouter initialEntries={["/cultivars/gg4"]}>
      <Routes>
        <Route path="/cultivars/:slug" element={<CultivarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  catalog.profile = null;
  catalog.sources = [];
  cleanup();
});

describe("cultivar verification rendering", () => {
  it("shows sample verification fields and hides the verified-only signup CTA", () => {
    const base = findCultivarBySlug("gg4");
    if (!base) throw new Error("gg4 missing");
    catalog.profile = base;
    catalog.sources = [
      {
        key: "linked",
        title: "Linked source",
        publisher: "Publisher",
        url: "https://example.com/linked",
        sourceType: "breeder",
        retrievedAt: "2026-07-22",
        licenseNotes: "Public page.",
      },
    ];
    renderSlug();
    expect(screen.getByTestId("cultivar-reference-banner")).toHaveTextContent(
      "Sample reference data",
    );
    expect(screen.getByText("Last verified")).toBeInTheDocument();
    expect(screen.getByText("sample")).toBeInTheDocument();
    expect(screen.queryByText(/Sources · last checked/)).toBeNull();
    const cta = screen.getByTestId("cultivar-signup-cta");
    expect(cta).toHaveTextContent("Start a free grow diary");
    expect(cta).toHaveAttribute("href", "/auth");
    expect(cta.getAttribute("href")).not.toContain("verdantgrowdiary.com");
    expect(screen.getByRole("link", { name: "Linked source" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("shows the verified signup CTA as a relative URL and honors link policy", () => {
    const base = findCultivarBySlug("gg4");
    if (!base) throw new Error("gg4 missing");
    catalog.profile = {
      ...base,
      verificationStatus: "verified",
      dataOrigin: "editorial",
      lastVerifiedAt: "2026-11-01T00:00:00.000Z",
    };
    catalog.sources = [
      {
        key: "nofollow-source",
        title: "Nofollow source",
        publisher: "Publisher",
        url: "https://example.com/nofollow",
        sourceType: "breeder",
        retrievedAt: "2026-11-01",
        licenseNotes: "Public page.",
        linkPolicy: "nofollow",
      },
      {
        key: "unlinked-source",
        title: "Unlinked source",
        publisher: "Publisher",
        url: "https://example.com/unlinked",
        sourceType: "verdant_editorial",
        retrievedAt: "2026-11-01",
        licenseNotes: "Named, not linked.",
        linkPolicy: "unlinked",
      },
    ];
    renderSlug();
    expect(screen.getByTestId("cultivar-reference-banner")).toHaveTextContent("Source-backed");
    expect(screen.getByText("editorial")).toBeInTheDocument();
    expect(screen.getByText("Nov 1, 2026")).toBeInTheDocument();
    expect(screen.getByText(/Sources · last checked/)).toBeInTheDocument();
    const cta = screen.getByTestId("cultivar-signup-cta");
    expect(cta).toHaveTextContent("Start your Original Glue (GG4) diary");
    expect(cta.getAttribute("href")).toMatch(/^\/auth\?mode=signup/);
    expect(cta.getAttribute("href")).not.toContain("verdantgrowdiary.com");
    expect(screen.getByRole("link", { name: "Nofollow source" })).toHaveAttribute(
      "rel",
      "nofollow noopener noreferrer",
    );
    expect(screen.getByText("Unlinked source").tagName).toBe("P");
    expect(screen.queryByRole("link", { name: "Unlinked source" })).toBeNull();
  });

  it("not-found renders no source links and no canonical", () => {
    catalog.profile = null;
    renderSlug();
    expect(screen.getByTestId("cultivar-not-found")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /source/i })).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('meta[property="og:url"]')).toBeNull();
  });
});
