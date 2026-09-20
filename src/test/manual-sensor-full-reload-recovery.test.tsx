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

function renderSessionCard(initialOwnerId = "owner-a", initialTarget = TENT_A) {
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
  const view = render(tree(true, initialOwnerId, initialTarget));
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
  sessionStorage.clear();
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("manual snapshot uncertain-save recovery after a document reload", () => {
  it("blocks new writes while recovery storage is malformed", async () => {
    sessionStorage.setItem("verdant:sensors:pending-manual:v1:owner-a", "{");
    renderSessionCard();
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "25" } });
    expect(screen.getByTestId("manual-reading-recovery-error")).toHaveTextContent(
      "cannot be read safely",
    );
    expect(screen.getByTestId("manual-reading-save")).toBeDisabled();
    expect(backend.posts).toHaveLength(0);
    sessionStorage.removeItem("verdant:sensors:pending-manual:v1:owner-a");
    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));
    expect(screen.queryByTestId("manual-reading-recovery-error")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(25);
    expect(screen.getByTestId("manual-reading-save")).toBeEnabled();
    expect(backend.posts).toHaveLength(0);
  });

  it("requires storage to retain the claim before any insert", async () => {
    renderSessionCard();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "25" } });
    await reviewAndConfirm();
    expect(screen.getByTestId("manual-reading-recovery-error")).toHaveTextContent(
      "No new snapshot was sent",
    );
    expect(backend.posts).toHaveLength(0);
  });

  it("restores the original owned tent when the document reopens at another tent", async () => {
    const first = renderSessionCard();
    await submit();
    await screen.findByTestId("manual-reading-save-unconfirmed");
    const original = structuredClone(backend.posts[0]);
    first.unmount();
    vi.setSystemTime("2026-09-16T08:05:00.000Z");
    renderSessionCard("owner-a", TENT_B);
    expect(screen.getByTestId("manual-reading-tent-select")).toHaveTextContent("Tent A");
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(25);
    expect(screen.getByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
    await reviewAndConfirm();
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.posts[1]).toEqual(original);
    expect(backend.rows).toHaveLength(2);
  });

  it("does not expose owner A recovery to a fresh owner B session", async () => {
    const first = renderSessionCard();
    await submit();
    await screen.findByTestId("manual-reading-save-unconfirmed");
    first.unmount();
    renderSessionCard("owner-b");
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(null);
    expect(screen.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    expect(backend.posts).toHaveLength(1);
    expect(sessionStorage.getItem("verdant:sensors:pending-manual:v1:owner-a")).not.toBeNull();
  });

  it("reports a confirmed save despite cleanup failure, then retries cleanup without another write", async () => {
    backend.loseFirstReply = false;
    renderSessionCard();
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    await submit();
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(screen.getByTestId("manual-reading-recovery-error")).toHaveTextContent(
      "snapshot is saved",
    );
    expect(screen.getByTestId("manual-reading-save")).toBeDisabled();
    remove.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));
    expect(screen.queryByTestId("manual-reading-recovery-error")).not.toBeInTheDocument();
    expect(backend.posts).toHaveLength(1);
    expect(sessionStorage.getItem("verdant:sensors:pending-manual:v1:owner-a")).toBeNull();
  });
  it("control: a same-document remount retries the original snapshot without duplication", async () => {
    const view = renderSessionCard();
    await submit();
    await screen.findByTestId("manual-reading-save-unconfirmed");
    const original = structuredClone(backend.posts[0]);
    act(() => view.hide());
    vi.setSystemTime("2026-09-16T08:05:00.000Z");
    act(() => view.show());
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(25);
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(60);
    await reviewAndConfirm();
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.posts).toHaveLength(2);
    expect(backend.posts[1]).toEqual(original);
    expect(backend.rows).toHaveLength(2);
  });

  it("restores an accepted snapshot after a fresh document cache and never gives its retry a new capture time", async () => {
    const view = renderSessionCard();
    await submit();
    await screen.findByTestId("manual-reading-save-unconfirmed");
    const original = structuredClone(backend.posts[0]);
    view.unmount();
    vi.setSystemTime("2026-09-16T08:05:00.000Z");

    // A full document reload constructs a new QueryClient while retaining
    // this tab's browser storage. It must retain the original save identity.
    const reloaded = renderSessionCard();
    expect(reloaded.client).not.toBe(view.client);
    expect.soft(screen.getByLabelText(/Air temp/i)).toHaveValue(25);
    expect.soft(screen.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect.soft(screen.queryByTestId("manual-reading-save-unconfirmed")).toBeInTheDocument();
    // Reproduce the grower's natural retry if the form was incorrectly lost.
    if ((screen.getByLabelText(/Air temp/i) as HTMLInputElement).value === "") {
      fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "25" } });
      fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "60" } });
    }
    await reviewAndConfirm();
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.posts).toHaveLength(2);
    expect.soft(backend.posts[1]).toEqual(original);
    expect.soft(backend.rows).toHaveLength(2);
  });
});
