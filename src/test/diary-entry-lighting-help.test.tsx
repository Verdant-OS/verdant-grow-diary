import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DiaryEntryBadges from "@/components/DiaryEntryBadges";
import DiaryEntryLightingHelp from "@/components/DiaryEntryLightingHelp";
import { buildGrowDiaryTimeline } from "@/lib/growDiaryTimelineRules";

afterEach(cleanup);

function renderHelp(item: Parameters<typeof DiaryEntryLightingHelp>[0]["item"]) {
  return render(
    <MemoryRouter>
      <DiaryEntryLightingHelp item={item} />
    </MemoryRouter>,
  );
}

describe("DiaryEntryLightingHelp", () => {
  it("deep-links stress entries and mounts the read-only comparison flow", () => {
    renderHelp({
      eventType: "observation",
      notePreview: "Pale bleaching directly under the fixture after a dimmer change.",
    });
    expect(screen.getByTestId("diary-entry-lighting-guide-link")).toHaveAttribute(
      "href",
      "/guides/cannabis-grow-light-distance-and-schedule#faq-3",
    );
    expect(screen.getByTestId("light-stress-troubleshooter")).toBeInTheDocument();
  });

  it("links PPFD notes without mounting an irrelevant stress flow", () => {
    renderHelp({
      eventType: "environment",
      notePreview: "Recorded center and edge PPFD.",
    });
    expect(screen.getByTestId("diary-entry-lighting-guide-link")).toHaveAttribute(
      "href",
      "/guides/cannabis-grow-light-distance-and-schedule#faq-1",
    );
    expect(screen.queryByTestId("light-stress-troubleshooter")).toBeNull();
  });

  it("updates the comparison from explicit grower selections", () => {
    renderHelp({ notePreview: "Possible light stress on upper leaves." });
    fireEvent.click(screen.getByTestId("light-stress-troubleshooter-trigger"));
    fireEvent.change(screen.getByTestId("light-stress-visible-pattern"), {
      target: { value: "bleached_top" },
    });
    fireEvent.change(screen.getByTestId("light-stress-location-pattern"), {
      target: { value: "top_under_fixture" },
    });
    fireEvent.click(screen.getByTestId("light-stress-evidence-high-ppfd-dli"));

    expect(screen.getByTestId("light-stress-comparison-result")).toHaveTextContent(
      /current evidence most supports comparing: bleaching pattern/i,
    );
    expect(screen.getByTestId("light-stress-caution")).toHaveTextContent(/not a diagnosis/i);
    expect(screen.getByTestId("light-stress-next-data")).toHaveTextContent(
      /fixture-to-canopy distance/i,
    );
  });
});

describe("DiaryEntryBadges lighting priority", () => {
  it("uses structured light-check context for the grow-light guide instead of a generic FAQ", () => {
    const [item] = buildGrowDiaryTimeline({
      rawEntries: [
        {
          id: "lighting-check-1",
          entry_at: "2026-07-29T12:00:00.000Z",
          entry_type: "observation",
          note: "Checked fixture height.",
          details: { checkType: "light" },
        },
      ],
    });
    if (!item) throw new Error("expected timeline item");

    render(
      <MemoryRouter>
        <DiaryEntryBadges item={item} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("diary-entry-lighting-guide-link")).toHaveAttribute(
      "href",
      "/guides/cannabis-grow-light-distance-and-schedule#faq-0",
    );
    expect(screen.queryByTestId("diary-entry-faq-link")).toBeNull();
  });

  it("offers stress comparison for structured upper-growth symptoms", () => {
    const [item] = buildGrowDiaryTimeline({
      rawEntries: [
        {
          id: "lighting-symptom-1",
          entry_at: "2026-07-29T12:00:00.000Z",
          entry_type: "observation",
          note: "Visible change documented.",
          details: {
            observedSign: "bleached_tissue",
            observationLocation: "upper_growth",
          },
        },
      ],
    });
    if (!item) throw new Error("expected timeline item");

    render(
      <MemoryRouter>
        <DiaryEntryBadges item={item} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("diary-entry-lighting-help")).toHaveAttribute(
      "data-lighting-topic",
      "stress",
    );
    expect(screen.getByTestId("light-stress-troubleshooter")).toBeInTheDocument();
  });
});
