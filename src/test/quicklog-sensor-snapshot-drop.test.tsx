import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import QuickLog from "@/components/QuickLog";

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const insertMock = vi.fn();
const uploadMock = vi.fn();
const sensorReadingsSelectMock = vi.fn();
const toastMessage = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "sensor_readings") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => sensorReadingsSelectMock(),
              }),
            }),
          }),
        };
      }
      if (table === "diary_entries") {
        return { insert: insertMock };
      }
      if (table === "grows") {
        return { update: () => ({ eq: vi.fn() }) };
      }
      return { insert: insertMock, update: () => ({ eq: vi.fn() }) };
    },
    storage: { from: () => ({ upload: uploadMock, remove: vi.fn() }) },
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Test Grow", stage: "veg" }],
    activeGrow: { id: "grow-1", name: "Test Grow", stage: "veg" },
    activeGrowId: "grow-1",
    setActiveGrowId: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Test Plant", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    message: (...a: unknown[]) => toastMessage(...a),
  },
}));

beforeEach(() => {
  insertMock.mockReset();
  uploadMock.mockReset();
  sensorReadingsSelectMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastMessage.mockReset();
});

describe("QuickLog sensor_snapshot drop behavior", () => {
  it("drops stale snapshot, saves diary entry without sensor_snapshot, and toasts", async () => {
    insertMock.mockResolvedValue({ error: null });
    sensorReadingsSelectMock.mockResolvedValue({
      data: [
        {
          id: "sr-1",
          tent_id: "tent-1",
          metric: "temperature_c",
          value: 24,
          source: "live",
          ts: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h stale
        },
      ],
      error: null,
    });

    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", tentId: "tent-1", suggestSnapshot: true }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const note = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Checked plant today" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertArg = insertMock.mock.calls[0][0];
    expect(insertArg.details).not.toHaveProperty("sensor_snapshot");
    expect(insertArg.note).toBe("Checked plant today");
    expect(insertArg.grow_id).toBe("grow-1");
    expect(toastMessage).toHaveBeenCalledWith(
      "Sensor reading too old to attach — log saved without it.",
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("drops invalid snapshot, saves diary entry without sensor_snapshot, and toasts", async () => {
    insertMock.mockResolvedValue({ error: null });
    sensorReadingsSelectMock.mockResolvedValue({
      data: [
        {
          id: "sr-2",
          tent_id: "tent-1",
          metric: "temperature_c",
          value: Number.NaN,
          source: "live",
          ts: new Date().toISOString(),
        },
      ],
      error: null,
    });

    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", tentId: "tent-1", suggestSnapshot: true }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const note = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Checked plant today" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertArg = insertMock.mock.calls[0][0];
    expect(insertArg.details).not.toHaveProperty("sensor_snapshot");
    expect(toastMessage).toHaveBeenCalledWith(
      "Sensor reading unreadable — log saved without it.",
    );
  });

  it("embeds live snapshot when fresh", async () => {
    insertMock.mockResolvedValue({ error: null });
    sensorReadingsSelectMock.mockResolvedValue({
      data: [
        {
          id: "sr-3",
          tent_id: "tent-1",
          metric: "temperature_c",
          value: 24,
          source: "live",
          ts: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2m fresh
        },
      ],
      error: null,
    });

    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", tentId: "tent-1", suggestSnapshot: true }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const note = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Checked plant today" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertArg = insertMock.mock.calls[0][0];
    expect(insertArg.details).toHaveProperty("sensor_snapshot");
    expect(insertArg.details.sensor_snapshot.state).toBe("live");
    expect(insertArg.details.sensor_snapshot.source).toBe("live");
    expect(toastMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("too old"),
    );
    expect(toastMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("unreadable"),
    );
  });

  it("embeds manual snapshot even when old", async () => {
    insertMock.mockResolvedValue({ error: null });
    sensorReadingsSelectMock.mockResolvedValue({
      data: [
        {
          id: "sr-4",
          tent_id: "tent-1",
          metric: "temperature_c",
          value: 23,
          source: "manual",
          ts: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48h old
        },
      ],
      error: null,
    });

    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", tentId: "tent-1", suggestSnapshot: true }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const note = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Checked plant today" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertArg = insertMock.mock.calls[0][0];
    expect(insertArg.details).toHaveProperty("sensor_snapshot");
    expect(insertArg.details.sensor_snapshot.state).toBe("manual");
    expect(insertArg.details.sensor_snapshot.source).toBe("manual");
    expect(toastMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("too old"),
    );
  });

  it("saves normally with no snapshot when snapshot switch is off", async () => {
    insertMock.mockResolvedValue({ error: null });

    renderWithClient(
      <QuickLog
        open={true}
        onOpenChange={vi.fn()}
        prefill={{ plantId: "plant-1", tentId: "tent-1" }}
      />,
    );

    const dialog = screen.getByRole("dialog");
    const note = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Simple note" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertArg = insertMock.mock.calls[0][0];
    expect(insertArg.details).not.toHaveProperty("sensor_snapshot");
    expect(toastMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("too old"),
    );
    expect(toastMessage).not.toHaveBeenCalledWith(
      expect.stringContaining("unreadable"),
    );
  });
});
