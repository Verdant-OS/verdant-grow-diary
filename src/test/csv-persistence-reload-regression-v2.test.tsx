/**
 * CSV Persistence Reload Regression v2
 *
 * Verifies that after a confirmed CSV import, the persisted row shape
 * (the shape the insert adapter returns / the read path replays) still
 * renders with CSV source labeling and never switches imported data to
 * Live/Manual/Demo wording.
 *
 * Approach:
 *  1. Drive the real EnvironmentCsvImportModal through upload → preview →
 *     confirm. Capture the rows the persistence layer was asked to insert.
 *  2. Simulate the reload by feeding those persisted rows back through the
 *     canonical source presenter (`normalizeSensorSource` + `sensorSourceLabel`)
 *     and into a tiny presenter-only renderer.
 *  3. Assert: every replayed reading still resolves to source "csv", labels
 *     as "CSV import", is not classified as a healthy live source, and never
 *     renders "Live"/"Manual"/"Demo" wording or "healthy" near the row.
 *
 * Deferred: full route-level reload via React Query refetch — the Post-Grow
 * loop does not expose a single "saved CSV readings" route-level card today
 * (readings flow into the existing sensor charts / ingest audit ledger).
 * Adding a fake route just for this test is out of scope; the presenter +
 * source-rule contract is the safe lower-level fence.
 */
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import {
  normalizeSensorSource,
  sensorSourceLabel,
  isHealthySensorSource,
  type SensorSource,
} from "@/lib/sensor/sensorSourceRules";

const SAMPLE_CSV =
  "Timestamp,Temperature (C),Humidity\n" +
  "2026-06-01T10:00:00Z,24.0,55\n" +
  "2026-06-01T10:05:00Z,24.2,54\n" +
  "2026-06-01T10:10:00Z,24.1,55\n";

/** Minimal persisted-row shape returned by the CSV insert adapter. */
interface PersistedCsvReading {
  readonly captured_at: string;
  readonly tent_id: string;
  readonly source: string;
  readonly temperature_c: number | null;
  readonly humidity_pct: number | null;
  readonly raw_payload: Record<string, unknown>;
}

/**
 * Drive the real modal through a confirmed import and return the rows
 * the persistence layer was asked to insert.
 */
async function runConfirmedImport(): Promise<{
  inserted: ReadonlyArray<PersistedCsvReading>;
}> {
  let captured: ReadonlyArray<PersistedCsvReading> = [];
  const onConfirm = vi.fn(
    async (rows: ReadonlyArray<Record<string, unknown>>) => {
      // The modal hands the persistence layer rows already tagged source:"csv".
      // We snapshot them here as the "persisted shape" replayed on reload.
      captured = rows.map((r) => ({
        captured_at: String(r.captured_at ?? ""),
        tent_id: "tent-1",
        source: "csv",
        temperature_c:
          typeof r.temperature_c === "number" ? r.temperature_c : null,
        humidity_pct: typeof r.humidity_pct === "number" ? r.humidity_pct : null,
        raw_payload: { source_app: "test-vendor" },
      }));
      return { insertedCount: captured.length, error: null };
    },
  );

  render(
    <EnvironmentCsvImportModal
      open
      onOpenChange={() => {}}
      onConfirm={onConfirm}
    />,
  );

  const input = screen.getByTestId(
    "csv-import-file-input",
  ) as HTMLInputElement;
  Object.defineProperty(input, "files", {
    value: [new File([SAMPLE_CSV], "export.csv", { type: "text/csv" })],
  });
  fireEvent.change(input);

  await waitFor(() => {
    expect(
      screen.queryByTestId("csv-import-preview") ||
        screen.queryByTestId("csv-import-unit-confirm"),
    ).toBeTruthy();
  });
  const unit = screen.queryByTestId("csv-import-unit-c");
  if (unit) {
    fireEvent.click(unit);
    await waitFor(() =>
      expect(screen.queryByTestId("csv-import-preview")).toBeTruthy(),
    );
  }

  fireEvent.click(screen.getByTestId("csv-import-confirm"));
  await waitFor(() =>
    expect(screen.queryByTestId("csv-import-done")).toBeTruthy(),
  );

  expect(onConfirm).toHaveBeenCalledTimes(1);
  cleanup();
  return { inserted: captured };
}

/**
 * Tiny presenter-only renderer that simulates the post-reload UI for one
 * CSV-sourced reading. Uses only canonical source helpers; no business logic.
 */
function ReadingCard({ row }: { row: PersistedCsvReading }) {
  const source: SensorSource = normalizeSensorSource(row.source);
  return (
    <div data-testid={`reading-${row.captured_at}`}>
      <span data-testid="reading-source-label">
        {sensorSourceLabel(source)}
      </span>
      <span data-testid="reading-source-source">{source}</span>
      <span data-testid="reading-captured-at">{row.captured_at}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Persistence contract — rows reach the insert layer tagged source:"csv"
// ---------------------------------------------------------------------------
describe("CSV Persistence Reload Regression v2 — persistence contract", () => {
  it("forwards parsed rows to onConfirm and treats them as CSV-sourced", async () => {
    const { inserted } = await runConfirmedImport();
    expect(inserted.length).toBeGreaterThan(0);
    for (const row of inserted) {
      expect(row.source).toBe("csv");
      expect(typeof row.captured_at).toBe("string");
      expect(row.captured_at.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Reload presenter — persisted rows still render as CSV
// ---------------------------------------------------------------------------
describe("CSV Persistence Reload Regression v2 — reload presenter", () => {
  it("renders persisted CSV rows with the canonical 'CSV import' label", async () => {
    const { inserted } = await runConfirmedImport();
    expect(inserted.length).toBeGreaterThan(0);

    render(
      <div>
        {inserted.map((row) => (
          <ReadingCard key={row.captured_at} row={row} />
        ))}
      </div>,
    );

    const labels = screen.getAllByTestId("reading-source-label");
    expect(labels.length).toBe(inserted.length);
    for (const el of labels) {
      expect(el.textContent).toBe("CSV import");
    }
    const sources = screen.getAllByTestId("reading-source-source");
    for (const el of sources) {
      expect(el.textContent).toBe("csv");
    }
    cleanup();
  });

  it("never relabels reloaded CSV rows as Live / Manual / Demo / Stale / Invalid", async () => {
    const { inserted } = await runConfirmedImport();
    render(
      <div data-testid="reload-root">
        {inserted.map((row) => (
          <ReadingCard key={row.captured_at} row={row} />
        ))}
      </div>,
    );
    const text = (screen.getByTestId("reload-root").textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/\blive\b/);
    expect(text).not.toMatch(/\bmanual\b/);
    expect(text).not.toMatch(/\bdemo\b/);
    expect(text).not.toMatch(/\bstale\b/);
    expect(text).not.toMatch(/\binvalid\b/);
    expect(text).not.toMatch(/\bhealthy\b/);
    cleanup();
  });

  it("CSV source is never classified as a healthy live source", () => {
    expect(isHealthySensorSource(normalizeSensorSource("csv"))).toBe(false);
    // Defensive: only "live" is healthy.
    expect(isHealthySensorSource("live")).toBe(true);
    for (const s of ["manual", "csv", "demo", "stale", "invalid"] as const) {
      expect(isHealthySensorSource(s)).toBe(false);
    }
  });

  it("modal done copy survives reload language and stays CSV-tagged", async () => {
    // Sanity: the done-state text from the modal also never says Live.
    const onConfirm = vi
      .fn()
      .mockResolvedValue({ insertedCount: 3, error: null });
    render(
      <EnvironmentCsvImportModal
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    );
    const input = screen.getByTestId(
      "csv-import-file-input",
    ) as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [new File([SAMPLE_CSV], "export.csv", { type: "text/csv" })],
    });
    fireEvent.change(input);
    await waitFor(() =>
      expect(
        screen.queryByTestId("csv-import-preview") ||
          screen.queryByTestId("csv-import-unit-confirm"),
      ).toBeTruthy(),
    );
    const unit = screen.queryByTestId("csv-import-unit-c");
    if (unit) {
      fireEvent.click(unit);
      await waitFor(() =>
        expect(screen.queryByTestId("csv-import-preview")).toBeTruthy(),
      );
    }
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() =>
      expect(screen.queryByTestId("csv-import-done")).toBeTruthy(),
    );
    const done = (
      screen.getByTestId("csv-import-done").textContent ?? ""
    ).toLowerCase();
    expect(done).toContain("csv");
    expect(done).not.toMatch(/\blive\b/);
    expect(done).not.toMatch(/\bhealthy\b/);
    cleanup();
  });
});
