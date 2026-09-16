/**
 * CSV import → "View imported history" handoff (component tests).
 *
 * Pins:
 *  - successful import shows the CTA and the historical-context note;
 *  - the CTA targets the tent's visible imported-history section so plant
 *    choice remains explicit after the grower sees value;
 *  - completion never invokes AI Doctor, never creates alerts, never
 *    creates Action Queue items;
 *  - duplicate-count completion copy stays intact;
 *  - the modal without a handoff href renders exactly as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { tentDetailPath } from "@/lib/routes";
import {
  readSensorsTentRouteIntent,
  resolveSensorsTentRouteSelection,
} from "@/lib/sensorRouteTentIntentRules";
import { IMPORTED_SENSOR_HISTORY_ANCHOR_ID } from "@/lib/importedSensorHistoryViewModel";
import {
  CSV_IMPORT_ADD_CURRENT_READING_LABEL,
  CSV_IMPORT_CONFIRM_LABEL,
  CSV_IMPORT_HISTORICAL_CONTEXT_NOTE,
  CSV_IMPORT_VIEW_HISTORY_LABEL,
} from "@/lib/environmentCsvPreviewCopyRules";

// ---- shared spies -----------------------------------------------------
const supabaseSpies = vi.hoisted(() => ({
  tables: [] as string[],
  writes: [] as Array<[string, string]>,
  subscriptionFilters: [] as Array<[string, unknown]>,
  functionsInvoke: vi.fn(),
  insertedRows: [] as Array<{ tent_id: string }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const operation of ["insert", "update", "upsert", "delete"]) {
      b[operation] = async (rows: Array<{ tent_id: string }>) => {
        supabaseSpies.writes.push([table, operation]);
        if (operation === "insert") supabaseSpies.insertedRows.push(...rows);
        return { error: null };
      };
    }
    b.select = () => b;
    b.eq = (column: string, value: unknown) => {
      if (table === "subscriptions") supabaseSpies.subscriptionFilters.push([column, value]);
      return b;
    };
    b.order = () => b;
    b.limit = () => Promise.resolve({ data: [], error: null });
    b.in = () => b;
    b.gte = () => b;
    b.lte = () => Promise.resolve({ data: [], error: null });
    return b;
  };
  return {
    supabase: {
      from: (table: string) => {
        supabaseSpies.tables.push(table);
        return builder(table);
      },
      functions: { invoke: supabaseSpies.functionsInvoke },
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const trackSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: trackSpy }));

import { EnvironmentCsvImportLauncher } from "@/components/EnvironmentCsvImportLauncher";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";

const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e01";
const GROW_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e02";
const PLANT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e03";
const OTHER_TENT_ID = "11111111-1111-4111-8111-111111111111";

/** Regression fence: CSV handoff must target the imported tent, not grow-scoped /sensors. */
function expectTentScopedManualReadingHref(href: string | null, tentId: string) {
  expect(href).toBe(`/sensors?tentId=${tentId}&tentIntent=required#manual-reading`);
  expect(href).not.toContain("growId=");
}

function CurrentLocation() {
  const location = useLocation();
  return (
    <output data-testid="handoff-location">
      {location.pathname + location.search + location.hash}
    </output>
  );
}

function makeQueryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        {children}
        <CurrentLocation />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

async function upload() {
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  const file = new File(["Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n"], "export.csv", {
    type: "text/csv",
  });
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
  expect(screen.getByTestId("csv-import-confirm")).toHaveTextContent(CSV_IMPORT_CONFIRM_LABEL);
}

async function confirm() {
  fireEvent.click(screen.getByTestId("csv-import-confirm"));
  await waitFor(() => expect(screen.queryByTestId("csv-import-done")).toBeTruthy());
}

async function uploadAndConfirm() {
  await upload();
  await confirm();
}

beforeEach(() => {
  supabaseSpies.tables.length = 0;
  supabaseSpies.writes.length = 0;
  supabaseSpies.insertedRows.length = 0;
  supabaseSpies.subscriptionFilters.length = 0;
  supabaseSpies.functionsInvoke.mockReset();
  trackSpy.mockReset();
});

afterEach(() => cleanup());

describe("launcher → modal handoff", () => {
  it("successful import shows 'View imported history' targeting the visible tent history", async () => {
    const Wrapper = makeQueryWrapper();
    render(
      <Wrapper>
        <EnvironmentCsvImportLauncher growId={GROW_ID} tentId={TENT_ID} plantId={PLANT_ID} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId("csv-launcher-button"));
    await uploadAndConfirm();

    const note = screen.getByTestId("csv-import-historical-note");
    expect(note.textContent).toBe(CSV_IMPORT_HISTORICAL_CONTEXT_NOTE);

    const cta = screen.getByTestId("csv-import-view-history");
    expect(cta.textContent).toContain(CSV_IMPORT_VIEW_HISTORY_LABEL);
    expect(cta.getAttribute("href")).toBe(
      `${tentDetailPath(TENT_ID)}#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`,
    );
    const current = screen.getByTestId("csv-import-add-current-reading");
    expect(current.textContent).toContain(CSV_IMPORT_ADD_CURRENT_READING_LABEL);
    expectTentScopedManualReadingHref(current.getAttribute("href"), TENT_ID);
  });

  it("uses the same explicit tent-history target without a plant hint", async () => {
    const Wrapper = makeQueryWrapper();
    render(
      <Wrapper>
        <EnvironmentCsvImportLauncher growId={GROW_ID} tentId={TENT_ID} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId("csv-launcher-button"));
    await uploadAndConfirm();
    expect(screen.getByTestId("csv-import-view-history").getAttribute("href")).toBe(
      `${tentDetailPath(TENT_ID)}#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`,
    );
    expectTentScopedManualReadingHref(
      screen.getByTestId("csv-import-add-current-reading").getAttribute("href"),
      TENT_ID,
    );
  });

  it("completion keeps the tent-scoped handoff when parent grow context clears before confirm", async () => {
    const Wrapper = makeQueryWrapper();
    const tree = (growId: string | null) => (
      <Wrapper>
        <EnvironmentCsvImportLauncher growId={growId} tentId={TENT_ID} />
      </Wrapper>
    );
    const rendered = render(tree(GROW_ID));
    fireEvent.click(screen.getByTestId("csv-launcher-button"));
    await upload();
    // Import session scope is frozen at open; parent grow selection may clear mid-flow.
    rendered.rerender(tree(null));
    await confirm();
    expectTentScopedManualReadingHref(
      screen.getByTestId("csv-import-add-current-reading").getAttribute("href"),
      TENT_ID,
    );
    expect(supabaseSpies.insertedRows.every((row) => row.tent_id === TENT_ID)).toBe(true);
  });

  it.each(["card", "compact"] as const)(
    "%s completion keeps the imported tent after the surrounding selection changes",
    async (variant) => {
      const Wrapper = makeQueryWrapper();
      const tree = (tentId: string) => (
        <Wrapper>
          <EnvironmentCsvImportLauncher growId={GROW_ID} tentId={tentId} variant={variant} />
        </Wrapper>
      );
      const rendered = render(tree(TENT_ID));
      fireEvent.click(screen.getByTestId("csv-launcher-button"));
      await upload();
      // The import is still for its original tent, even if the parent route
      // rerenders another selection before the grower confirms the file.
      rendered.rerender(tree(OTHER_TENT_ID));
      await confirm();
      expect(supabaseSpies.insertedRows).toHaveLength(3);
      expect(supabaseSpies.insertedRows.every((row) => row.tent_id === TENT_ID)).toBe(true);

      const current = screen.getByTestId("csv-import-add-current-reading");
      const href = current.getAttribute("href")!;
      expectTentScopedManualReadingHref(href, TENT_ID);
      expect(screen.getByTestId("csv-import-view-history")).toHaveAttribute(
        "href",
        `${tentDetailPath(TENT_ID)}#${IMPORTED_SENSOR_HISTORY_ANCHOR_ID}`,
      );
      const intent = readSensorsTentRouteIntent(new URL(href, "https://local.test").searchParams);
      expect(
        resolveSensorsTentRouteSelection({
          intent,
          tents: [{ id: OTHER_TENT_ID }, { id: TENT_ID }],
          currentTentId: OTHER_TENT_ID,
        }),
      ).toBe(TENT_ID);
      expect(
        resolveSensorsTentRouteSelection({
          intent,
          tents: [{ id: OTHER_TENT_ID }],
          currentTentId: OTHER_TENT_ID,
        }),
      ).toBeNull();

      fireEvent.click(current);
      await waitFor(() => expect(screen.getByTestId("handoff-location")).toHaveTextContent(href));
      expect(screen.queryByTestId("csv-import-modal")).not.toBeInTheDocument();
      expect(supabaseSpies.writes).toEqual([["sensor_readings", "insert"]]);
      expect(supabaseSpies.functionsInvoke).not.toHaveBeenCalled();
    },
  );

  it("does not offer an unscoped current-reading link for a malformed tent", async () => {
    const Wrapper = makeQueryWrapper();
    render(
      <Wrapper>
        <EnvironmentCsvImportLauncher growId={GROW_ID} tentId="not-a-persisted-tent" />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId("csv-launcher-button"));
    // The stub accepts this input so the completion-link guard is exercised;
    // real database persistence is not claimed by this presentation test.
    await uploadAndConfirm();
    expect(screen.queryByTestId("csv-import-add-current-reading")).not.toBeInTheDocument();
  });

  it("no trustworthy context at all falls back safely to the needs-context state", () => {
    const Wrapper = makeQueryWrapper();
    render(
      <Wrapper>
        <EnvironmentCsvImportLauncher growId={null} tentId={null} />
      </Wrapper>,
    );
    expect(screen.getByTestId("csv-launcher-needs-context")).toBeTruthy();
    expect(screen.queryByTestId("csv-import-view-history")).toBeNull();
    expect(screen.queryByTestId("csv-import-add-current-reading")).toBeNull();
  });

  it("import completion never invokes AI Doctor, alerts, or Action Queue", async () => {
    const Wrapper = makeQueryWrapper();
    render(
      <Wrapper>
        <EnvironmentCsvImportLauncher growId={GROW_ID} tentId={TENT_ID} plantId={PLANT_ID} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId("csv-launcher-button"));
    await uploadAndConfirm();

    // No edge-function calls at all (AI Doctor runs only via
    // supabase.functions.invoke).
    expect(supabaseSpies.functionsInvoke).not.toHaveBeenCalled();
    // History access may read the owner's live subscriptions; only the CSV
    // sensor rows may be written. No alerts, Action Queue or billing mutation.
    expect(supabaseSpies.tables.length).toBeGreaterThan(0);
    for (const table of supabaseSpies.tables) {
      expect(["sensor_readings", "subscriptions"]).toContain(table);
    }
    expect(supabaseSpies.writes).toEqual([["sensor_readings", "insert"]]);
    expect(supabaseSpies.subscriptionFilters).toContainEqual(["user_id", "u1"]);
    expect(supabaseSpies.subscriptionFilters).toContainEqual(["environment", "live"]);
    // Funnel events remain privacy-safe and explicitly cover the import start
    // and durable completion boundaries—nothing downstream is inferred.
    expect(trackSpy).toHaveBeenCalledWith("csv_import_started");
    expect(trackSpy).toHaveBeenCalledWith(
      "csv_import_completed",
      expect.objectContaining({ rows: expect.any(Number) }),
    );
    expect(trackSpy.mock.calls.map(([eventName]) => eventName)).toEqual([
      "csv_import_started",
      "csv_import_completed",
    ]);
    expect(trackSpy).not.toHaveBeenCalledWith("csv_history_ai_doctor_clicked", expect.anything());
    expect(trackSpy).not.toHaveBeenCalledWith("historical_ai_review_started", expect.anything());
  });
});

describe("modal — completion copy and back-compat", () => {
  it("distinguishes historical context from live telemetry and keeps duplicate counts", async () => {
    const onConfirm = vi.fn(async (_rows: readonly ParsedEnvironmentRow[]) => ({
      insertedCount: 9,
      duplicateCount: 3,
      error: null,
    }));
    render(
      <MemoryRouter>
        <EnvironmentCsvImportModal
          open
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          viewHistoryHref={tentDetailPath(TENT_ID)}
        />
      </MemoryRouter>,
    );
    await uploadAndConfirm();
    const done = screen.getByTestId("csv-import-done");
    expect(done.textContent).toContain("9");
    expect(done.textContent).toContain("3");
    expect(done.textContent).toContain(CSV_IMPORT_HISTORICAL_CONTEXT_NOTE);
    expect(done.textContent).toContain("not live telemetry");
  });

  it("renders the tent-scoped current-reading CTA when addCurrentReadingHref is provided", async () => {
    const onConfirm = vi.fn(async () => ({
      insertedCount: 2,
      duplicateCount: 0,
      error: null,
    }));
    const tentHref = `/sensors?tentId=${TENT_ID}&tentIntent=required#manual-reading`;
    render(
      <MemoryRouter>
        <EnvironmentCsvImportModal
          open
          onOpenChange={() => {}}
          onConfirm={onConfirm}
          addCurrentReadingHref={tentHref}
        />
      </MemoryRouter>,
    );
    await uploadAndConfirm();
    expectTentScopedManualReadingHref(
      screen.getByTestId("csv-import-add-current-reading").getAttribute("href"),
      TENT_ID,
    );
  });

  it("omitting viewHistoryHref renders the legacy done state without a CTA", async () => {
    const onConfirm = vi.fn(async () => ({
      insertedCount: 3,
      duplicateCount: 0,
      error: null,
    }));
    render(<EnvironmentCsvImportModal open onOpenChange={() => {}} onConfirm={onConfirm} />);
    await uploadAndConfirm();
    expect(screen.queryByTestId("csv-import-view-history")).toBeNull();
    expect(screen.queryByTestId("csv-import-add-current-reading")).toBeNull();
    // The truthful historical note still renders.
    expect(screen.getByTestId("csv-import-historical-note")).toBeTruthy();
  });
});
