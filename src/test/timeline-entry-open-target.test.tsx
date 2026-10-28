import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineEntryOpenButton } from "@/components/TimelineEntryOpenButton";
import { timelineEntryOpenAccessibleName } from "@/lib/timelineEntryOpenLabelRules";

const TIMELINE = readFileSync(resolve(__dirname, "../pages/Timeline.tsx"), "utf8");

afterEach(() => cleanup());

describe("timelineEntryOpenAccessibleName", () => {
  it("builds a distinct Open label from the entry title and date", () => {
    const photo = timelineEntryOpenAccessibleName({
      title: "Photo",
      occurredAtLabel: "Oct 10, 2026",
    });
    const water = timelineEntryOpenAccessibleName({
      title: "Water",
      occurredAtLabel: "Oct 9, 2026",
    });
    expect(photo).toBe("Open Photo Oct 10, 2026");
    expect(water).toBe("Open Water Oct 9, 2026");
    expect(photo).not.toBe(water);
  });

  it("falls back when the title and date are missing or blank", () => {
    expect(timelineEntryOpenAccessibleName({ title: null, occurredAtLabel: null })).toBe(
      "Open entry",
    );
    expect(timelineEntryOpenAccessibleName({ title: "   ", occurredAtLabel: "" })).toBe(
      "Open entry",
    );
    expect(timelineEntryOpenAccessibleName({ title: undefined, occurredAtLabel: undefined })).toBe(
      "Open entry",
    );
  });

  it("drops an overlong subject instead of announcing a blob", () => {
    expect(
      timelineEntryOpenAccessibleName({
        title: "x".repeat(81),
        occurredAtLabel: "Oct 10, 2026",
      }),
    ).toBe("Open Oct 10, 2026");
  });

  it("repeats the same inputs as the same name", () => {
    const input = { title: "Photo", occurredAtLabel: "Oct 10, 2026" };
    expect(timelineEntryOpenAccessibleName(input)).toBe(timelineEntryOpenAccessibleName(input));
  });
});

describe("TimelineEntryOpenButton", () => {
  it("exposes the card label, a focus-visible ring, and a 24px target", () => {
    const onOpen = vi.fn();
    render(
      createElement(TimelineEntryOpenButton, {
        label: "Open Photo Oct 10, 2026",
        onOpen,
      }),
    );
    const button = screen.getByTestId("timeline-entry-open");
    expect(button).toHaveAttribute("aria-label", "Open Photo Oct 10, 2026");
    expect(button.className).toContain("focus-visible:ring-2");
    expect(button.className).toContain("min-h-6");
    expect(button).toHaveStyle({ minHeight: "24px", minWidth: "24px" });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("Timeline card wiring", () => {
  it("passes the event title into the per-card Open name", () => {
    expect(TIMELINE).toContain("timelineEntryOpenAccessibleName");
    expect(TIMELINE).toContain("TimelineEntryOpenButton");
    expect(TIMELINE).toMatch(/title:\s*et\.label/);
  });
});
