import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import {
  confirmManualSnapshotConflict,
  matchesManualSnapshotReadback,
} from "@/lib/manualSensorSnapshotRecovery";
import type { SensorReadingInsert, SensorReadingRow } from "@/lib/db";

type Row = Record<string, unknown>;
const backend = vi.hoisted(() => ({
  rows: [] as Row[],
  posts: [] as Row[][],
  reads: 0,
  loseFirstReply: true,
  rejectFirstWrite: false,
  readError: false,
  readTransform: null as null | ((rows: Row[]) => Row[]),
  firstWriteGate: null as Promise<void> | null,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "sensor_readings") throw new Error("Unexpected table in manual recovery test");
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
          if (backend.readError) return { data: null, error: { message: "Read unavailable" } };
          const rows = backend.rows.filter((row) => filters.every((filter) => filter(row)));
          return {
            data: (backend.readTransform ? backend.readTransform(rows) : rows).slice(0, count),
            error: null,
          };
        },
      };
      return {
        select: () => query,
        insert: async (input: Row[]) => {
          const rows = JSON.parse(JSON.stringify(input)) as Row[];
          backend.posts.push(rows);
          if (backend.posts.length === 1 && backend.firstWriteGate) await backend.firstWriteGate;
          if (backend.rejectFirstWrite && backend.posts.length === 1) {
            return { error: { code: "42501", message: "Write rejected" } };
          }
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
          return backend.loseFirstReply && backend.posts.length === 1
            ? { error: { message: "Failed to fetch" } }
            : { error: null };
        },
      };
    },
  },
}));

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const CAPTURED = "2026-09-16T08:00:00.000Z";
const MANUAL_PAYLOAD = {
  manual_provenance: {
    source: "manual",
    source_identity: "manual_entry",
    transport: "manual",
    confidence: null,
  },
};

function renderCard() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const card = (tentId: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[
            { id: TENT_A, name: "Tent A" },
            { id: TENT_B, name: "Tent B" },
          ]}
          defaultTentId={tentId}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(card(TENT_A));
  return { ...result, changeTarget: () => result.rerender(card(TENT_B)) };
}

async function submitSnapshot() {
  fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "25" } });
  fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "60" } });
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
  await waitFor(() => expect(backend.posts).toHaveLength(1));
  await waitFor(() => expect(screen.getByTestId("manual-sensor-review-confirm")).toBeEnabled());
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
    rejectFirstWrite: false,
    readError: false,
    readTransform: null,
    firstWriteGate: null,
  });
});
afterEach(() => vi.useRealTimers());

describe("manual snapshot retry confirmation", () => {
  it("retries the accepted snapshot without changing its measurement time or duplicating rows", async () => {
    const created = vi.fn();
    window.addEventListener("verdant:sensor-reading-created", created);
    try {
      renderCard();
      await submitSnapshot();
      expect(backend.rows).toHaveLength(2);
      expect(backend.posts[0].map((row) => row.raw_payload)).toEqual([
        MANUAL_PAYLOAD,
        MANUAL_PAYLOAD,
      ]);
      expect(backend.rows.map((row) => row.raw_payload)).toEqual([MANUAL_PAYLOAD, MANUAL_PAYLOAD]);
      expect(screen.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
      expect(created).not.toHaveBeenCalled();
      vi.setSystemTime("2026-09-16T08:05:00.000Z");
      fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
      await screen.findByTestId("manual-reading-saved-confirmation");
      expect(backend.posts[1]).toEqual(backend.posts[0]);
      expect(backend.rows).toHaveLength(2);
      expect(backend.reads).toBe(1);
      expect(created).toHaveBeenCalledTimes(1);
      expect((created.mock.calls[0][0] as CustomEvent).detail).toEqual({
        tentId: TENT_A,
        createdAt: CAPTURED,
      });
      expect(screen.getByTestId("manual-reading-saved-captured-at")).toHaveTextContent(
        new Date(CAPTURED).toLocaleString(),
      );
    } finally {
      window.removeEventListener("verdant:sensor-reading-created", created);
    }
  });

  it("uses safe unconfirmed copy and keeps both values after a lost reply", async () => {
    renderCard();
    await submitSnapshot();
    expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/save is unconfirmed/i));
    expect(screen.getByTestId("manual-reading-save-unconfirmed")).toHaveTextContent(
      /save is unconfirmed/i,
    );
    expect(screen.getByTestId("snapshot-captured-at")).toHaveTextContent(CAPTURED);
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(25);
    expect(screen.getByLabelText(/Humidity/i)).toHaveValue(60);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("retains the original payload after a rejected write so explicit retry can save it once", async () => {
    backend.rejectFirstWrite = true;
    renderCard();
    await submitSnapshot();
    expect(backend.rows).toHaveLength(0);
    vi.setSystemTime("2026-09-16T08:05:00.000Z");
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.posts[1]).toEqual(backend.posts[0]);
    expect(backend.rows).toHaveLength(2);
  });

  for (const missing of [
    "failed",
    "partial",
    "mismatched",
    "missing provenance",
    "wrong provenance",
    "extra provenance",
  ] as const) {
    it(`does not claim success when duplicate readback is ${missing}`, async () => {
      renderCard();
      await submitSnapshot();
      if (missing === "failed") backend.readError = true;
      if (missing === "partial") backend.readTransform = (rows) => rows.slice(0, 1);
      if (missing === "mismatched")
        backend.readTransform = (rows) => rows.map((row) => ({ ...row, value: 99 }));
      if (missing === "missing provenance")
        backend.readTransform = (rows) => rows.map((row) => ({ ...row, raw_payload: null }));
      if (missing === "wrong provenance")
        backend.readTransform = (rows) =>
          rows.map((row) => ({
            ...row,
            raw_payload: {
              manual_provenance: { ...MANUAL_PAYLOAD.manual_provenance, transport: "live" },
            },
          }));
      if (missing === "extra provenance")
        backend.readTransform = (rows) =>
          rows.map((row) => ({
            ...row,
            raw_payload: { ...MANUAL_PAYLOAD, extra: true },
          }));
      vi.setSystemTime("2026-09-16T08:05:00.000Z");
      fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
      await waitFor(() => expect(backend.posts).toHaveLength(2));
      await waitFor(() => expect(screen.getByTestId("manual-sensor-review-confirm")).toBeEnabled());
      expect(screen.queryByTestId("manual-reading-saved-confirmation")).not.toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
      expect(backend.rows).toHaveLength(2);
      backend.readError = false;
      backend.readTransform = null;
      fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
      await screen.findByTestId("manual-reading-saved-confirmation");
      expect(backend.rows).toHaveLength(2);
      expect(backend.posts[2]).toEqual(backend.posts[0]);
    });
  }

  it("treats an edited measurement as new while preserving the prior accepted rows", async () => {
    renderCard();
    await submitSnapshot();
    vi.setSystemTime("2026-09-16T08:05:00.000Z");
    fireEvent.change(screen.getByLabelText(/Humidity/i), { target: { value: "61" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.rows).toHaveLength(4);
    expect(backend.posts[1].find((row) => row.metric === "humidity_pct")?.value).toBe(61);
    expect(backend.posts[0][0].captured_at).toBe(CAPTURED);
    expect(backend.posts[1][0].captured_at).not.toBe(CAPTURED);
  });

  it("does not reuse the unresolved snapshot after switching to another tent", async () => {
    const view = renderCard();
    await submitSnapshot();
    await act(async () => view.changeTarget());
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(null);
    vi.setSystemTime("2026-09-16T08:05:00.000Z");
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "26" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await screen.findByTestId("manual-reading-saved-confirmation");
    expect(backend.posts[1]).toHaveLength(1);
    expect(backend.posts[1][0]).toMatchObject({ tent_id: TENT_B, value: 26 });
    expect(backend.rows.filter((row) => row.tent_id === TENT_A)).toHaveLength(2);
  });

  it("does not attach an earlier failed save's retry message to a new tent draft", async () => {
    let release!: () => void;
    backend.firstWriteGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    backend.rejectFirstWrite = true;
    const view = renderCard();
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("manual-reading-save"));
    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    await act(async () => view.changeTarget());
    fireEvent.change(screen.getByLabelText(/Air temp/i), { target: { value: "26" } });
    await act(async () => {
      release();
      await backend.firstWriteGate;
    });
    await waitFor(() => expect(screen.getByTestId("manual-reading-save")).toBeEnabled());
    expect(screen.getByLabelText(/Air temp/i)).toHaveValue(26);
    expect(screen.queryByTestId("manual-reading-save-unconfirmed")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(backend.rows).toHaveLength(0);
  });
});

describe("manual duplicate receipt verification", () => {
  const submitted: SensorReadingInsert[] = [
    {
      tent_id: TENT_A,
      user_id: "owner-a",
      source: "manual",
      metric: "temperature_c",
      value: 25,
      captured_at: CAPTURED,
      ts: CAPTURED,
      quality: "ok",
    },
  ];
  const stored: SensorReadingRow[] = [
    {
      ...submitted[0],
      id: "stored-row",
      user_id: "owner-a",
      tent_id: TENT_A,
      source: "manual",
      metric: "temperature_c",
      value: 25,
      captured_at: CAPTURED,
      ts: CAPTURED,
      created_at: CAPTURED,
      quality: "ok",
      device_id: null,
      raw_payload: null,
    },
  ];

  it("accepts legacy null-payload evidence with equivalent timestamp notation", () => {
    expect(
      matchesManualSnapshotReadback(submitted, [
        { ...stored[0], captured_at: "2026-09-16T08:00:00+00:00" },
      ]),
    ).toBe(true);
  });

  it("accepts exact canonical persisted metadata regardless of JSON property order", () => {
    const withProvenance = [{ ...submitted[0], raw_payload: MANUAL_PAYLOAD }];
    const persisted = [
      {
        ...stored[0],
        raw_payload: {
          manual_provenance: {
            confidence: null,
            transport: "manual",
            source_identity: "manual_entry",
            source: "manual",
          },
        },
      },
    ];
    expect(matchesManualSnapshotReadback(withProvenance, persisted)).toBe(true);
  });

  for (const [description, payload] of [
    ["missing envelope", null],
    [
      "wrong identity",
      { manual_provenance: { ...MANUAL_PAYLOAD.manual_provenance, source_identity: "probe" } },
    ],
    [
      "wrong transport",
      { manual_provenance: { ...MANUAL_PAYLOAD.manual_provenance, transport: "live" } },
    ],
    [
      "invented confidence",
      { manual_provenance: { ...MANUAL_PAYLOAD.manual_provenance, confidence: 1 } },
    ],
    [
      "missing confidence",
      {
        manual_provenance: {
          source: "manual",
          source_identity: "manual_entry",
          transport: "manual",
        },
      },
    ],
    [
      "extra envelope field",
      { manual_provenance: { ...MANUAL_PAYLOAD.manual_provenance, extra: true } },
    ],
    ["extra payload field", { ...MANUAL_PAYLOAD, extra: true }],
  ] as const) {
    it(`rejects canonical confirmation with ${description}`, () => {
      expect(
        matchesManualSnapshotReadback(
          [{ ...submitted[0], raw_payload: MANUAL_PAYLOAD }],
          [{ ...stored[0], raw_payload: payload }],
        ),
      ).toBe(false);
    });
  }

  it("does not confirm a legacy submission against a newly annotated row", () => {
    expect(
      matchesManualSnapshotReadback(submitted, [{ ...stored[0], raw_payload: MANUAL_PAYLOAD }]),
    ).toBe(false);
  });

  for (const [field, value] of [
    ["source", "live"],
    ["tent_id", TENT_B],
    ["user_id", "owner-b"],
    ["value", 26],
    ["captured_at", "2026-09-16T08:05:00Z"],
    ["ts", "2026-09-16T08:05:00Z"],
    ["quality", "invalid"],
    ["device_id", "manual:different-tool"],
    ["raw_payload", { changed: true }],
  ] as const) {
    it(`rejects a mismatched ${field}`, () => {
      expect(matchesManualSnapshotReadback(submitted, [{ ...stored[0], [field]: value }])).toBe(
        false,
      );
    });
  }

  it("rejects absent rows and repeated metrics even when counts happen to match", () => {
    expect(matchesManualSnapshotReadback(submitted, [])).toBe(false);
    expect(
      matchesManualSnapshotReadback([submitted[0], submitted[0]], [stored[0], stored[0]]),
    ).toBe(false);
  });

  it("rejects duplicate-conflict recovery before readback when captured_at and ts diverge", async () => {
    backend.rows = stored;
    backend.reads = 0;
    expect(
      await confirmManualSnapshotConflict([{ ...submitted[0], ts: "2026-09-16T08:05:00Z" }], {
        code: "23505",
      }),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate-conflict recovery before readback when the batch repeats a metric", async () => {
    backend.rows = stored;
    backend.reads = 0;
    expect(
      await confirmManualSnapshotConflict([submitted[0], { ...submitted[0], value: 26 }], {
        code: "23505",
      }),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate-conflict recovery before readback when batch rows carry mismatched provenance", async () => {
    backend.rows = stored;
    backend.reads = 0;
    const canonical = [{ ...submitted[0], raw_payload: MANUAL_PAYLOAD }];
    const legacy = [
      {
        ...submitted[0],
        metric: "humidity_pct",
        value: 55,
        raw_payload: null,
      },
    ];
    expect(await confirmManualSnapshotConflict([...canonical, ...legacy], { code: "23505" })).toBe(
      false,
    );
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate-conflict recovery before readback when batch rows disagree on tent_id", async () => {
    backend.rows = stored;
    backend.reads = 0;
    expect(
      await confirmManualSnapshotConflict(
        [submitted[0], { ...submitted[0], metric: "humidity_pct", value: 55, tent_id: TENT_B }],
        { code: "23505" },
      ),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate-conflict recovery before readback when batch rows disagree on user_id", async () => {
    backend.rows = stored;
    backend.reads = 0;
    expect(
      await confirmManualSnapshotConflict(
        [submitted[0], { ...submitted[0], metric: "humidity_pct", value: 55, user_id: "owner-b" }],
        { code: "23505" },
      ),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate-conflict recovery before readback when the batch is empty", async () => {
    backend.reads = 0;
    expect(await confirmManualSnapshotConflict([], { code: "23505" })).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate-conflict recovery before readback when batch rows disagree on captured_at", async () => {
    backend.rows = stored;
    backend.reads = 0;
    const later = "2026-09-16T09:00:00.000Z";
    expect(
      await confirmManualSnapshotConflict(
        [
          submitted[0],
          {
            ...submitted[0],
            metric: "humidity_pct",
            value: 55,
            captured_at: later,
            ts: later,
          },
        ],
        { code: "23505" },
      ),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate-conflict recovery before readback when batch rows disagree on ts", async () => {
    backend.rows = stored;
    backend.reads = 0;
    const later = "2026-09-16T09:00:00.000Z";
    expect(
      await confirmManualSnapshotConflict(
        [
          submitted[0],
          {
            ...submitted[0],
            metric: "humidity_pct",
            value: 55,
            ts: later,
          },
        ],
        { code: "23505" },
      ),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("never recovers an unrelated error or a non-manual write as this snapshot", async () => {
    backend.rows = stored;
    expect(await confirmManualSnapshotConflict(submitted, { code: "42501" })).toBe(false);
    expect(await confirmManualSnapshotConflict(submitted, new Error("23505 duplicate"))).toBe(
      false,
    );
    expect(
      await confirmManualSnapshotConflict([{ ...submitted[0], source: "sim" }], { code: "23505" }),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("keeps a thrown recovery read unconfirmed", async () => {
    backend.rows = stored;
    backend.readTransform = () => {
      throw new Error("connection lost");
    };
    expect(await confirmManualSnapshotConflict(submitted, { code: "23505" })).toBe(false);
  });

  it("confirms a duplicate legacy snapshot when readback matches absent metadata", async () => {
    backend.rows = stored;
    backend.reads = 0;
    expect(await confirmManualSnapshotConflict(submitted, { code: "23505" })).toBe(true);
    expect(backend.reads).toBe(1);
  });

  it("confirms a duplicate canonical snapshot when readback matches persisted metadata", async () => {
    const canonicalSubmitted = [{ ...submitted[0], raw_payload: MANUAL_PAYLOAD }];
    const canonicalStored = [{ ...stored[0], raw_payload: MANUAL_PAYLOAD }];
    backend.rows = canonicalStored;
    backend.reads = 0;
    expect(await confirmManualSnapshotConflict(canonicalSubmitted, { code: "23505" })).toBe(true);
    expect(backend.reads).toBe(1);
  });

  it("rejects duplicate recovery when captured_at and ts disagree on the frozen submission", async () => {
    backend.rows = stored;
    backend.reads = 0;
    expect(
      await confirmManualSnapshotConflict([{ ...submitted[0], ts: "2026-09-16T08:00:01.000Z" }], {
        code: "23505",
      }),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate recovery when batch metrics carry mismatched provenance envelopes", async () => {
    backend.rows = stored;
    backend.reads = 0;
    const mixedBatch: SensorReadingInsert[] = [
      { ...submitted[0], raw_payload: MANUAL_PAYLOAD },
      {
        ...submitted[0],
        metric: "humidity_pct",
        value: 55,
        raw_payload: null,
      },
    ];
    expect(await confirmManualSnapshotConflict(mixedBatch, { code: "23505" })).toBe(false);
    expect(backend.reads).toBe(0);
  });

  it("rejects duplicate recovery when the frozen batch repeats a metric", async () => {
    backend.rows = stored;
    backend.reads = 0;
    expect(
      await confirmManualSnapshotConflict([submitted[0], submitted[0]], { code: "23505" }),
    ).toBe(false);
    expect(backend.reads).toBe(0);
  });
});
