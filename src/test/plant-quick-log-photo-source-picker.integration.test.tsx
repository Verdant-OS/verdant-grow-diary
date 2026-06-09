/**
 * PlantQuickLog photo source picker — browser-level integration coverage.
 *
 * Drives the real PlantQuickLog component end-to-end against mocked
 * Supabase storage + diary_entries insert (no real network, no real DB
 * writes). Proves both "Take Photo" and "Choose from Library" inputs:
 *
 *   1. Reach the same selected-photo preview state.
 *   2. Reach the same diary-photos upload + diary_entries insert path.
 *   3. Produce equivalent insert payloads.
 *   4. Have accessible names + ARIA wiring for screen readers.
 *   5. Support mobile-safe photo-only and manual-reading-only saves.
 *
 * No real Supabase calls — uses the same mock-supabase-client pattern
 * already used by other component integration tests in this repo.
 * Playwright/Cypress are NOT installed; this is the safest available
 * browser-level harness without introducing a heavy new E2E dependency.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const uploadCalls: Array<{ bucket: string; path: string; file: File }> = [];
const insertCalls: Array<Record<string, unknown>> = [];

vi.mock("@/integrations/supabase/client", () => {
  return {
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
        insert: (payload: Record<string, unknown>) => {
          insertCalls.push({ __table: table, ...payload });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "user-test-1" } }),
}));

vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorLogs: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// URL.createObjectURL is not available in jsdom by default.
beforeEach(() => {
  uploadCalls.length = 0;
  insertCalls.length = 0;
  vi.restoreAllMocks();
  if (typeof URL.createObjectURL !== "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).createObjectURL = vi.fn(() => "blob:mock-preview");
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-preview");
  }
  if (typeof URL.revokeObjectURL !== "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (URL as any).revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  }
});

import PlantQuickLog from "@/components/PlantQuickLog";

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlantQuickLog
        open
        onOpenChange={() => {}}
        plantId="plant-1"
        plantName="Plant 1"
        growId="grow-1"
        tentId="tent-1"
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

describe("PlantQuickLog photo source picker — accessible names + ARIA wiring", () => {
  it("exposes Take Photo and Choose from Library as named buttons", () => {
    renderSheet();
    const take = screen.getByRole("button", { name: /take photo/i });
    const lib = screen.getByRole("button", { name: /choose from library/i });
    expect(take).toBeTruthy();
    expect(lib).toBeTruthy();
    expect(take.getAttribute("aria-controls")).toBe("plant-quick-log-photo-input");
    expect(lib.getAttribute("aria-controls")).toBe("plant-quick-log-photo-library-input");
  });

  it("hidden inputs carry stable ids + aria-labels for assistive tech", () => {
    renderSheet();
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    const library = document.getElementById("plant-quick-log-photo-library-input") as HTMLInputElement;
    expect(camera).toBeTruthy();
    expect(library).toBeTruthy();
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
    const library = document.getElementById("plant-quick-log-photo-library-input") as HTMLInputElement;
    expect(camera.className).toContain("sr-only");
    expect(library.className).toContain("sr-only");
    expect(camera.className).not.toContain("hidden");
    expect(library.className).not.toContain("hidden");
  });

  it("renders a mobile-visible save helper and sticky save action", () => {
    renderSheet();
    expect(screen.getByTestId("plant-quick-log-save-helper").textContent).toMatch(
      /add a note, photo, or manual reading/i,
    );
    const save = screen.getByTestId("plant-quick-log-save");
    expect(save.getAttribute("aria-describedby")).toBe("plant-quick-log-save-helper");
    expect(save.closest("div")?.className).toContain("sticky");
  });
});

describe("PlantQuickLog photo source picker — both sources reach same preview + save", () => {
  it("Take Photo selection shows preview, uploads to diary-photos, inserts into diary_entries", async () => {
    renderSheet();
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("camera.jpg"));

    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Logged from camera path" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(insertCalls).toHaveLength(1);
    });
    expect(uploadCalls[0].bucket).toBe("diary-photos");
    expect(uploadCalls[0].path.startsWith("user-test-1/grow-1/")).toBe(true);
    expect(insertCalls[0].__table).toBe("diary_entries");
    expect(typeof insertCalls[0].photo_url).toBe("string");
    expect("user_id" in insertCalls[0]).toBe(false);
  });

  it("Choose from Library selection takes the identical preview + upload + insert path", async () => {
    renderSheet();
    const library = document.getElementById("plant-quick-log-photo-library-input") as HTMLInputElement;
    await pickFile(library, makeImage("gallery.png"));

    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Logged from library path" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(insertCalls).toHaveLength(1);
    });
    expect(uploadCalls[0].bucket).toBe("diary-photos");
    expect(uploadCalls[0].path.startsWith("user-test-1/grow-1/")).toBe(true);
    expect(insertCalls[0].__table).toBe("diary_entries");
    expect(typeof insertCalls[0].photo_url).toBe("string");
    expect("user_id" in insertCalls[0]).toBe(false);
  });

  it("saves a library photo without requiring typed notes", async () => {
    renderSheet();
    const library = document.getElementById("plant-quick-log-photo-library-input") as HTMLInputElement;
    await pickFile(library, makeImage("photo-only.jpg"));

    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy();
    });
    expect(screen.getByTestId("plant-quick-log-save")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("plant-quick-log-save"));

    await waitFor(() => {
      expect(uploadCalls).toHaveLength(1);
      expect(insertCalls).toHaveLength(1);
    });
    expect(insertCalls[0].note).toBe("Photo attached from Quick Log.");
    expect(typeof insertCalls[0].photo_url).toBe("string");
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
      expect(insertCalls).toHaveLength(1);
    });
    expect(insertCalls[0].note).toBe("Manual readings captured from Quick Log.");
    expect(insertCalls[0].details).toMatchObject({
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
      /add a note, photo, or manual reading/i,
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("resets the library input value after selection so the same photo can be picked again", async () => {
    renderSheet();
    const library = document.getElementById("plant-quick-log-photo-library-input") as HTMLInputElement;
    const galleryFile = makeImage("same-gallery-photo.jpg");

    await pickFile(library, galleryFile);
    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy();
    });
    expect(library.value).toBe("");

    fireEvent.click(screen.getByTestId("plant-quick-log-photo-remove"));
    await pickFile(library, galleryFile);

    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy();
    });
    expect(library.value).toBe("");
  });

  it("resets the camera input value after selection too", async () => {
    renderSheet();
    const camera = document.getElementById("plant-quick-log-photo-input") as HTMLInputElement;
    await pickFile(camera, makeImage("same-camera-photo.jpg"));

    await waitFor(() => {
      expect(screen.getByTestId("plant-quick-log-photo-preview")).toBeTruthy();
    });
    expect(camera.value).toBe("");
  });

  it("both sources produce structurally equivalent insert payloads", async () => {
    // Camera path
    const first = renderSheet();
    await pickFile(
      document.getElementById("plant-quick-log-photo-input") as HTMLInputElement,
      makeImage("a.jpg"),
    );
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Same note both ways" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(insertCalls).toHaveLength(1));
    const fromCamera = { ...insertCalls[0] };
    first.unmount();

    insertCalls.length = 0;
    uploadCalls.length = 0;

    // Library path
    renderSheet();
    await pickFile(
      document.getElementById("plant-quick-log-photo-library-input") as HTMLInputElement,
      makeImage("a.jpg"),
    );
    fireEvent.change(screen.getByTestId("plant-quick-log-note"), {
      target: { value: "Same note both ways" },
    });
    fireEvent.click(screen.getByTestId("plant-quick-log-save"));
    await waitFor(() => expect(insertCalls).toHaveLength(1));
    const fromLibrary = { ...insertCalls[0] };

    // Strip path/photo_url (timestamp differs) and compare the rest of the contract.
    const stripVolatile = (p: Record<string, unknown>) => {
      const { photo_url: _p, ...rest } = p;
      return rest;
    };
    expect(stripVolatile(fromCamera)).toEqual(stripVolatile(fromLibrary));
    expect(typeof fromCamera.photo_url).toBe("string");
    expect(typeof fromLibrary.photo_url).toBe("string");
  });
});

describe("QuickLogV2Sheet — photo saving remains enabled", () => {
  it("isPhotoSavingSupported() returns true", async () => {
    const { isPhotoSavingSupported } = await import("@/lib/quickLogV2Rules");
    expect(isPhotoSavingSupported()).toBe(true);
  });
});
