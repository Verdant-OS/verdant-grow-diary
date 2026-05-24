/**
 * 7-day Daily Check method breakdown for Plant Detail.
 *
 * Read-only UI/copy only. Same basis as Daily Grow Check (plant QuickLogs
 * + current-tent manual sensor snapshots). No persistence, no writes.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildDailyGrowCheckConsistency,
  buildDailyMethodBreakdown,
  formatDailyMethodBreakdownLabel,
} from "@/lib/dailyGrowCheckConsistencyRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0); // Sun May 24 2026
const PLANT = "plant-1";
const TENT = "tent-1";

function iso(y: number, m: number, d: number, hh = 9) {
  return new Date(y, m, d, hh, 0, 0).toISOString();
}

function summaryFor(opts: {
  diaryEntries?: Parameters<typeof buildDailyGrowCheckConsistency>[0]["diaryEntries"];
  manualReadings?: Parameters<typeof buildDailyGrowCheckConsistency>[0]["manualReadings"];
  currentTentId?: string | null;
}) {
  return buildDailyGrowCheckConsistency({
    now: NOW,
    windowDays: 7,
    plantId: PLANT,
    currentTentId: opts.currentTentId ?? TENT,
    plantsInTentCount: 1,
    manualReadings: opts.manualReadings ?? [],
    diaryEntries: opts.diaryEntries ?? [],
  });
}

describe("buildDailyMethodBreakdown — pure rule", () => {
  it("returns exactly 7 deterministic days, oldest-first by default", () => {
    const s = summaryFor({});
    const a = buildDailyMethodBreakdown(s);
    const b = buildDailyMethodBreakdown(s);
    expect(a).toHaveLength(7);
    expect(a.map((d) => d.dayKey)).toEqual(b.map((d) => d.dayKey));
    // oldest-first: the last item is "Today".
    expect(a[a.length - 1].label).toBe("Today");
  });

  it("supports newest-first ordering deterministically", () => {
    const s = summaryFor({});
    const newest = buildDailyMethodBreakdown(s, "newest-first");
    expect(newest[0].label).toBe("Today");
    expect(newest).toHaveLength(7);
  });

  it("classifies a day with only a QuickLog as 'note'", () => {
    const s = summaryFor({
      diaryEntries: [{ entry_at: iso(2026, 4, 24, 10), id: "d1", plant_id: PLANT }],
    });
    const today = buildDailyMethodBreakdown(s, "newest-first")[0];
    expect(today.method).toBe("note");
    expect(formatDailyMethodBreakdownLabel(today.method)).toBe("Note");
  });

  it("classifies a day with only a current-tent manual snapshot as 'sensor'", () => {
    const s = summaryFor({
      manualReadings: [{ ts: iso(2026, 4, 24, 11), id: "m1", tent_id: TENT }],
    });
    const today = buildDailyMethodBreakdown(s, "newest-first")[0];
    expect(today.method).toBe("sensor");
    expect(formatDailyMethodBreakdownLabel(today.method)).toBe("Sensor");
  });

  it("classifies a day with both as 'both'", () => {
    const s = summaryFor({
      diaryEntries: [{ entry_at: iso(2026, 4, 24, 10), id: "d1", plant_id: PLANT }],
      manualReadings: [{ ts: iso(2026, 4, 24, 11), id: "m1", tent_id: TENT }],
    });
    const today = buildDailyMethodBreakdown(s, "newest-first")[0];
    expect(today.method).toBe("both");
    expect(formatDailyMethodBreakdownLabel(today.method)).toBe("Both");
  });

  it("classifies a day with neither as 'missed'", () => {
    const s = summaryFor({});
    const today = buildDailyMethodBreakdown(s, "newest-first")[0];
    expect(today.method).toBe("missed");
    expect(formatDailyMethodBreakdownLabel(today.method)).toBe("Missed");
  });

  it("ignores manual snapshots from a different tent", () => {
    const s = summaryFor({
      manualReadings: [
        { ts: iso(2026, 4, 24, 11), id: "m1", tent_id: "other-tent" },
      ],
    });
    const today = buildDailyMethodBreakdown(s, "newest-first")[0];
    expect(today.method).toBe("missed");
  });
});

// --- UI render -------------------------------------------------------------

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [
      {
        id: "m1",
        ts: iso(2026, 4, 24, 10),
        created_at: iso(2026, 4, 24, 10),
        tent_id: TENT,
        source: "manual",
      },
    ],
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [
      {
        id: "d1",
        entry_at: iso(2026, 4, 23, 9),
        created_at: iso(2026, 4, 23, 9),
        plant_id: PLANT,
        tent_id: TENT,
      },
    ],
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: PLANT, name: "Mango", tent_id: TENT }],
  }),
}));

import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlantDailyGrowCheckConsistencyCard
          plantId={PLANT}
          currentTentId={TENT}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlantDailyGrowCheckConsistencyCard — 7-day method breakdown", () => {
  it("renders the 7-day method breakdown with labels", () => {
    renderCard();
    const region = screen.getByTestId("plant-daily-grow-check-method-breakdown");
    expect(region.getAttribute("data-order")).toBe("oldest-first");
    expect(region.getAttribute("data-day-count")).toBe("7");
    const days = within(region).getAllByTestId(
      "plant-daily-grow-check-method-breakdown-day",
    );
    expect(days).toHaveLength(7);
    const methods = days.map((d) => d.getAttribute("data-method"));
    expect(methods.every((m) => ["note", "sensor", "both", "missed"].includes(m!))).toBe(true);
    // Today (last cell in oldest-first) has the manual snapshot → sensor.
    expect(days[6].getAttribute("data-method")).toBe("sensor");
    // Yesterday had a QuickLog → note.
    expect(days[5].getAttribute("data-method")).toBe("note");
  });

  it("preserves the existing today method label", () => {
    renderCard();
    const today = screen.getByTestId("plant-daily-grow-check-today-method");
    expect(today.textContent).toMatch(/Checked by sensor snapshot/);
  });

  it("preserves the existing guidance + CTA", () => {
    renderCard();
    expect(
      screen.getByTestId("plant-daily-grow-check-guidance"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("plant-daily-grow-check-consistency-cta"),
    ).toBeTruthy();
  });
});

// --- Safety scans ----------------------------------------------------------

const cardSrc = readFileSync(
  resolve(__dirname, "../components/PlantDailyGrowCheckConsistencyCard.tsx"),
  "utf8",
);
const rulesSrc = readFileSync(
  resolve(__dirname, "../lib/dailyGrowCheckConsistencyRules.ts"),
  "utf8",
);

describe("safety — no forbidden wording or unsafe wiring", () => {
  it("does not use forbidden wording in the breakdown UI/rule", () => {
    for (const src of [cardSrc, rulesSrc]) {
      expect(src).not.toMatch(/\bperfect\b/i);
      expect(src).not.toMatch(/\bcompleted\b/i);
      expect(src).not.toMatch(/guaranteed healthy/i);
    }
  });

  it("does not add persistence, RPC, ingestion, alerts, action_queue, automation, device control, or service_role", () => {
    for (const src of [cardSrc, rulesSrc]) {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/action_queue/i);
      expect(src).not.toMatch(/sensor_ingest/i);
      expect(src).not.toMatch(/alert_events/i);
    }
  });

  it("does not fabricate a local 'checked today' state independent of summary", () => {
    expect(cardSrc).not.toMatch(/useState<\s*boolean\s*>\(\s*true\s*\)/);
    expect(cardSrc).not.toMatch(/localStorage\.setItem/);
  });
});
