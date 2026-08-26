/**
 * PlantQuickLog photo source picker + grower-model integration coverage.
 *
 * Drives the real PlantQuickLog component end-to-end against mocked
 * diary-photos upload + useQuickLogV2Save (no real network, no real DB writes).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const uploadCalls: Array<{ bucket: string; path: string; file: File }> = [];
const saveCalls: Array<Record<string, unknown>> = [];
const updateCalls: Array<Record<string, unknown>> = [];
const saveResultState = vi.hoisted(() => ({
  value: { ok: true, growEventId: "ge-1", reused: false } as {
    ok: boolean;
    growEventId: string | null;
    reused: boolean;
  },
}));
const photoPatchState = vi.hoisted(() => ({
  data: [{ id: "diary-1" }] as Array<{ id: string }> | null,
  error: null as unknown,
  rejectOnSelect: false,
}));
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({
    save: async (payload: Record<string, unknown>) => {
      saveCalls.push(payload);
      return saveResultState.value;
    },
    saving: false,
    error: null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: File) => {
          uploadCalls.push({ bucket, path, file });
          return Promise.resolve({ data: { path }, error: null });
        },
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        updateCalls.push({ __table: table, ...payload });
        const chain = {
          eq: () => chain,
          filter: () => chain,
          select: () =>
            photoPatchState.rejectOnSelect
              ? Promise.reject(new Error("diary update unavailable"))
              : Promise.resolve({ data: photoPatchState.data, error: photoPatchState.error }),
        };
        return chain;
      },
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
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

beforeEach(() => {
  uploadCalls.length = 0;
  saveCalls.length = 0;
  updateCalls.length = 0;
  saveResultState.value = { ok: true, growEventId: "ge-1", reused: false };
  photoPatchState.data = [{ id: "diary-1" }];
  photoPatchState.error = null;
  photoPatchState.rejectOnSelect = false;
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  vi.restoreAllMocks();
  if (typeof URL.createObjectURL !== "function") {
    (URL as any).createObjectURL = vi.fn(() => "blob:mock-preview");
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
  }
  if (typeof URL.revokeObjectURL !== "function") {
    (URL as any).revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  }
});

import PlantQuickLog from "@/components/PlantQuickLog";

function renderSheet({
  onOpenChange = () => {},
  onSaved,
}: {
  onOpenChange?: (open: boolean) => void;
  onSaved?: () => void;
} = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={onOpenChange}
        plantId="plant-1"
        plantName="Plant 1"
        growId="grow-1"
        tentId="tent-1"
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
}

function makeImage(name = "shot.jpg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

async function pickFile(input: HTMLInputElement, file: File) {
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe("PlantQuickLog action-first grower model", () => {
  it("renders action chips first and response checks second", () => {
    renderSheet();
    expect(screen.getByText("2. What changed?")).toBeTruthy();
    expect(
      screen.getByText("Tap the grow action. This is the thing the plant will respond to."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /log action watered/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /log action fed/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /log action issue spotted/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /log action environment changed/i })).toBeTruthy();
    expect(screen.getByText("3. Response follow-up")).toBeTruthy();
    expect(screen.getByRole("button", { name: /response check better/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /response check same/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /response check worse/i })).toBeTruthy();
    expect(
      screen.getByText("Better/Same/Worse records the plant response, not the grow action."),
    ).toBeTruthy();
  });

  it("action chips update local note state without saving", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /log action watered/i }));
    expect(screen.getByTestId("plant-quick-log-note")).toHaveValue("Watered.");
    expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();
    expect(saveCalls).toHaveLength(0);
    expect(uploadCalls).toHaveLength(0);
  });

  it("response check updates local note state without saving", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /response check better/i }));
    expect(screen.getByTestId("plant-quick-log-note")).toHaveValue("Response check: Better.");
    expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();
    expect(saveCalls).toHaveLength(0);
    expect(uploadCalls).toHaveLength(0);
  });

  it("response check replaces previous response instead of stacking contradictions", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /response check worse/i }));
    fireEvent.click(screen.getByRole("button", { name: /response check same/i }));
    expect(screen.getByTestId("plant-quick-log-note")).toHaveValue("Response check: Same.");
  });

  it("saves an action through quicklog_save_manual as a plant note", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /log action watered/i }));
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => expect(saveCalls).toHaveLength(1));
    expect(uploadCalls).toHaveLength(0);
    expect(saveCalls[0]).toMatchObject({
      p_target_type: "plant",
      p_target_id: "plant-1",
      p_action: "note",
      p_note: "Watered.",
    });
    expect(saveCalls[0].p_details).toMatchObject({
      grow_id: "grow-1",
      plant_id: "plant-1",
      tent_id: "tent-1",
    });
    expect(JSON.stringify(saveCalls[0])).not.toContain("user_id");
  });

  it("saves a response follow-up through the same RPC note path", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /response check better/i }));
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => expect(saveCalls).toHaveLength(1));
    expect(saveCalls[0]).toMatchObject({
      p_target_type: "plant",
      p_target_id: "plant-1",
      p_action: "note",
      p_note: "Response check: Better.",
    });
    expect(JSON.stringify(saveCalls[0])).not.toContain("user_id");
  });

  it("action chips append local note detail without saving", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /log action watered/i }));
    fireEvent.click(screen.getByRole("button", { name: /log action fed/i }));
    fireEvent.click(screen.getByRole("button", { name: /log action fed/i }));
    expect(screen.getByTestId("plant-quick-log-note")).toHaveValue("Watered.\nFed.");
    expect(saveCalls).toHaveLength(0);
  });

  it("Photo only action does not weaken validation when no photo is selected", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /log action photo only/i }));
    expect(screen.getByTestId("plant-quick-log-error").textContent).toMatch(/add a photo before/i);
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
    expect(saveCalls).toHaveLength(0);
  });
});

describe("PlantQuickLog Gate 1 polish", () => {
  it("renders title, subtitle, section labels, save copy, and helper copy", () => {
    renderSheet();
    expect(screen.getByRole("heading", { name: "Quick Log" })).toBeTruthy();
    expect(
      screen.getByText(
        "Capture what changed. Better/Same/Worse is for the plant response afterward.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("1. Plant")).toBeTruthy();
    expect(screen.getByText("2. What changed?")).toBeTruthy();
    expect(screen.getByText("3. Response follow-up")).toBeTruthy();
    expect(screen.getByText("4. Optional details")).toBeTruthy();
    expect(screen.getByRole("button", { name: /save quick log/i })).toHaveTextContent("Save log");
    expect(screen.getByText("You can add more detail later from the timeline.")).toBeTruthy();
  });

  it("renders photo helper and manual readings helper without calling manual readings live", () => {
    renderSheet();
    expect(screen.getByText("A photo can be enough for today.")).toBeTruthy();
    expect(screen.getByText("Manual readings")).toBeTruthy();
    expect(screen.getByText("Optional. Manual readings are not live sensor data.")).toBeTruthy();
    expect(screen.queryByText(/manual readings are live/i)).toBeNull();
  });

  it("exposes accessible labels for plant, note, photo buttons, save, and manual readings", () => {
    renderSheet();
    expect(screen.getByLabelText("Selected plant for this Quick Log")).toHaveTextContent("Plant 1");
    expect(screen.getByLabelText("Quick Log grow action note")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Take Photo$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Choose from Library$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /save quick log/i })).toBeTruthy();
    expect(screen.getByTestId("plant-quick-log-sensors").getAttribute("aria-describedby")).toBe(
      "plant-quick-log-manual-readings-helper",
    );
  });
});

describe("PlantQuickLog photo source picker — accessible names + ARIA wiring", () => {
  it("exposes Take Photo and Choose from Library as named buttons", () => {
    renderSheet();
    const take = screen.getByRole("button", { name: /^take photo$/i });
    const lib = screen.getByRole("button", { name: /^choose from library$/i });
    expect(take.getAttribute("aria-controls")).toBe("plant-quick-log-photo-input");
    expect(lib.getAttribute("aria-controls")).toBe("plant-quick-log-photo-library-input");
  });

  it("hidden inputs carry stable ids + aria-labels for assistive tech", () => {
    renderSheet();
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    const library = document.getElementById(
      "plant-quick-log-photo-library-input",
    ) as HTMLInputElement;
    expect(camera.getAttribute("aria-label")).toMatch(/camera/i);
    expect(library.getAttribute("aria-label")).toMatch(/library/i);
    expect(camera.getAttribute("accept")).toBe("image/*");
    expect(library.getAttribute("accept")).toBe("image/*");
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(library.hasAttribute("capture")).toBe(false);
  });

  it("keeps file inputs visually hidden instead of display-none for mobile picker reliability", () => {
    renderSheet();
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    const library = document.getElementById(
      "plant-quick-log-photo-library-input",
    ) as HTMLInputElement;
    expect(camera.className).toContain("sr-only");
    expect(library.className).toContain("sr-only");
    expect(camera.className).not.toContain("hidden");
    expect(library.className).not.toContain("hidden");
  });

  it("renders a mobile-visible save helper and sticky save action", () => {
    renderSheet();
    expect(screen.getByTestId("plant-quick-log-save-helper").textContent).toMatch(
      /tap what changed/i,
    );
    const save = screen.getByTestId("plant-quick-log-save");
    expect(save.getAttribute("aria-describedby")).toBe("plant-quick-log-save-helper");
    expect(save.closest("div")?.className).toContain("sticky");
  });
});

describe("PlantQuickLog photo source picker — both sources reach same preview + save", () => {
  it("Take Photo selection shows preview, uploads to diary-photos, then saves via RPC", async () => {
    renderSheet();
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("camera.jpg"));

    await waitFor(() => expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy());

    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Logged from camera path" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(saveCalls).toHaveLength(1);
      expect(updateCalls).toHaveLength(1);
    });
    expect(uploadCalls[0].bucket).toBe("diary-photos");
    expect(uploadCalls[0].path.startsWith("user-test-1/grow-1/")).toBe(true);
    expect(typeof (saveCalls[0].p_details as { photo_url?: string }).photo_url).toBe("string");
    expect(updateCalls[0]).toMatchObject({
      __table: "diary_entries",
      photo_url: uploadCalls[0].path,
    });
    expect(JSON.stringify(saveCalls[0])).not.toContain("user_id");
  });

  it("Choose from Library selection takes the identical preview + upload + RPC path", async () => {
    renderSheet();
    const library = document.getElementById(
      "plant-quick-log-photo-library-input",
    ) as HTMLInputElement;
    await pickFile(library, makeImage("gallery.png"));

    await waitFor(() => expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy());
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Logged from library path" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(saveCalls).toHaveLength(1);
      expect(updateCalls).toHaveLength(1);
    });
    expect(uploadCalls[0].bucket).toBe("diary-photos");
    expect(uploadCalls[0].path.startsWith("user-test-1/grow-1/")).toBe(true);
    expect(typeof (saveCalls[0].p_details as { photo_url?: string }).photo_url).toBe("string");
    expect(updateCalls[0].__table).toBe("diary_entries");
    expect(JSON.stringify(saveCalls[0])).not.toContain("user_id");
  });

  it("keeps a confirmed nested-photo save successful when top-level normalization fails", async () => {
    photoPatchState.error = { message: "diary update rejected" };
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderSheet({ onOpenChange, onSaved });
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("patch-failure.jpg"));
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Photo evidence needs an honest result" },
    });

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Log saved to timeline."));
    expect(screen.queryByTestId("plant-quick-log-error")).toBeNull();
    expect(screen.getByTestId("plant-quick-log-save-helper")).not.toHaveTextContent(
      /page refresh/i,
    );
    expect(saveCalls).toHaveLength(1);
    expect(uploadCalls).toHaveLength(1);
    expect((saveCalls[0].p_details as { photo_url?: string }).photo_url).toBe(uploadCalls[0].path);
    expect(updateCalls).toHaveLength(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmed save fail-closed when it omits its event identity", async () => {
    saveResultState.value = { ok: true, growEventId: null, reused: false };
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    renderSheet({ onOpenChange, onSaved });
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("missing-event-id.jpg"));
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Photo evidence needs a linked event" },
    });

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    expect(await screen.findByTestId("plant-quick-log-error")).toHaveTextContent(
      /log was saved, but the photo could not be attached/i,
    );
    expect(screen.getByTestId("plant-quick-log-save")).toBeDisabled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("keeps a confirmed nested-photo save successful when top-level normalization finds no row", async () => {
    photoPatchState.data = [];
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderSheet({ onOpenChange, onSaved });
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("missing-diary-row.jpg"));
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Photo evidence needs a diary mirror" },
    });

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Log saved to timeline."));
    expect(screen.queryByTestId("plant-quick-log-error")).toBeNull();
    expect(screen.getByTestId("plant-quick-log-save-helper")).not.toHaveTextContent(
      /page refresh/i,
    );
    expect(uploadCalls).toHaveLength(1);
    expect((saveCalls[0].p_details as { photo_url?: string }).photo_url).toBe(uploadCalls[0].path);
    expect(updateCalls).toHaveLength(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmed nested-photo save successful when top-level normalization rejects", async () => {
    photoPatchState.rejectOnSelect = true;
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderSheet({ onOpenChange, onSaved });
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("throwing-normalizer.jpg"));
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "The nested diary reference is the durable receipt" },
    });

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Log saved to timeline."));
    expect(screen.queryByTestId("plant-quick-log-error")).toBeNull();
    expect(screen.getByTestId("plant-quick-log-save-helper")).not.toHaveTextContent(
      /page refresh/i,
    );
    expect(saveCalls).toHaveLength(1);
    expect(uploadCalls).toHaveLength(1);
    expect((saveCalls[0].p_details as { photo_url?: string }).photo_url).toBe(uploadCalls[0].path);
    expect(updateCalls).toHaveLength(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("saves a library photo without requiring typed notes", async () => {
    renderSheet();
    const library = document.getElementById(
      "plant-quick-log-photo-library-input",
    ) as HTMLInputElement;
    await pickFile(library, makeImage("photo-only.jpg"));

    await waitFor(() => expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy());
    expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(saveCalls).toHaveLength(1);
    });
    expect(saveCalls[0].p_note).toBe("Photo attached from Quick Log.");
    expect(typeof (saveCalls[0].p_details as { photo_url?: string }).photo_url).toBe("string");
  });

  it("saves manual readings without requiring typed notes or a photo", async () => {
    renderSheet();
    fireEvent.change(screen.getByTestId("plant-quick-log-temp"), {
      target: { value: "78" },
    });
    expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(0);
      expect(saveCalls).toHaveLength(1);
    });
    expect(saveCalls[0].p_note).toBe("Manual readings captured from Quick Log.");
    expect(saveCalls[0].p_details).toMatchObject({
      manual_sensor_snapshot: {
        temp_f: 78,
        source: "manual",
      },
    });
  });

  it("shows an inline error when saving with no content", async () => {
    renderSheet();
    const save = screen.getByTestId("plant-quick-log-save");
    expect(save).toBeDisabled();
    fireEvent.submit(screen.getByTestId("plant-quick-log-note").closest("form")!);
    expect(screen.getByTestId("plant-quick-log-error").textContent).toMatch(
      /add what changed, a photo, or a reading/i,
    );
    expect(saveCalls).toHaveLength(0);
  });

  it("resets the library input value after selection so the same photo can be picked again", async () => {
    renderSheet();
    const library = document.getElementById(
      "plant-quick-log-photo-library-input",
    ) as HTMLInputElement;
    const galleryFile = makeImage("same-gallery-photo.jpg");

    await pickFile(library, galleryFile);
    await waitFor(() => expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy());
    expect(library.value).toBe("");

    fireEvent.click(screen.getByTestId("plant-quick-log-photo-remove"));
    await pickFile(library, galleryFile);

    await waitFor(() => expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy());
    expect(library.value).toBe("");
  });

  it("resets the camera input value after selection too", async () => {
    renderSheet();
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("same-camera-photo.jpg"));

    await waitFor(() => expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy());
    expect(camera.value).toBe("");
  });

  it("both sources produce structurally equivalent RPC payloads", async () => {
    const first = renderSheet();
    await pickFile(
      document.getElementById("plant-quick-log-photo-input") as HTMLInputElement,
      makeImage("a.jpg"),
    );
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Same note both ways" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(saveCalls).toHaveLength(1));
    const fromCamera = { ...saveCalls[0] };
    first.unmount();

    saveCalls.length = 0;
    uploadCalls.length = 0;
    updateCalls.length = 0;

    renderSheet();
    await pickFile(
      document.getElementById("plant-quick-log-photo-library-input") as HTMLInputElement,
      makeImage("a.jpg"),
    );
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Same note both ways" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(saveCalls).toHaveLength(1));
    const fromLibrary = { ...saveCalls[0] };

    const stripVolatile = (p: Record<string, unknown>) => {
      const details = { ...(p.p_details as Record<string, unknown>) };
      delete details.photo_url;
      const { p_idempotency_key: _key, ...rest } = p;
      return { ...rest, p_details: details };
    };
    expect(stripVolatile(fromCamera)).toEqual(stripVolatile(fromLibrary));
    expect(typeof (fromCamera.p_details as { photo_url?: string }).photo_url).toBe("string");
    expect(typeof (fromLibrary.p_details as { photo_url?: string }).photo_url).toBe("string");
  });
});

describe("QuickLogV2Sheet — photo saving remains enabled", () => {
  it("isPhotoSavingSupported() returns true", async () => {
    const { isPhotoSavingSupported } = await import("@/lib/quickLogV2Rules");
    expect(isPhotoSavingSupported()).toBe(true);
  });
});
