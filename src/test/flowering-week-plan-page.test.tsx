import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/lib/floweringWeekPlanAnalytics", () => ({
  trackFloweringPlannerEvent: vi.fn(),
}));

import { trackFloweringPlannerEvent } from "@/lib/floweringWeekPlanAnalytics";
import {
  FLOWERING_PLAN_CTA_HREF,
  FLOWERING_PLAN_FAQ,
  FLOWERING_PLAN_H1,
} from "@/lib/floweringWeekPlanRules";
import CannabisFloweringStagesWeekByWeek from "@/pages/CannabisFloweringStagesWeekByWeek";

function renderPage() {
  return render(
    <MemoryRouter>
      <CannabisFloweringStagesWeekByWeek />
    </MemoryRouter>,
  );
}

const calls = (name: string) =>
  vi.mocked(trackFloweringPlannerEvent).mock.calls.filter(([event]) => event === name);

const planTable = () => screen.getByRole("region", { name: "Flower plan table" });
const milestoneTable = () => screen.getByRole("region", { name: "Milestone log table" });

describe("public cannabis flowering stages planner page", () => {
  beforeEach(() => {
    vi.mocked(trackFloweringPlannerEvent).mockClear();
    storage.setItem.mockClear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the H1, the FAQ and three CTAs to the guide's signup URL", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: FLOWERING_PLAN_H1 })).toBeInTheDocument();
    const faq = document.getElementById("cannabis-flowering-stages-faq")!;
    const visible = [...faq.querySelectorAll("details")].map((d) => ({
      question: d.querySelector("summary")?.textContent,
      answer: d.querySelector("p")?.textContent,
    }));
    expect(visible).toEqual(FLOWERING_PLAN_FAQ.map((q) => ({ ...q })));
    const ctas = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
    expect(ctas.map((a) => [a.getAttribute("href"), a.getAttribute("data-cta-location")])).toEqual([
      [FLOWERING_PLAN_CTA_HREF, "tool"],
      [FLOWERING_PLAN_CTA_HREF, "article"],
      [FLOWERING_PLAN_CTA_HREF, "footer"],
    ]);
    expect(screen.getByTestId("flowering-plan-page")).toHaveAttribute(
      "data-print-section",
      "public-guide-tool",
    );
  });

  it("dates the plan from the flip across the new year, in memory only", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Flip to 12/12 date"), {
      target: { value: "2026-12-14" },
    });
    const rows = within(planTable()).getAllByRole("row");
    expect(rows).toHaveLength(1 + 9);
    expect(rows[1]).toHaveTextContent("Dec 14–Dec 20 (2026-12-14 to 2026-12-20)");
    expect(rows[9]).toHaveTextContent("Feb 8–Feb 14 (2027-02-08 to 2027-02-14)");
    expect(within(rows[7]).getByRole("link", { name: "Start checking trichomes" })).toHaveAttribute(
      "href",
      "/guides/when-to-harvest-cannabis",
    );
    expect(screen.getByText("2027-02-14")).toBeInTheDocument();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs a milestone difference and the stretch result", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Flip to 12/12 date"), {
      target: { value: "2026-12-14" },
    });
    fireEvent.change(screen.getByLabelText("Actual date for First pistils"), {
      target: { value: "2026-12-25" },
    });
    expect(within(milestoneTable()).getByText("+4 days")).toBeInTheDocument();
    expect(calls("flowering_planner_milestone_logged").at(-1)?.[1]).toEqual({
      milestone_count: 1,
    });
    fireEvent.change(screen.getByLabelText("Height at flip (inches, optional)"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Height when stretch slows (inches)"), {
      target: { value: "36" },
    });
    expect(screen.getAllByText("Stretch: +16.0 in (+80%)").length).toBeGreaterThan(0);
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
  });

  it("re-plans for a short flowering time and rejects overlapping stage edits", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Breeder's flowering time (weeks from flip)"), {
      target: { value: "7" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Short flowering time: adjust the stage weeks to your breeder's description.",
    );
    expect(within(planTable()).getAllByRole("row")).toHaveLength(1 + 7);
    fireEvent.change(screen.getByLabelText("Bud set end wk"), { target: { value: "4" } });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bud set (weeks 3–4) overlaps or is out of order with Bulking (weeks 4–5).",
    );
  });

  it("debounces generated and stage_edited to one event after two quiet seconds", () => {
    vi.useFakeTimers();
    renderPage();
    const weeks = screen.getByLabelText("Breeder's flowering time (weeks from flip)");
    fireEvent.change(weeks, { target: { value: "10" } });
    fireEvent.change(weeks, { target: { value: "11" } });
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(calls("flowering_planner_generated")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(calls("flowering_planner_generated")).toEqual([
      ["flowering_planner_generated", { flower_weeks: 11 }],
    ]);
    fireEvent.change(screen.getByLabelText("Start checking trichomes (wk)"), {
      target: { value: "8" },
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(calls("flowering_planner_stage_edited")).toHaveLength(1);
  });

  it("sends autoflower growers to the autoflower planner", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Autoflower"));
    expect(screen.queryByTestId("photoperiod-planner-body")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("planned from the sprout date instead");
    expect(calls("flowering_planner_plant_type")).toEqual([
      ["flowering_planner_plant_type", { type: "autoflower" }],
    ]);
  });

  it("falls back to a text box and drops it once the plan changes", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy plan" }));
    });
    expect(screen.getByLabelText(/Clipboard access was unavailable/)).toBeInTheDocument();
    expect(calls("flowering_planner_copy")[0][1]).toEqual({ week_count: 9 });
    fireEvent.change(screen.getByLabelText("Plant name (optional)"), {
      target: { value: "Tent 1" },
    });
    expect(screen.queryByLabelText(/Clipboard access was unavailable/)).not.toBeInTheDocument();
  });

  it("clears only after confirmation", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Breeder's flowering time (weeks from flip)"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    expect(screen.getByLabelText("Breeder's flowering time (weeks from flip)")).toHaveValue(9);
    expect(within(planTable()).getAllByRole("row")).toHaveLength(1 + 9);
    expect(calls("flowering_planner_clear")).toHaveLength(1);
  });
});
