import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIELD_NOTEBOOK_TENT_AGE_UNKNOWN,
  buildFieldNotebookTentAgeLabels,
} from "@/lib/fieldNotebookTentAgeRules";
import { FieldNotebookScope } from "@/components/FieldNotebookMount";

// QA pass 2026-11-19, B2: right after onboarding the dashboard tent card read
// "Week —" and "Age: — · Started: —" although the grow row carries a saved
// start date (grows.started_at, filled with the creation time).

const H = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; started_at: string | null }>,
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: H.grows }),
}));

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save: vi.fn() }),
}));

vi.mock("@/components/FieldNotebook", () => ({
  default: ({
    tents,
  }: {
    tents: Array<{ name: string; weekLabel: string; ageLabel: string; startedLabel: string }>;
  }) => (
    <div data-testid="notebook-card">
      {tents.map((tent) => (
        <p key={tent.name}>
          {tent.name} · {tent.weekLabel} | {tent.ageLabel} · Started: {tent.startedLabel}
        </p>
      ))}
    </div>
  ),
}));

const CHICAGO = "America/Chicago";

describe("buildFieldNotebookTentAgeLabels", () => {
  it("labels a grow started earlier today in the grower's zone", () => {
    // 3:50 AM CT on Nov 19 2026; the grow row was created at 3:45 AM CT.
    const labels = buildFieldNotebookTentAgeLabels({
      startedAt: "2026-11-19T09:45:00.000Z",
      nowMs: Date.parse("2026-11-19T09:50:00.000Z"),
      timeZone: CHICAGO,
    });
    expect(labels).toEqual({
      weekLabel: "Week 1",
      ageLabel: "Age: started today",
      startedLabel: "Nov 19, 2026",
    });
  });

  it("counts calendar days in the zone, not 24-hour blocks", () => {
    // 11:30 PM CT Nov 18 to 12:10 AM CT Nov 19 is 40 minutes but one day.
    const labels = buildFieldNotebookTentAgeLabels({
      startedAt: "2026-11-19T05:30:00.000Z",
      nowMs: Date.parse("2026-11-19T06:10:00.000Z"),
      timeZone: CHICAGO,
    });
    expect(labels.ageLabel).toBe("Age: 1 day");
    expect(labels.startedLabel).toBe("Nov 18, 2026");
  });

  it("starts week 2 on day 7", () => {
    const start = "2026-11-01T18:00:00.000Z";
    const day6 = buildFieldNotebookTentAgeLabels({
      startedAt: start,
      nowMs: Date.parse("2026-11-07T18:00:00.000Z"),
      timeZone: CHICAGO,
    });
    const day7 = buildFieldNotebookTentAgeLabels({
      startedAt: start,
      nowMs: Date.parse("2026-11-08T18:00:00.000Z"),
      timeZone: CHICAGO,
    });
    expect(day6).toMatchObject({ weekLabel: "Week 1", ageLabel: "Age: 6 days" });
    expect(day7).toMatchObject({ weekLabel: "Week 2", ageLabel: "Age: 7 days" });
  });

  it("says a planned grow has not started instead of a negative age", () => {
    const labels = buildFieldNotebookTentAgeLabels({
      startedAt: "2026-11-25T18:00:00.000Z",
      nowMs: Date.parse("2026-11-19T18:00:00.000Z"),
      timeZone: CHICAGO,
    });
    expect(labels).toEqual({
      weekLabel: "Not started yet",
      ageLabel: "Age: not started yet",
      startedLabel: "Nov 25, 2026",
    });
  });

  it.each([null, undefined, "", "not a date"])(
    "names a missing or unreadable start date (%s) with words, never a dash",
    (startedAt) => {
      const labels = buildFieldNotebookTentAgeLabels({
        startedAt,
        nowMs: Date.parse("2026-11-19T18:00:00.000Z"),
        timeZone: CHICAGO,
      });
      expect(labels).toEqual(FIELD_NOTEBOOK_TENT_AGE_UNKNOWN);
      expect(Object.values(labels).join(" ")).not.toContain("—");
    },
  );
});

describe("dashboard tent card after onboarding", () => {
  afterEach(() => {
    vi.useRealTimers();
    H.grows = [];
  });

  function renderScope() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <FieldNotebookScope
          growsLoading={false}
          growId="grow-1"
          tents={[{ id: "tent-1", name: "Tent 1" }]}
        />
      </QueryClientProvider>,
    );
  }

  it("shows week, age and start date from the grow row, with no bare dashes", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-21T12:00:00.000Z"));
    H.grows = [{ id: "grow-1", started_at: "2026-11-19T12:00:00.000Z" }];

    renderScope();

    const card = screen.getByTestId("notebook-card");
    expect(card.textContent).toMatch(/Tent 1 · Week 1 \| Age: 2 days · Started: Nov 19, 2026/);
    expect(card.textContent).not.toContain("—");
  });

  it("falls back to plain words when the grow row is not loaded", () => {
    H.grows = [];

    renderScope();

    const card = screen.getByTestId("notebook-card");
    expect(card.textContent).toContain("Start date not set");
    expect(card.textContent).not.toContain("—");
  });
});
