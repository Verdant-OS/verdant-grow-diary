/**
 * Creator & Breeder Beta landing — safety + CTA regression tests.
 *
 * Guards:
 *  - Hero copy, positioning, sections render.
 *  - Explicit "does not" statements are present (no auto keeper selection,
 *    no equipment control, no guaranteed yield, no medical, etc.).
 *  - No forbidden claim strings appear anywhere on the page.
 *  - Primary CTA uses VITE_CREATOR_BETA_FORM_URL when set, and falls back
 *    to a disabled placeholder when the URL is missing or unsafe.
 *  - Only http(s) URLs are accepted; javascript: etc. never becomes an href.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// usePageSeo touches document — stub it so JSDOM stays quiet and deterministic.
vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => undefined,
}));

async function loadPage() {
  vi.resetModules();
  const mod = await import("@/pages/CreatorBeta");
  return mod.default;
}

async function renderPage() {
  const CreatorBeta = await loadPage();
  return render(
    <MemoryRouter>
      <CreatorBeta />
    </MemoryRouter>,
  );
}

const FORBIDDEN_CLAIMS: RegExp[] = [
  /guaranteed yield/i,
  /autopilot grows for you/i,
  /\bmedical\b/i,
  /\bcure\b/i,
  /diagnose disease/i,
  /disqualified/i,
  /buy cannabis/i,
];

beforeEach(() => {
  // Default: no env-configured URL.
  vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

describe("CreatorBeta · content + safety", () => {
  it("renders title, hero, positioning, and both CTAs", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: /show the evidence behind the grow/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("creator-beta-page")).toBeInTheDocument();
    expect(screen.getByTestId("creator-beta-positioning")).toBeInTheDocument();
    // Secondary CTA is always present.
    expect(screen.getByTestId("creator-beta-cta-secondary")).toHaveTextContent(
      /watch demo walkthrough/i,
    );
  });

  it("explicitly says Verdant does not control equipment or auto-select keepers", async () => {
    await renderPage();
    const doesNot = screen.getByTestId("creator-beta-does-not");
    expect(doesNot).toHaveTextContent(/does not control equipment/i);
    expect(doesNot).toHaveTextContent(/does not select keepers automatically/i);
    expect(doesNot).toHaveTextContent(/does not disqualify candidates automatically/i);
    expect(doesNot).toHaveTextContent(/does not run blind automation/i);
    expect(doesNot).toHaveTextContent(/does not claim guaranteed yield/i);
    expect(doesNot).toHaveTextContent(/does not diagnose from one photo with certainty/i);
  });

  it("contains no forbidden claim strings", async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    for (const pattern of FORBIDDEN_CLAIMS) {
      // The "does not …" copy is allowed to name these things; but forbidden
      // claims must never appear as positive assertions. We inspect line by
      // line: any line that matches a forbidden pattern must also negate it.
      const lines = text.split(/\n|\.|•/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (pattern.test(line)) {
          const negated = /does not|never|no\b/i.test(line);
          expect(
            negated,
            `Forbidden claim "${pattern}" appeared in unqualified line: "${line}"`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("CreatorBeta · CTA behavior", () => {
  it("uses configured external form URL for the primary CTA", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "https://forms.example.com/verdant-beta");
    await renderPage();
    const cta = screen.getByTestId("creator-beta-cta-primary");
    expect(cta).toHaveAttribute("href", "https://forms.example.com/verdant-beta");
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", expect.stringMatching(/noopener/));
    expect(cta).toHaveTextContent(/request beta access/i);
    expect(
      screen.queryByTestId("creator-beta-cta-primary-disabled"),
    ).not.toBeInTheDocument();
  });

  it("falls back to a disabled placeholder when the URL is missing", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "");
    await renderPage();
    const disabled = screen.getByTestId("creator-beta-cta-primary-disabled");
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveTextContent(/beta form coming soon/i);
    expect(screen.queryByTestId("creator-beta-cta-primary")).not.toBeInTheDocument();
  });

  it("rejects non-http(s) URLs and falls back to the disabled placeholder", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "javascript:alert(1)");
    await renderPage();
    expect(
      screen.getByTestId("creator-beta-cta-primary-disabled"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("creator-beta-cta-primary")).not.toBeInTheDocument();
  });

  it("trims whitespace-only URLs and treats them as missing", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "   ");
    await renderPage();
    expect(
      screen.getByTestId("creator-beta-cta-primary-disabled"),
    ).toBeInTheDocument();
  });
});
