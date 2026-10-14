/**
 * Daily Check quick actions (#2020): structured Feeding, a manual-snapshot
 * handoff, and a live event-note limit. Receive-only: no device control.
 */
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";

import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { QUICK_LOG_V2_OPEN_EVENT } from "@/lib/quickLogV2OpenIntent";
import { QUICK_LOG_V2_FEED_OPEN_EVENT } from "@/lib/quickLogV2FeedOpenIntent";
import {
  QUICK_LOG_ACTIVITY_NOTE_MAX_LENGTH,
  quickLogActivityNoteCharacterCount,
  quickLogActivityNoteLimitLabel,
} from "@/lib/quickLogActivityRules";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

function mount(props?: Partial<ComponentProps<typeof QuickLogAllActivitiesSection>>) {
  return render(
    <MemoryRouter>
      <QuickLogAllActivitiesSection
        growId="grow-1"
        tentId="tent-1"
        plantId="plant-1"
        plantStage="flower"
        {...props}
      />
    </MemoryRouter>,
  );
}

function select(id: string) {
  const testId = `quick-log-all-activities-picker-${id}`;
  if (!screen.queryByTestId(testId)) {
    fireEvent.click(screen.getByTestId("quick-log-all-activities-picker-more"));
  }
  fireEvent.click(screen.getByTestId(testId));
}

describe("daily check quick action handoff", () => {
  it("counts typed characters without trimming and labels only event notes", () => {
    expect(quickLogActivityNoteCharacterCount("  ab ")).toBe(5);
    expect(quickLogActivityNoteCharacterCount("🌿")).toBe(1);
    expect(quickLogActivityNoteLimitLabel("training")).toBe(
      `/${QUICK_LOG_ACTIVITY_NOTE_MAX_LENGTH}`,
    );
    expect(quickLogActivityNoteLimitLabel("note")).toBeNull();
    expect(quickLogActivityNoteLimitLabel("watering")).toBeNull();
    expect(quickLogActivityNoteLimitLabel("manual_sensor_snapshot")).toBeNull();
  });

  it("opens structured Feed from Daily Check and leaves the shared note form alone", () => {
    const events: CustomEvent[] = [];
    const listener = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener(QUICK_LOG_V2_FEED_OPEN_EVENT, listener);
    window.addEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);

    mount({ openStructuredFeeding: true });
    select("feeding");

    window.removeEventListener(QUICK_LOG_V2_FEED_OPEN_EVENT, listener);
    window.removeEventListener(QUICK_LOG_V2_OPEN_EVENT, listener);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(QUICK_LOG_V2_FEED_OPEN_EVENT);
    expect(events[0].detail).toEqual({ targetKey: "plant:plant-1", action: "feed" });
    expect(screen.queryByTestId("quick-log-all-activities-form")).not.toBeInTheDocument();
    cleanup();

    mount();
    select("feeding");
    expect(screen.getByTestId("quick-log-all-activities-note")).toBeInTheDocument();
    expect(screen.getByTestId("quick-log-all-activities-note-limit")).toHaveTextContent("0/500");
  });

  it("shows a live /500 counter on event notes and none on a standalone Note", () => {
    mount();
    select("training");
    const note = screen.getByTestId("quick-log-all-activities-note");
    expect(note).not.toHaveAttribute("maxLength");
    const limit = screen.getByTestId("quick-log-all-activities-note-limit");
    expect(limit).toHaveTextContent("0/500");
    fireEvent.change(note, { target: { value: "x".repeat(501) } });
    expect(limit).toHaveTextContent("501/500");
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeEnabled();

    fireEvent.click(screen.getByTestId("quick-log-all-activities-cancel"));
    select("note");
    expect(screen.queryByTestId("quick-log-all-activities-note-limit")).not.toBeInTheDocument();
    const standalone = screen.getByTestId("quick-log-all-activities-note");
    fireEvent.change(standalone, { target: { value: "x".repeat(3000) } });
    expect(standalone).toHaveValue("x".repeat(3000));
  });

  it("replaces the manual snapshot dead end with a receive-only handoff", () => {
    const open = vi.fn();
    mount({ onOpenManualSensorReading: open });
    select("manual_sensor_snapshot");
    expect(screen.queryByText(/Use the Manual Sensor Snapshot card/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("quick-log-all-activities-manual-sensor-open"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("quick-log-all-activities-save")).toBeDisabled();
    expect(screen.getByText(/labeled manual, not live/i)).toBeInTheDocument();
  });
});
