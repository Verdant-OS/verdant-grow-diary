import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import {
  TimelineCsvContextPanel,
  type TimelineDiaryLike,
} from "@/components/TimelineCsvContextPanel";
import {
  buildCsvTimelineContext,
  type CsvSensorReadingRow,
} from "@/lib/environmentCsvTimelineContextViewModel";
import { parseEnvironmentCSVText } from "@/lib/csvParser";
import { buildSensorReadingInserts } from "@/lib/environmentCsvImportPersistence";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  write: vi.fn(),
  unit: "fahrenheit",
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => mocks.unit,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => {
          mocks.eq(...args);
          return chain;
        },
        in: (...args: unknown[]) => {
          mocks.in(...args);
          return chain;
        },
        order: () => chain,
        limit: () => mocks.read(),
        insert: mocks.write,
        update: mocks.write,
        delete: mocks.write,
        upsert: mocks.write,
      };
      return chain;
    },
  },
}));

// Explicit offsets keep the QA's 06:00–07:30 CDT observations independent of runner timezone.
const times = ["06:00", "06:30", "07:00", "07:30"].map((t) => `2026-10-28T${t}:00-05:00`);
const temperatures = [76.1, 76.8, 77.4, 78.0];
function importedRows(): CsvSensorReadingRow[] {
  const parsed = parseEnvironmentCSVText(
    [
      "Timestamp,Temp(°F),RH,VPD",
      ...times.map((t, i) => `${t},${temperatures[i]},${58 - i},${[1.2, 1.3, 1.4, 1.47][i]}`),
    ].join("\n"),
  );
  expect(parsed.validRows).toHaveLength(4);
  return buildSensorReadingInserts(parsed.validRows, {
    user_id: "qa",
    grow_id: "g1",
    tent_id: "t1",
  });
}
function diary(entryTimes = times, tentId = "t1"): TimelineDiaryLike[] {
  return entryTimes.map((entry_at, i) => ({ id: `${tentId}-d${i}`, tent_id: tentId, entry_at }));
}
async function mount(rows: CsvSensorReadingRow[], entries = diary()) {
  mocks.read.mockResolvedValue({ data: rows, error: null });
  const result = render(
    <TimelineCsvContextPanel
      growId="g1"
      entries={entries}
      tentNamesById={
        new Map([
          ["t1", "QA Tent One"],
          ["t2", "QA Tent Two"],
        ])
      }
    />,
  );
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  return result;
}
function cards() {
  return screen.queryAllByRole("complementary", { name: "CSV environment snapshot" });
}
function links() {
  return screen.getAllByRole("link", { name: /Diary entry/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.unit = "fahrenheit";
});

describe("VER-305 shared CSV diary context", () => {
  it("reproduces the cause: four nearby diary entries legitimately select 07:30, not four CSV rows", () => {
    const rows = importedRows();
    expect(rows).toHaveLength(12);
    const matched = buildCsvTimelineContext({
      diaryEntries: diary(Array(4).fill("2026-10-28T07:35:00-05:00")).map((e) => ({
        ...e,
        grow_id: "g1",
        occurred_at: e.entry_at,
      })),
      sensorReadings: rows,
      growId: "g1",
      tentId: "t1",
    });
    expect(matched.map((m) => m.snapshot?.capturedAt)).toEqual(
      Array(4).fill("2026-10-28T12:30:00.000Z"),
    );
    expect(matched.map((m) => m.matchAgeMinutes)).toEqual([5, 5, 5, 5]);
  });

  it("shows one shared observation with all four diary links instead of four identical cards", async () => {
    await mount(importedRows(), diary(Array(4).fill("2026-10-28T07:35:00-05:00")));
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toHaveTextContent("78.0 °F");
    expect(cards()[0]).toHaveTextContent("55 %");
    expect(cards()[0]).toHaveTextContent("CSV VPD: 1.47 kPa");
    expect(cards()[0]).toHaveTextContent(new Date(times[3]).toLocaleString());
    expect(screen.getByText("Context for 4 diary entries")).toBeTruthy();
    expect(links().map((a) => a.getAttribute("href"))).toEqual(
      diary().map((e) => `#timeline-entry-${e.id}`),
    );
    expect(
      links().every((a) =>
        a.textContent?.includes(new Date("2026-10-28T07:35:00-05:00").toLocaleString()),
      ),
    ).toBe(true);
    expect(links()[0]).toHaveAttribute("title", "5 min from CSV capture");
  });

  it("retains four distinct captures and each observation's own measurements and diary link", async () => {
    await mount(importedRows());
    expect(cards()).toHaveLength(4);
    cards().forEach((card, i) => {
      expect(card).toHaveTextContent(`${temperatures[i].toFixed(1)} °F`);
      expect(card).toHaveTextContent(`${58 - i} %`);
      expect(card).toHaveTextContent(new Date(times[i]).toLocaleString());
    });
    expect(links().map((a) => a.getAttribute("href"))).toEqual(
      diary().map((e) => `#timeline-entry-${e.id}`),
    );
  });

  it("does not collapse equal measurements captured at different times", async () => {
    await mount(
      importedRows().map((r) => ({ ...r, value: r.metric === "temperature_c" ? 25 : r.value })),
    );
    expect(cards()).toHaveLength(4);
    expect(links()).toHaveLength(4);
  });

  it("does not merge simultaneous observations in different tents or borrow another grow's values", async () => {
    const rows = importedRows();
    await mount(
      [
        ...rows,
        ...rows.map((r) => ({
          ...r,
          tent_id: "t2",
          value: r.metric === "temperature_c" ? 20 : r.value,
        })),
        ...rows.map((r) => ({ ...r, value: 999, raw_payload: { grow_id: "other-grow" } })),
      ],
      [...diary(), ...diary(times, "t2")],
    );
    expect(cards()).toHaveLength(8);
    expect(screen.getAllByText("Tent: QA Tent One")).toHaveLength(4);
    expect(screen.getAllByText("Tent: QA Tent Two")).toHaveLength(4);
    expect(links()).toHaveLength(8);
    expect(cards()[4]).toHaveTextContent("68.0 °F");
    expect(document.body).not.toHaveTextContent("999");
  });

  it("does not fill missing values from an adjacent capture or a different tent", async () => {
    const rows = importedRows().filter(
      (r) => r.captured_at !== "2026-10-28T11:30:00.000Z" || r.metric === "humidity_pct",
    );
    await mount([
      ...rows,
      { tent_id: "t2", source: "csv", metric: "temperature_c", value: 99, captured_at: times[1] },
    ]);
    expect(cards()).toHaveLength(4);
    expect(cards()[1]).toHaveTextContent("— °F");
    expect(cards()[1]).toHaveTextContent("57 %");
    expect(cards()[1]).not.toHaveTextContent("VPD");
  });

  it.each(["csv", "derived", undefined])(
    "preserves %s VPD provenance and historical CSV source without mutations",
    async (origin) => {
      const rows = importedRows().map((r) => ({
        ...r,
        raw_payload: { grow_id: "g1", vpd_source: origin },
      }));
      const before = JSON.stringify(rows);
      await mount(rows);
      cards().forEach((card) => {
        expect(card).toHaveAttribute("data-source", "CSV");
        expect(
          within(card).getByText(
            origin === "csv" ? "CSV VPD:" : origin === "derived" ? "Derived VPD:" : "VPD:",
          ),
        ).toBeTruthy();
        expect(card.textContent?.toLowerCase()).not.toContain("live");
      });
      expect(JSON.stringify(rows)).toBe(before);
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.eq).toHaveBeenCalledWith("source", "csv");
      expect(mocks.in).toHaveBeenCalledWith("tent_id", ["t1"]);
      expect(screen.getByRole("note")).toHaveTextContent(/historical/i);
      expect(screen.getByRole("note")).toHaveTextContent(/45 minutes/);
      expect(screen.getByRole("note")).toHaveTextContent(/Imported sensor history/);
    },
  );

  it("excludes non-CSV sources and out-of-window entries", async () => {
    await mount([
      ...importedRows().map((r) => ({ ...r, source: "live" })),
      ...importedRows().map((r) => ({ ...r, source: "manual" })),
    ]);
    expect(cards()).toHaveLength(0);
    await mount(importedRows(), diary(["2026-10-28T08:16:00-05:00"]));
    expect(cards()).toHaveLength(0);
  });

  it("keeps the 45-minute boundary and earlier capture on an equal-distance tie", async () => {
    await mount(importedRows(), diary(["2026-10-28T06:15:00-05:00", "2026-10-28T08:15:00-05:00"]));
    expect(cards()).toHaveLength(2);
    expect(cards()[0]).toHaveTextContent(new Date(times[0]).toLocaleString());
    expect(cards()[1]).toHaveTextContent(new Date(times[3]).toLocaleString());
    expect(links()[0]).toHaveAttribute("title", "15 min from CSV capture");
    expect(links()[1]).toHaveAttribute("title", "45 min from CSV capture");
  });

  it("handles invalid entry times, invalid capture times and non-finite values without guessing", async () => {
    await mount(
      [
        {
          tent_id: "t1",
          source: "csv",
          metric: "temperature_c",
          value: Number.NaN,
          captured_at: times[0],
        },
        {
          tent_id: "t1",
          source: "csv",
          metric: "humidity_pct",
          value: null,
          captured_at: times[0],
        },
        {
          tent_id: "t1",
          source: "csv",
          metric: "vpd_kpa",
          value: Number.POSITIVE_INFINITY,
          captured_at: times[0],
        },
        {
          tent_id: "t1",
          source: "csv",
          metric: "temperature_c",
          value: 99,
          captured_at: "invalid",
        },
      ],
      [
        ...diary([times[0]]),
        { id: "invalid", tent_id: "t1", entry_at: "invalid" },
        { id: "missing", tent_id: "t1", entry_at: null },
      ],
    );
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toHaveTextContent("— °F");
    expect(cards()[0]).toHaveTextContent("— %");
    expect(cards()[0]).not.toHaveTextContent(/VPD|NaN|Infinity/);
    expect(links()).toHaveLength(1);
  });

  it("remains repeatable when diary entries change and hides removed associations", async () => {
    const entries = diary(Array(4).fill(times[3]));
    const view = await mount(importedRows(), entries);
    expect(cards()).toHaveLength(1);
    view.rerender(<TimelineCsvContextPanel growId="g1" entries={[entries[3]]} />);
    expect(cards()).toHaveLength(1);
    expect(links()).toHaveLength(1);
    expect(links()[0]).toHaveAttribute("href", "#timeline-entry-t1-d3");
    expect(screen.getByText("Context for 1 diary entry")).toBeTruthy();
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
});
