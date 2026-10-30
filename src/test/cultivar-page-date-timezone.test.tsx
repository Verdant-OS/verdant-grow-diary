import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERDANT_CULTIVARS, getCultivarSources } from "@/constants/strainReferenceLibrary";
import CultivarPage from "@/pages/CultivarPage";

const fixture = vi.hoisted(() => ({ date: null as string | null }));

vi.mock("@/lib/react-router-compat", () => ({
  useParams: () => ({ slug: "sour-diesel" }),
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
  Navigate: () => null,
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/components/BrandLogo", () => ({ default: () => null }));
vi.mock("@/components/CultivarFollowButton", () => ({ default: () => null }));
vi.mock("@/components/CultivarPhenoSampleModule", () => ({ default: () => null }));
vi.mock("@/components/CultivarQaPanel", () => ({ default: () => null }));
vi.mock("@/components/CultivarBlueprintCrossSell", () => ({ default: () => null }));
vi.mock("@/hooks/usePublishedCultivars", async () => {
  const { BUNDLED_CULTIVAR_CATALOG: catalog } = await import(
    "@/lib/cultivarReferenceSourceRules"
  );
  return {
    usePublishedCultivars: () => ({
      state: "bundled_fallback",
      reason: "flag_disabled",
      catalog: {
        ...catalog,
        findBySlug: (slug: string) => {
          const profile = catalog.findBySlug(slug);
          return profile && fixture.date !== null
            ? { ...profile, lastVerifiedAt: fixture.date }
            : profile;
        },
        sourcesFor: (profile: Parameters<typeof catalog.sourcesFor>[0]) =>
          catalog.sourcesFor(profile).map((source) => ({
            ...source,
            retrievedAt: fixture.date ?? source.retrievedAt,
          })),
      },
    }),
  };
});

const NativeDateTimeFormat = Intl.DateTimeFormat;
const profile = VERDANT_CULTIVARS.find((item) => item.slug === "sour-diesel")!;
const timezones = [
  "UTC",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Tokyo",
  "Pacific/Kiritimati",
];
let hostTimezone = "UTC";
let root: Root | undefined;

beforeEach(() => {
  hostTimezone = "UTC";
  fixture.date = null;
  // Model the host's default zone only. Explicit production timeZone options
  // take precedence. Changing process.env.TZ is unreliable in Vitest workers.
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    (locales, options) =>
      new NativeDateTimeFormat(locales, { timeZone: hostTimezone, ...options }),
  );
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
});

function expectVisibleDates(container: HTMLElement, expected: string) {
  const label = [...container.querySelectorAll("dt")].find(
    (item) => item.textContent === "Last verified",
  );
  expect(label?.parentElement?.querySelector("dd")?.textContent).toBe(expected);
  const sources = [...container.querySelectorAll("#sources li")];
  expect(sources).toHaveLength(getCultivarSources(profile).length);
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) expect(source.textContent).toContain(`retrieved ${expected}`);
}

describe("cultivar reference date hydration (VER-306)", () => {
  it.each(timezones)("preserves UTC server dates and Article dates in %s", async (timezone) => {
    // The real bundled dates are midnight UTC; do not alter them for this case.
    expect(profile.lastVerifiedAt).toBe("2026-07-22T00:00:00.000Z");
    expect(getCultivarSources(profile).every((s) => s.retrievedAt === profile.lastVerifiedAt)).toBe(
      true,
    );
    const html = renderToString(<CultivarPage />);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    expectVisibleDates(container, "Jul 22, 2026");
    const beforeHydration = container.innerHTML;

    hostTimezone = timezone;
    const recoverable = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, <CultivarPage />, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe(beforeHydration);
    expectVisibleDates(container, "Jul 22, 2026");
    const article = document.head.querySelector<HTMLScriptElement>(
      'script[data-page-ldjson="cultivar-sour-diesel-article"]',
    );
    expect(JSON.parse(article!.text)).toMatchObject({
      "@type": "Article",
      datePublished: "2026-07-22",
      dateModified: "2026-07-22",
    });
  });

  it.each(timezones)("preserves year and leap-day boundaries in %s", (timezone) => {
    hostTimezone = timezone;
    for (const [date, expected] of [
      ["2026-01-01T00:00:00.000Z", "Jan 1, 2026"],
      ["2024-02-29T00:00:00.000Z", "Feb 29, 2024"],
      ["2026-12-31T23:59:59.000Z", "Dec 31, 2026"],
    ]) {
      fixture.date = date;
      const container = document.createElement("div");
      container.innerHTML = renderToString(<CultivarPage />);
      expectVisibleDates(container, expected);
    }
  });

  it.each(["", "not-a-date"])("keeps the Not recorded fallback for %j", (date) => {
    fixture.date = date;
    const container = document.createElement("div");
    container.innerHTML = renderToString(<CultivarPage />);
    expectVisibleDates(container, "Not recorded");
  });
});
