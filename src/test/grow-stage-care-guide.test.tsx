/**
 * grow-stage-care-guide.test.tsx
 *
 * Render and interaction tests for the public /guides/grow-stage-care-guide
 * page: search, stage/category filters, checklist checkboxes, FAQ accordion,
 * public-link safety, and no forbidden device-control positioning.
 *
 * No Supabase, no network, no persisted writes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import GrowStageCareGuide from "@/pages/GrowStageCareGuide";
import GuidesIndex from "@/pages/GuidesIndex";
import { APP_ROUTES } from "@/lib/appRouteManifest";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location-probe">{loc.pathname}</div>;
}

function renderGuide(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/guides" element={<GuidesIndex />} />
        <Route path="/guides/grow-stage-care-guide" element={<GrowStageCareGuide />} />
        <Route path="/guides/:slug" element={<LocationProbe />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

const FORBIDDEN_DEVICE_PHRASES = [
  "autopilot",
  "fully automated grow control",
  "AI controls your equipment",
  "automatic device control",
  "autonomous device control",
  "hands-free grow control",
  "set-and-forget automation",
  "controls your lights",
  "controls your fans",
  "controls irrigation",
  "controls humidifiers",
  "controls your equipment",
];

describe("GrowStageCareGuide page", () => {
  it("renders the page with heading, search, and all three stages by default", () => {
    renderGuide("/guides/grow-stage-care-guide");
    expect(screen.getByTestId("grow-stage-care-guide-page")).toBeInTheDocument();
    expect(screen.getByText("Grow-stage care guide")).toBeInTheDocument();
    expect(screen.getByTestId("grow-stage-care-search")).toBeInTheDocument();
    expect(screen.getByTestId("grow-stage-care-seedling")).toBeInTheDocument();
    expect(screen.getByTestId("grow-stage-care-veg")).toBeInTheDocument();
    expect(screen.getByTestId("grow-stage-care-flower")).toBeInTheDocument();
  });

  it("filters to one stage when a stage button is clicked", () => {
    renderGuide("/guides/grow-stage-care-guide");
    const seedlingButton = screen.getByRole("button", { name: "Seedling" });
    fireEvent.click(seedlingButton);
    expect(screen.getByTestId("grow-stage-care-seedling")).toBeInTheDocument();
    expect(screen.queryByTestId("grow-stage-care-veg")).toBeNull();
    expect(screen.queryByTestId("grow-stage-care-flower")).toBeNull();
  });

  it("filters by category badges", () => {
    renderGuide("/guides/grow-stage-care-guide");
    const harvestButton = screen.getByRole("button", { name: "Harvest" });
    fireEvent.click(harvestButton);
    expect(screen.queryByTestId("grow-stage-care-seedling")).toBeNull();
    expect(screen.queryByTestId("grow-stage-care-veg")).toBeNull();
    expect(screen.getByTestId("grow-stage-care-flower")).toBeInTheDocument();
  });

  it("searches checklist text and hides non-matching items", () => {
    renderGuide("/guides/grow-stage-care-guide");
    const search = screen.getByTestId("grow-stage-care-search");
    fireEvent.change(search, { target: { value: "trichome" } });
    expect(screen.queryByTestId("grow-stage-care-seedling")).toBeNull();
    expect(screen.queryByTestId("grow-stage-care-veg")).toBeNull();
    expect(screen.getByTestId("grow-stage-care-flower")).toBeInTheDocument();
  });

  it("shows an empty state when search matches nothing", () => {
    renderGuide("/guides/grow-stage-care-guide");
    const search = screen.getByTestId("grow-stage-care-search");
    fireEvent.change(search, { target: { value: "zzzzzzzzz" } });
    expect(screen.getByTestId("grow-stage-care-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("grow-stage-care-seedling")).toBeNull();
  });

  it("toggles checklist items via checkbox", () => {
    renderGuide("/guides/grow-stage-care-guide");
    const firstCheckbox = screen.getAllByRole("checkbox")[0];
    expect(firstCheckbox).not.toBeChecked();
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox).toBeChecked();
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox).not.toBeChecked();
  });

  it("renders the FAQ accordion with all three questions", () => {
    renderGuide("/guides/grow-stage-care-guide");
    expect(screen.getByText("Can I use the same checklist for every cultivar?")).toBeInTheDocument();
    expect(screen.getByText("Why is the checklist grouped by stage instead of by week?")).toBeInTheDocument();
    expect(screen.getByText("Should I check every item every day?")).toBeInTheDocument();
  });

  it("all internal links point to public routes or real assets", () => {
    const { container } = renderGuide("/guides/grow-stage-care-guide");
    const internal = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => h.startsWith("/"));
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) {
      const pathname = href.split("#")[0].split("?")[0];
      const segs = pathname.split("/").filter(Boolean);
      const entry = APP_ROUTES.find((r) => {
        if (r.path === "*") return false;
        const patSegs = r.path.split("/").filter(Boolean);
        if (patSegs.length !== segs.length) return false;
        return patSegs.every((p, i) => p.startsWith(":") || p === segs[i]);
      });
      expect(entry, `${href} is not a known route or public asset`).toBeTruthy();
      expect(entry?.access, `${href} is not a public route`).toBe("public");
    }
  });

  it("clicking 'All guides' navigates to the public /guides hub", () => {
    const { container } = renderGuide("/guides/grow-stage-care-guide");
    const link = container.querySelector<HTMLAnchorElement>('a[href="/guides"]');
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(screen.getByTestId("guides-index-page")).toBeInTheDocument();
  });

  it("clicking the cannabis FAQ link navigates to that public guide", () => {
    const { container } = renderGuide("/guides/grow-stage-care-guide");
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/guides/cannabis-plant-care"]',
    );
    expect(link).toBeTruthy();
    fireEvent.click(link!);
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/guides/cannabis-plant-care");
  });

  it("contains no forbidden device-control or autopilot positioning", () => {
    const { container } = renderGuide("/guides/grow-stage-care-guide");
    const description =
      document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    const haystack = `${container.textContent ?? ""}\n${document.title}\n${description}`.toLowerCase();
    for (const phrase of FORBIDDEN_DEVICE_PHRASES) {
      expect(
        haystack.includes(phrase.toLowerCase()),
        `contains forbidden phrase: ${phrase}`,
      ).toBe(false);
    }
  });
});
