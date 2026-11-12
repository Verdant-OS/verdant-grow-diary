import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook from "@/components/FieldNotebook";
import { clearNotebookSession } from "@/lib/fieldNotebookSession";

const pending = {
  timelineHasEntry: false,
  countIncludesEntry: false,
  lastActivityIncludesEntry: false,
};

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "Week 3",
  ageLabel: "Age: 22 days",
  startedLabel: "Jan 8, 2025",
};

const entry = {
  growEventId: "11111111-1111-4111-8111-111111111111",
  tentId: "flower",
  tentName: "Flower Tent 2",
  note: "observation A",
  occurredAt: "2025-01-08T15:24:00.000Z",
};

function renderNotebook(onSave: unknown, onFindEntry: unknown) {
  return render(
    <FieldNotebook
      tents={[tent]}
      readingsByTent={{}}
      onSave={onSave as ComponentProps<typeof FieldNotebook>["onSave"]}
      onFindEntry={onFindEntry as ComponentProps<typeof FieldNotebook>["onFindEntry"]}
    />,
  );
}

describe("Check Timeline resolves a no-event-id save by idempotency key", () => {
  beforeEach(() => clearNotebookSession());

  it("confirms a found row that matches the tent and the canonical note", async () => {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt" },
      reflection: pending,
    });
    const onFindEntry = vi.fn().mockResolvedValue({
      availability: "authoritative",
      candidates: [entry],
      matchedEventId: entry.growEventId,
    });
    renderNotebook(onSave, onFindEntry);
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: entry.note },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByRole("button", { name: "Yes, that's it" })).toBeInTheDocument();
    expect(onFindEntry).toHaveBeenCalledWith("flower", null, expect.any(String));
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("stays blocked when the key lookup is missing or fails", async () => {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt" },
      reflection: pending,
    });
    const onFindEntry = vi.fn().mockResolvedValue({ availability: "unavailable" });
    renderNotebook(onSave, onFindEntry);
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: entry.note },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    expect(
      await screen.findByText(
        "This note may not have saved. Check Timeline. It stays here so you can copy it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not confirm a row whose tent or note does not match", async () => {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt" },
      reflection: pending,
    });
    const onFindEntry = vi.fn().mockResolvedValue({
      availability: "authoritative",
      candidates: [{ ...entry, tentId: "other", note: "different" }],
      matchedEventId: entry.growEventId,
    });
    renderNotebook(onSave, onFindEntry);
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: entry.note },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    expect(
      await screen.findByText(
        "This note may not have saved. Check Timeline. It stays here so you can copy it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, that's it" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("spaces-only note", () => {
  beforeEach(() => clearNotebookSession());

  it("disables Save and does not dispatch", () => {
    const onSave = vi.fn();
    renderNotebook(onSave, vi.fn());
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't save. Your note is still here.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
