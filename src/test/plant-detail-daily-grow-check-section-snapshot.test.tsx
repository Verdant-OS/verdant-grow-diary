/**
 * Visual hierarchy snapshot tests for the Daily Grow Check section on
 * Plant Detail. Captures the ordered list of visible test IDs (with role
 * hints) for each of the three meaningful states:
 *
 *   1. No activity / onboarding
 *   2. Today unchecked / next action prominent
 *   3. Today has activity / recent-activity cue present
 *
 * Snapshots are structural, not pixel-level — they catch regressions in
 * which surfaces are visible, in what order, and how the "next action"
 * is presented, without churning on Tailwind class tweaks.
 *
 * Safety: pure render. No writes, no AI Coach, no action_queue, no
 * automation, no device control. Hooks are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const FIXED_NOW = new Date("2026-05-26T15:00:00Z");
const TENT_ID = "tent-1";
const PLANT_ID = "plant-1";
const OTHER_TENT = "tent-2";

// ----- Mock hooks (driven per state via mutable refs) ---------------------

const state = {
  sensors: [] as Array<{
    id: string;
    tent_id: string | null;
    source: string;
    ts: string;
    created_at: string;
  }>,
  diary: [] as Array<{
    id: string;
    plant_id: string;
    tent_id: string | null;
    entry_at: string;
    created_at: string;
  }>,
};

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: state.sensors }),
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: state.diary }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: TENT_ID, name: "Tent A" }] }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: PLANT_ID, tent_id: TENT_ID, name: "Plant A" }],
  }),
}));
// Onboarding dismissal must stay un-dismissed for these snapshots.
vi.mock("@/lib/dailyGrowCheckOnboardingDismissStore", () => ({
  useOnboardingDismissed: () => ({ isDismissed: false, dismiss: () => {} }),
}));

import DailyGrowCheckOnboardingCard from "@/components/DailyGrowCheckOnboardingCard";
import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";
import PlantDailyGrowCheckHistoryCard from "@/components/PlantDailyGrowCheckHistoryCard";

// ----- Helpers ------------------------------------------------------------

function isoDaysAgo(days: number, hoursOffset = 9): string {
  const d = new Date(FIXED_NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hoursOffset, 0, 0, 0);
  return d.toISOString();
}

function renderSection() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <section
          aria-labelledby="plant-daily-grow-check-section-heading"
          data-testid="plant-daily-grow-check-section"
          className="space-y-4 sm:space-y-3"
        >
          <h2 id="plant-daily-grow-check-section-heading">Daily Grow Check</h2>
          <DailyGrowCheckOnboardingCard
            focusedPlantId={PLANT_ID}
            focusedTentId={TENT_ID}
            tentIds={[TENT_ID]}
            hideWhenReady
          />
          <PlantDailyGrowCheckConsistencyCard
            plantId={PLANT_ID}
            currentTentId={TENT_ID}
          />
          <PlantDailyGrowCheckHistoryCard
            plantId={PLANT_ID}
            currentTentId={TENT_ID}
            hideHeaderCta
          />
        </section>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Walk the rendered container in document order and produce a stable
 * hierarchy summary: one line per element carrying a data-testid, with
 * tag, role hint, and short visible text. This is the snapshot payload.
 */
function summarizeHierarchy(container: HTMLElement): string {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-testid]"),
  );
  return nodes
    .map((el, i) => {
      const id = el.getAttribute("data-testid");
      const tag = el.tagName.toLowerCase();
      const role =
        tag === "button" || el.getAttribute("role") === "button"
          ? "[cta]"
          : tag === "a" && el.closest("button")
            ? "[cta]"
            : tag === "h1" || tag === "h2" || tag === "h3"
              ? "[heading]"
              : "";
      const text = (el.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      return `${String(i).padStart(2, "0")} ${id}${role ? " " + role : ""}${
        text ? ` :: "${text}"` : ""
      }`;
    })
    .join("\n");
}

// ----- Tests --------------------------------------------------------------

describe("Plant Detail · Daily Grow Check section · visual hierarchy snapshots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    state.sensors = [];
    state.diary = [];
  });

  it("State 1: no activity → onboarding is the prominent surface", () => {
    // Nothing logged ever.
    const { container } = renderSection();
    expect(summarizeHierarchy(container)).toMatchSnapshot();
  });

  it("State 2: prior activity but today unchecked → next-action CTA is prominent", () => {
    // Activity on prior days only; nothing today.
    state.sensors = [
      {
        id: "s-prev",
        tent_id: TENT_ID,
        source: "manual",
        ts: isoDaysAgo(2),
        created_at: isoDaysAgo(2),
      },
      {
        id: "s-prev2",
        tent_id: TENT_ID,
        source: "manual",
        ts: isoDaysAgo(4),
        created_at: isoDaysAgo(4),
      },
    ];
    state.diary = [
      {
        id: "d-prev",
        plant_id: PLANT_ID,
        tent_id: TENT_ID,
        entry_at: isoDaysAgo(2),
        created_at: isoDaysAgo(2),
      },
      {
        id: "d-prev2",
        plant_id: PLANT_ID,
        tent_id: TENT_ID,
        entry_at: isoDaysAgo(4),
        created_at: isoDaysAgo(4),
      },
    ];

    const { container } = renderSection();
    expect(summarizeHierarchy(container)).toMatchSnapshot();
  });

  it("State 3: today has activity → recent-activity cue replaces next-action CTA", () => {
    state.sensors = [
      {
        id: "s-prev",
        tent_id: TENT_ID,
        source: "manual",
        ts: isoDaysAgo(2),
        created_at: isoDaysAgo(2),
      },
      {
        id: "s-today",
        tent_id: TENT_ID,
        source: "manual",
        ts: isoDaysAgo(0, 8),
        created_at: isoDaysAgo(0, 8),
      },
    ];
    state.diary = [
      {
        id: "d-prev",
        plant_id: PLANT_ID,
        tent_id: TENT_ID,
        entry_at: isoDaysAgo(2),
        created_at: isoDaysAgo(2),
      },
      {
        id: "d-today",
        plant_id: PLANT_ID,
        tent_id: TENT_ID,
        entry_at: isoDaysAgo(0, 8),
        created_at: isoDaysAgo(0, 8),
      },
    ];

    const { container } = renderSection();
    expect(summarizeHierarchy(container)).toMatchSnapshot();
  });

  it("never introduces banned health/success or unsafe automation copy in any state", () => {
    // Re-render state 3 (the most-populated state) and assert safety guards.
    state.sensors = [
      {
        id: "s-today",
        tent_id: TENT_ID,
        source: "manual",
        ts: isoDaysAgo(0, 8),
        created_at: isoDaysAgo(0, 8),
      },
    ];
    state.diary = [
      {
        id: "d-today",
        plant_id: PLANT_ID,
        tent_id: TENT_ID,
        entry_at: isoDaysAgo(0, 8),
        created_at: isoDaysAgo(0, 8),
      },
    ];
    const { container } = renderSection();
    const text = (container.textContent ?? "").toLowerCase();
    for (const banned of [
      "healthy",
      "perfect",
      "successfully maintained",
      "live sensor",
      "auto-executed",
      "automation enabled",
    ]) {
      expect(text).not.toContain(banned);
    }
    // Sensor labels from non-tent should not leak.
    expect(container.querySelectorAll(`[data-tent-id="${OTHER_TENT}"]`).length).toBe(
      0,
    );
  });
});
