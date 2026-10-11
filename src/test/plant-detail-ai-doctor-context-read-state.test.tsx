import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailAiDoctorContextPanel from "@/components/PlantDetailAiDoctorContextPanel";

type Source = "diary" | "audit" | "companion" | "rootzone" | "manual";
type Response = { data: unknown; error: unknown };
const io = vi.hoisted(() => ({
  responses: new Map<Source, Response | Promise<Response>>(),
  requests: [] as Array<{ source: Source; filters: Array<[string, unknown]> }>,
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let companion = false;
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        in: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        not: () => {
          companion = true;
          return query;
        },
        is: () => query,
        or: (value: string) => {
          filters.push(["or", value]);
          return query;
        },
        order: () => query,
        limit: async () => {
          const source: Source =
            table === "sensor_readings_effective"
              ? "manual"
              : table === "ai_doctor_sessions"
                ? "audit"
                : table === "grow_events"
                  ? "rootzone"
                  : companion
                    ? "companion"
                    : "diary";
          io.requests.push({ source, filters });
          return io.responses.get(source) ?? { data: [], error: null };
        },
      };
      return query;
    },
  },
}));

const PLANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PLANT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GROW = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const clients: QueryClient[] = [];

function setup(plantId = PLANT) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const view = (id: string) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantDetailAiDoctorContextPanel
          plantId={id}
          plant={{
            id,
            name: "Alpha",
            strain: "NL",
            stage: "veg",
            medium: "Coco",
            tentId: TENT,
            growId: GROW,
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(view(plantId));
  return { client, rerender: (id: string) => rendered.rerender(view(id)) };
}

function expectAssessmentWithheld() {
  expect(screen.queryByTestId("plant-ai-doctor-context-readiness")).not.toBeInTheDocument();
  expect(screen.queryByTestId("plant-ai-doctor-context-missing")).not.toBeInTheDocument();
  expect(screen.queryByTestId("plant-ai-doctor-context-no-warning")).not.toBeInTheDocument();
  expect(screen.queryByText("Recent events (7d)")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Add sensor snapshot" })).not.toBeInTheDocument();
  expect(screen.queryByText("No supporting context yet.")).not.toBeInTheDocument();
}

async function settled(client: QueryClient) {
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

function manualReading() {
  const at = new Date(Date.now() - 60_000).toISOString();
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    user_id: "11111111-1111-4111-8111-111111111111",
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    tent_id: TENT,
    metric: "temperature_c",
    value: 23,
    captured_at: at,
    ts: at,
    created_at: at,
    source: "manual",
    quality: "ok",
  };
}

function diaryNotes() {
  return [1, 2].map((n) => ({
    id: "note-" + n,
    plant_id: PLANT,
    tent_id: TENT,
    entry_at: new Date(Date.now() - n * 60_000).toISOString(),
    note: "Observed plant",
    photo_url: null,
    details: { event_type: "observation" },
  }));
}

beforeEach(() => {
  onlineManager.setOnline(true);
  io.responses.clear();
  io.requests.length = 0;
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
});

describe("Doctor context requires completed evidence reads", () => {
  it("withholds the assessment while the first read waits for connection, then accepts real empty reads", async () => {
    onlineManager.setOnline(false);
    const { client } = setup();
    expect(io.requests).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(/waiting for connection/i);
    expectAssessmentWithheld();
    act(() => onlineManager.setOnline(true));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-context-readiness")).toBeInTheDocument(),
    );
    await settled(client);
    expect(screen.getByText("Recent events (7d)").nextElementSibling).toHaveTextContent("0");
    expect(screen.getByTestId("plant-ai-doctor-context-missing")).toBeInTheDocument();
    expect(screen.getByTestId("plant-ai-doctor-context-no-warning")).toBeInTheDocument();
  });

  it("does not issue missing-data advice while an online first read is unresolved", async () => {
    let resolve!: (response: Response) => void;
    io.responses.set(
      "diary",
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const { client } = setup();
    expectAssessmentWithheld();
    expect(screen.getByRole("status")).toHaveTextContent(/loading recent context/i);
    await act(async () => resolve({ data: [], error: null }));
    await settled(client);
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-context-readiness")).toBeInTheDocument(),
    );
  });

  it.each<Source>(["diary", "audit", "companion", "rootzone", "manual"])(
    "shows unavailable and retries all context reads after %s fails, preserving a usable manual survivor",
    async (source) => {
      if (source !== "manual") io.responses.set("manual", { data: [manualReading()], error: null });
      io.responses.set(source, { data: null, error: { message: "read failed" } });
      const { client } = setup();
      await settled(client);
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/unavailable/i));
      expectAssessmentWithheld();
      if (source !== "manual")
        expect(screen.getByTestId("plant-ai-doctor-context-latest-snapshot")).toBeInTheDocument();
      const before = io.requests.length;
      io.responses.set(source, { data: [], error: null });
      fireEvent.click(screen.getByRole("button", { name: "Retry context" }));
      await waitFor(() =>
        expect(screen.getByTestId("plant-ai-doctor-context-readiness")).toBeInTheDocument(),
      );
      const retried = io.requests.slice(before);
      expect(retried.map((request) => request.source).sort()).toEqual([
        "audit",
        "companion",
        "diary",
        "manual",
        "rootzone",
      ]);
      expect(retried.find((r) => r.source === "manual")?.filters).toContainEqual(["tent_id", TENT]);
      expect(retried.find((r) => r.source === "manual")?.filters).toContainEqual([
        "source",
        ["manual"],
      ]);
      expect(retried.find((r) => r.source === "diary")?.filters).toContainEqual([
        "plant_id",
        PLANT,
      ]);
      expect(retried.find((r) => r.source === "rootzone")?.filters).toContainEqual([
        "grow_id",
        GROW,
      ]);
    },
  );

  it.each<Source>(["diary", "audit", "companion", "rootzone"])(
    "does not accept a null %s list as a successful empty read",
    async (source) => {
      io.responses.set(source, { data: null, error: null });
      const { client } = setup();
      await settled(client);
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/unavailable/i));
      expectAssessmentWithheld();
      expect(screen.getByRole("button", { name: "Retry context" })).toBeInTheDocument();
    },
  );

  it("keeps previously loaded diary evidence visible after refresh failure without presenting complete counts", async () => {
    io.responses.set("diary", { data: diaryNotes(), error: null });
    const { client } = setup();
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-context-readiness")).toBeInTheDocument(),
    );
    io.responses.set("diary", { data: null, error: { message: "offline read failed" } });
    await act(async () => {
      await client.refetchQueries({ queryKey: ["timeline_memory"] });
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/unavailable/i));
    expect(screen.getByRole("status")).toHaveTextContent(/previously loaded/i);
    expectAssessmentWithheld();
    expect(
      screen
        .getByTestId("plant-ai-doctor-context-evidence")
        .querySelector('[data-code="recent-timeline-activity"]'),
    ).not.toBeNull();
  });

  it("withholds the old assessment during refresh and a new plant's paused first read", async () => {
    io.responses.set("diary", { data: diaryNotes(), error: null });
    const { client, rerender } = setup();
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-context-readiness")).toBeInTheDocument(),
    );
    let resolve!: (response: Response) => void;
    io.responses.set(
      "diary",
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    act(() => {
      void client.refetchQueries({ queryKey: ["timeline_memory"] });
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/refreshing/i));
    expectAssessmentWithheld();
    await act(async () => resolve({ data: diaryNotes(), error: null }));
    await settled(client);
    onlineManager.setOnline(false);
    const before = io.requests.length;
    rerender(OTHER_PLANT);
    expectAssessmentWithheld();
    expect(screen.getByRole("status")).toHaveTextContent(/waiting for connection/i);
    expect(
      screen
        .getByTestId("plant-ai-doctor-context-evidence")
        .querySelector('[data-code="recent-timeline-activity"]'),
    ).toBeNull();
    expect(io.requests).toHaveLength(before);
  });

  it("identifies cached context while a refresh is paused and restores the assessment on reconnect", async () => {
    io.responses.set("diary", { data: diaryNotes(), error: null });
    const { client } = setup();
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-context-readiness")).toBeInTheDocument(),
    );
    onlineManager.setOnline(false);
    const before = io.requests.length;
    act(() => {
      void client.refetchQueries({ queryKey: ["timeline_memory"] });
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/waiting for connection/i),
    );
    expectAssessmentWithheld();
    expect(screen.getByRole("status")).toHaveTextContent(/previously loaded/i);
    expect(
      screen
        .getByTestId("plant-ai-doctor-context-evidence")
        .querySelector('[data-code="recent-timeline-activity"]'),
    ).not.toBeNull();
    expect(io.requests).toHaveLength(before);
    act(() => onlineManager.setOnline(true));
    await waitFor(() =>
      expect(screen.getByTestId("plant-ai-doctor-context-readiness")).toBeInTheDocument(),
    );
  });
});
