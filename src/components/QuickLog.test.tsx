import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  insertMock.mockReset();
  uploadMock.mockReset();
  // Stub object URL APIs used by preview
  // @ts-expect-error jsdom
  URL.createObjectURL = vi.fn(() => "blob:mock");
  // @ts-expect-error jsdom
  URL.revokeObjectURL = vi.fn();
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
});
