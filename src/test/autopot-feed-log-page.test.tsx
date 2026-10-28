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

vi.mock("@/lib/autopotFeedLogAnalytics", () => ({
  trackAutopotLogEvent: vi.fn(),
}));

import { trackAutopotLogEvent } from "@/lib/autopotFeedLogAnalytics";
import { AUTOPOT_LOG_CTA_HREF, AUTOPOT_LOG_FAQ, AUTOPOT_LOG_H1 } from "@/lib/autopotFeedLogRules";
import AutopotStashNutrientsFeedLog from "@/pages/AutopotStashNutrientsFeedLog";

function renderPage() {
  return render(
    <MemoryRouter>
      <AutopotStashNutrientsFeedLog />
    </MemoryRouter>,
  );
}

const calls = (name: string) =>
  vi.mocked(trackAutopotLogEvent).mock.calls.filter(([event]) => event === name);
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const add = () => fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
const logTable = () => screen.getByRole("region", { name: "AutoPot feed log table" });

describe("public AutoPot feed log page", () => {
  beforeEach(() => {
    vi.mocked(trackAutopotLogEvent).mockClear();
    storage.setItem.mockClear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the H1, the FAQ, three CTAs and a /guides breadcrumb", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: AUTOPOT_LOG_H1 })).toBeInTheDocument();
    const faq = document.getElementById("autopot-feeding-faq")!;
    expect(
      [...faq.querySelectorAll("details")].map((d) => ({
        question: d.querySelector("summary")?.textContent,
        answer: d.querySelector("p")?.textContent,
      })),
    ).toEqual(AUTOPOT_LOG_FAQ.map((q) => ({ ...q })));
    const ctas = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
    expect(ctas.map((a) => [a.getAttribute("href"), a.getAttribute("data-cta-location")])).toEqual([
      [AUTOPOT_LOG_CTA_HREF, "tool"],
      [AUTOPOT_LOG_CTA_HREF, "article"],
      [AUTOPOT_LOG_CTA_HREF, "footer"],
    ]);
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
      name: "Guides",
    });
    expect(crumb).toHaveAttribute("href", "/guides");
  });

  it("keeps the grow example hidden and empty while GROW_EXAMPLE is null", () => {
    renderPage();
    const section = document.getElementById("example-from-our-grow")!;
    expect(section).toHaveAttribute("hidden");
    expect(section.textContent).toBe("");
    expect(screen.queryByText("Example from our grow")).not.toBeInTheDocument();
  });

  it("logs a refill in memory with units and never converts between them", () => {
    renderPage();
    fill("Date", "2026-10-27");
    fill("Tent (optional)", "Flower tent");
    fill("Volume added (gal)", "5");
    fill("pH (actual)", "5.83");
    fill("EC/PPM (actual)", "476");
    fill("Actual EC/PPM unit", "µS/cm");
    fill("Planned EC/PPM", "1.2");
    add();
    const row = within(logTable()).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Flower tent");
    expect(row).toHaveTextContent("5 gal");
    expect(row).toHaveTextContent("1.2 mS/cm → 476 µS/cm");
    expect(within(row).getByText("Different units — no comparison")).toBeInTheDocument();
    expect(screen.getByText("5.0 gal")).toBeInTheDocument();
    expect(calls("autopot_log_refill_added")).toEqual([
      ["autopot_log_refill_added", { refill_count: 1 }],
    ]);
    expect(screen.getByLabelText("Tent (optional)")).toHaveValue("Flower tent");
    expect(screen.getByLabelText("Volume added (gal)")).toHaveValue(null);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the source message and adds nothing when an EC reading has no unit", () => {
    renderPage();
    fill("EC/PPM (actual)", "1.2");
    fill("Actual EC/PPM unit", "");
    add();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please select the unit shown on your meter for Actual EC/PPM.",
    );
    expect(calls("autopot_log_refill_added")).toHaveLength(0);
  });

  it("tracks system and unit choices as enums, and plan comparisons after two quiet seconds", () => {
    vi.useFakeTimers();
    renderPage();
    fill("System", "Tray2Grow");
    fill("Planned EC/PPM unit", "PPM (700 scale)");
    expect(calls("autopot_log_system_selected")[0][1]).toEqual({ system: "tray2grow" });
    expect(calls("autopot_log_unit_selected")[0][1]).toEqual({ unit: "ppm700" });
    fill("Planned pH", "5.8");
    fill("pH (actual)", "5.9");
    add();
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(calls("autopot_log_plan_compared")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(calls("autopot_log_plan_compared")).toEqual([
      ["autopot_log_plan_compared", { compared_count: 1 }],
    ]);
  });

  it("tracks source clicks as autopot or stash only", () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("link", { name: "Stash Nutrients official site" })[0]);
    fireEvent.click(screen.getAllByRole("link", { name: "AutoPot brochure" })[0]);
    expect(calls("autopot_log_source_click").map((c) => c[1])).toEqual([
      { source: "stash" },
      { source: "autopot" },
    ]);
  });

  it("deletes, copies with a fallback, and clears only after confirmation", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderPage();
    fill("Volume added (gal)", "2");
    add();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    });
    expect(screen.getByLabelText(/Clipboard access was unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Delete entry from / }));
    expect(screen.queryByLabelText(/Clipboard access was unavailable/)).not.toBeInTheDocument();
    expect(calls("autopot_log_refill_deleted")[0][1]).toEqual({ refill_count: 0 });
    fill("Volume added (gal)", "3");
    add();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    expect(screen.getByText(/No AutoPot entries logged yet/)).toBeInTheDocument();
    expect(calls("autopot_log_clear")).toHaveLength(1);
  });

  it("prints inside a visible print section", () => {
    vi.useFakeTimers();
    const print = vi.fn();
    vi.stubGlobal("print", print);
    renderPage();
    expect(screen.getByTestId("autopot-feed-log-page")).toHaveAttribute(
      "data-print-section",
      "public-guide-tool",
    );
    fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(print).toHaveBeenCalledTimes(1);
    expect(calls("autopot_log_print")).toHaveLength(1);
  });
});
