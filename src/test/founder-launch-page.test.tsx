import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";

import {
  FOUNDER_INCLUDED_FEATURES,
  FOUNDER_LAUNCH_COPY,
  FOUNDER_LAUNCH_FAQ,
  FOUNDER_PRICING_PATH,
} from "@/constants/founderLaunchCopy";
import { VERDANT_FORBIDDEN_PUBLIC_PHRASES } from "@/constants/verdantSeoCopy";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { PRICING_ANALYTICS_EVENT, type PricingAnalyticsPayload } from "@/lib/pricingAnalytics";
import Founder from "@/pages/Founder";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('[data-page-ldjson^="founder-"]').forEach((node) => node.remove());
});

function renderFounder() {
  return render(
    <MemoryRouter initialEntries={["/founder"]}>
      <Founder />
    </MemoryRouter>,
  );
}

function renderSharedFounder() {
  return render(
    <MemoryRouter
      initialEntries={[
        "/founder?utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch",
      ]}
    >
      <Founder />
    </MemoryRouter>,
  );
}

describe("Founder acquisition page", () => {
  it("renders the canonical offer, safety boundaries, and two measured pricing CTAs", () => {
    renderFounder();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      FOUNDER_LAUNCH_COPY.heading,
    );
    expect(screen.getByText(FOUNDER_LAUNCH_COPY.price)).toBeInTheDocument();
    expect(screen.getByText(FOUNDER_LAUNCH_COPY.availability)).toBeInTheDocument();
    expect(screen.getByText(/credits are capped, never unlimited/i)).toBeInTheDocument();
    expect(screen.getByText(/actions remain approval-required/i)).toBeInTheDocument();

    const pricingLinks = screen.getAllByRole("link", {
      name: FOUNDER_LAUNCH_COPY.primaryCta,
    });
    expect(pricingLinks).toHaveLength(2);
    for (const link of pricingLinks) {
      expect(link).toHaveAttribute("href", FOUNDER_PRICING_PATH);
    }
  });

  it("uses canonical Pro and Founder features without inventing a claimed count", () => {
    renderFounder();
    for (const feature of FOUNDER_INCLUDED_FEATURES) {
      expect(screen.getByText(feature)).toBeInTheDocument();
    }

    const visible = screen.getByTestId("founder-page").textContent ?? "";
    expect(visible).not.toMatch(/\b\d+\s+(?:claimed|remaining|left)\b/i);
    expect(visible).not.toMatch(/guaranteed\s+(?:diagnosis|harvest|yield)/i);
  });

  it("preserves fixed Founder-share attribution into both pricing CTAs", () => {
    renderSharedFounder();
    for (const link of screen.getAllByRole("link", { name: FOUNDER_LAUNCH_COPY.primaryCta })) {
      expect(link).toHaveAttribute(
        "href",
        "/pricing?plan=founder_lifetime&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch",
      );
    }
    expect(screen.getByTestId("founder-start-free-hero")).toHaveAttribute(
      "href",
      "/auth?mode=signup&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch",
    );
  });

  it("emits PII-free page-view and CTA events", () => {
    const events: PricingAnalyticsPayload[] = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent<PricingAnalyticsPayload>).detail);
    };
    window.addEventListener(PRICING_ANALYTICS_EVENT, listener);

    renderFounder();
    fireEvent.click(screen.getByTestId("founder-pricing-cta-hero"));
    fireEvent.click(screen.getByTestId("founder-start-free-hero"));

    window.removeEventListener(PRICING_ANALYTICS_EVENT, listener);
    expect(events).toEqual(
      expect.arrayContaining([
        { name: "founder_page_view", props: { source: "founder_page" } },
        { name: "founder_checkout_cta_clicked", props: { source: "hero" } },
        { name: "founder_start_free_clicked", props: { source: "hero" } },
      ]),
    );
    expect(JSON.stringify(events)).not.toMatch(/email|user_id|token|password/i);
  });

  it("keeps visible FAQ content and FAQPage JSON-LD on the same source", () => {
    renderFounder();
    for (const entry of FOUNDER_LAUNCH_FAQ) {
      expect(screen.getByRole("button", { name: entry.question })).toBeInTheDocument();
    }

    const script = document.head.querySelector<HTMLScriptElement>(
      '[data-page-ldjson="founder-faq"]',
    );
    expect(script).not.toBeNull();
    const payload = JSON.parse(script?.text ?? "{}") as {
      "@type"?: string;
      mainEntity?: Array<{ name?: string }>;
    };
    expect(payload["@type"]).toBe("FAQPage");
    expect(payload.mainEntity?.map((entry) => entry.name)).toEqual(
      FOUNDER_LAUNCH_FAQ.map((entry) => entry.question),
    );
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderFounder();
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((violation) => `${violation.id}:${violation.help}`)).toEqual([]);
  });
});

describe("Founder route, discovery, and safety fences", () => {
  it("is a public lazy route registered in the app and manifest", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('const Founder = lazy(() => import("./pages/Founder"))');
    expect(app).toContain('<Route path="/founder" element={<Founder />} />');
    expect(APP_ROUTES.find((entry) => entry.path === "/founder")?.access).toBe("public");
  });

  it("is discoverable from the sitemap, pricing page, and SEO runtime smoke", () => {
    expect(read("public/sitemap.xml")).toContain("https://verdantgrowdiary.com/founder");
    expect(read("src/pages/Pricing.tsx")).toContain('to="/founder"');
    expect(read("scripts/seo-runtime-smoke.mjs")).toContain('path: "/founder"');
  });

  it("contains no forbidden public automation claims or private-data access", () => {
    const page = read("src/pages/Founder.tsx");
    const surface = [page, read("src/constants/founderLaunchCopy.ts")].join("\n");
    const lower = surface.toLowerCase();
    for (const phrase of VERDANT_FORBIDDEN_PUBLIC_PHRASES) {
      expect(lower).not.toContain(phrase.toLowerCase());
    }
    expect(surface).not.toMatch(/@\/integrations\/supabase|supabase\.|fetch\(/);
    expect(page).not.toMatch(/\.from\(/);
    expect(surface).not.toMatch(/service_role|api[_-]?key|webhook[_-]?secret/i);
  });
});
