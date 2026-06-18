/**
 * Diary Calendar — mobile filter chip polish + Environment Check empty state.
 *
 * Safety: no Supabase, no writes. CTA uses the existing
 * `verdant:open-quicklog` window event already handled by Quick Log.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import DiaryCalendarSection, {
  ENVIRONMENT_CHECK_EMPTY_TITLE,
  ENVIRONMENT_CHECK_EMPTY_BODY,
  ENVIRONMENT_CHECK_EMPTY_CTA,
} from "@/components/DiaryCalendarSection";

const MIXED_NO_ENV = [
  { id: "w", entry_at: "2026-06-10T08:00:00Z", event_type: "watering" },
  { id: "f", entry_at: "2026-06-10T09:00:00Z", event_type: "feeding" },
  { id: "d", entry_at: "2026-06-10T10:00:00Z", event_type: "diagnosis" },
];

describe("Diary Calendar — mobile filter chip bar", () => {
  it("renders all 5 chips including Environment Check", () => {
    render(<DiaryCalendarSection rawEntries={MIXED_NO_ENV} />);
    for (const v of ["all", "watering", "feeding", "diagnosis", "environment"]) {
      expect(
        screen.getByTestId(`diary-calendar-filter-${v}`),
      ).toBeInTheDocument();
    }
  });

  it("uses an overflow-x-auto container so chips can scroll horizontally on mobile", () => {
    render(<DiaryCalendarSection rawEntries={MIXED_NO_ENV} />);
    const bar = screen.getByTestId("diary-calendar-filters");
    expect(bar.className).toMatch(/overflow-x-auto/);
    // Desktop opt-in to wrap/visible.
    expect(bar.className).toMatch(/sm:flex-wrap/);
    expect(bar.className).toMatch(/sm:overflow-visible/);
  });

  it("Environment Check chip has comfortable tap-target and accessible label", () => {
    render(<DiaryCalendarSection rawEntries={MIXED_NO_ENV} />);
    const chip = screen.getByTestId("diary-calendar-filter-environment");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveAccessibleName(/Environment Check, \d+ events?/);
    expect(chip.className).toMatch(/min-h-\[40px\]/);
    expect(chip.className).toMatch(/shrink-0/);
    expect(chip.className).toMatch(/whitespace-nowrap/);
  });
});

describe("Diary Calendar — Environment Check empty state", () => {
  it("renders dedicated empty title/body/CTA when env filter has no events", () => {
    render(<DiaryCalendarSection rawEntries={MIXED_NO_ENV} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-environment"));
    expect(screen.getByText(ENVIRONMENT_CHECK_EMPTY_TITLE)).toBeInTheDocument();
    expect(
      screen.getByTestId("diary-calendar-environment-empty-body"),
    ).toHaveTextContent(ENVIRONMENT_CHECK_EMPTY_BODY);
    expect(
      screen.getByTestId("diary-calendar-environment-empty-cta"),
    ).toHaveTextContent(ENVIRONMENT_CHECK_EMPTY_CTA);
  });

  it("body contains the not-live disclaimer phrase", () => {
    render(<DiaryCalendarSection rawEntries={MIXED_NO_ENV} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-environment"));
    expect(
      screen.getByTestId("diary-calendar-environment-empty-body"),
    ).toHaveTextContent(/not live sensor telemetry/i);
  });

  it("CTA dispatches existing verdant:open-quicklog event with environment eventType", () => {
    render(<DiaryCalendarSection rawEntries={MIXED_NO_ENV} />);
    fireEvent.click(screen.getByTestId("diary-calendar-filter-environment"));
    const captured: CustomEvent[] = [];
    const handler = (e: Event) => captured.push(e as CustomEvent);
    window.addEventListener("verdant:open-quicklog", handler as EventListener);
    try {
      fireEvent.click(screen.getByTestId("diary-calendar-environment-empty-cta"));
    } finally {
      window.removeEventListener(
        "verdant:open-quicklog",
        handler as EventListener,
      );
    }
    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe("verdant:open-quicklog");
    expect((captured[0].detail as any).eventType).toBe("environment");
  });

  it("does not perform any direct writes (no fetch / no supabase calls)", () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockImplementation(() => {
        throw new Error("no network calls allowed");
      });
    try {
      render(<DiaryCalendarSection rawEntries={MIXED_NO_ENV} />);
      fireEvent.click(screen.getByTestId("diary-calendar-filter-environment"));
      fireEvent.click(screen.getByTestId("diary-calendar-environment-empty-cta"));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("generic empty state remains for non-environment filters", () => {
    render(<DiaryCalendarSection rawEntries={[]} />);
    expect(screen.getByTestId("diary-calendar-empty")).toBeInTheDocument();
    expect(
      screen.queryByTestId("diary-calendar-environment-empty-cta"),
    ).not.toBeInTheDocument();
  });
});

describe("Static safety: diary calendar presenter/view-model", () => {
  const root = path.resolve(__dirname, "..");
  const forbidden = [
    "@/integrations/supabase",
    "supabase-js",
    "service_role",
  ];
  const files = [
    "components/DiaryCalendarSection.tsx",
    "lib/diaryCalendarViewModel.ts",
    "lib/environmentCheckCalendarViewModel.ts",
    "lib/environmentCheckTimelineViewModel.ts",
  ];
  for (const rel of files) {
    it(`${rel} has no Supabase/client/service_role imports`, () => {
      const src = readFileSync(path.join(root, rel), "utf8");
      for (const needle of forbidden) {
        expect(src).not.toContain(needle);
      }
    });
  }
});
