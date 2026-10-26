import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

const storage = vi.hoisted(() => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
}));

vi.mock("@/lib/cronkFeedLogAnalytics", () => ({
  trackFeedLogEvent: vi.fn(),
}));

import { trackFeedLogEvent } from "@/lib/cronkFeedLogAnalytics";
import {
  CRONK_FEED_LOG_CTA_HREF,
  CRONK_FEED_LOG_CTA_LABEL,
  CRONK_FEED_LOG_DISCLAIMER,
  CRONK_FEED_LOG_FAQ,
  CRONK_FEED_LOG_H1,
} from "@/lib/cronkFeedLogRules";
import CronkFeedLog from "@/pages/CronkFeedLog";
import { staticRouteHead } from "@/lib/build/staticRouteHead";

function renderPage() {
  return render(
    <MemoryRouter>
      <CronkFeedLog />
    </MemoryRouter>,
  );
}

function mockViewport(matchesDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("public Cronk nutrients feed log page", () => {
  beforeEach(() => {
    vi.mocked(trackFeedLogEvent).mockClear();
    storage.setItem.mockClear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    mockViewport(true);
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:feed-log"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders one disclaimer twice, three signup CTAs, and FAQ text that matches JSON-LD", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: CRONK_FEED_LOG_H1 })).toBeInTheDocument();
    expect(screen.getAllByText(CRONK_FEED_LOG_DISCLAIMER)).toHaveLength(2);
    expect(screen.getByLabelText("Week 1, Product 1, planned")).toHaveValue("");
    expect(screen.getByText("Avg temp (°F)")).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: CRONK_FEED_LOG_CTA_LABEL });
    expect(ctas).toHaveLength(3);
    expect(ctas.map((link) => link.getAttribute("href"))).toEqual([
      CRONK_FEED_LOG_CTA_HREF,
      CRONK_FEED_LOG_CTA_HREF,
      CRONK_FEED_LOG_CTA_HREF,
    ]);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/welcome");
    expect(
      screen.getByRole("link", { name: "Advanced Nutrients feeding chart log" }),
    ).toHaveAttribute("href", "/guides/advanced-nutrients-feeding-chart-log");
    expect(screen.getByRole("link", { name: "Athena feed chart log" })).toHaveAttribute(
      "href",
      "/guides/athena-feed-chart-log",
    );
    const head = staticRouteHead("/guides/cronk-nutrients-grow-diary");
    const blocks = (head.scripts ?? []).map((script) => JSON.parse(String(script.children)));
    const types = blocks.map((block) => block["@type"]);
    expect(types).toEqual(["WebPage", "Article", "FAQPage", "BreadcrumbList", "WebApplication"]);
    expect(blocks[1].datePublished).toBe("2026-07-16");
    expect(blocks[1].dateModified).toBe("2026-10-26");
    expect(blocks[3].itemListElement[0].item).toBe("https://verdantgrowdiary.com/welcome");
    const faq = blocks[2].mainEntity.map(
      (entry: { name: string; acceptedAnswer: { text: string } }) => ({
        question: entry.name,
        answer: entry.acceptedAnswer.text,
      }),
    );
    expect(faq).toEqual(CRONK_FEED_LOG_FAQ.map((entry) => ({ ...entry })));
    for (const entry of CRONK_FEED_LOG_FAQ) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
    }
  });

  it("calculates a deviation without storing the log", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Week 1, Product 1, planned"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Week 1, Product 1, actual"), {
      target: { value: "2.5" },
    });
    expect(screen.getByText(/\+0\.50/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "PuurOrganics" }));
    expect(screen.getByLabelText("Week 1, Product 1, planned")).toHaveValue("2");
    expect(trackFeedLogEvent).toHaveBeenCalledWith("feed_log_line_changed", {
      line: "puurorganics",
    });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("uses stacked cards on a phone viewport and does not render the wide table", () => {
    mockViewport(false);
    renderPage();
    expect(screen.getByTestId("cronk-feed-log-page")).toHaveAttribute("data-layout", "phone");
    expect(screen.queryByRole("region", { name: "Weekly feed log table" })).not.toBeInTheDocument();
    expect(screen.getByTestId("cronk-feed-log-phone-cards")).toBeInTheDocument();
  });
});
