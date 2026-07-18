/**
 * QuickLogV2Sheet — a save must never commit a second main log, whether the
 * second attempt comes from a sequential Retry (after a companion-photo
 * failure) or a concurrent double-tap during the upload window.
 *
 * handleSave commits the main log via the quicklog_save_manual RPC, then
 * writes the companion photo diary entry. The RPC has no idempotency key, so:
 *  - a Retry after a companion failure reuses the committed log and re-attempts
 *    only the photo (committedMainLogRef), and
 *  - a concurrent re-entry bails before starting a second commit
 *    (saveInFlightRef), even before `saving` flips true during the upload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpcMock = vi.fn();
const uploadCalls: Array<{ path: string }> = [];
const removeCalls: string[][] = [];
let insertCallCount = 0;
let insertFailFirst = false;
let deferUploads = false;
const pendingUploads: Array<() => void> = [];

function nextInsertResult(): { error: { message?: string } | null } {
  insertCallCount += 1;
  return insertFailFirst && insertCallCount === 1
    ? { error: { message: "companion insert failed" } }
    : { error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpcMock(...a),
    storage: {
      from: () => ({
        upload: (path: string, _file: File) => {
          uploadCalls.push({ path });
          if (deferUploads) {
            return new Promise((resolve) => {
              pendingUploads.push(() => resolve({ data: { path }, error: null }));
            });
          }
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: (paths: string[]) => {
          removeCalls.push(paths);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
    from: () => ({
      insert: () => Promise.resolve(nextInsertResult()),
    }),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-test-1" } }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet(onOpenChange: (v: boolean) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open onOpenChange={onOpenChange} defaultTargetKey="plant:plant-1" />
    </QueryClientProvider>,
  );
}

function makeImage(name = "gallery.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

async function pickFile(input: HTMLInputElement, file: File) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

function attachPhotoAndNote() {
  const library = screen.getByTestId("qlv2-photo-library-input") as HTMLInputElement;
  return pickFile(library, makeImage()).then(() => {
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Observation with attached photo" },
    });
  });
}

beforeEach(() => {
  rpcMock.mockReset();
  uploadCalls.length = 0;
  removeCalls.length = 0;
  pendingUploads.length = 0;
  insertCallCount = 0;
  insertFailFirst = false;
  deferUploads = false;
  rpcMock.mockResolvedValue({ data: { ok: true, grow_event_id: "event-1" }, error: null });
  if (typeof URL.createObjectURL !== "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = vi.fn(() => "blob:quicklog-v2-preview");
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quicklog-v2-preview");
  }
});
afterEach(() => cleanup());

describe("QuickLogV2Sheet — no duplicate main log on retry", () => {
  it("re-attempts only the photo on Retry and never commits a second log", async () => {
    insertFailFirst = true;
    const onOpenChange = vi.fn();
    renderSheet(onOpenChange);
    await attachPhotoAndNote();

    // First attempt: main log commits (rpc), companion insert fails, error shown.
    fireEvent.click(screen.getByTestId("qlv2-save"));
    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("qlv2-save-retry")).toBeTruthy();
    });
    expect(insertCallCount).toBe(1);

    // Retry: the companion insert now succeeds and the sheet closes.
    fireEvent.click(screen.getByTestId("qlv2-save-retry"));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // The retry re-uploaded and re-wrote the companion entry...
    expect(uploadCalls.length).toBe(2);
    expect(insertCallCount).toBe(2);
    // ...but the main log RPC was invoked exactly ONCE across both attempts.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("QuickLogV2Sheet — no duplicate main log on concurrent double-submit", () => {
  it("a second click during the upload window does not start a second commit", async () => {
    deferUploads = true; // the first upload stays pending until we release it
    const onOpenChange = vi.fn();
    renderSheet(onOpenChange);
    await attachPhotoAndNote();

    // Two clicks land while the first run is suspended on the pending upload
    // (the Save button is enabled here — `saving` only flips true once save()
    // starts). The re-entry guard must let only the first run proceed.
    await act(async () => {
      fireEvent.click(screen.getByTestId("qlv2-save"));
      fireEvent.click(screen.getByTestId("qlv2-save"));
    });
    expect(uploadCalls.length).toBe(1);
    expect(rpcMock).not.toHaveBeenCalled();

    // Release the upload; the single in-flight run completes and closes.
    await act(async () => {
      pendingUploads.forEach((resolve) => resolve());
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(uploadCalls.length).toBe(1);
    // The main-log RPC fired exactly once despite the double click.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("QuickLogV2Sheet — duplicate-write guards are wired (source pins)", () => {
  const body = readFileSync(join(process.cwd(), "src/components/QuickLogV2Sheet.tsx"), "utf8");

  it("keeps the committed-log guard and its target/action-change reset", () => {
    // The committed main log is remembered so a Retry reuses it, and it is
    // cleared when the target or action changes so a genuinely different save
    // commits fresh (guards against a mis-targeted companion / dropped commit).
    expect(body).toMatch(/committedMainLogRef\.current\s*=\s*null/);
    expect(body).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*committedMainLogRef\.current\s*=\s*null[\s\S]*\},\s*\[\s*form\.selectedKey\s*,\s*form\.action\s*\]\s*\)/,
    );
  });

  it("keeps the synchronous in-flight re-entry guard", () => {
    expect(body).toMatch(/if\s*\(\s*saveInFlightRef\.current\s*\)\s*return/);
    expect(body).toMatch(/saveInFlightRef\.current\s*=\s*true/);
  });
});
