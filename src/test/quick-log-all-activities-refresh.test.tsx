/**
 * #2697 — a confirmed save from the "All activity types" section must refresh
 * the plant page and Timeline caches, not only dispatch verdant:entry-created.
 * Those React Query reads do not listen for the event, so before this fix the
 * plant page kept its stale cache until a reload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import { resolveQuickLogV2RefreshScope } from "@/lib/quickLogV2RefreshRules";

const rpcMock = vi.fn();
const storageUploadMock = vi.fn(async (..._args: unknown[]) => ({
  data: { path: "p" },
  error: null,
}));
const diaryInsertMock = vi.fn(async (..._args: unknown[]) => ({ error: null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => storageUploadMock(...args),
        remove: async () => ({ data: null, error: null }),
      }),
    },
    from: () => ({
      insert: (...args: unknown[]) => diaryInsertMock(...args),
    }),
  },
}));

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

const GROW = "grow-1";
const TENT = "tent-1";
const PLANT = "plant-1";
const OTHER_PLANT = "plant-2";
const EVENT_ID = "77777777-7777-4777-8777-000000002697";

const PLANT_PAGE_KEYS = [
  ["timeline_memory", "plant", PLANT],
  ["quick_log_grouped_timeline", "plant", PLANT],
  ["plant_recent_activity", PLANT],
  ["diary_entries", PLANT],
] as const;
const OTHER_PLANT_KEY = ["plant_recent_activity", OTHER_PLANT] as const;
const TENT_KEY = ["tent_recent_activity", TENT] as const;

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const key of [...PLANT_PAGE_KEYS, OTHER_PLANT_KEY, TENT_KEY]) {
    client.setQueryData([...key], { rows: [] });
  }
  return client;
}

function isInvalidated(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryState([...key])?.isInvalidated === true;
}

function mountSection(
  client: QueryClient | null,
  props?: Partial<React.ComponentProps<typeof QuickLogAllActivitiesSection>>,
) {
  const tree = (
    <MemoryRouter>
      <QuickLogAllActivitiesSection
        growId={GROW}
        tentId={TENT}
        plantId={PLANT}
        plantStage="flower"
        {...props}
      />
    </MemoryRouter>
  );
  return render(client ? <QueryClientProvider client={client}>{tree}</QueryClientProvider> : tree);
}

function selectActivity(activityId: string) {
  const testId = `quick-log-all-activities-picker-${activityId}`;
  if (!screen.queryByTestId(testId)) {
    fireEvent.click(screen.getByRole("button", { name: "More activity types" }));
  }
  fireEvent.click(screen.getByTestId(testId));
}

async function saveNote(activityId: string, note: string) {
  selectActivity(activityId);
  await screen.findByTestId("quick-log-all-activities-form");
  fireEvent.change(screen.getByTestId("quick-log-all-activities-note"), {
    target: { value: note },
  });
  fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
}

function listenForEntryCreated() {
  const events: Event[] = [];
  const handler = (e: Event) => events.push(e);
  window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
  return {
    events,
    dispose: () => window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  rpcMock.mockReset();
  storageUploadMock.mockClear();
  diaryInsertMock.mockClear();
});

describe("All activity types save — plant page and Timeline refresh (#2697)", () => {
  it("refreshes the saved plant's page and Timeline reads after a confirmed Note save", async () => {
    let resolveRpc: (value: unknown) => void = () => {};
    rpcMock.mockReturnValueOnce(new Promise((resolve) => (resolveRpc = resolve)));
    const client = seededClient();
    const entryCreated = listenForEntryCreated();
    try {
      mountSection(client);
      await saveNote("note", "new leaf tips curling");
      await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
      for (const key of PLANT_PAGE_KEYS) expect(isInvalidated(client, key)).toBe(false);

      resolveRpc({ data: { ok: true, grow_event_id: EVENT_ID }, error: null });
      await screen.findByTestId("quick-log-all-activities-saved-item");

      for (const key of PLANT_PAGE_KEYS) expect(isInvalidated(client, key)).toBe(true);
      expect(isInvalidated(client, TENT_KEY)).toBe(true);
      expect(isInvalidated(client, OTHER_PLANT_KEY)).toBe(false);
      expect(entryCreated.events).toHaveLength(1);
    } finally {
      entryCreated.dispose();
    }
  });

  it("refreshes the plant page after a confirmed Photo save", async () => {
    const client = seededClient();
    mountSection(client);
    selectActivity("photo");
    await screen.findByTestId("quick-log-all-activities-form");
    fireEvent.change(screen.getByTestId("quick-log-all-activities-photo-file"), {
      target: { files: [new File(["img-bytes"], "bud.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByTestId("quick-log-all-activities-save"));
    await waitFor(() => expect(diaryInsertMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(isInvalidated(client, ["plant_recent_activity", PLANT])).toBe(true));
    expect(isInvalidated(client, ["timeline_memory", "plant", PLANT])).toBe(true);
    expect(isInvalidated(client, OTHER_PLANT_KEY)).toBe(false);
  });

  it("refreshes the tent reads for a tent-scoped save without inventing a plant", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, grow_event_id: EVENT_ID }, error: null });
    const client = seededClient();
    mountSection(client, { plantId: null });
    await saveNote("training", "lowered the canopy");
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(isInvalidated(client, TENT_KEY)).toBe(true);
    expect(isInvalidated(client, ["plant_recent_activity", PLANT])).toBe(false);
    expect(isInvalidated(client, OTHER_PLANT_KEY)).toBe(false);
  });

  it("does not refresh when the save fails", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Write rejected" } });
    const client = seededClient();
    const entryCreated = listenForEntryCreated();
    try {
      mountSection(client);
      await saveNote("note", "unsaved note");
      await screen.findByTestId("quick-log-all-activities-error");
      for (const key of PLANT_PAGE_KEYS) expect(isInvalidated(client, key)).toBe(false);
      expect(entryCreated.events).toHaveLength(0);
    } finally {
      entryCreated.dispose();
    }
  });

  it("refreshes once a retried save confirms the earlier unresolved write", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "Reply unavailable" } })
      .mockResolvedValueOnce({ data: { ok: true, grow_event_id: EVENT_ID }, error: null });
    const client = seededClient();
    mountSection(client);
    await saveNote("training", "topped above the fourth node");
    const retry = await screen.findByTestId("quick-log-all-activities-retry-original");
    await waitFor(() => expect(retry).toBeEnabled());
    expect(isInvalidated(client, ["plant_recent_activity", PLANT])).toBe(false);

    fireEvent.click(retry);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(isInvalidated(client, ["plant_recent_activity", PLANT])).toBe(true));
    expect(isInvalidated(client, ["quick_log_grouped_timeline", "plant", PLANT])).toBe(true);
  });

  it("still saves when the section renders without a query cache", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, grow_event_id: EVENT_ID }, error: null });
    mountSection(null);
    await saveNote("note", "standalone note");
    await screen.findByTestId("quick-log-all-activities-saved-item");
    expect(screen.queryByTestId("quick-log-all-activities-error")).toBeNull();
  });
});

describe("resolveQuickLogV2RefreshScope", () => {
  it("keeps a plant target with its tent", () => {
    expect(resolveQuickLogV2RefreshScope({ tentId: TENT, plantId: PLANT })).toEqual({
      targetType: "plant",
      targetId: PLANT,
      tentId: TENT,
    });
    expect(resolveQuickLogV2RefreshScope({ tentId: null, plantId: PLANT })).toEqual({
      targetType: "plant",
      targetId: PLANT,
      tentId: null,
    });
  });

  it("scopes a tent target to the tent", () => {
    expect(resolveQuickLogV2RefreshScope({ tentId: TENT, plantId: null })).toEqual({
      targetType: "tent",
      targetId: TENT,
      tentId: TENT,
    });
  });

  it("gives a grow-only target no plant or tent id", () => {
    expect(resolveQuickLogV2RefreshScope({ tentId: null, plantId: null })).toEqual({
      targetType: "tent",
      targetId: "",
      tentId: null,
    });
  });
});
