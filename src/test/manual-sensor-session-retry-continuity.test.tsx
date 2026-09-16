import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { useSensorsPageSession } from "@/hooks/useSensorsPageSession";
import type { ManualCorrectionContext } from "@/lib/manualSensorCorrectionContext";

type Row = Record<string, unknown>;
const backend = vi.hoisted(() => ({
  rows: [] as Row[],
  posts: [] as Row[][],
  reads: 0,
  loseFirstReply: true,
  firstWriteGate: null as Promise<void> | null,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
// Real mutation, validation, uniqueness recovery and readback run against this
// isolated in-memory backend. No actual Supabase response or credentials are used.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "sensor_readings") throw new Error("Unexpected table in session retry fixture");
      const filters: Array<(row: Row) => boolean> = [];
      const query = {
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        limit: async (count: number) => {
          backend.reads += 1;
          return {
            data: backend.rows
              .filter((row) => filters.every((filter) => filter(row)))
              .slice(0, count),
            error: null,
          };
        },
      };
      return {
        select: () => query,
        insert: async (input: Row[]) => {
          const rows = input.map((row) => ({ ...row }));
          const attempt = backend.posts.push(rows);
          if (attempt === 1 && backend.firstWriteGate) await backend.firstWriteGate;
          const keys = ["tent_id", "source", "metric", "captured_at"];
          if (
            rows.some((row) =>
              backend.rows.some((stored) => keys.every((key) => stored[key] === row[key])),
            )
          ) {
            return { error: { code: "23505", message: "Duplicate snapshot identity" } };
          }
          backend.rows.push(
            ...rows.map((row, index) => ({
              ...row,
              id: `reading-${backend.rows.length + index}`,
              user_id: "owner-a",
              device_id: row.device_id ?? null,
              raw_payload: row.raw_payload ?? null,
            })),
          );
          return backend.loseFirstReply && attempt === 1
            ? { error: { message: "Response lost after commit" } }
            : { error: null };
        },
      };
    },
  },
}));

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const CAPTURED = "2026-09-16T08:00:00.000Z";
const tents = [
  { id: TENT_A, name: "Tent A" },
  { id: TENT_B, name: "Tent B" },
];

function SessionCard({
  ownerId,
  target = TENT_A,
  correction,
}: {
  ownerId: string;
  target?: string;
  correction?: ManualCorrectionContext;
}) {
  const session = useSensorsPageSession(ownerId);
  useEffect(() => {
    session?.reconcileSelection({
      intent: { tentId: target, requireExactMatch: true },
      intentKey: `fixture-required-${target}`,
      tents,
      tentsLoaded: true,
    });
  }, [session, target]);
  return (
    <ManualSensorReadingCard
      tents={tents}
      defaultTentId={target}
      session={session ?? undefined}
      correction={correction}
    />
  );
}

function renderSessionCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    visible: boolean,
    ownerId = "owner-a",
    target = TENT_A,
    correction?: ManualCorrectionContext,
  ) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {visible ? (
          <SessionCard ownerId={ownerId} target={target} correction={correction} />
        ) : (
          <p>Protected form unmounted</p>
        )}
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree(true));
  return {
    ...view,
    client,
    hide: () => view.rerender(tree(false)),
    show: (ownerId?: string, target?: string, correction?: ManualCorrectionContext) =>
      view.rerender(tree(true, ownerId, target, correction)),
  };
}

async function submit(airTemp = "25") {
  fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: airTemp } });
  fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "60" } });
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
  await waitFor(() => expect(backend.posts).toHaveLength(1));
}

async function reviewAndConfirm() {
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(CAPTURED);
  Object.assign(backend, {
    rows: [],
    posts: [],
    reads: 0,
    loseFirstReply: true,
    firstWriteGate: null,
  });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe("manual snapshot save identity across a session remount", () => {
  for (const scenario of [
    {
      name: "already active Celsius",
      initialUnit: "C",
      nextUnit: "C",
      initialValue: "25",
      nextValue: 25,
    },
    {
      name: "Celsius to Fahrenheit",
      initialUnit: "C",
      nextUnit: "F",
      initialValue: "25",
      nextValue: 77,
    },
    {
      name: "Fahrenheit to Celsius",
      initialUnit: "F",
      nextUnit: "C",
      initialValue: "77",
      nextValue: 25,
    },
  ] as const) {
    it(`preserves an unconfirmed snapshot's database identity after ${scenario.name} unit selection`, async () => {
      renderSessionCard();
      if (scenario.initialUnit === "F")
        fireEvent.click(screen.getByTestId("manual-reading-temp-unit-F"));
      await submit(scenario.initialValue);
      await screen.findByTestId("manual-reading-save-unconfirmed");
      const originalPayload = structuredClone(backend.posts[0]);
      const originalRows = structuredClone(backend.rows);
      expect(originalRows).toHaveLength(2);
      vi.setSystemTime("2026-09-16T08:05:00.000Z");

      fireEvent.click(screen.getByTestId(`manual-reading-temp-unit-${scenario.nextUnit}`));
      expect(screen.getByLabelText(/Air temp/i)).toHaveValue(scenario.nextValue);
      expect(screen.getByTestId(`manual-reading-temp-unit-${scenario.nextUnit}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await reviewAndConfirm();
      await screen.findByTestId("manual-reading-saved-confirmation");
      expect(backend.posts).toHaveLength(2);
      expect(backend.posts[1]).toEqual(originalPayload);
      expect(backend.rows).toEqual(originalRows);
      expect(backend.reads).toBe(1);
      expect(screen.getByTestId("manual-reading-saved-captured-at")).toHaveTextContent(
        new Date(CAPTURED).toLocaleString(),
      );
    });
  }

  it("restores the explicit temperature unit and custom device note without reinterpreting the reading", async () => {
    backend.loseFirstReply = false;
    const view = renderSessionCard();
    fireEvent.click(screen.getByTestId("manual-reading-temp-unit-F"));
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "77" } });
    fireEvent.keyDown(screen.getByTestId("manual-reading-device-select"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByTestId("manual-reading-device-option-custom"));
    fireEvent.change(screen.getByTestId("manual-reading-device-custom"), {
      target: { value: "Handheld meter" },
    });
    act(() => view.hide());
    act(() => view.show());
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(77);
    expect(screen.getByTestId("manual-reading-temp-unit-F")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("manual-reading-device-custom")).toHaveValue("Handheld meter");
    await reviewAndConfirm();
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.posts).toHaveLength(1);
    expect(backend.posts[0]).toHaveLength(1);
    expect(backend.posts[0][0]).toMatchObject({
      metric: "temperature_c",
      value: 25,
      source: "manual",
      device_id: "manual:Handheld meter",
    });
  });

  it("isolates standard pending retries and distinct correction identities within the same tent", async () => {
    const view = renderSessionCard();
    await submit();
    await screen.findByTestId("manual-reading-save-unconfirmed");
    const correction: ManualCorrectionContext = {
      tentId: TENT_A,
      originalCapturedAt: "2026-09-15T08:00:00.000Z",
      originalReadingIds: { humidity_pct: "33333333-3333-4333-8333-333333333333" },
      originalValues: { humidity_pct: 42 },
    };
    act(() => view.hide());
    act(() => view.show("owner-a", TENT_A, correction));
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(42);
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(null);
    expect(screen.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "44" } });
    act(() => view.hide());
    act(() => view.show("owner-a", TENT_A, correction));
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(44);
    act(() =>
      view.show("owner-a", TENT_A, {
        ...correction,
        originalReadingIds: { humidity_pct: "44444444-4444-4444-8444-444444444444" },
        originalValues: { humidity_pct: 49 },
      }),
    );
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(49);
    act(() => view.show());
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(null);
    expect(screen.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    expect(backend.posts).toHaveLength(1);
  });

  it("retains the exact unconfirmed payload and captured time across unmount, then retries through strict readback once", async () => {
    const created = vi.fn();
    window.addEventListener("verdant:sensor-reading-created", created);
    try {
      const view = renderSessionCard();
      await submit();
      await screen.findByTestId("manual-reading-save-unconfirmed");
      const original = structuredClone(backend.posts[0]);
      const storedIds = backend.rows.map((row) => row.id);
      expect(backend.rows).toHaveLength(2);
      expect(toast.success).not.toHaveBeenCalled();
      act(() => view.hide());
      expect(screen.queryByLabelText(/Humidity/i)).not.toBeInTheDocument();
      vi.setSystemTime("2026-09-16T08:05:00.000Z");
      act(() => view.show());
      expect(await screen.findByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
      expect(screen.getByLabelText(/Air temp/i)).toHaveValue(25);
      expect(screen.getByLabelText(/Humidity/i)).toHaveValue(60);
      expect(screen.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
      expect(created).not.toHaveBeenCalled();

      await reviewAndConfirm();
      await screen.findByTestId("manual-reading-saved-confirmation");
      expect(backend.posts).toHaveLength(2);
      expect(backend.posts[1]).toEqual(original);
      expect(
        backend.posts[1].every((row) => row.captured_at === CAPTURED && row.ts === CAPTURED),
      ).toBe(true);
      expect(backend.rows.map((row) => row.id)).toEqual(storedIds);
      expect(backend.reads).toBe(1);
      expect(created).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("manual-reading-saved-captured-at")).toHaveTextContent(
        new Date(CAPTURED).toLocaleString(),
      );
    } finally {
      window.removeEventListener("verdant:sensor-reading-created", created);
    }
  });

  it("keeps an in-flight save fenced after remount until its lost reply settles", async () => {
    let release!: () => void;
    backend.firstWriteGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = renderSessionCard();
    await submit();
    act(() => view.hide());
    vi.setSystemTime("2026-09-16T08:05:00.000Z");
    act(() => view.show());
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect(screen.getByTestId("manual-reading-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    expect(backend.posts).toHaveLength(1);
    expect(backend.rows).toHaveLength(0);

    await act(async () => {
      release();
      await backend.firstWriteGate;
    });
    await screen.findByTestId("manual-reading-save-unconfirmed");
    expect(screen.getByTestId("manual-reading-save")).toBeEnabled();
    await reviewAndConfirm();
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.posts).toHaveLength(2);
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.rows).toHaveLength(2);
    expect(backend.reads).toBe(1);
  });

  it("does not attach a late old-target completion to a new exact target draft", async () => {
    let release!: () => void;
    backend.firstWriteGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    backend.loseFirstReply = false;
    const view = renderSessionCard();
    await submit();
    act(() => view.hide());
    act(() => view.show("owner-a", TENT_B));
    await waitFor(() =>
      expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent B"),
    );
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(null);
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "57" } });
    await act(async () => {
      release();
      await backend.firstWriteGate;
    });
    await waitFor(() => expect(backend.rows).toHaveLength(2));
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(57);
    expect(screen.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    expect(backend.posts).toHaveLength(1);
  });

  it("does not repopulate cleared private session state after an old request settles", async () => {
    let release!: () => void;
    backend.firstWriteGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const view = renderSessionCard();
    await submit();
    act(() => {
      view.hide();
      view.client.clear();
    });
    expect(view.client.getQueryCache().getAll()).toHaveLength(0);
    await act(async () => {
      release();
      await backend.firstWriteGate;
    });
    expect(view.client.getQueryCache().getAll()).toHaveLength(0);
    act(() => view.show("owner-b"));
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(null);
    expect(screen.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
    expect(backend.posts).toHaveLength(1);
  });
});
