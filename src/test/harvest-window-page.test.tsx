import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

vi.mock("@/lib/harvestWindowAnalytics", () => ({
  trackHarvestTrackerEvent: vi.fn(),
}));

import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { trackHarvestTrackerEvent } from "@/lib/harvestWindowAnalytics";
import {
  HARVEST_WINDOW_CTA_HREF,
  HARVEST_WINDOW_FAQ,
  HARVEST_WINDOW_H1,
  HARVEST_WINDOW_PATH,
  HARVEST_FUTURE_DATE_MESSAGE,
} from "@/lib/harvestWindowRules";
import HarvestWindowTracker from "@/pages/HarvestWindowTracker";

function renderPage() {
  return render(
    <MemoryRouter>
      <HarvestWindowTracker />
    </MemoryRouter>,
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function addCheck(date: string, clear: string, cloudy: string, amber: string) {
  fill("Date", date);
  fill("Plant", "Plant A");
  fill("% Clear", clear);
  fill("% Cloudy", cloudy);
  fill("% Amber", amber);
  fireEvent.click(screen.getByRole("button", { name: "Add check" }));
}

function harvestDocument() {
  const document = STATIC_PUBLIC_SEO_DOCUMENTS.find((entry) => entry.path === HARVEST_WINDOW_PATH);
  if (!document) throw new Error("missing static document");
  return document;
}

describe("public harvest window tracker page", () => {
  beforeEach(() => {
    vi.mocked(trackHarvestTrackerEvent).mockClear();
    storage.setItem.mockClear();
    storage.getItem.mockClear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the H1, the FAQ and three CTAs to the guide's signup URL", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: HARVEST_WINDOW_H1 })).toBeInTheDocument();
    for (const entry of HARVEST_WINDOW_FAQ) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
      expect(screen.getByText(entry.answer)).toBeInTheDocument();
    }
    const ctas = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
    expect(ctas.map((link) => link.getAttribute("href"))).toEqual([
      HARVEST_WINDOW_CTA_HREF,
      HARVEST_WINDOW_CTA_HREF,
      HARVEST_WINDOW_CTA_HREF,
    ]);
    expect(ctas.map((link) => link.getAttribute("data-cta-location"))).toEqual([
      "tool",
      "article",
      "footer",
    ]);
  });

  it("emits the visible FAQ word for word as FAQPage JSON-LD, with no ratings", () => {
    renderPage();
    const faq = (harvestDocument().metadata.jsonLd ?? []).find(
      (node) => (node as { "@type"?: string })["@type"] === "FAQPage",
    ) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    const visible = [...document.querySelectorAll("details")].map((details) => ({
      question: details.querySelector("summary")?.textContent,
      answer: details.querySelector("p")?.textContent,
    }));
    expect(
      faq.mainEntity.map((entry) => ({ question: entry.name, answer: entry.acceptedAnswer.text })),
    ).toEqual(visible);
    const types = (harvestDocument().metadata.jsonLd ?? []).map(
      (node) => (node as { "@type"?: string })["@type"],
    );
    for (const type of ["Article", "FAQPage", "WebApplication", "BreadcrumbList"]) {
      expect(types).toContain(type);
    }
    expect(JSON.stringify(harvestDocument().metadata.jsonLd ?? [])).not.toMatch(
      /aggregateRating|"review"/i,
    );
  });

  it("logs checks in memory, shows status and summary, and tracks counters only", () => {
    renderPage();
    addCheck("2026-10-01", "26", "70", "4");
    addCheck("2026-10-06", "6", "80", "14");
    const table = screen.getByRole("region", { name: "Trichome check log table" });
    expect(within(table).getByText("Before window")).toBeInTheDocument();
    expect(within(table).getByText("In window")).toBeInTheDocument();
    expect(screen.getByText("Plant A (2 checks)")).toBeInTheDocument();
    // Amber 14% is already past the peak window's 10% edge, so no past-date projection.
    expect(screen.queryByText(/amber would reach the lower edge/)).not.toBeInTheDocument();
    expect(trackHarvestTrackerEvent).toHaveBeenLastCalledWith("harvest_tracker_check_added", {
      check_count: 2,
      plant_count: 1,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    // The storage note names the one action that does keep the log.
    expect(
      screen.getByText(
        /Nothing is saved in your browser unless you click .Keep this log in Verdant./,
      ),
    ).toBeInTheDocument();
  });

  it("shows the source validation message and adds nothing for a bad total", () => {
    renderPage();
    addCheck("2026-10-01", "30", "30", "30");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Clear %, Cloudy % and Amber % currently total 90%.",
    );
    expect(trackHarvestTrackerEvent).not.toHaveBeenCalled();
  });

  it("tracks a target change and recomputes status", () => {
    renderPage();
    addCheck("2026-10-01", "0", "60", "40");
    expect(screen.getByText("Past window")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^Body \/ later/));
    expect(trackHarvestTrackerEvent).toHaveBeenLastCalledWith("harvest_tracker_target_changed", {
      target: "body",
    });
    expect(
      within(screen.getByRole("region", { name: "Trichome check log table" })).getByText(
        "In window",
      ),
    ).toBeInTheDocument();
  });

  it("prints inside a visible print section and keeps blank mode until afterprint", () => {
    vi.useFakeTimers();
    const print = vi.fn();
    vi.stubGlobal("print", print);
    renderPage();
    expect(screen.getByTestId("harvest-window-page")).toHaveAttribute(
      "data-print-section",
      "public-guide-tool",
    );
    fireEvent.click(screen.getByRole("button", { name: "Print blank check sheet" }));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(print).toHaveBeenCalledTimes(1);
    const sheet = screen.getByText("Verdant Grow Diary — Blank Trichome Check Sheet").parentElement;
    expect(sheet?.className).toContain("print:block");
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(sheet?.className).not.toContain("print:block");
    vi.useRealTimers();
  });

  it("refuses a future check date instead of logging it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 9));
    renderPage();
    expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2026-10-28");
    addCheck("2026-10-29", "26", "70", "4");
    expect(screen.getByText(HARVEST_FUTURE_DATE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText("Plant A (1 check)")).not.toBeInTheDocument();
    addCheck("2026-10-28", "26", "70", "4");
    expect(screen.getByText("Plant A (1 check)")).toBeInTheDocument();
    vi.setSystemTime(new Date(2026, 9, 29, 0, 5));
    fireEvent.focus(screen.getByLabelText("Date"));
    expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2026-10-29");
    vi.useRealTimers();
  });

  it("clears only after confirmation", () => {
    renderPage();
    addCheck("2026-10-01", "26", "70", "4");
    fireEvent.click(screen.getByRole("button", { name: "Clear log" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    expect(screen.getByText(/No trichome checks logged yet/)).toBeInTheDocument();
    expect(trackHarvestTrackerEvent).toHaveBeenLastCalledWith("harvest_tracker_clear", {});
  });

  it("falls back to a text box when the clipboard is unavailable", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    });
    expect(screen.getByLabelText(/Clipboard access was unavailable/)).toHaveValue(
      "Target Effect\tTarget Cloudy Min %\tTarget Amber Min %\tTarget Amber Max %\tDate\tPlant\tClear %\tCloudy %\tAmber %\tWindow Status\tPistil Notes\tPhoto Note",
    );
    expect(trackHarvestTrackerEvent).toHaveBeenCalledWith("harvest_tracker_copy", {
      check_count: 0,
    });
    // A changed log drops the stale snapshot instead of offering it for copying.
    addCheck("2026-10-01", "26", "70", "4");
    expect(screen.queryByLabelText(/Clipboard access was unavailable/)).not.toBeInTheDocument();
  });
});
