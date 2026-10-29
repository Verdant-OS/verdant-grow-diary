import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { useSensorsPageSession } from "@/hooks/useSensorsPageSession";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readPendingManualSnapshot } from "@/lib/manualSensorPendingSnapshotStore";
import { buildManualReadingPayloads } from "@/lib/sensorReadingManualEntryRules";

const backend = vi.hoisted(() => ({ posts: [] as Record<string, unknown>[][] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "fahrenheit",
}));
// Only the network boundary is replaced; recovery, session, review and entry
// validation all run as mounted in the real card. No live Supabase is called.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "sensor_readings") throw new Error("Unexpected upgrade fixture table");
      const query = {
        eq: () => query,
        in: () => query,
        limit: async () => ({ data: [], error: null }),
      };
      return {
        select: () => query,
        insert: async (rows: Record<string, unknown>[]) => {
          backend.posts.push(rows.map((row) => ({ ...row })));
          return { error: null };
        },
      };
    },
  },
}));

const TENT = "11111111-1111-4111-8111-111111111111";
const tents = [{ id: TENT, name: "Tent A" }];
const key = "verdant:sensors:pending-manual:v1:legacy-owner";
const capturedAt = "2026-10-28T18:00:00.000Z";

function SessionCard() {
  const session = useSensorsPageSession("legacy-owner");
  useEffect(() => {
    session?.reconcileSelection({
      intent: { tentId: TENT, requireExactMatch: true },
      intentKey: "legacy-upgrade",
      tents,
      tentsLoaded: true,
    });
  }, [session]);
  return (
    <ManualSensorReadingCard tents={tents} defaultTentId={TENT} session={session ?? undefined} />
  );
}

function mountSeededLegacySnapshot() {
  // A previous build accepted 200 °F, stored 93.33 °C, then refused insertion.
  // Do not use today's entry/claim validator to construct an upgrade fixture.
  const record = {
    version: 1,
    ownerId: "legacy-owner",
    airTempUnit: "F",
    payloads: buildManualReadingPayloads({
      tentId: TENT,
      ts: capturedAt,
      metrics: [
        { metric: "temperature_c", value: 93.33 },
        { metric: "humidity_pct", value: 50 },
      ],
    }),
  };
  const raw = JSON.stringify(record);
  sessionStorage.setItem(key, raw);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SessionCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return raw;
}

beforeEach(() => {
  sessionStorage.clear();
  backend.posts = [];
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("mounted legacy manual snapshot upgrade", () => {
  it("restores 200 °F, refuses it, then saves a deliberate 77 °F correction as 25 °C", async () => {
    const raw = mountSeededLegacySnapshot();
    const input = (await screen.findByLabelText(/Air temp/i)) as HTMLInputElement;
    expect(input.value).toBe("200");
    expect(screen.getByTestId("manual-reading-temp-unit-F")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("manual-reading-recovery-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
    expect(
      screen.getAllByText("Temperature must be between 14 and 122 °F.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId("manual-reading-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(screen.queryByTestId("manual-sensor-review-confirm")).not.toBeInTheDocument();
    expect(backend.posts).toHaveLength(0);
    expect(sessionStorage.getItem(key)).toBe(raw);

    fireEvent.change(input, { target: { value: "77" } });
    expect(readPendingManualSnapshot("legacy-owner")).toEqual({ status: "empty" });
    expect(screen.getByTestId("manual-reading-save")).toBeEnabled();
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));

    await waitFor(() => expect(backend.posts).toHaveLength(1));
    expect(backend.posts[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "temperature_c",
          value: 25,
          source: "manual",
          tent_id: TENT,
        }),
        expect.objectContaining({
          metric: "humidity_pct",
          value: 50,
          source: "manual",
          tent_id: TENT,
        }),
      ]),
    );
    expect(backend.posts[0][0].captured_at).not.toBe(capturedAt);
    await waitFor(() =>
      expect(readPendingManualSnapshot("legacy-owner")).toEqual({ status: "empty" }),
    );
    expect(screen.queryByTestId("manual-reading-recovery-error")).not.toBeInTheDocument();
  });
});
