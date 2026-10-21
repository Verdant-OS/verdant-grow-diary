import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { useSensorsPageSession } from "@/hooks/useSensorsPageSession";

// QA (production 05f5138d): with a °F preference, a refused manual snapshot
// restored after a reload showed "Entered in °C" with 93.33, so typing 77
// meaning °F would have saved 77 °C. The restored draft must show the
// grower's unit, with the number expressed in that unit.

type Row = Record<string, unknown>;
const backend = vi.hoisted(() => ({
  posts: [] as Row[][],
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit",
}));
// In-memory sensor_readings table: no real Supabase response or credentials.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "sensor_readings") throw new Error("Unexpected table in unit fixture");
      const query = {
        eq: () => query,
        in: () => query,
        limit: async () => ({ data: [], error: null }),
      };
      return {
        select: () => query,
        insert: async (input: Row[]) => {
          backend.posts.push(input.map((row) => ({ ...row })));
          return { error: null };
        },
      };
    },
  },
}));

const TENT = "11111111-1111-4111-8111-111111111111";
const tents = [{ id: TENT, name: "Tent A" }];
const PENDING_KEY = "verdant:sensors:pending-manual:v1:owner-a";

function SessionCard() {
  const session = useSensorsPageSession("owner-a");
  useEffect(() => {
    session?.reconcileSelection({
      intent: { tentId: TENT, requireExactMatch: true },
      intentKey: "restored-draft-unit-preference",
      tents,
      tentsLoaded: true,
    });
  }, [session]);
  return (
    <ManualSensorReadingCard tents={tents} defaultTentId={TENT} session={session ?? undefined} />
  );
}

/** A fresh QueryClient per mount stands in for a document reload. */
function mountPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SessionCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const airTemp = () => screen.getByLabelText(/Air temp/i) as HTMLInputElement;
const temperatureRow = (rows: Row[] | undefined) =>
  rows?.find((row) => row.metric === "temperature_c");

async function refuseHotReadingThenReload() {
  const first = mountPage();
  expect(screen.getByTestId("manual-reading-temp-unit-F")).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(airTemp(), { target: { value: "200" } });
  fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "50" } });
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
  // The app refuses the out-of-range reading before any insert, leaving the
  // claimed snapshot (canonical °C) pending in this tab's sessionStorage.
  await screen.findByTestId("manual-reading-save-unconfirmed");
  expect(backend.posts).toHaveLength(0);
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
  expect(temperatureRow(pending?.payloads)?.value).toBe(93.33);
  first.unmount();
  mountPage();
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  backend.posts = [];
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("manual reading form keeps the °F preference after a restored draft", () => {
  it("shows the restored reading in °F (200, not 93.33 °C) after a reload", async () => {
    await refuseHotReadingThenReload();

    expect(screen.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
    expect(screen.getByTestId("manual-reading-temp-unit-F")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("manual-reading-temp-unit-C")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(airTemp().value).toBe("200");
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(50);
  });

  it("treats 77 typed into the restored form as °F and sends 25 °C", async () => {
    await refuseHotReadingThenReload();

    fireEvent.change(airTemp(), { target: { value: "77" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    await waitFor(() => expect(backend.posts).toHaveLength(1));
    expect(temperatureRow(backend.posts[0])?.value).toBe(25);
  });
});
