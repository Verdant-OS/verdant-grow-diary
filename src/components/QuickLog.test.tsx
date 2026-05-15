import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import QuickLog from "./QuickLog";

const insertMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: insertMock, update: () => ({ eq: vi.fn() }) }),
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

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: any[]) => toastError(...a), success: (...a: any[]) => toastSuccess(...a) } }));

beforeEach(() => {
  insertMock.mockReset();
  uploadMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  // Stub object URL APIs used by preview
  (URL as any).createObjectURL = vi.fn(() => "blob:mock");
  (URL as any).revokeObjectURL = vi.fn();
});

describe("QuickLog photo Remove button", () => {
  it("clears the preview and does not submit the form", () => {
    const onOpenChange = vi.fn();
    render(<QuickLog open={true} onOpenChange={onOpenChange} />);

    const dialog = screen.getByRole("dialog");
    // File input is hidden; grab it via the dialog
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const file = new File(["x"], "leaf.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Preview image is rendered
    const img = dialog.querySelector("img");
    expect(img).toBeTruthy();

    // Remove button appears
    const removeBtn = within(dialog).getByLabelText("Remove photo");
    expect(removeBtn).toHaveAttribute("type", "button");

    fireEvent.click(removeBtn);

    // Preview gone, Remove button gone, placeholder back
    expect(dialog.querySelector("img")).toBeNull();
    expect(within(dialog).queryByLabelText("Remove photo")).toBeNull();
    expect(within(dialog).getByText(/Tap to add photo/i)).toBeInTheDocument();

    // Form was not submitted
    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("uploads the selected photo and inserts the entry with the uploaded path as photo_url", async () => {
    uploadMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });

    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    render(<QuickLog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    const dialog = screen.getByRole("dialog");
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "leaf.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const note = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Watered today" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));

    // upload(path, file, opts)
    const [uploadedPath, uploadedFile, uploadOpts] = uploadMock.mock.calls[0];
    expect(uploadedFile).toBe(file);
    expect(uploadOpts).toMatchObject({ contentType: "image/jpeg", upsert: false });
    expect(uploadedPath).toMatch(/^user-1\/grow-1\/\d+\.jpg$/);

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const insertArg = insertMock.mock.calls[0][0];
    expect(insertArg.photo_url).toBe(uploadedPath);
    expect(insertArg).toMatchObject({
      user_id: "user-1",
      grow_id: "grow-1",
      note: "Watered today",
    });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Logged 🌱");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the storage error and does not insert when upload fails", async () => {
    uploadMock.mockResolvedValue({ error: { message: "bucket not found" } });

    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    render(<QuickLog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    const dialog = screen.getByRole("dialog");
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(["x"], "leaf.jpg", { type: "image/jpeg" })] } });
    fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, { target: { value: "Note" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Photo upload failed: bucket not found"),
    );

    expect(insertMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    // Preview is preserved so the user can retry without re-picking the file
    expect(dialog.querySelector("img")).toBeTruthy();
  });

  it("blocks submit with no photo and empty note, showing the validation toast", async () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    render(<QuickLog open={true} onOpenChange={onOpenChange} onCreated={onCreated} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("img")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /save entry/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Add a quick note"));

    expect(uploadMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
