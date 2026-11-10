import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FieldNotebook from "@/components/FieldNotebook";
import { backToNote, emptyDraft } from "@/lib/fieldNotebookOutcomeRules";
import { formatServerClockLabel } from "@/lib/fieldNotebookViewModel";
import {
  adoptNotebookSessionOwner,
  clearNotebookSession,
  forgetNotebookMemory,
  readNotebookDraft,
  writeNotebookDraft,
} from "@/lib/fieldNotebookSession";

const tent = {
  id: "flower",
  name: "Flower Tent 2",
  weekLabel: "Week 3",
  ageLabel: "Age: 22 days",
  startedLabel: "Jan 8, 2025",
};

const MAY_NOT = "This note may not have saved. Check Timeline. It stays here so you can copy it.";

describe("a note that may not have saved stays with the signed-in account", () => {
  beforeEach(() => {
    clearNotebookSession();
    adoptNotebookSessionOwner("account-a");
  });

  async function landUncertain(reason: string) {
    const onSave = vi.fn().mockResolvedValue({
      transport: { kind: "dispatched_no_receipt", reason },
      reflection: {
        timelineHasEntry: false,
        countIncludesEntry: false,
        lastActivityIncludesEntry: false,
      },
    });
    const onFindEntry = vi.fn().mockResolvedValue({ availability: "unavailable" });
    render(
      <FieldNotebook
        tents={[tent]}
        readingsByTent={{}}
        onSave={onSave}
        onFindEntry={onFindEntry}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(await screen.findByText(MAY_NOT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to Flower Tent 2" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByText(MAY_NOT)).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledOnce();
    const box = screen.getByPlaceholderText("Add what you observed.") as HTMLTextAreaElement;
    expect(box.value).toBe("leaves are pale");
    expect(box.readOnly).toBe(false);
    return { onSave };
  }

  it("keeps an offline note locked, visible, and copyable", async () => {
    await landUncertain("offline");
  });

  it("keeps a non-definitive rejection locked, visible, and copyable", async () => {
    await landUncertain("save_failed");
  });

  it("reloads the note for the same account and hides it from another", () => {
    writeNotebookDraft({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "uncertain",
      writeBlocked: true,
    });
    forgetNotebookMemory();
    adoptNotebookSessionOwner("account-a");
    expect(readNotebookDraft("flower").note).toBe("leaves are pale");
    expect(readNotebookDraft("flower").writeBlocked).toBe(true);
    adoptNotebookSessionOwner("account-b");
    expect(readNotebookDraft("flower").note).toBe("");
    adoptNotebookSessionOwner("account-a");
    expect(readNotebookDraft("flower").note).toBe("leaves are pale");
  });

  it("renders the saved time in local time", () => {
    const label = formatServerClockLabel("2025-01-08T15:24:00.000Z");
    expect(label).toBeTruthy();
    expect(label).not.toMatch(/UTC/);
    const local = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(Date.parse("2025-01-08T15:24:00.000Z"));
    expect(label).toBe(local);
  });

  it("Back to note keeps the text visible", () => {
    const returned = backToNote({
      ...emptyDraft("flower"),
      note: "leaves are pale",
      phase: "check_none",
      writeBlocked: true,
    });
    expect(returned.note).toBe("leaves are pale");
    expect(returned.phase).toBe("uncertain");
    expect(returned.writeBlocked).toBe(true);
  });
});
