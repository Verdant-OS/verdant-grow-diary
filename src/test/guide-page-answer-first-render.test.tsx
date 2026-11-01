/**
 * GuidePage renders the shared answer-first layout (#2650): the question H1,
 * then the direct answer, then the source, and the closing FAQ last.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ slug: "" }));

vi.mock("@/lib/react-router-compat", () => ({
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) =>
    createElement("a", { href: to, ...props }, children),
  Navigate: ({ to }: { to: string }) => createElement("span", { "data-redirect-to": to }),
  useLocation: () => ({ hash: "" }),
  useParams: () => ({ slug: routeState.slug }),
}));
vi.mock("@/components/DiaryFaqLinkStatsPanel", () => ({ default: () => null }));
vi.mock("@/components/customer/CustomerComparisonGuideQrOption", () => ({
  default: () => null,
}));

import { VERDANT_SEO_GUIDES } from "@/constants/verdantSeoContent";
import { selectGuideAnswerFirstLayout } from "@/lib/guideAnswerFirstLayoutRules";
import GuidePage from "@/pages/GuidePage";

afterEach(() => cleanup());

function follows(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("GuidePage answer-first layout", () => {
  it.each(VERDANT_SEO_GUIDES.map((g) => [g.slug, g] as const))(
    "%s: H1, then answer, then source, FAQ last",
    (slug, guide) => {
      routeState.slug = slug;
      render(createElement(GuidePage));
      const layout = selectGuideAnswerFirstLayout({
        question: guide.h1,
        answer: guide.intro,
        sources: guide.sources,
        faq: guide.faq,
      });

      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toHaveTextContent(guide.h1.trim());

      const answer = screen.getByTestId("guide-direct-answer");
      expect(answer).toHaveTextContent(layout.answer ?? "");
      expect(follows(h1, answer)).toBe(true);

      const source = screen.queryByTestId("guide-answer-source");
      if (layout.source) {
        expect(source).not.toBeNull();
        expect(source!.querySelector("a")).toHaveAttribute("href", layout.source.href);
        expect(follows(answer, source!)).toBe(true);
      } else {
        expect(source).toBeNull();
      }

      const faq = screen.queryByTestId("guide-closing-faq");
      if (layout.faq.length > 0) {
        expect(faq).not.toBeNull();
        expect(follows(source ?? answer, faq!)).toBe(true);
        for (const item of layout.faq) expect(faq).toHaveTextContent(item.question);
      } else {
        expect(faq).toBeNull();
      }
    },
  );
});
