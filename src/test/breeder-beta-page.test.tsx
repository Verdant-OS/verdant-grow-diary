/**
 * Breeder Beta landing — breeder-focused variant + shared invariants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));

async function renderPage() {
  vi.resetModules();
  const mod = await import("@/pages/BreederBeta");
  const BreederBeta = mod.default;
  return render(
    <MemoryRouter>
      <BreederBeta />
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

describe("BreederBeta · content + a11y", () => {
  it("renders the breeder-focused kicker and support copy", async () => {
    await renderPage();
    expect(screen.getByText(/verdant breeder beta/i)).toBeInTheDocument();
    expect(
      screen.getByText(/keeper decisions stay grounded in evidence the breeder can defend/i),
    ).toBeInTheDocument();
  });

  it("has exactly one H1 with the shared hero copy", async () => {
    await renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/show the evidence behind the grow/i);
  });

  it("preserves the 'does not' invariants (no auto keeper/disqualify/equipment)", async () => {
    await renderPage();
    const doesNot = screen.getByTestId("breeder-beta-does-not");
    expect(doesNot).toHaveTextContent(/does not select keepers automatically/i);
    expect(doesNot).toHaveTextContent(/does not disqualify candidates automatically/i);
    expect(doesNot).toHaveTextContent(/does not control equipment/i);
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

  it("walkthrough section is present and anchored", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: /watch demo walkthrough/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("breeder-beta-walkthrough")).toHaveAttribute(
      "id",
      "watch-demo",
    );
    expect(
      screen.getByTestId("breeder-beta-cta-secondary"),
    ).toHaveAttribute("href", "#watch-demo");
  });

  it("primary CTA falls back to a real disabled button when URL is missing", async () => {
    await renderPage();
    const disabled = screen.getByTestId("breeder-beta-cta-primary-disabled");
    expect(disabled.tagName).toBe("BUTTON");
    expect(disabled).toBeDisabled();
    expect(disabled).not.toHaveAttribute("href");
  });

  it("primary CTA is external with target=_blank and rel noopener noreferrer when configured", async () => {
    vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "https://forms.example.com/verdant-beta");
    await renderPage();
    const cta = screen.getByTestId("breeder-beta-cta-primary");
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", expect.stringMatching(/noopener/));
    expect(cta).toHaveAttribute("rel", expect.stringMatching(/noreferrer/));
    expect(cta).toHaveAccessibleName(/request beta access.*new tab/i);
  });
});
