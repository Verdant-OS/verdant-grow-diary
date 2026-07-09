/**
 * Post-demo feedback section — env-driven external URL, safe fallback,
 * UTM preservation, and shared behavior across creator + breeder variants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));

type Variant = "creator" | "breeder";

async function renderVariant(variant: Variant) {
  vi.resetModules();
  const modPath = variant === "creator" ? "@/pages/CreatorBeta" : "@/pages/BreederBeta";
  const mod = await import(/* @vite-ignore */ modPath);
  const Page = mod.default;
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}

const originalLocation = window.location;
function stubSearch(search: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, search },
  });
}

beforeEach(() => {
  vi.stubEnv("VITE_CREATOR_BETA_FORM_URL", "");
  vi.stubEnv("VITE_BETA_FEEDBACK_FORM_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  cleanup();
});

describe.each<Variant>(["creator", "breeder"])(
  "%s beta · post-demo feedback section",
  (variant) => {
    const root = `${variant}-beta`;

    it("renders a Post-demo feedback heading and prompts list", async () => {
      await renderVariant(variant);
      expect(
        screen.getByRole("heading", { level: 2, name: /post-demo feedback/i }),
      ).toBeInTheDocument();
      const prompts = screen.getByTestId(`${root}-feedback-prompts`);
      expect(prompts.querySelectorAll("li").length).toBeGreaterThanOrEqual(3);
    });

    it("falls back to a real disabled <button> when the URL is missing", async () => {
      await renderVariant(variant);
      const disabled = screen.getByTestId(`${root}-feedback-cta-disabled`);
      expect(disabled.tagName).toBe("BUTTON");
      expect(disabled).toBeDisabled();
      expect(disabled).toHaveAttribute("aria-disabled", "true");
      expect(disabled).not.toHaveAttribute("href");
      expect(disabled).toHaveTextContent(/feedback form coming soon/i);
      expect(screen.queryByTestId(`${root}-feedback-cta`)).not.toBeInTheDocument();
    });

    it("rejects non-http(s) URLs and shows the disabled placeholder", async () => {
      vi.stubEnv("VITE_BETA_FEEDBACK_FORM_URL", "javascript:alert(1)");
      await renderVariant(variant);
      expect(screen.getByTestId(`${root}-feedback-cta-disabled`)).toBeInTheDocument();
      expect(screen.queryByTestId(`${root}-feedback-cta`)).not.toBeInTheDocument();
    });

    it("renders an external anchor with target=_blank + rel noopener noreferrer when configured", async () => {
      vi.stubEnv("VITE_BETA_FEEDBACK_FORM_URL", "https://forms.example.com/verdant-feedback");
      await renderVariant(variant);
      const cta = screen.getByTestId(`${root}-feedback-cta`);
      expect(cta.tagName).toBe("A");
      expect(cta).toHaveAttribute("target", "_blank");
      expect(cta).toHaveAttribute("rel", expect.stringMatching(/noopener/));
      expect(cta).toHaveAttribute("rel", expect.stringMatching(/noreferrer/));
      expect(cta).toHaveAccessibleName(/share post-demo feedback.*new tab/i);
    });

    it("forwards allow-listed utm_* params to the feedback URL and drops others", async () => {
      vi.stubEnv("VITE_BETA_FEEDBACK_FORM_URL", "https://forms.example.com/verdant-feedback");
      stubSearch("?utm_source=verdant-post&utm_medium=beta&secret=drop");
      await renderVariant(variant);
      const href =
        screen.getByTestId(`${root}-feedback-cta`).getAttribute("href") ?? "";
      const url = new URL(href);
      expect(url.origin + url.pathname).toBe("https://forms.example.com/verdant-feedback");
      expect(url.searchParams.get("utm_source")).toBe("verdant-post");
      expect(url.searchParams.get("utm_medium")).toBe("beta");
      expect(url.searchParams.get("secret")).toBeNull();
    });
  },
);
