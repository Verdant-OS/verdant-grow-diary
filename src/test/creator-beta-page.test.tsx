/**
 * Creator Beta landing — content, a11y, CTA, walkthrough, UTM tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));

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
  vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

describe("CreatorBeta · content + a11y", () => {
  it("has exactly one H1 with the hero copy", async () => {
    await renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/show the evidence behind the grow/i);
  });

  it("renders section H2s including Watch demo walkthrough", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: /watch demo walkthrough/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /what verdant does not do/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /best-fit testers/i }),
    ).toBeInTheDocument();
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

  it("contains no unqualified forbidden claim strings", async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    for (const pattern of FORBIDDEN_CLAIMS) {
      const lines = text.split(/\n|\.|•/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (pattern.test(line)) {
          const negated = /does not|never|no\b/i.test(line);
          expect(
            negated,
            `Forbidden claim "${pattern}" in unqualified line: "${line}"`,
          ).toBe(true);
        }
      }
    }
  });

  it("walkthrough section is reachable by the secondary CTA anchor", async () => {
    await renderPage();
    const cta = screen.getByTestId("creator-beta-cta-secondary");
    expect(cta).toHaveAttribute("href", "#watch-demo");
    expect(cta).toHaveAccessibleName(/demo walkthrough/i);
    expect(screen.getByTestId("creator-beta-walkthrough")).toHaveAttribute(
      "id",
      "watch-demo",
    );
    expect(
      screen.getByTestId("creator-beta-walkthrough-steps").querySelectorAll("li"),
    ).toHaveLength(4);
  });
});

describe("CreatorBeta · CTA behavior", () => {
  it("primary CTA uses configured URL, opens in new tab, and announces it", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "https://forms.example.com/verdant-beta");
    await renderPage();
    const cta = screen.getByTestId("creator-beta-cta-primary");
    expect(cta.tagName).toBe("A");
    expect(cta).toHaveAttribute("href", expect.stringMatching(/^https:\/\/forms\.example\.com\/verdant-beta/));
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", expect.stringMatching(/noopener/));
    expect(cta).toHaveAttribute("rel", expect.stringMatching(/noreferrer/));
    // Accessible name includes the "opens in a new tab" sr-only hint.
    expect(cta).toHaveAccessibleName(/request beta access.*new tab/i);
    expect(
      screen.queryByTestId("creator-beta-cta-primary-disabled"),
    ).not.toBeInTheDocument();
  });

  it("primary CTA falls back to a real disabled <button> when URL is missing", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "");
    await renderPage();
    const disabled = screen.getByTestId("creator-beta-cta-primary-disabled");
    expect(disabled.tagName).toBe("BUTTON");
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled).toHaveTextContent(/beta form coming soon/i);
    // Must not be a link stub.
    expect(disabled).not.toHaveAttribute("href");
    expect(screen.queryByTestId("creator-beta-cta-primary")).not.toBeInTheDocument();
  });

  it("rejects non-http(s) URLs and falls back to the disabled placeholder", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "javascript:alert(1)");
    await renderPage();
    expect(screen.getByTestId("creator-beta-cta-primary-disabled")).toBeInTheDocument();
    expect(screen.queryByTestId("creator-beta-cta-primary")).not.toBeInTheDocument();
  });

  it("focusable CTAs can receive focus (keyboard-safe)", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "https://forms.example.com/verdant-beta");
    await renderPage();
    const primary = screen.getByTestId("creator-beta-cta-primary");
    const secondary = screen.getByTestId("creator-beta-cta-secondary");
    primary.focus();
    expect(primary).toHaveFocus();
    secondary.focus();
    expect(secondary).toHaveFocus();
  });
});

describe("CreatorBeta · UTM preservation on primary CTA", () => {
  const originalLocation = window.location;

  function stubSearch(search: string) {
    // JSDOM allows redefining window.location on newer builds via delete.
    // Safer: use a proxy over the existing object.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, search },
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("forwards allow-listed utm_* params onto the external CTA", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "https://forms.example.com/verdant-beta");
    stubSearch("?utm_source=verdant-post&utm_medium=creator&utm_campaign=beta&extra=drop");
    await renderPage();
    const href = screen.getByTestId("creator-beta-cta-primary").getAttribute("href") ?? "";
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://forms.example.com/verdant-beta");
    expect(url.searchParams.get("utm_source")).toBe("verdant-post");
    expect(url.searchParams.get("utm_medium")).toBe("creator");
    expect(url.searchParams.get("utm_campaign")).toBe("beta");
    // Non-allow-listed param must not leak.
    expect(url.searchParams.get("extra")).toBeNull();
  });

  it("target URL's own params win over incoming utm_*", async () => {
    vi.stubEnv(
      "VITE_CREATOR_BETA_FORM_URL",
      "https://forms.example.com/verdant-beta?utm_source=intake",
    );
    stubSearch("?utm_source=verdant-post");
    await renderPage();
    const href = screen.getByTestId("creator-beta-cta-primary").getAttribute("href") ?? "";
    expect(new URL(href).searchParams.get("utm_source")).toBe("intake");
  });
});
