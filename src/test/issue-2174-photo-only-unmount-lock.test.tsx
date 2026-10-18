/**
 * An in-flight Photo only save must keep its identity if the sheet unmounts
 * before the diary insert settles. A later reopen must not upload again.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const insertCalls: Array<{ table: string; row: Record<string, unknown> }> = [];
const uploadPaths: string[] = [];
const gates: {
  upload:
    ((value: { data: { path: string } | null; error: { message: string } | null }) => void) | null;
  insert:
    ((value: { data: null; error: { message: string; code?: string } | null }) => void) | null;
} = { upload: null, insert: null };

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: async () => ({ ok: true, growEventId: "ge-1", reused: false }),
    saving: false,
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string) =>
          new Promise((resolve) => {
            uploadPaths.push(path);
            gates.upload = resolve;
          }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        insertCalls.push({ table, row });
        return new Promise((resolve) => {
          gates.insert = resolve;
        });
      },
      update: () => {
        const chain = {
          eq: () => chain,
          filter: () => chain,
          select: () => Promise.resolve({ data: [{ id: "diary-1" }], error: null }),
        };
        return chain;
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-test-1" } }),
}));

vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: vi.fn(),
}));

import PlantQuickLog from "@/components/PlantQuickLog";

function sheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => {}}
        plantId="plant-1"
        plantName="Plant 1"
        growId="grow-1"
        tentId="tent-1"
      />
    </QueryClientProvider>
  );
}

async function choosePhotoOnly() {
  const library = document.getElementById(
    "plant-quick-log-photo-library-input",
  ) as HTMLInputElement;
  const photo = new File([new Uint8Array([1, 2, 3])], "leaf.jpg", { type: "image/jpeg" });
  await act(async () => {
    fireEvent.change(library, { target: { files: [photo] } });
  });
  fireEvent.click(screen.getByRole("button", { name: /log action photo only/i }));
}

beforeEach(() => {
  insertCalls.length = 0;
  uploadPaths.length = 0;
  gates.upload = null;
  gates.insert = null;
  window.sessionStorage.clear();
  if (typeof URL.createObjectURL !== "function") {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(
      () => "blob:mock-preview",
    );
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
  }
});

describe("Photo only identity when the sheet unmounts mid-save", () => {
  it("keeps the ambiguous insert locked after unmount so a reopen does not upload again", async () => {
    const view = render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(gates.upload).toBeTruthy());
    await act(async () => {
      gates.upload?.({ data: { path: uploadPaths[0] }, error: null });
    });
    await waitFor(() => expect(insertCalls).toHaveLength(1));
    const savedId = insertCalls[0]?.row.id;

    view.unmount();
    await act(async () => {
      gates.insert?.({ data: null, error: { message: "response lost" } });
    });

    render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(uploadPaths).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.row.id).toBe(savedId);
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });

  it("still inserts a Photo only row when the sheet unmounts after the upload succeeds", async () => {
    const view = render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(gates.upload).toBeTruthy());

    view.unmount();
    await act(async () => {
      gates.upload?.({ data: { path: uploadPaths[0] }, error: null });
    });
    await act(async () => {
      await waitFor(() => expect(gates.insert).toBeTruthy());
      gates.insert?.({ data: null, error: { message: "response lost" } });
    });

    render(sheet());
    await choosePhotoOnly();
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });

    expect(uploadPaths).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
  });
});
