import { act, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/lib/autoflowerWeekPlanAnalytics", () => ({
  trackAutoflowerPlannerEvent: vi.fn(),
}));

import { trackAutoflowerPlannerEvent } from "@/lib/autoflowerWeekPlanAnalytics";
import {
  AUTOFLOWER_WEEK_PLAN_CTA_HREF,
  AUTOFLOWER_WEEK_PLAN_FAQ,
  AUTOFLOWER_WEEK_PLAN_H1,
  AUTOFLOWER_WEEK_PLAN_PATH,
} from "@/lib/autoflowerWeekPlanRules";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import AutoflowerWeekByWeek from "@/pages/AutoflowerWeekByWeek";

function renderPage() {
  return render(
    <MemoryRouter>
      <AutoflowerWeekByWeek />
    </MemoryRouter>,
  );
}

function jsonLd() {
  const document = STATIC_PUBLIC_SEO_DOCUMENTS.find(
    (entry) => entry.path === AUTOFLOWER_WEEK_PLAN_PATH,
  );
  return document?.metadata.jsonLd ?? [];
}

const generatedCalls = () =>
  vi
    .mocked(trackAutoflowerPlannerEvent)
    .mock.calls.filter(([name]) => name === "autoflower_planner_generated");

describe("public autoflower week-by-week planner page", () => {
  beforeEach(() => {
    vi.mocked(trackAutoflowerPlannerEvent).mockClear();
    storage.setItem.mockClear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the H1, the FAQ and three CTAs to the guide's signup URL", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: AUTOFLOWER_WEEK_PLAN_H1 }),
    ).toBeInTheDocument();
    for (const entry of AUTOFLOWER_WEEK_PLAN_FAQ) {
      expect(screen.getAllByText(entry.question).length).toBeGreaterThan(0);
    }
    const ctas = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
    expect(ctas.map((link) => link.getAttribute("href"))).toEqual([
      AUTOFLOWER_WEEK_PLAN_CTA_HREF,
      AUTOFLOWER_WEEK_PLAN_CTA_HREF,
      AUTOFLOWER_WEEK_PLAN_CTA_HREF,
    ]);
  });

  it("emits the visible FAQ word for word as FAQPage JSON-LD, with no ratings", () => {
    renderPage();
    const faq = jsonLd().find((node) => (node as { "@type"?: string })["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    const visible = [...document.querySelectorAll("details")].map((details) => ({
      question: details.querySelector("summary")?.textContent,
      answer: details.querySelector("p")?.textContent,
    }));
    expect(
      faq.mainEntity.map((entry) => ({ question: entry.name, answer: entry.acceptedAnswer.text })),
    ).toEqual(visible);
    const types = jsonLd().map((node) => (node as { "@type"?: string })["@type"]);
    for (const type of ["Article", "FAQPage", "WebApplication", "BreadcrumbList"]) {
      expect(types).toContain(type);
    }
    expect(JSON.stringify(jsonLd())).not.toMatch(/aggregateRating|"review"/i);
  });

  it("builds the plan from the sprout date and estimate, in memory only", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Sprout date"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText(/estimated seed-to-harvest time/), {
      target: { value: "10" },
    });
    expect(screen.getByText("2027-01-09")).toBeInTheDocument();
    expect(screen.getByText("Nov 1–Nov 7 (2026-11-01 to 2026-11-07)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start checking trichomes" })).toHaveAttribute(
      "href",
      "/guides/when-to-harvest-cannabis",
    );
    fireEvent.change(screen.getByLabelText("Actual date for First pistils"), {
      target: { value: "2026-12-03" },
    });
    expect(screen.getByText("+4 days")).toBeInTheDocument();
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
    expect(trackAutoflowerPlannerEvent).toHaveBeenLastCalledWith(
      "autoflower_planner_milestone_logged",
      { milestone_count: 1 },
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the short-estimate message and rejects overlapping stage edits", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/estimated seed-to-harvest time/), {
      target: { value: "7" },
    });
    expect(
      screen.getByText("Short estimate: adjust the stage weeks to your breeder's description."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/estimated seed-to-harvest time/), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Veg end wk"), { target: { value: "5" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Stages must be in order without overlapping.",
    );
  });

  it("drops a stale clipboard fallback once the plan changes", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy plan" }));
    });
    expect(screen.getByLabelText(/Clipboard access was unavailable/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sprout date"), { target: { value: "2026-11-01" } });
    expect(screen.queryByLabelText(/Clipboard access was unavailable/)).not.toBeInTheDocument();
  });

  it("prints inside a visible print section", () => {
    renderPage();
    expect(screen.getByTestId("autoflower-week-page")).toHaveAttribute(
      "data-print-section",
      "public-guide-tool",
    );
  });

  it("throttles autoflower_planner_generated to one event per two seconds", () => {
    const now = vi.spyOn(performance, "now");
    renderPage();
    now.mockReturnValue(10_000);
    fireEvent.click(screen.getByLabelText("20/4 (20 hours on, 4 off)"));
    now.mockReturnValue(11_999);
    fireEvent.click(screen.getByLabelText("18/6 (18 hours on, 6 off)"));
    expect(generatedCalls()).toHaveLength(1);
    expect(generatedCalls()[0][1]).toEqual({ estimate_weeks: 10, light: "20_4" });
    now.mockReturnValue(12_000);
    fireEvent.click(screen.getByLabelText("20/4 (20 hours on, 4 off)"));
    expect(generatedCalls()).toHaveLength(2);
    now.mockRestore();
  });
});
