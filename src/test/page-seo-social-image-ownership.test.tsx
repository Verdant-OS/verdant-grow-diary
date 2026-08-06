import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePageSeo } from "@/hooks/usePageSeo";

const ROUTE_IMAGE =
  "https://verdantgrowdiary.com/og/guides--cannabis-grow-light-distance-and-schedule.png";
const EXPLICIT_IMAGE = "https://verdantgrowdiary.com/og/custom-card.png";
const BRAND_IMAGE = "https://verdantgrowdiary.com/brand/verdant-logo-512.png";

function SeoProbe({ ogImage, noindex = false }: { ogImage?: string; noindex?: boolean }) {
  usePageSeo({
    title: "Cannabis Grow Light Distance, PPFD & DLI Guide | Verdant",
    description: "Measure PPFD, DLI, and canopy response before changing light distance.",
    path: "/guides/cannabis-grow-light-distance-and-schedule",
    ogType: "article",
    ogImage,
    noindex,
  });
  return null;
}

function addRouteOwnedMeta(attribute: "name" | "property", key: string) {
  const meta = document.createElement("meta");
  meta.setAttribute(attribute, key);
  meta.setAttribute("content", ROUTE_IMAGE);
  document.head.appendChild(meta);
  return meta;
}

afterEach(() => {
  cleanup();
  document.head
    .querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
    .forEach((node) => node.remove());
});

describe("usePageSeo social-image ownership", () => {
  it("preserves route-owned OG and Twitter images when the page omits an explicit image", () => {
    const ogImage = addRouteOwnedMeta("property", "og:image");
    const twitterImage = addRouteOwnedMeta("name", "twitter:image");

    render(<SeoProbe />);

    expect(ogImage.getAttribute("content")).toBe(ROUTE_IMAGE);
    expect(twitterImage.getAttribute("content")).toBe(ROUTE_IMAGE);
  });

  it("preserves the initially discovered route image across effect reruns", () => {
    const ogImage = addRouteOwnedMeta("property", "og:image");
    const twitterImage = addRouteOwnedMeta("name", "twitter:image");
    const view = render(<SeoProbe />);

    view.rerender(<SeoProbe noindex />);

    expect(ogImage.getAttribute("content")).toBe(ROUTE_IMAGE);
    expect(twitterImage.getAttribute("content")).toBe(ROUTE_IMAGE);
  });

  it("uses the brand fallback when neither the route nor the page supplies an image", () => {
    render(<SeoProbe />);

    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      BRAND_IMAGE,
    );
    expect(document.head.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe(
      BRAND_IMAGE,
    );
  });

  it("lets an explicit page image override route-owned metadata", () => {
    const ogImage = addRouteOwnedMeta("property", "og:image");
    const twitterImage = addRouteOwnedMeta("name", "twitter:image");

    render(<SeoProbe ogImage={EXPLICIT_IMAGE} />);

    expect(ogImage.getAttribute("content")).toBe(EXPLICIT_IMAGE);
    expect(twitterImage.getAttribute("content")).toBe(EXPLICIT_IMAGE);
  });
});
