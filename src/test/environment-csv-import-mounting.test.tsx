/**
 * environment-csv-import-mounting.test — verifies the CSV Drop launcher is
 * mounted on Sensors / Timeline surfaces and that it only inserts via the
 * Confirm CTA (never on open/cancel).
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const trackFunnelEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

import { MemoryRouter } from "@/lib/react-router-compat";
import EnvironmentCsvImportLauncher from "@/components/EnvironmentCsvImportLauncher";

const insertSpy = vi.fn();
let insertError: { message: string; code?: string; details?: string } | null = null;
let insertFailureCall: number | null = null;
let authUserId = "u-1";
let existingRows: Array<Record<string, unknown>> = [];
let insertOverride: ((rows: unknown[]) => Promise<{ error: typeof insertError }>) | null = null;
let lookupOverride:
  | (() => Promise<{
      data: Array<Record<string, unknown>> | null;
      error: { message: string } | null;
    }>)
  | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        let tentIds: string[] = [];
        let from = 0;
        let to = Infinity;
        let minCapturedAt = "";
        let maxCapturedAt = "~";
        const chain: Record<string, unknown> = {
          in: (key: string, values: string[]) => {
            if (key === "tent_id") tentIds = values;
            return chain;
          },
          gte: (_key: string, value: string) => {
            minCapturedAt = value;
            return chain;
          },
          lte: (_key: string, value: string) => {
            maxCapturedAt = value;
            return chain;
          },
          order: () => chain,
          range: (start: number, end: number) => {
            from = start;
            to = end;
            return chain;
          },
          then: (
            resolve: (result: {
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }) => unknown,
          ) =>
            (lookupOverride
              ? lookupOverride()
              : Promise.resolve({
                  data: existingRows.filter(
                    (r) =>
                      tentIds.includes(String(r.tent_id)) &&
                      String(r.captured_at) >= minCapturedAt &&
                      String(r.captured_at) <= maxCapturedAt,
                  ),
                  error: null,
                })
            ).then((result) => {
              if (result.error || !result.data) {
                resolve(result);
                return;
              }
              resolve({
                ...result,
                data: result.data.slice(from, Math.min(to + 1, from + 1000)),
              });
            }),
        };
        return chain;
      },
      insert: (rows: unknown) => {
        insertSpy(rows);
        if (insertOverride) return insertOverride(rows as unknown[]);
        const error =
          insertFailureCall === insertSpy.mock.calls.length
            ? { message: "Later batch failed", code: "PGRST500" }
            : insertError;
        return Promise.resolve({ error });
      },
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: authUserId }, session: null, loading: false, signOut: vi.fn() }),
}));

function withQuery(ui: React.ReactElement, qc = new QueryClient()) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("EnvironmentCsvImportLauncher — mounting", () => {
  beforeEach(() => {
    trackFunnelEvent.mockReset();
    insertSpy.mockReset();
    insertError = null;
    insertFailureCall = null;
    authUserId = "u-1";
    existingRows = [];
    insertOverride = null;
    lookupOverride = null;
  });

  it("renders calm message when no grow/tent selected (test 1, 6)", () => {
    render(
      withQuery(<EnvironmentCsvImportLauncher growId={null} tentId={null} testIdPrefix="x" />),
    );
    expect(screen.getByTestId("x-needs-context").textContent).toMatch(
      /Select a grow and tent before importing CSV data\./,
    );
  });

  it("renders the card CTA with copy when context is ready (tests 1, 2)", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          testIdPrefix="sensors-csv-launcher"
        />,
      ),
    );
    expect(screen.getByTestId("sensors-csv-launcher-card")).toBeTruthy();
    expect(screen.getAllByText(/Import historical data/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Data is read-only and source-tagged as CSV/i)).toBeTruthy();
  });

  it("clicking the CTA opens the CSV modal (tests 3, 5)", () => {
    render(withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />));
    fireEvent.click(screen.getByTestId("x-button"));
    expect(screen.getByTestId("csv-import-modal")).toBeTruthy();
    expect(trackFunnelEvent).toHaveBeenCalledWith("csv_import_started");
  });

  it("opening modal does not insert (tests 8, 9)", () => {
    insertSpy.mockClear();
    render(withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />));
    fireEvent.click(screen.getByTestId("x-button"));
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("compact variant renders the Import CSV button (test 4)", () => {
    render(
      withQuery(
        <EnvironmentCsvImportLauncher
          growId="g1"
          tentId="t1"
          variant="compact"
          testIdPrefix="timeline-csv-launcher"
        />,
      ),
    );
    expect(screen.getByTestId("timeline-csv-launcher-button").textContent).toMatch(/Import CSV/);
  });

  it("Confirm CTA is the only insert path; payload uses source = csv (tests 10, 11, 12)", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    render(
      withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />, qc),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    // upload a simple valid CSV with explicit Celsius header
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    const file = new File(
      ["Timestamp,Temperature (C),RH (%)\n2026-06-01T10:00:00Z,25,50\n"],
      "e.csv",
      { type: "text/csv" },
    );
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
    expect(insertSpy).not.toHaveBeenCalled(); // parsing/preview never inserts
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const rows = (insertSpy.mock.calls[0]?.[0] ?? []) as Array<{
      source: string;
      raw_payload: { source_tag: string };
    }>;
    await waitFor(() =>
      expect(trackFunnelEvent).toHaveBeenCalledWith("csv_import_completed", {
        rows: rows.length,
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.source === "csv")).toBe(true);
    expect(rows.every((r) => r.raw_payload.source_tag === "csv")).toBe(true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grow", "sensors"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sensor_readings"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["csv-timeline-context"] });
  });

  it("fails open when presence lookup errors instead of blocking import", async () => {
    lookupOverride = () =>
      Promise.resolve({
        data: null,
        error: { message: "CSV presence lookup unavailable" },
      });
    render(withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />));
    fireEvent.click(screen.getByTestId("x-button"));
    const csv = "Timestamp,Temperature (C)\n2026-12-01T10:00:00Z,20\n";
    fireEvent.change(screen.getByTestId("csv-import-file-input"), {
      target: { files: [new File([csv], "fresh.csv", { type: "text/csv" })] },
    });
    await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
  });

  it("recognizes sparse existing readings past the server's first presence page", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    existingRows = Array.from({ length: 10000 }, (_, index) => ({
      tent_id: "t1",
      source: "csv",
      metric: "temperature_c",
      captured_at: new Date(start + index * 60000).toISOString(),
    }));
    insertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "sensor_readings_dedupe_uidx"',
    };
    render(withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />));
    fireEvent.click(screen.getByTestId("x-button"));
    const csv =
      "Timestamp,Temperature (C)\n" +
      [1000, 5000, 9000].map((index) => `${existingRows[index].captured_at},20`).join("\n");
    fireEvent.change(screen.getByTestId("csv-import-file-input"), {
      target: { files: [new File([csv], "sparse.csv", { type: "text/csv" })] },
    });
    await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(screen.getByTestId("csv-import-done")).toBeTruthy());
    expect(insertSpy).not.toHaveBeenCalled();
    expect(trackFunnelEvent).toHaveBeenCalledWith("csv_import_completed", { rows: 0 });
  });

  it("Cancel does not insert (test 8)", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    render(
      withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />, qc),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    const file = new File(
      ["Timestamp,Temperature (C),RH (%)\n2026-06-01T10:00:00Z,25,50\n"],
      "e.csv",
      { type: "text/csv" },
    );
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
    fireEvent.click(screen.getByTestId("csv-import-cancel"));
    expect(insertSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(trackFunnelEvent).toHaveBeenCalledWith("csv_import_started");
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("csv_import_completed", expect.anything());
  });

  it("a definite first-batch rejection does not invalidate sensor chart caches", async () => {
    insertError = { message: "Insert rejected", code: "23514" };
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    render(
      withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />, qc),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
    const file = new File(
      ["Timestamp,Temperature (C),RH (%)\n2026-06-01T10:00:00Z,25,50\n"],
      "e.csv",
      { type: "text/csv" },
    );
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(screen.getByTestId("csv-import-error")).toBeTruthy());

    expect(insertSpy).toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("csv_import_completed", expect.anything());
  });

  it("refreshes cached history after an earlier CSV batch commits and a later batch fails", async () => {
    insertFailureCall = 2;
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const csvImportedListener = vi.fn();
    window.addEventListener("verdant:csv-imported", csvImportedListener);

    try {
      render(
        withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />, qc),
      );
      fireEvent.click(screen.getByTestId("x-button"));
      const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
      const csvRows = Array.from({ length: 251 }, (_, index) => {
        const capturedAt = new Date(Date.UTC(2026, 5, 1, 10, 0, index)).toISOString();
        return `${capturedAt},25,50`;
      });
      const file = new File(
        [`Timestamp,Temperature (C),RH (%)\n${csvRows.join("\n")}\n`],
        "partial.csv",
        { type: "text/csv" },
      );
      Object.defineProperty(input, "files", { value: [file] });
      fireEvent.change(input);
      await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
      fireEvent.click(screen.getByTestId("csv-import-confirm"));

      await waitFor(() => expect(screen.getByTestId("csv-import-error")).toBeTruthy());
      expect(insertSpy).toHaveBeenCalledTimes(2);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grow", "sensors"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sensor_readings"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["csv-timeline-context"] });
      expect(csvImportedListener).toHaveBeenCalledTimes(1);
      expect(trackFunnelEvent).not.toHaveBeenCalledWith("csv_import_completed", expect.anything());
    } finally {
      window.removeEventListener("verdant:csv-imported", csvImportedListener);
    }
  });
  it("refreshes history after an unconfirmed first batch without reporting completion", async () => {
    insertOverride = async (rows) => {
      existingRows.push(...(rows as Array<Record<string, unknown>>));
      return { error: { message: "TypeError: fetch failed", code: "" } };
    };
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const imported = vi.fn();
    window.addEventListener("verdant:csv-imported", imported);
    try {
      render(
        withQuery(
          <EnvironmentCsvImportLauncher growId="g1" tentId="t1" plantId="p1" testIdPrefix="x" />,
          qc,
        ),
      );
      fireEvent.click(screen.getByTestId("x-button"));
      const input = screen.getByTestId("csv-import-file-input");
      fireEvent.change(input, {
        target: {
          files: [
            new File(["Timestamp,Temperature (C),RH\n2026-06-01T10:00:00Z,25,50\n"], "lost.csv", {
              type: "text/csv",
            }),
          ],
        },
      });
      await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
      fireEvent.click(screen.getByTestId("csv-import-confirm"));
      await waitFor(() => expect(screen.getByTestId("csv-import-error")).toBeTruthy());
      expect(existingRows).toHaveLength(3);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sensor_readings"] });
      expect(imported).toHaveBeenCalledTimes(1);
      expect(trackFunnelEvent).not.toHaveBeenCalledWith("csv_import_completed", expect.anything());
      expect(insertSpy).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("link", { name: /View imported history/i }));
      expect(screen.queryByTestId("csv-import-modal")).toBeNull();
      expect(insertSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("verdant:csv-imported", imported);
    }
  });

  it("keeps the original target and history link when selection changes, including explicit retry", async () => {
    insertOverride = async (rows) => {
      existingRows.push(...(rows as Array<Record<string, unknown>>));
      return { error: { message: "TypeError: fetch failed", code: "" } };
    };
    const qc = new QueryClient();
    const { rerender } = render(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g1" tentId="t1" plantId="p1" testIdPrefix="x" />,
        qc,
      ),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    fireEvent.change(screen.getByTestId("csv-import-file-input"), {
      target: {
        files: [
          new File(["Timestamp,Temperature (C),RH\n2026-06-01T10:00:00Z,25,50\n"], "original.csv", {
            type: "text/csv",
          }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
    rerender(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g2" tentId="t2" plantId="p2" testIdPrefix="x" />,
        qc,
      ),
    );
    expect(insertSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(screen.getByTestId("csv-import-error")).toBeTruthy());
    expect(existingRows).toHaveLength(3);
    expect(
      existingRows.every(
        (r) =>
          r.user_id === "u-1" &&
          r.tent_id === "t1" &&
          (r.raw_payload as Record<string, unknown>).grow_id === "g1" &&
          (r.raw_payload as Record<string, unknown>).plant_id === "p1",
      ),
    ).toBe(true);
    expect(screen.getByRole("link", { name: /View imported history/i }).getAttribute("href")).toBe(
      "/tents/t1#imported-history",
    );
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("csv_import_completed", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: /Retry import/i }));
    await waitFor(() => expect(screen.getByTestId("csv-import-done")).toBeTruthy());
    expect(screen.getByTestId("csv-import-done").textContent).toMatch(/already exist/i);
    expect(existingRows).toHaveLength(3);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("retains an unconfirmed import through a temporarily missing selection", async () => {
    insertOverride = async (rows) => {
      existingRows.push(...(rows as Array<Record<string, unknown>>));
      return { error: { message: "TypeError: fetch failed", code: "" } };
    };
    const qc = new QueryClient();
    const { rerender } = render(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g1" tentId="t1" plantId="p1" testIdPrefix="x" />,
        qc,
      ),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    fireEvent.change(screen.getByTestId("csv-import-file-input"), {
      target: {
        files: [
          new File(["Timestamp,Temperature (C),RH\n2026-06-01T10:00:00Z,25,50\n"], "original.csv", {
            type: "text/csv",
          }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(screen.getByTestId("csv-import-error")).toBeTruthy());
    const receipt = screen.getByTestId("csv-import-error").textContent;
    expect(receipt).toMatch(/couldn't confirm/i);
    rerender(
      withQuery(<EnvironmentCsvImportLauncher growId={null} tentId={null} testIdPrefix="x" />, qc),
    );
    expect(screen.getByTestId("csv-import-error").textContent).toBe(receipt);
    rerender(
      withQuery(
        <EnvironmentCsvImportLauncher growId="g2" tentId="t2" plantId="p2" testIdPrefix="x" />,
        qc,
      ),
    );
    expect(screen.getByTestId("csv-import-error").textContent).toBe(receipt);
    expect(screen.getByRole("link", { name: /View imported history/i }).getAttribute("href")).toBe(
      "/tents/t1#imported-history",
    );
    expect(insertSpy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Retry import/i }));
    await waitFor(() => expect(screen.getByTestId("csv-import-done")).toBeTruthy());
    expect(screen.getByTestId("csv-import-done").textContent).toMatch(/already exist/i);
    expect(existingRows).toHaveLength(3);
    expect(existingRows.every((row) => row.tent_id === "t1")).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it.each(["lookup", "first batch"] as const)(
    "ends the old %s operation across an account round trip",
    async (pendingAt) => {
      let finishLookup!: (value: { data: Array<Record<string, unknown>>; error: null }) => void;
      let finishBatch!: (value: { error: null }) => void;
      const lookupStarted = vi.fn();
      if (pendingAt === "lookup") {
        lookupOverride = () => {
          lookupStarted();
          return new Promise((resolve) => {
            finishLookup = resolve;
          });
        };
      } else {
        insertOverride = () =>
          new Promise((resolve) => {
            finishBatch = resolve;
          });
      }
      const qc = new QueryClient();
      const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
      const { rerender } = render(
        withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />, qc),
      );
      fireEvent.click(screen.getByTestId("x-button"));
      const csvRows = Array.from(
        { length: 251 },
        (_, index) => `${new Date(Date.UTC(2026, 5, 1, 10, 0, index)).toISOString()},25,50`,
      );
      fireEvent.change(screen.getByTestId("csv-import-file-input"), {
        target: {
          files: [
            new File([`Timestamp,Temperature (C),RH\n${csvRows.join("\n")}\n`], "pending.csv", {
              type: "text/csv",
            }),
          ],
        },
      });
      await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
      fireEvent.click(screen.getByTestId("csv-import-confirm"));
      await waitFor(() =>
        expect(pendingAt === "lookup" ? lookupStarted : insertSpy).toHaveBeenCalledTimes(1),
      );
      if (pendingAt === "first batch") expect(insertSpy.mock.calls[0][0]).toHaveLength(500);
      authUserId = "u-2";
      rerender(
        withQuery(<EnvironmentCsvImportLauncher growId="g2" tentId="t2" testIdPrefix="x" />, qc),
      );
      authUserId = "u-1";
      rerender(
        withQuery(<EnvironmentCsvImportLauncher growId="g3" tentId="t3" testIdPrefix="x" />, qc),
      );
      fireEvent.click(screen.getByTestId("x-button"));
      expect(screen.getByTestId("csv-import-entry")).toBeTruthy();
      lookupOverride = null;
      insertOverride = null;
      await act(async () => {
        if (pendingAt === "lookup") finishLookup({ data: [], error: null });
        else finishBatch({ error: null });
      });
      expect(insertSpy).toHaveBeenCalledTimes(pendingAt === "lookup" ? 0 : 1);
      expect(screen.getByTestId("csv-import-entry")).toBeTruthy();
      expect(screen.queryByTestId("csv-import-done")).toBeNull();
      expect(trackFunnelEvent).not.toHaveBeenCalledWith("csv_import_completed", expect.anything());
      expect(invalidateSpy).not.toHaveBeenCalled();
    },
  );

  it("closes the old import on account change and suppresses its late completion", async () => {
    let complete!: (value: { error: null }) => void;
    insertOverride = () =>
      new Promise<{ error: null }>((resolve) => {
        complete = resolve;
      });
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { rerender } = render(
      withQuery(<EnvironmentCsvImportLauncher growId="g1" tentId="t1" testIdPrefix="x" />, qc),
    );
    fireEvent.click(screen.getByTestId("x-button"));
    fireEvent.change(screen.getByTestId("csv-import-file-input"), {
      target: {
        files: [
          new File(["Timestamp,Temperature (C),RH\n2026-06-01T10:00:00Z,25,50\n"], "owner.csv", {
            type: "text/csv",
          }),
        ],
      },
    });
    await waitFor(() => expect(screen.getByTestId("csv-import-preview")).toBeTruthy());
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await waitFor(() => expect(insertSpy).toHaveBeenCalledTimes(1));
    authUserId = "u-2";
    rerender(
      withQuery(<EnvironmentCsvImportLauncher growId="g2" tentId="t2" testIdPrefix="x" />, qc),
    );
    await act(async () => complete({ error: null }));
    expect(screen.queryByTestId("csv-import-done")).toBeNull();
    expect(screen.queryByTestId("csv-import-modal")).toBeNull();
    expect(trackFunnelEvent).not.toHaveBeenCalledWith("csv_import_completed", expect.anything());
    expect(invalidateSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("x-button"));
    expect(screen.getByTestId("csv-import-entry")).toBeTruthy();
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});

describe("EnvironmentCsvImportLauncher — static safety scan (tests 28-35)", () => {
  it("launcher source has no forbidden runtime strings", () => {
    const raw = readFileSync(
      resolve(__dirname, "../components/EnvironmentCsvImportLauncher.tsx"),
      "utf8",
    );
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/action_queue/i);
    expect(src).not.toMatch(/from\(['"]alerts['"]\)/i);
    expect(src).not.toMatch(/automation/i);
    expect(src).not.toMatch(/device.?control/i);
    expect(src).not.toMatch(/bridge.?token/i);
    expect(src).not.toMatch(new RegExp("switch" + "bot", "i"));
    expect(src.toLowerCase()).not.toMatch(/"live"|'live'|live vpd/);
  });
});
