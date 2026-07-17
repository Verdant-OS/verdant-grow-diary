/**
 * CSV import → "View imported history" handoff (component tests).
 *
 * Pins:
 *  - successful import shows the CTA and the historical-context note;
 *  - the CTA targets the launcher's TRUSTED plant, else the tent — and
 *    with no trustworthy context the launcher falls back safely;
 *  - completion never invokes AI Doctor, never creates alerts, never
 *    creates Action Queue items;
 *  - duplicate-count completion copy stays intact;
 *  - the modal without a handoff href renders exactly as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import { plantDetailPath, sensorsPath, tentDetailPath } from "@/lib/routes";
import {
  CSV_IMPORT_ADD_CURRENT_READING_LABEL,
  CSV_IMPORT_HISTORICAL_CONTEXT_NOTE,
  CSV_IMPORT_VIEW_HISTORY_LABEL,
} from "@/lib/environmentCsvPreviewCopyRules";

// ---- shared spies -----------------------------------------------------
const supabaseSpies = vi.hoisted(() => ({
  tables: [] as string[],
  functionsInvoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    b.insert = async () => ({ error: null });
    b.select = () => b;
    b.in = () => b;
    b.gte = () => b;
    b.lte = () => Promise.resolve({ data: [], error: null });
    return b;
  };
  return {
    supabase: {
      from: (table: string) => {
        supabaseSpies.tables.push(table);
        return builder();
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

function makeQueryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

async function uploadAndConfirm() {
  const input = screen.getByTestId("csv-import-file-input") as HTMLInputElement;
  const file = new File(["Timestamp,Temp(°C),RH\n2026-06-01T10:00:00Z,25,50\n"], "export.csv", {
    type: "text/csv",
  });
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => expect(screen.queryByTestId("csv-import-preview")).toBeTruthy());
  fireEvent.click(screen.getByTestId("csv-import-confirm"));
  await waitFor(() => expect(screen.queryByTestId("csv-import-done")).toBeTruthy());
}

beforeEach(() => {
  supabaseSpies.tables.length = 0;
  supabaseSpies.functionsInvoke.mockReset();
  trackSpy.mockReset();
});

afterEach(() => cleanup());

describe("launcher → modal handoff", () => {
  it("successful import shows 'View imported history' targeting the trusted plant", async () => {
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
    expect(cta.getAttribute("href")).toBe(plantDetailPath(PLANT_ID, { tentId: TENT_ID }));
    const current = screen.getByTestId("csv-import-add-current-reading");
    expect(current.textContent).toContain(CSV_IMPORT_ADD_CURRENT_READING_LABEL);
    expect(current.getAttribute("href")).toBe(`${sensorsPath(GROW_ID)}#manual-reading`);
  });

  it("without a plant target the CTA falls back to the selected tent", async () => {
    const Wrapper = makeQueryWrapper();
    render(
      <Wrapper>
        <EnvironmentCsvImportLauncher growId={GROW_ID} tentId={TENT_ID} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId("csv-launcher-button"));
    await uploadAndConfirm();
    expect(screen.getByTestId("csv-import-view-history").getAttribute("href")).toBe(
      tentDetailPath(TENT_ID),
    );
    expect(screen.getByTestId("csv-import-add-current-reading").getAttribute("href")).toBe(
      `${sensorsPath(GROW_ID)}#manual-reading`,
    );
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
    // Only sensor_readings is touched — never alerts / action_queue.
    expect(supabaseSpies.tables.length).toBeGreaterThan(0);
    for (const table of supabaseSpies.tables) {
      expect(table).toBe("sensor_readings");
    }
    // Funnel event is the existing privacy-safe completion signal.
    expect(trackSpy).toHaveBeenCalledWith(
      "csv_import_completed",
      expect.objectContaining({ rows: expect.any(Number) }),
    );
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
